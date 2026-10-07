/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { PushNotificationHelper } = ChromeUtils.importESModule(
  "resource://gre/modules/PushNotificationHelper.sys.mjs"
);

const AVAILABLE_PREF = "app.backgroundNotifications.helper.available";
const ENABLED_PREF = "app.backgroundNotifications.helper.enabled";

// start() and stop() launch the real helper process, so they are stubbed for
// the whole file while the prefs are asserted on directly.
add_setup(async function () {
  const sandbox = sinon.createSandbox();
  sandbox.stub(PushNotificationHelper, "start");
  sandbox.stub(PushNotificationHelper, "stop");

  registerCleanupFunction(() => {
    sandbox.restore();
    Services.prefs.clearUserPref(AVAILABLE_PREF);
    Services.prefs.clearUserPref(ENABLED_PREF);
  });
});

add_task(async function test_ENABLE_CLOSED_BROWSER_NOTIFICATIONS() {
  Services.prefs.setBoolPref(ENABLED_PREF, false);

  await SMATestUtils.executeAndValidateAction({
    type: "ENABLE_CLOSED_BROWSER_NOTIFICATIONS",
  });

  Assert.ok(
    Services.prefs.getBoolPref(ENABLED_PREF),
    "the action turned the user's switch on"
  );
});

add_task(async function test_DISABLE_CLOSED_BROWSER_NOTIFICATIONS() {
  Services.prefs.setBoolPref(ENABLED_PREF, true);

  await SMATestUtils.executeAndValidateAction({
    type: "DISABLE_CLOSED_BROWSER_NOTIFICATIONS",
  });

  Assert.ok(
    !Services.prefs.getBoolPref(ENABLED_PREF),
    "the action turned the user's switch back off"
  );
});

// Nimbus unenrolls any client that writes a pref it set, so an opt-out must
// leave the gate alone. This is the whole reason the two prefs are separate.
add_task(async function test_the_actions_never_touch_the_nimbus_gate() {
  Services.prefs.setBoolPref(AVAILABLE_PREF, true);

  for (const type of [
    "ENABLE_CLOSED_BROWSER_NOTIFICATIONS",
    "DISABLE_CLOSED_BROWSER_NOTIFICATIONS",
  ]) {
    await SMATestUtils.executeAndValidateAction({ type });

    Assert.ok(
      Services.prefs.getBoolPref(AVAILABLE_PREF),
      `${type} left the Nimbus-owned gate untouched`
    );
  }
});
