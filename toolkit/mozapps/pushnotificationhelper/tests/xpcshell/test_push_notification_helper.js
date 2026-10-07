/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { NimbusTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/NimbusTestUtils.sys.mjs"
);
const { PushNotificationHelper } = ChromeUtils.importESModule(
  "resource://gre/modules/PushNotificationHelper.sys.mjs"
);

NimbusTestUtils.init(this);

const AVAILABLE_PREF = "app.backgroundNotifications.helper.available";
const ENABLED_PREF = "app.backgroundNotifications.helper.enabled";

function setPrefs({ available, enabled }) {
  Services.prefs.setBoolPref(AVAILABLE_PREF, available);
  Services.prefs.setBoolPref(ENABLED_PREF, enabled);
}

// start() and stop() both launch a real process, so every test stubs them out
// and asserts on which one would have run.
function stubLaunchers() {
  const original = {
    start: PushNotificationHelper.start,
    stop: PushNotificationHelper.stop,
  };
  const calls = { start: 0, stop: 0 };

  PushNotificationHelper.start = () => calls.start++;
  PushNotificationHelper.stop = () => calls.stop++;

  return {
    calls,
    restore() {
      PushNotificationHelper.start = original.start;
      PushNotificationHelper.stop = original.stop;
    },
  };
}

// The prefs are arranged inside the stubbed region as well, because their
// observers run synchronously and would otherwise reach the real launchers.
function withStubs(prefs, task) {
  const { calls, restore } = stubLaunchers();

  try {
    setPrefs(prefs);
    calls.start = 0;
    calls.stop = 0;

    return task(calls);
  } finally {
    restore();
  }
}

add_setup(async function () {
  do_get_profile();
});

registerCleanupFunction(() => {
  // Clearing the prefs fires their observers, so keep the real launchers out
  // of it here too.
  const { restore } = stubLaunchers();
  try {
    Services.prefs.clearUserPref(AVAILABLE_PREF);
    Services.prefs.clearUserPref(ENABLED_PREF);
  } finally {
    restore();
  }
});

// The Nimbus-owned gate and the user's own switch are independent, so the
// helper runs for exactly one of the four combinations.
add_task(async function test_update_needs_both_prefs() {
  for (const available of [false, true]) {
    for (const enabled of [false, true]) {
      const shouldRun = available && enabled;
      const state = `available=${available} enabled=${enabled}`;

      withStubs({ available, enabled }, calls => {
        PushNotificationHelper.update();
        Assert.equal(
          calls.start,
          shouldRun ? 1 : 0,
          `starts once for ${state}`
        );
        Assert.equal(calls.stop, shouldRun ? 0 : 1, `stops once for ${state}`);
      });
    }
  }
});

add_task(async function test_flipping_the_gate_on_starts() {
  withStubs({ available: false, enabled: true }, calls => {
    Services.prefs.setBoolPref(AVAILABLE_PREF, true);
    Assert.equal(calls.start, 1, "flipping on starts without an update()");
  });
});

add_task(async function test_flipping_the_gate_off_stops() {
  withStubs({ available: true, enabled: true }, calls => {
    Services.prefs.setBoolPref(AVAILABLE_PREF, false);
    Assert.equal(calls.stop, 1, "flipping off stops without an update()");
  });
});

add_task(async function test_flipping_the_user_switch_on_starts() {
  withStubs({ available: true, enabled: false }, calls => {
    Services.prefs.setBoolPref(ENABLED_PREF, true);
    Assert.equal(calls.start, 1, "flipping on starts without an update()");
  });
});

add_task(async function test_flipping_the_user_switch_off_stops() {
  withStubs({ available: true, enabled: true }, calls => {
    Services.prefs.setBoolPref(ENABLED_PREF, false);
    Assert.equal(calls.stop, 1, "flipping off stops without an update()");
  });
});

// The gate is the kill switch, so a client whose switch is on must stay stopped
// once the experiment reverts it.
add_task(async function test_the_user_switch_cannot_defeat_the_gate() {
  withStubs({ available: false, enabled: false }, calls => {
    Services.prefs.setBoolPref(ENABLED_PREF, true);
    Assert.equal(calls.start, 0, "nothing starts while the gate is closed");
  });
});

add_task(async function test_set_enabled_writes_the_user_pref() {
  withStubs({ available: true, enabled: false }, calls => {
    PushNotificationHelper.setEnabled(true);
    Assert.ok(
      Services.prefs.getBoolPref(ENABLED_PREF),
      "setEnabled(true) turns the user switch on"
    );
    Assert.equal(calls.start, 1, "and starts the helper");

    PushNotificationHelper.setEnabled(false);
    Assert.ok(
      !Services.prefs.getBoolPref(ENABLED_PREF),
      "setEnabled(false) turns it back off"
    );
    Assert.equal(calls.stop, 1, "and stops the helper");
  });
});

// Nimbus unenrolls a client that writes a pref it set, so the opt-out must
// leave the gate alone.
add_task(async function test_set_enabled_leaves_the_gate_alone() {
  withStubs({ available: true, enabled: true }, () => {
    PushNotificationHelper.setEnabled(false);
    Assert.ok(
      Services.prefs.getBoolPref(AVAILABLE_PREF),
      "the Nimbus-owned gate is untouched"
    );
  });
});

// Nothing checks that the pref named in FeatureManifest.yaml exists, so this
// covers the one path that proves the variable reaches AVAILABLE_PREF, and that
// unenrollment restores it.
add_task(async function test_nimbus_owns_the_gate() {
  const { restore } = stubLaunchers();
  Services.prefs.clearUserPref(AVAILABLE_PREF);

  try {
    const { cleanup } = await NimbusTestUtils.setupTest();
    const unenroll = await NimbusTestUtils.enrollWithFeatureConfig({
      featureId: "pushNotificationHelper",
      value: { available: true },
    });

    Assert.ok(
      Services.prefs.getBoolPref(AVAILABLE_PREF, false),
      "enrolling opens the gate"
    );

    await unenroll();

    // On the default branch Nimbus cannot undo this until the next restart,
    // which would leave the helper running. The user branch reverts now.
    Assert.ok(
      !Services.prefs.getBoolPref(AVAILABLE_PREF, false),
      "unenrolling closes it again in the same session"
    );

    await cleanup();
  } finally {
    restore();
  }
});

// A helper deliberately outlives Firefox, so a session that starts up while the
// feature is off must clean up whatever an earlier session left running.
add_task(async function test_startup_while_off_stops_orphans() {
  withStubs({ available: true, enabled: false }, calls => {
    PushNotificationHelper.init();
    Assert.equal(calls.stop, 1, "startup stops a helper left by a prior run");
    Assert.equal(calls.start, 0, "and does not launch one while off");
  });
});
