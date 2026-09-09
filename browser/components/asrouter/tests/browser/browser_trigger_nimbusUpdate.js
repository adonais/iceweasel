/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { ASRouter, MessageLoaderUtils } = ChromeUtils.importESModule(
  "resource:///modules/asrouter/ASRouter.sys.mjs"
);
const { RemoteSettings } = ChromeUtils.importESModule(
  "resource://services-settings/remote-settings.sys.mjs"
);
const { EnrollmentType } = ChromeUtils.importESModule(
  "resource://nimbus/ExperimentAPI.sys.mjs"
);
const { NimbusTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/NimbusTestUtils.sys.mjs"
);

const client = RemoteSettings("nimbus-desktop-experiments");
const secureClient = RemoteSettings("nimbus-secure-experiments");
// Making these calls eliminates a lot of noisy EmptyDatabaseErrors.
// TODO(bug 1979320): Remove this:
const dbsReady = Promise.all([
  client.db.importChanges({}, Date.now(), [], {}),
  secureClient.db.importChanges({}, Date.now(), [], {}),
]);

const TEST_MESSAGE_IDS = ["nimbus-update-test-1", "nimbus-update-test-2"];

const TEST_MESSAGE_CONTENT = {
  id: "NIMBUS_UPDATE_TEST_MESSAGE",
  template: "infobar",
  content: {
    type: "tab",
    text: "Text",
    buttons: [
      {
        label: "Primary CTA",
        primary: true,
        accessKey: "P",
        action: { type: "CANCEL" },
      },
    ],
  },
  targeting: "true",
  trigger: { id: "nimbusUpdate" },
};

/**
 * The trigger routes to a real infobar, which would otherwise persist into
 * subsequent tests in this run.
 */
function removeTestInfobars() {
  const box = gBrowser.getNotificationBox(gBrowser.selectedBrowser);
  for (const id of TEST_MESSAGE_IDS) {
    const node = box.getNotificationWithValue(id);
    if (node) {
      box.removeNotification(node);
    }
  }
}

add_setup(async function () {
  await dbsReady;
  registerCleanupFunction(async () => {
    removeTestInfobars();
    await client.db.clear();
    await secureClient.db.clear();
  });
});

add_task(async function test_nimbusUpdate_reach_experiment() {
  const sandbox = sinon.createSandbox();
  await ASRouter.waitForInitialized;
  await ASRouter._updateMessageProviders();
  await ExperimentAPI._rsLoader.finishedUpdating();
  await ExperimentAPI.ready();

  const sendTriggerSpy = sandbox.spy(ASRouter, "sendTriggerMessage");
  const routeSpy = sandbox.spy(ASRouter, "routeCFRMessage");
  const reachSpy = sandbox.spy(ASRouter, "_recordReachEvent");
  const triggerMatch = sandbox.match({ id: "nimbusUpdate" });
  const featureId = "cfr";
  const recipe = NimbusTestUtils.factories.recipe("nimbus_update_test", {
    branches: [
      {
        slug: "control",
        ratio: 1,
        features: [
          {
            featureId,
            value: {
              ...TEST_MESSAGE_CONTENT,
              id: "nimbus-update-test-1",
              recordReach: true,
            },
          },
        ],
      },
      {
        slug: "treatment",
        ratio: 1,
        features: [
          {
            featureId,
            value: {
              ...TEST_MESSAGE_CONTENT,
              id: "nimbus-update-test-2",
              recordReach: true,
            },
          },
        ],
      },
    ],
  });

  await client.db.importChanges({}, Date.now(), [recipe], { clear: true });
  await secureClient.db.importChanges({}, Date.now(), [], { clear: true });
  await SpecialPowers.pushPrefEnv({
    set: [
      ["app.shield.optoutstudies.enabled", true],
      ["datareporting.healthreport.uploadEnabled", true],
      [
        "browser.newtabpage.activity-stream.asrouter.providers.messaging-experiments",
        `{"id":"messaging-experiments","enabled":true,"type":"remote-experiments","updateCycleInMs":0}`,
      ],
    ],
  });
  await ExperimentAPI._rsLoader.updateRecipes("test");

  let metadata = await TestUtils.waitForCondition(
    () =>
      NimbusFeatures[featureId].getEnrollmentMetadata(
        EnrollmentType.EXPERIMENT
      ),
    "ExperimentAPI should return an experiment"
  );

  const filterFn = m => TEST_MESSAGE_IDS.includes(m?.id);
  await TestUtils.waitForCondition(
    () => ASRouter.state.messages.filter(filterFn).length > 1,
    "Should load the test messages"
  );

  await TestUtils.waitForCondition(
    () => sendTriggerSpy.calledWith(triggerMatch),
    "nimbusUpdate trigger fired after enrollment"
  );
  Assert.ok(
    routeSpy.calledWith(
      sandbox.match(filterFn),
      gBrowser.selectedBrowser,
      triggerMatch
    ),
    "Trigger routed to the correct message"
  );
  Assert.ok(
    reachSpy.calledWith(sandbox.match(filterFn)),
    "Trigger recorded a reach event"
  );
  const reachMessageId =
    metadata.branch === "control"
      ? "nimbus-update-test-2"
      : "nimbus-update-test-1";
  const reachMessageBranch =
    metadata.branch === "control" ? "treatment" : "control";
  const reachId = `${metadata.slug}:${reachMessageBranch}:${reachMessageId}`;
  Assert.ok(
    MessageLoaderUtils._recordedReachIds.has(reachId),
    "Reach message will not be sent again"
  );

  ExperimentAPI.manager.store._deleteForTests("nimbus_update_test");
  await client.db.importChanges({}, Date.now(), [], { clear: true });
  await ExperimentAPI._rsLoader.updateRecipes("test");
  MessageLoaderUtils._recordedReachIds.clear();
  await ASRouter._updateMessageProviders();
  sandbox.restore();
  await TestUtils.waitForCondition(
    () =>
      !NimbusFeatures[featureId].getEnrollmentMetadata(
        EnrollmentType.EXPERIMENT
      ),
    "Wait for unenrollment"
  );
});
