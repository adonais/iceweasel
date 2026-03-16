"use strict";

const { BaseNodeServer, NodeServer } = ChromeUtils.importESModule(
  "resource://testing-common/NodeServer.sys.mjs"
);

const baseURL = getRootDirectory(gTestPath).replace(
  "chrome://mochitests/content",
  "https://example.com"
);

// Node-side code: raw TCP server that captures SNI from TLS ClientHello.
/* globals require, global */
class NodeSNIServerCode {
  // Extracts the SNI hostname from a TLS ClientHello message.
  static extractSNI(buffer) {
    if (buffer.length < 5) {
      return null;
    }
    const contentType = buffer[0];
    if (contentType !== 0x16) {
      return null;
    }
    const recordLength = buffer.readUInt16BE(3);
    if (buffer.length < 5 + recordLength) {
      return null;
    }
    const handshakeType = buffer[5];
    if (handshakeType !== 0x01) {
      return null;
    }

    let offset = 5 + 1 + 3 + 2 + 32;

    const sessionIdLength = buffer[offset];
    offset += 1 + sessionIdLength;

    const cipherSuitesLength = buffer.readUInt16BE(offset);
    offset += 2 + cipherSuitesLength;

    const compressionMethodsLength = buffer[offset];
    offset += 1 + compressionMethodsLength;

    if (offset + 2 > buffer.length) {
      return null;
    }
    const extensionsLength = buffer.readUInt16BE(offset);
    offset += 2;

    const extensionsEnd = offset + extensionsLength;
    while (offset + 4 <= extensionsEnd) {
      const extType = buffer.readUInt16BE(offset);
      const extLength = buffer.readUInt16BE(offset + 2);
      offset += 4;

      if (extType === 0x0000) {
        const sniListLength = buffer.readUInt16BE(offset);
        let sniOffset = offset + 2;
        const sniEnd = offset + sniListLength + 2;
        while (sniOffset + 3 <= sniEnd) {
          const nameType = buffer[sniOffset];
          const nameLength = buffer.readUInt16BE(sniOffset + 1);
          sniOffset += 3;
          if (nameType === 0x00) {
            return buffer
              .slice(sniOffset, sniOffset + nameLength)
              .toString("ascii");
          }
          sniOffset += nameLength;
        }
      }
      offset += extLength;
    }
    return null;
  }

  static async startServer(port) {
    const net = require("net");
    global.sniValues = [];
    global.connectionCount = 0;
    global.server = net.createServer(socket => {
      global.connectionCount++;
      socket.once("data", data => {
        const sni = NodeSNIServerCode.extractSNI(data);
        console.log(`sni = ${sni}`);
        if (sni) {
          global.sniValues.push(sni);
        }
      });
      socket.on("error", () => {});
    });
    await new Promise(resolve => global.server.listen(port, resolve));
    return global.server.address().port;
  }
}

// Test-side server class extending BaseNodeServer.
class NodeSNIServer extends BaseNodeServer {
  async start(port = 0) {
    this.processId = await NodeServer.fork();
    await this.execute(NodeSNIServerCode);
    this._port = await this.execute(`NodeSNIServerCode.startServer(${port})`);
  }

  async stop() {
    if (this.processId) {
      await this.execute(`global.server.close(() => {})`);
      await NodeServer.kill(this.processId);
      this.processId = undefined;
    }
  }

  async connectionCount() {
    return this.execute(`global.connectionCount`);
  }

  async sniValues() {
    return this.execute(`global.sniValues`);
  }
}

function waitForFetchComplete(port) {
  let targetURL = `https://localhost:${port}/`;
  return new Promise(resolve => {
    let observer = {
      observe(subject) {
        let channel = subject.QueryInterface(Ci.nsIChannel);
        if (channel.URI.spec !== targetURL) {
          return;
        }
        Services.obs.removeObserver(observer, "http-on-stop-request");
        resolve(channel.status);
      },
    };
    Services.obs.addObserver(observer, "http-on-stop-request");
  });
}

