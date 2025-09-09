/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

// Test that TelemetryController sends close to shutdown don't lead
// to AsyncShutdown timeouts.

"use strict";

ChromeUtils.defineESModuleGetters(this, {
  AppConstants: "resource://gre/modules/AppConstants.sys.mjs",
  NimbusFeatures: "resource://nimbus/ExperimentAPI.sys.mjs",
  sinon: "resource://testing-common/Sinon.sys.mjs",
  WinTaskbarJumpList: "resource:///modules/WindowsJumpLists.sys.mjs",
  TestUtils: "resource://testing-common/TestUtils.sys.mjs",
});

const { NimbusTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/NimbusTestUtils.sys.mjs"
);
const { Policy, TelemetryReportingPolicy } = ChromeUtils.importESModule(
  "resource://gre/modules/TelemetryReportingPolicy.sys.mjs"
);

NimbusTestUtils.init(this);

const TOU_ACCEPTED_VERSION_PREF = "termsofuse.acceptedVersion";
const TOU_CURRENT_VERSION_PREF = "termsofuse.currentVersion";
const TOU_MINIMUM_VERSION_PREF = "termsofuse.minimumVersion";
const TOU_ACCEPTED_DATE_PREF = "termsofuse.acceptedDate";
const TOU_BYPASS_NOTIFICATION_PREF = "termsofuse.bypassNotification";

// Some tests in this test file can't outside desktop Firefox because of
// features that aren't included in the build.
const skipIfNotBrowser = () => ({
  skip_if: () => AppConstants.MOZ_BUILD_APP != "browser",
});

function fakeResetAcceptedPolicy() {
  Services.prefs.clearUserPref(TOU_ACCEPTED_DATE_PREF);
  Services.prefs.clearUserPref(TOU_ACCEPTED_VERSION_PREF);
}

// Fake dismissing a modal dialog.
function fakeInteractWithModal() {
  Services.obs.notifyObservers(null, "termsofuse:interacted");
}

function unsetMinimumPolicyVersion() {
  Services.prefs.clearUserPref(TOU_MINIMUM_VERSION_PREF);
}

function enrollInPreonboardingExperiment(version) {
  return NimbusTestUtils.enrollWithFeatureConfig(
    {
      featureId: NimbusFeatures.preonboarding.featureId,
      value: {
        enabled: true,
        currentVersion: version,
        minimumVersion: version,
        firstRunURL: `http://mochi.test/v${version}`,
        // Needed to opt into the modal flow, but not actually used in this test.
        screens: [{ id: "test" }],
      },
    },
    { isRollout: false }
  );
}

add_setup(async function test_setup() {
  // Addon manager needs a profile directory
  do_get_profile(true);
  await loadAddonManager(
    "xpcshell@tests.mozilla.org",
    "XPCShell",
    "1",
    "1.9.2"
  );
  finishAddonManagerStartup();
  fakeIntlReady();

  // Make sure we don't generate unexpected pings due to pref changes.
  await setEmptyPrefWatchlist();

  // Don't bypass the legacy data reporting notifications in this test, we'll
  // fake it.
  Services.prefs.setBoolPref(
    TelemetryUtils.Preferences.BypassNotification,
    false
  );

  // Don't bypass the terms of use notification in this test, we'll
  // fake it.
  Services.prefs.setBoolPref(TOU_BYPASS_NOTIFICATION_PREF, false);
  await Services.fog.testResetFOG();
  TelemetryReportingPolicy.setup();
});

add_setup(skipIfNotBrowser(), async () => {
  const { cleanup } = await NimbusTestUtils.setupTest();
  registerCleanupFunction(cleanup);
});

