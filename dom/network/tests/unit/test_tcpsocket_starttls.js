/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/**
 * Tests that data received in plaintext but not yet delivered when
 * upgradeToSecure() is called is discarded, rather than delivered as if it
 * had been received over TLS.
 */
add_task(async function test_plaintext_discarded_on_upgrade() {
  const server = Cc["@mozilla.org/network/server-socket;1"].createInstance(
    Ci.nsIServerSocket
  );
  server.init(-1, true, -1);
  const { promise: accepted, resolve: onAccepted } = Promise.withResolvers();
  server.asyncListen({
    onSocketAccepted(serverSocket, transport) {
      onAccepted(transport);
    },
    onStopListening() {},
  });

  const socket = new TCPSocket("127.0.0.1", server.port);
  const received = [];
  let onData;
  socket.ondata = event => {
    received.push(event.data);
    onData?.();
  };
  socket.onerror = () => {};
  await new Promise(resolve => (socket.onopen = resolve));

  const transport = await accepted;
  const output = transport.openOutputStream(
    Ci.nsITransport.OPEN_BLOCKING,
    0,
    0
  );
  const input = transport
    .openInputStream(0, 0, 0)
    .QueryInterface(Ci.nsIAsyncInputStream);
  const write = data => output.write(data, data.length);

  const { promise: gotReady, resolve: onReady } = Promise.withResolvers();
  onData = onReady;
  write("220 Ready to start TLS\r\n");
  await gotReady;
  onData = null;
  Assert.deepEqual(
    received,
    ["220 Ready to start TLS\r\n"],
    "the plaintext response should be delivered"
  );

  socket.suspend();
  write("250 Injected\r\n");
  // Give the injected data time to be buffered by the client socket.
  await new Promise(resolve => do_timeout(500, resolve));

  socket.upgradeToSecure();
  socket.resume();
  socket.send("EHLO test\r\n");

  // The send above starts the TLS handshake. Once the ClientHello reaches the
  // server, any buffered plaintext would have been delivered.
  await new Promise(resolve =>
    input.asyncWait(resolve, 0, 0, Services.tm.mainThread)
  );
  const firstByte = Cc["@mozilla.org/binaryinputstream;1"].createInstance(
    Ci.nsIBinaryInputStream
  );
  firstByte.setInputStream(input);
  Assert.equal(
    firstByte.read8(),
    0x16,
    "the client should have started a TLS handshake"
  );
  await new Promise(resolve => executeSoon(resolve));

  Assert.deepEqual(
    received,
    ["220 Ready to start TLS\r\n"],
    "plaintext received before the upgrade should not be delivered after it"
  );

  socket.close();
  transport.close(Cr.NS_OK);
  server.close();
});