let gServer;

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["network.lna.blocking", true],
      ["network.proxy.allow_hijacking_localhost", false],
      ["network.lna.address_space.public.override", "127.0.0.1:4443"],
    ],
  });

  gServer = new NodeSNIServer();
  await gServer.start();
  info(`SNI capture server listening on port ${gServer.port()}`);

  registerCleanupFunction(async () => {
    await gServer.stop();
  });
});

// Test 1: Verify that blocking the LNA prompt does not leak SNI.
add_task(async function test_lna_block_no_sni_leak() {
  Services.obs.notifyObservers(null, "testonly-reload-permissions-from-disk");
  Services.perms.removeAll();

  is(await gServer.connectionCount(), 0, "No connections before loading page");

  let promptPromise = BrowserTestUtils.waitForEvent(
    PopupNotifications.panel,
    "popupshown"
  );
  const tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    `${baseURL}page_fetch_localhost_https.html?port=${gServer.port()}`
  );

  await promptPromise;

  let popup = PopupNotifications.getNotification(
    "localhost",
    tab.linkedBrowser
  );
  ok(popup, "LNA permission prompt should appear for https://localhost fetch");

  Assert.equal(
    await gServer.connectionCount(),
    1,
    "Only 1 TCP connection should have been made before LNA prompt response"
  );

  Assert.deepEqual(
    await gServer.sniValues(),
    [],
    "No SNI values should be captured before the user responds to the LNA prompt"
  );

  let notification = popup?.owner?.panel?.childNodes?.[0];
  ok(notification, "Notification popup element is available");
  let fetchDone = waitForFetchComplete(gServer.port());
  notification.secondaryButton.doCommand();
  await fetchDone;

  Assert.equal(
    await gServer.connectionCount(),
    1,
    "No new TCP connections after blocking the LNA prompt"
  );

  Assert.deepEqual(
    await gServer.sniValues(),
    [],
    "No SNI values should be captured after the user rejects the LNA prompt"
  );

  gBrowser.removeTab(tab);
});

// Test 2: After clearing permissions, verify re-prompt and that accepting
// allows the SNI to reach the server.
add_task(async function test_lna_accept_receives_sni() {
  Services.obs.notifyObservers(null, "testonly-reload-permissions-from-disk");
  Services.perms.removeAll();

  // Reset server counters.
  await gServer.execute(`global.connectionCount = 0`);
  await gServer.execute(`global.sniValues = []`);

  let promptPromise = BrowserTestUtils.waitForEvent(
    PopupNotifications.panel,
    "popupshown"
  );
  const tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    `${baseURL}page_fetch_localhost_https.html?port=${gServer.port()}`
  );

  await promptPromise;

  let popup = PopupNotifications.getNotification(
    "localhost",
    tab.linkedBrowser
  );
  ok(popup, "LNA permission prompt should appear again after permission reset");

  Assert.equal(
    await gServer.connectionCount(),
    1,
    "Only 1 TCP connection should have been made before LNA prompt response"
  );

  Assert.deepEqual(
    await gServer.sniValues(),
    [],
    "No SNI values should be captured before accepting the LNA prompt"
  );

  // Accept the prompt.
  let notification = popup?.owner?.panel?.childNodes?.[0];
  ok(notification, "Notification popup element is available for accept");
  notification.button.doCommand();

  // The server is a raw TCP socket, so the TLS handshake will fail after the
  // ClientHello is sent. Wait for the SNI to be captured by the server.
  await BrowserTestUtils.waitForCondition(
    async () => !!(await gServer.sniValues()).length,
    "Waiting for SNI value after accepting the LNA prompt"
  );

  Assert.greater(
    (await gServer.sniValues()).length,
    0,
    "SNI value should be captured after the user accepts the LNA prompt"
  );

  gBrowser.removeTab(tab);
});