add_task(skipIfNotBrowser(), async function test_feature_prefs() {
  // Verify that feature values impact Gecko preferences at
  // `sessionstore-windows-restored` time, but not afterward.
  function assertPrefs(currentVersion, minimumVersion, firstRunURL) {
    Assert.equal(
      Services.prefs.getIntPref(TOU_CURRENT_VERSION_PREF),
      currentVersion,
      `${TOU_CURRENT_VERSION_PREF} is set`
    );

    Assert.equal(
      Services.prefs.getIntPref(TOU_MINIMUM_VERSION_PREF),
      minimumVersion,
      `${TOU_MINIMUM_VERSION_PREF} is set`
    );

    Assert.equal(
      Services.prefs.getCharPref(TelemetryUtils.Preferences.FirstRunURL),
      firstRunURL,
      "datareporting.policy.firstRunURL is set"
    );
  }

  unsetMinimumPolicyVersion();
  Services.prefs.clearUserPref(TOU_CURRENT_VERSION_PREF);

  let doCleanup = await NimbusTestUtils.enrollWithFeatureConfig(
    {
      featureId: NimbusFeatures.preonboarding.featureId,
      value: {
        enabled: true,
        currentVersion: 900,
        minimumVersion: 899,
        firstRunURL: "http://mochi.test/v900",
      },
    },
    { isRollout: false }
  );

  Assert.ok(NimbusFeatures.preonboarding.getVariable("enabled"));

  // Before `sessionstore-windows-restored`, nothing is configured.
  TelemetryReportingPolicy.reset();

  Assert.ok(
    !Services.prefs.prefHasUserValue(TOU_CURRENT_VERSION_PREF),
    `${TOU_CURRENT_VERSION_PREF} is not set`
  );

  Assert.ok(
    !Services.prefs.prefHasUserValue(TOU_MINIMUM_VERSION_PREF),
    `${TOU_MINIMUM_VERSION_PREF} is not set`
  );

  Assert.ok(
    !Services.prefs.prefHasUserValue(TelemetryUtils.Preferences.FirstRunURL),
    "datareporting.policy.firstRunURL is not set"
  );

  // After `sessionstore-windows-restored`, values are adopted.
  await Policy.fakeSessionRestoreNotification();
  assertPrefs(900, 899, "http://mochi.test/v900");

  // Unenroll.  Values remain, for consistency while Firefox is running.
  await doCleanup();
  Assert.ok(!NimbusFeatures.preonboarding.getVariable("enabled"));
  assertPrefs(900, 899, "http://mochi.test/v900");

  // Updating the Nimbus feature does nothing (without `sessionstore-windows-restored`).
  doCleanup = await NimbusTestUtils.enrollWithFeatureConfig(
    {
      featureId: NimbusFeatures.preonboarding.featureId,
      value: {
        enabled: true,
        currentVersion: 901,
        minimumVersion: 900,
        firstRunURL: "http://mochi.test/v901",
      },
    },
    { isRollout: false }
  );
  Assert.ok(NimbusFeatures.preonboarding.getVariable("enabled"));
  assertPrefs(900, 899, "http://mochi.test/v900");
  await doCleanup();
});

async function doOneModalFlow(version) {
  let doCleanup = await enrollInPreonboardingExperiment(version);

  let displayStub = sinon.stub(Policy, "showModal").returns(true);

  // This will notify the user via a modal.
  TelemetryReportingPolicy.reset();
  await Policy.fakeSessionRestoreNotification();

  Assert.equal(displayStub.callCount, 1, "showModal is invoked");

  Assert.equal(
    TelemetryReportingPolicy.userHasAcceptedTOU(),
    false,
    "Before interaction, the user should be reported as not having accepted"
  );

  let completed = false;
  let p = TelemetryReportingPolicy.ensureUserIsNotified().then(
    () => (completed = true)
  );

  Assert.equal(
    completed,
    false,
    "The notification promise should not resolve before the user interacts"
  );

  fakeInteractWithModal();

  await p;

  Assert.equal(
    completed,
    true,
    "The notification promise should resolve after user interacts"
  );

  Assert.equal(
    TelemetryReportingPolicy.userHasAcceptedTOU(),
    true,
    "After interaction, the state should be accepted."
  );

  const metricVersion = await Glean.termsofuse.version.testGetValue();
  Assert.equal(
    metricVersion,
    version,
    `Glean.termsofuse.version is ${metricVersion} and matches expected ${version}`
  );

  const rawDate = await Glean.termsofuse.date.testGetValue();
  // Compare only seconds
  const metricSec = getDateInSeconds(rawDate);
  const expectedSec = getDateInSeconds(
    Services.prefs.getStringPref(TOU_ACCEPTED_DATE_PREF)
  );
  Assert.equal(
    metricSec,
    expectedSec,
    `Glean.termsofuse.date (in seconds) is ${metricSec} and matches expected ${expectedSec}`
  );

  await doCleanup();

  sinon.restore();
}

