/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

var userAgentID = "3c7462fc-270f-45be-a459-b9d631b0d093";
var channelID = "1e1f1d0a-0f3a-4a4c-9e2e-6b2d0b3d3f01";

function run_test() {
  do_get_profile();
  setPrefs({ userAgentID });
  run_next_test();
}

add_task(async function test_notification_ignore() {
  let db = PushServiceWebSocket.newPushDB();
  registerCleanupFunction(() => {
    return db.drop().then(_ => db.close());
  });
  await db.put({
    channelID,
    pushEndpoint: "https://example.com/update/1",
    scope: "https://example.org/1",
    originAttributes: "",
    version: 1,
    quota: Infinity,
    systemRecord: true,
  });

  let notifyCount = 0;
  let observer = () => notifyCount++;
  Services.obs.addObserver(observer, PushServiceComponent.pushTopic);
  registerCleanupFunction(() => {
    Services.obs.removeObserver(observer, PushServiceComponent.pushTopic);
  });

  let acks = [];
  let ignoredMessageSent = Promise.withResolvers();
  PushService.init({
    serverURI: "wss://push.example.org/",
    db,
    makeWebSocket(uri) {
      return new MockWebSocket(uri, {
        onHello() {
          this.serverSendMsg(
            JSON.stringify({
              messageType: "hello",
              uaid: userAgentID,
              status: 200,
              use_webpush: true,
            })
          );
          this.serverSendMsg(
            JSON.stringify({
              messageType: "notification",
              channelID,
              version: "v2",
            })
          );
        },
        onACK(request) {
          acks.push(...request.updates);

          // From now on the server's messages should be left alone
          PushService.ignoreNewMessages();
          this.serverSendMsg(
            JSON.stringify({
              messageType: "notification",
              channelID,
              version: "v3",
            })
          );
          ignoredMessageSent.resolve();
        },
      });
    },
  });

  await ignoredMessageSent.promise;

  // Gives the ignored message time to show up if it was wrongly handled
  await new Promise(resolve => do_timeout(500, resolve));

  equal(notifyCount, 1, "Only the first message should be delivered");
  deepEqual(
    acks,
    [{ channelID, version: "v2", code: 100 }],
    "Only the first message should be acked"
  );

  let record = await db.getByKeyID(channelID);
  ok(
    record.hasRecentMessageID("v2"),
    "The first message should be marked seen"
  );
  ok(
    !record.hasRecentMessageID("v3"),
    "The ignored message should not be marked seen, so it can come back"
  );
});
