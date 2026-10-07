/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const WebSocketWatcher = require("resource://devtools/server/actors/resources/websockets.js");

add_task(function test_frame_received_before_websocket_opened() {
  const watcher = new WebSocketWatcher();
  watcher.targetActor = {
    conn: null,
    manage() {},
  };

  let availableResources;
  watcher.onAvailable = resources => {
    availableResources = resources;
  };

  const httpChannelId = 123456;
  watcher.frameReceived(1, httpChannelId, {
    payload: "early server frame",
    timeStamp: 12.5,
    finBit: true,
    rsvBit1: false,
    rsvBit2: false,
    rsvBit3: false,
    opCode: Ci.nsIWebSocketFrame.OPCODE_TEXT,
    mask: 0,
    maskBit: false,
  });

  Assert.deepEqual(availableResources, [
    {
      wsMessageType: "frameReceived",
      httpChannelId,
      data: {
        type: "received",
        payload: "early server frame",
        timeStamp: 12.5,
        finBit: true,
        rsvBit1: false,
        rsvBit2: false,
        rsvBit3: false,
        opCode: Ci.nsIWebSocketFrame.OPCODE_TEXT,
        mask: 0,
        maskBit: false,
      },
    },
  ]);
});