add_task(
  skipIfNotBrowser(),
  async function test_modal_flow_before_notification() {
    // Test the `--first-startup` flow.  Suppose the user has not been notified.
    // Verify that when the Nimbus feature is configured, the modal branch is
    // taken, that the ensure promise waits, and that the observer notification
    // resolves the ensure promise.

    fakeResetAcceptedPolicy();
    Services.prefs.clearUserPref(TelemetryUtils.Preferences.FirstRun);

    await doOneModalFlow(900);

    // The user accepted the version from the experiment/rollout.
    Assert.equal(Services.prefs.getIntPref(TOU_ACCEPTED_VERSION_PREF), 900);
  }
);

add_task(
  skipIfNotBrowser(),
  async function test_modal_flow_after_notification() {
    // If the legacy infobar was shown previously (existing users), we never
    // show the TOU modal, even if they’re later enrolled in a Nimbus
    // experiment.
    fakeResetAcceptedPolicy();
    Services.prefs.clearUserPref(TelemetryUtils.Preferences.FirstRun);

    // Mark user as already notified via the legacy infobar
    TelemetryReportingPolicy.reset();
    TelemetryReportingPolicy.testInfobarShown();
    Assert.ok(
      TelemetryReportingPolicy.testIsUserNotifiedOfDataReportingPolicy(),
      "User is notified after seeing the legacy infobar"
    );

    let doCleanup = await enrollInPreonboardingExperiment(900);

    let modalStub = sinon.stub(Policy, "showModal").returns(true);
    let p = Policy.delayedSetup();
    Policy.fakeSessionRestoreNotification();
    await p;

    Assert.equal(
      modalStub.callCount,
      0,
      "showModal should not be invoked after legacy infobar notification"
    );

    // Cleanup
    Services.prefs.clearUserPref(TelemetryUtils.Preferences.AcceptedPolicyDate);
    Services.prefs.clearUserPref(
      TelemetryUtils.Preferences.AcceptedPolicyVersion
    );
    TelemetryReportingPolicy.reset();
    await doCleanup();
    sinon.restore();
  }
);

add_task(
  skipIfNotBrowser(),
  async function test_default_modal_shows_when_not_enrolled_in_experiment() {
    if (AppConstants.platform === "linux") {
      info(
        "Skipping test for Linux where preonboarding is disabled by default"
      );
      return;
    }
    let modalStub = sinon.stub(Policy, "showModal").returns(true);

    fakeResetAcceptedPolicy();
    TelemetryReportingPolicy.reset();
    let p = Policy.delayedSetup();
    Policy.fakeSessionRestoreNotification();
    fakeInteractWithModal();
    await p;

    Assert.equal(
      modalStub.callCount,
      1,
      "showModal is invoked once when not enrolled in an experiemnt"
    );

    sinon.restore();
    fakeResetAcceptedPolicy();
  }
);

add_task(skipIfNotBrowser(), async function test_modal_not_shown_on_linux() {
  if (AppConstants.platform !== "linux") {
    info("Skipping test on non-Linux platforms");
    return;
  }

  let modalStub = sinon.stub(Policy, "showModal").returns(true);

  fakeResetAcceptedPolicy();
  TelemetryReportingPolicy.reset();

  let p = Policy.delayedSetup();
  Policy.fakeSessionRestoreNotification();
  await p;

  Assert.equal(
    modalStub.callCount,
    0,
    "showModal is not invoked on Linux by default"
  );

  sinon.restore();
  fakeResetAcceptedPolicy();
});

add_task(
  skipIfNotBrowser(),
  async function test_jumplist_blocking_on_modal_display_and_unblocking_after_interaction() {
    if (AppConstants.platform !== "win") {
      info("Skipping test for Windows only behavior");
      return;
    }

    fakeResetAcceptedPolicy();
    Services.prefs.clearUserPref(TelemetryUtils.Preferences.FirstRun);
    let blockSpy = sinon.spy(WinTaskbarJumpList, "blockJumpList");
    let unblockSpy = sinon.spy(WinTaskbarJumpList, "_unblockJumpList");
    sinon.stub(Policy, "showModal").returns(true);

    let doCleanup = await enrollInPreonboardingExperiment(900);

    // This will notify the user via a modal.
    TelemetryReportingPolicy.reset();
    await Policy.fakeSessionRestoreNotification();

    Assert.ok(
      blockSpy.calledOnce,
      "Jump list should be blocked when modal is presented."
    );

    let p = TelemetryReportingPolicy.ensureUserIsNotified;

    fakeInteractWithModal();

    await p;

    Assert.greaterOrEqual(
      unblockSpy.callCount,
      blockSpy.callCount,
      "Jump list should be unblocked after user interacts with modal"
    );

    await doCleanup();

    sinon.restore();
  }
);

