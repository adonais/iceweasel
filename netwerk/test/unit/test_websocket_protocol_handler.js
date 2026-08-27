/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// The ws and wss protocol handlers are singletons that are separate from the
// websocket channels they create.

add_task(async function test_handler_is_a_singleton() {
  for (let scheme of ["ws", "wss"]) {
    let contract = `@mozilla.org/network/protocol;1?name=${scheme}`;
    let handler = Services.io.getProtocolHandler(scheme);

    Assert.equal(handler.scheme, scheme, `${scheme}: scheme matches`);
    Assert.strictEqual(
      handler,
      Services.io.getProtocolHandler(scheme),
      `${scheme}: getProtocolHandler returns the singleton`
    );
    Assert.strictEqual(
      handler,
      Cc[contract].getService(Ci.nsIProtocolHandler),
      `${scheme}: getService returns the same singleton`
    );
  }
});

add_task(async function test_new_web_socket_channel() {
  for (let scheme of ["ws", "wss"]) {
    let handler = Services.io
      .getProtocolHandler(scheme)
      .QueryInterface(Ci.nsIWebSocketProtocolHandler);

    let chan = handler.newWebSocketChannel();
    Assert.ok(
      chan instanceof Ci.nsIWebSocketChannel,
      `${scheme}: got an nsIWebSocketChannel`
    );
    Assert.notStrictEqual(
      chan,
      handler.newWebSocketChannel(),
      `${scheme}: each call creates a new channel`
    );

    // The channel is not also the protocol handler.
    Assert.throws(
      () => chan.QueryInterface(Ci.nsIProtocolHandler),
      /NS_NOINTERFACE/,
      `${scheme}: the channel does not implement nsIProtocolHandler`
    );
  }
});

add_task(async function test_protocol_metadata() {
  // nsIWebSocketChannel is not an nsIChannel, so the generic channel creation
  // path is not supported.
  for (let scheme of ["ws", "wss"]) {
    Assert.throws(
      () =>
        Services.io
          .getProtocolHandler(scheme)
          .newChannel(Services.io.newURI(`${scheme}://localhost/`), null),
      /NS_ERROR_NOT_IMPLEMENTED/,
      `${scheme}: newChannel is not implemented`
    );

    // The handler must not override blocklisted ports.
    Assert.equal(
      Services.io.allowPort(25, scheme),
      false,
      `${scheme}: port 25 stays blocked`
    );
  }
});
