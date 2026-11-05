/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const userAgentID = "f4d7f7e9-7069-4abb-80dd-448d685d7b68";

function run_test() {
  do_get_profile();
  setPrefs({ userAgentID });
  run_next_test();
}

function scopes(records) {
  return records.map(record => record.scope).sort();
}

add_task(async function test_getAllUnexpiredNonSystem() {
  let db = PushServiceWebSocket.newPushDB();
  registerCleanupFunction(() => {
    return db.drop().then(_ => db.close());
  });
  await putTestRecord(db, "active", "https://example.com/active", 16);
  await putTestRecord(db, "active2", "https://example.org/active", 16);
  await putTestRecord(db, "expired", "https://example.com/expired", 0);
  await putTestRecord(db, "system", "chrome://test-scope", Infinity);

  deepEqual(
    await PushService.getAllUnexpiredNonSystem(),
    [],
    "Should be empty before the push service has started"
  );
  equal(
    PushService._state,
    0, // PUSH_SERVICE_UNINIT
    "Asking for the subscriptions must not start the push service"
  );

  // Clearing unregisters in the background; answer those so the socket is not
  // torn down with requests still in flight.
  let unregisterCount = 0;
  let { promise: unregistersPromise, resolve: unregistersDone } =
    Promise.withResolvers();

  ok(!PushService.isReady, "isReady is false before the service starts");
  let readyBeforeInit = PushService.ready();

  let { promise: handshakePromise, resolve: handshakeDone } =
    Promise.withResolvers();
  let initPromise = PushService.init({
    serverURI: "wss://push.example.org/",
    db,
    makeWebSocket(uri) {
      return new MockWebSocket(uri, {
        onHello() {
          this.serverSendMsg(
            JSON.stringify({
              messageType: "hello",
              status: 200,
              uaid: userAgentID,
            })
          );
          handshakeDone();
        },
        onUnregister(data) {
          this.serverSendMsg(
            JSON.stringify({
              messageType: "unregister",
              status: 200,
              channelID: data.channelID,
            })
          );
          if (++unregisterCount == 2) {
            unregistersDone();
          }
        },
      });
    },
  });

  equal(
    PushService._state,
    2, // PUSH_SERVICE_ACTIVATING
    "The push service should be activating"
  );
  ok(!PushService.isReady, "isReady is false while activating");
  let duringActivation = PushService.getAllUnexpiredNonSystem();

  await initPromise;
  await handshakePromise;

  deepEqual(
    scopes(await duringActivation),
    ["https://example.com/active", "https://example.org/active"],
    "Asking during activation waits for the push service to finish activating"
  );
  deepEqual(
    scopes(await PushService.getAllUnexpiredNonSystem()),
    ["https://example.com/active", "https://example.org/active"],
    "Should only return unexpired, non-system subscriptions"
  );
  await readyBeforeInit;
  ok(true, "ready() called before init resolves once the service activates");
  ok(PushService.isReady, "isReady is true once the service is active");
  await PushService.ready();
  ok(true, "ready() resolves immediately once the service is active");

  await PushService.clear({ domain: "*" });
  await unregistersPromise;
  deepEqual(
    await PushService.getAllUnexpiredNonSystem(),
    [],
    "Clearing site data removes the subscriptions"
  );
});