add_task(
  skipIfNotBrowser(),
  async function test_startup_records_tou_telemetry_if_prefs_already_set() {
    const timestamp = Date.now();
    const version = 999;

    Services.prefs.setStringPref(TOU_ACCEPTED_DATE_PREF, timestamp.toString());
    Services.prefs.setIntPref(TOU_ACCEPTED_VERSION_PREF, version);

    TelemetryReportingPolicy.reset();

    const metricVersion = await Glean.termsofuse.version.testGetValue();
    Assert.equal(
      metricVersion,
      version,
      `Glean.termsofuse.version is ${metricVersion} and matches expected ${version}`
    );

    // Compare only seconds
    const rawDate = await Glean.termsofuse.date.testGetValue();
    const metricSec = getDateInSeconds(rawDate);
    const expectedSec = getDateInSeconds(timestamp);
    Assert.equal(
      metricSec,
      expectedSec,
      `Glean.termsofuse.date (in seconds) is ${metricSec} and matches expected ${expectedSec}`
    );

    fakeResetAcceptedPolicy();
  }
);

add_task(
  skipIfNotBrowser(),
  async function test_user_tou_ineligible_notification() {
    // Simulate a user that is *ineligible* to see the ToU by enabling the
    // bypass-notification pref.
    Services.prefs.setBoolPref(TOU_BYPASS_NOTIFICATION_PREF, true);

    let doCleanup = await enrollInPreonboardingExperiment(999);
    TelemetryReportingPolicy.reset();
    const modalStub = sinon.stub(Policy, "showModal").returns(true);

    // We expect this event to fire before Policy.delayedSetup resolves,
    // so any change in that is considered a change in behaviour, and we should catch that.
    // This is why we don't await on this promise.
    let notificationSeen = false;
    TestUtils.topicObserved(
      TelemetryReportingPolicy.TELEMETRY_TOU_ACCEPTED_OR_INELIGIBLE
    ).then(() => (notificationSeen = true));

    const p = Policy.delayedSetup();
    Policy.fakeSessionRestoreNotification();
    // Spin the event loop once – the notification should *not* have fired yet.
    await TestUtils.waitForTick();
    await p;

    Assert.equal(
      modalStub.callCount,
      0,
      "showModal should never be invoked when the user is ineligible"
    );
    Assert.ok(
      notificationSeen,
      "System is notified it is ok to continue to initialize"
    );

    // Clean-up.
    // Avoid using clearUserPref here because the default in tests is `true`.
    // Explicitly set the pref to `false` to override the default.
    Services.prefs.setBoolPref(TOU_BYPASS_NOTIFICATION_PREF, false);
    fakeResetAcceptedPolicy();
    await doCleanup();
    sinon.restore();
  }
);

add_task(
  skipIfNotBrowser(),
  async function test_user_tou_accepted_previously_notification() {
    // Pretend the user already accepted the ToU in a prior session.
    const timestamp = Date.now();
    const version = 999;
    let doCleanup = await enrollInPreonboardingExperiment(999);
    Services.prefs.setStringPref(TOU_ACCEPTED_DATE_PREF, timestamp.toString());
    Services.prefs.setIntPref(TOU_ACCEPTED_VERSION_PREF, version);

    TelemetryReportingPolicy.reset();
    const modalStub = sinon.stub(Policy, "showModal").returns(true);

    // We expect this event to fire before Policy.delayedSetup resolves,
    // so any change in that is considered a change in behaviour, and we should catch that.
    // This is why we don't await on this promise.
    let notificationSeen = false;
    TestUtils.topicObserved(
      TelemetryReportingPolicy.TELEMETRY_TOU_ACCEPTED_OR_INELIGIBLE
    ).then(() => (notificationSeen = true));

    let p = Policy.delayedSetup();
    Policy.fakeSessionRestoreNotification();
    await p;

    Assert.equal(
      modalStub.callCount,
      0,
      "showModal should not be invoked when the user previously accepted the ToU"
    );
    Assert.ok(
      notificationSeen,
      "System is notified it is ok to continue to initialize"
    );

    // Clean-up.
    fakeResetAcceptedPolicy();
    await doCleanup();
    sinon.restore();
  }
);

