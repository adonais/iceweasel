/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

/**
 * Tests for the fx-accounts-client-info ping. Verifies that the ping
 * is enabled and carries the expected metrics when signed in, handled correctly
 * when signed out, etc.
 */

"use strict";

const { sinon } = ChromeUtils.importESModule(
  "resource://testing-common/Sinon.sys.mjs"
);
const { UIState } = ChromeUtils.importESModule(
  "resource://services-sync/UIState.sys.mjs"
);

const FAKE_UID = "0123456789abcdef0123456789abcdef";

add_setup(async () => {
  await SpecialPowers.pushPrefEnv({
    set: [["identity.fxaccounts.telemetry.clientInfoPing.enabled", true]],
  });
});

add_task(async function test_client_info_ping_signed_in() {
  // stubs UIState to return a given status, fires the idle-daily
  // notification which submits the ping.
  let sandbox = sinon.createSandbox();
  sandbox.stub(UIState, "get").returns({
    status: UIState.STATUS_SIGNED_IN,
    lastSync: new Date(),
    email: "test@example.com",
    uid: FAKE_UID,
  });

  // prime the fxa uid for the ping.
  Services.obs.notifyObservers(null, "sync-ui-state:update");

  try {
    await GleanPings.fxAccountsClientInfo.testSubmission(
      () => {
        Assert.equal(
          Glean.clientAssociation.uid.testGetValue("fx-accounts-client-info"),
          FAKE_UID,
          "uid metric is set when signed in"
        );
        Assert.deepEqual(
          Glean.browser.isUserDefault.testGetValue("fx-accounts-client-info"),
          { false: 1 },
          "is_user_default metric is present when signed in"
        );
      },
      () => {
        // force the submission.
        Services.obs.notifyObservers(null, "idle-daily");
      }
    );
  } finally {
    sandbox.restore();
  }
});

add_task(async function test_client_info_ping_signed_out() {
  for (let status of [
    UIState.STATUS_NOT_CONFIGURED,
    UIState.STATUS_LOGIN_FAILED,
    UIState.STATUS_NOT_VERIFIED,
  ]) {
    // setEnabled(false) clears stored ping data, so uid reads back null.
    let sandbox = sinon.createSandbox();
    sandbox.stub(UIState, "get").returns({
      status,
      lastSync: new Date(),
      email: "test@example.com",
      uid: FAKE_UID,
    });
    Services.obs.notifyObservers(null, UIState.ON_UPDATE);
    Services.obs.notifyObservers(null, "idle-daily");
    sandbox.restore();

    Assert.equal(
      Glean.clientAssociation.uid.testGetValue("fx-accounts-client-info"),
      null,
      `uid metric is null when status is ${status}`
    );
  }
});
