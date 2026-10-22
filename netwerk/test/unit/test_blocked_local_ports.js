/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { HttpServer } = ChromeUtils.importESModule(
  "resource://testing-common/httpd.sys.mjs"
);

let httpServer;

// Resolves with NS_OK once connected, or with the error the transport failed
// with.
function connectTo(host, port) {
  return new Promise(resolve => {
    let transport = Cc["@mozilla.org/network/socket-transport-service;1"]
      .getService(Ci.nsISocketTransportService)
      .createTransport([], host, port, null, null);
    let done = result => {
      transport.close(Cr.NS_OK);
      resolve(result);
    };
    transport.setEventSink(
      {
        onTransportStatus(aTransport, status) {
          if (status == Ci.nsISocketTransport.STATUS_CONNECTED_TO) {
            done(Cr.NS_OK);
          }
        },
      },
      Services.tm.currentThread
    );
    let input = transport.openInputStream(0, 0, 0);
    input.asyncWait(
      {
        onInputStreamReady(stream) {
          try {
            stream.available();
            done(Cr.NS_ERROR_UNEXPECTED);
          } catch (e) {
            done(e.result);
          }
        },
      },
      0,
      0,
      Services.tm.currentThread
    );
  });
}

function resolveMyHostName() {
  return new Promise(resolve => {
    Services.dns.asyncResolve(
      Services.dns.myHostName,
      Ci.nsIDNSService.RESOLVE_TYPE_DEFAULT,
      Ci.nsIDNSService.RESOLVE_DISABLE_IPV6,
      null,
      {
        onLookupComplete(request, record, status) {
          let addresses = [];
          if (Components.isSuccessCode(status)) {
            record.QueryInterface(Ci.nsIDNSAddrRecord);
            while (record.hasMore()) {
              addresses.push(record.getNextAddrAsString());
            }
          }
          resolve(addresses);
        },
      },
      Services.tm.currentThread,
      {}
    );
  });
}

function isPrivateIPv4(addr) {
  return (
    /^10\./.test(addr) ||
    /^192\.168\./.test(addr) ||
    /^172\.(1[6-9]|2[0-9]|3[01])\./.test(addr)
  );
}

add_setup(() => {
  httpServer = new HttpServer();
  httpServer.registerPathHandler("/", (request, response) => {
    response.setHeader("Connection", "close", false);
    response.write("ok");
  });
  httpServer.start(-1);
  registerCleanupFunction(async () => {
    await httpServer.stop();
  });
});

add_task(async function test_invalid_ports() {
  for (let port of [-1, 0, 65536]) {
    Assert.throws(
      () => Services.io.addBlockedLocalPort(port),
      e => e.result == Cr.NS_ERROR_INVALID_ARG,
      `Blocking port ${port} should throw`
    );
  }
});

add_task(async function test_http_to_blocked_local_port() {
  let port = httpServer.identity.primaryPort;

  let [req, buffer] = await channelOpenPromise(
    makeChan(`http://localhost:${port}/`)
  );
  Assert.equal(req.status, Cr.NS_OK);
  Assert.equal(buffer, "ok");

  Services.io.addBlockedLocalPort(port);

  for (let host of ["localhost", "127.0.0.1", "127.0.0.2", "[::1]"]) {
    [req] = await channelOpenPromise(
      makeChan(`http://${host}:${port}/`),
      CL_EXPECT_FAILURE
    );
    Assert.equal(
      req.status,
      Cr.NS_ERROR_PORT_ACCESS_NOT_ALLOWED,
      `Connection to ${host}:${port} should be blocked`
    );
  }

  Services.io.removeBlockedLocalPort(port);

  [req, buffer] = await channelOpenPromise(
    makeChan(`http://localhost:${port}/`)
  );
  Assert.equal(req.status, Cr.NS_OK);
  Assert.equal(buffer, "ok");
});

add_task(async function test_socket_to_blocked_local_port() {
  let port = httpServer.identity.primaryPort;

  Assert.equal(await connectTo("127.0.0.1", port), Cr.NS_OK);

  Services.io.addBlockedLocalPort(port);
  for (let host of ["127.0.0.1", "::1", "0.0.0.0", "::"]) {
    Assert.equal(
      await connectTo(host, port),
      Cr.NS_ERROR_PORT_ACCESS_NOT_ALLOWED,
      `Connection to ${host}:${port} should be blocked`
    );
  }
  Services.io.removeBlockedLocalPort(port);

  Assert.equal(await connectTo("127.0.0.1", port), Cr.NS_OK);
});

add_task(async function test_only_blocked_port_is_affected() {
  let port = httpServer.identity.primaryPort;
  Services.io.addBlockedLocalPort(port === 65535 ? port - 1 : port + 1);

  let [req, buffer] = await channelOpenPromise(
    makeChan(`http://localhost:${port}/`)
  );
  Assert.equal(req.status, Cr.NS_OK);
  Assert.equal(buffer, "ok");

  Services.io.removeBlockedLocalPort(port === 65535 ? port - 1 : port + 1);
});

add_task(async function test_socket_to_blocked_port_on_interface_address() {
  let addresses = await resolveMyHostName();
  let address = addresses.find(isPrivateIPv4);
  if (!address) {
    info("No private IPv4 interface address available, skipping");
    return;
  }

  let server = Cc["@mozilla.org/network/server-socket;1"].createInstance(
    Ci.nsIServerSocket
  );
  let accepted = [];
  server.init(-1, false, -1);
  server.asyncListen({
    onSocketAccepted(socket, transport) {
      accepted.push(transport);
    },
    onStopListening() {},
  });
  registerCleanupFunction(() => {
    accepted.forEach(t => t.close(Cr.NS_OK));
    server.close();
  });

  Assert.equal(await connectTo(address, server.port), Cr.NS_OK);

  Services.io.addBlockedLocalPort(server.port);
  Assert.equal(
    await connectTo(address, server.port),
    Cr.NS_ERROR_PORT_ACCESS_NOT_ALLOWED,
    `Connection to ${address}:${server.port} should be blocked`
  );
  Services.io.removeBlockedLocalPort(server.port);

  Assert.equal(await connectTo(address, server.port), Cr.NS_OK);
});