add_task(
  skipIfNotBrowser(),
  async function test_user_tou_accepted_now_notification() {
    // User has *not* accepted yet; they will accept via the modal we display.
    const modalStub = sinon.stub(Policy, "showModal").returns(true);
    let doCleanup = await enrollInPreonboardingExperiment(999);
    TelemetryReportingPolicy.reset();

    // We expect this event to fire before Policy.delayedSetup resolves,
    // so any change in that is considered a change in behaviour, and we should catch that.
    // This is why we don't await on this promise.
    let notificationSeen = false;
    TestUtils.topicObserved(
      TelemetryReportingPolicy.TELEMETRY_TOU_ACCEPTED_OR_INELIGIBLE
    ).then(() => (notificationSeen = true));

    let p = Policy.delayedSetup();
    Policy.fakeSessionRestoreNotification();
    // Spin the event loop once – the notification should *not* have fired yet.
    await TestUtils.waitForTick();
    Assert.ok(
      !notificationSeen,
      "Notification should not be dispatched before the user interacts"
    );

    Assert.equal(
      modalStub.callCount,
      1,
      "showModal should be invoked exactly once when prompting the user"
    );

    fakeInteractWithModal();
    await TestUtils.waitForTick();
    await p;

    Assert.ok(
      notificationSeen,
      "Notification fires after the user accepts the ToU in this session"
    );

    // Clean-up.
    fakeResetAcceptedPolicy();
    await doCleanup();
    sinon.restore();
  }
);

add_task(
  skipIfNotBrowser(),
  async function test_user_tou_ignored_no_notification() {
    // User has *not* accepted yet; they will accept via the modal we display.
    const modalStub = sinon.stub(Policy, "showModal").returns(true);
    let doCleanup = await enrollInPreonboardingExperiment(999);
    TelemetryReportingPolicy.reset();

    // We expect this event to fire before Policy.delayedSetup resolves,
    // so any change in that is considered a change in behaviour, and we should catch that.
    // This is why we don't await on this promise.
    let notificationSeen = false;
    TestUtils.topicObserved(
      TelemetryReportingPolicy.TELEMETRY_TOU_ACCEPTED_OR_INELIGIBLE
    ).then(() => (notificationSeen = true));

    let p = Policy.delayedSetup();
    Policy.fakeSessionRestoreNotification();
    // Spin the event loop once – the notification should *not* have fired yet.
    await TestUtils.waitForTick();
    Assert.ok(
      !notificationSeen,
      "Notification should not be dispatched before the user interacts"
    );

    Assert.equal(
      modalStub.callCount,
      1,
      "showModal should be invoked exactly once when prompting the user"
    );

    await TestUtils.waitForTick();
    await p;

    Assert.ok(
      !notificationSeen,
      "Notification should still not be dispatched if never interacted with"
    );

    // Clean-up.
    fakeResetAcceptedPolicy();
    await doCleanup();
    sinon.restore();
  }
);

add_task(
  skipIfNotBrowser(),
  async function test_user_tou_accept_later_notification() {
    // User has *not* accepted yet; they will accept via the modal we display.
    const modalStub = sinon.stub(Policy, "showModal").returns(true);
    let doCleanup = await enrollInPreonboardingExperiment(999);
    TelemetryReportingPolicy.reset();

    // We expect this event to fire before Policy.delayedSetup resolves,
    // so any change in that is considered a change in behaviour, and we should catch that.
    // This is why we don't await on this promise.
    let notificationSeen = false;
    TestUtils.topicObserved(
      TelemetryReportingPolicy.TELEMETRY_TOU_ACCEPTED_OR_INELIGIBLE
    ).then(() => (notificationSeen = true));

    let p = Policy.delayedSetup();
    Policy.fakeSessionRestoreNotification();
    // Spin the event loop once – the notification should *not* have fired yet.
    await TestUtils.waitForTick();
    Assert.ok(
      !notificationSeen,
      "Notification should not be dispatched before the user interacts"
    );

    Assert.equal(
      modalStub.callCount,
      1,
      "showModal should be invoked exactly once when prompting the user"
    );

    await TestUtils.waitForTick();
    await p;

    Assert.ok(
      !notificationSeen,
      "Notification should still not be dispatched if never interacted with"
    );
    fakeInteractWithModal();
    await TestUtils.waitForTick();

    Assert.ok(
      notificationSeen,
      "Notification fires after the user accepts the ToU in this session"
    );

    // Clean-up.
    fakeResetAcceptedPolicy();
    await doCleanup();
    sinon.restore();
  }
);
