const { ASRouter } = ChromeUtils.importESModule(
  "resource:///modules/asrouter/ASRouter.sys.mjs"
);
const { RemoteSettings } = ChromeUtils.importESModule(
  "resource://services-settings/remote-settings.sys.mjs"
);
const { InfoBar } = ChromeUtils.importESModule(
  "resource:///modules/asrouter/InfoBar.sys.mjs"
);

// Changing this pref fires the test message's preferenceObserver trigger, which
// lets us exercise the real routing path without navigating anywhere.
const TEST_PREF = "test.asrouter.groupFrequency";

function getInfobarBox() {
  return gBrowser.getNotificationBox(gBrowser.selectedBrowser);
}

function getInfobar(id) {
  return getInfobarBox().getNotificationWithValue(id);
}

/**
 * Fire the trigger, wait for the infobar to render, assert the expected
 * impression count, then remove the infobar so the next trigger isn't blocked
 * by InfoBar's active-infobar guard.
 */
async function showAndDismissInfobar(id, prefValue, expectedImpressions) {
  Services.prefs.setIntPref(TEST_PREF, prefValue);

  const node = await TestUtils.waitForCondition(
    () => getInfobar(id),
    `Infobar should be shown (impression ${expectedImpressions})`
  );

  await TestUtils.waitForCondition(
    () => ASRouter.state.messageImpressions[id]?.length === expectedImpressions,
    `Impression ${expectedImpressions} recorded`
  );

  getInfobarBox().removeNotification(node);
  await TestUtils.waitForCondition(
    () => !InfoBar._activeInfobar,
    `Active infobar should be cleared (impression ${expectedImpressions})`
  );
}

/**
 * Load and modify a message for the test.
 */
add_setup(async function () {
  const initialMsgCount = ASRouter.state.messages.length;
  const testMessage = {
    // Ensure no overlap due to frequency capping with other tests
    id: `GROUP_FREQUENCY_MESSAGE_${Date.now()}`,
    template: "infobar",
    groups: ["messaging-experiments"],
    targeting: "true",
    frequency: { lifetime: 3 },
    trigger: { id: "preferenceObserver", params: [TEST_PREF] },
    content: {
      type: "tab",
      text: "Group frequency test infobar",
      buttons: [{ label: "OK", primary: true, action: { type: "CANCEL" } }],
    },
  };
  const client = RemoteSettings("cfr");
  await client.db.importChanges({}, Date.now(), [testMessage], {
    clear: true,
  });

  // Force the CFR provider cache to 0 by modifying updateCycleInMs
  await SpecialPowers.pushPrefEnv({
    set: [
      [
        "browser.newtabpage.activity-stream.asrouter.providers.cfr",
        `{"id":"cfr","enabled":true,"type":"remote-settings","collection":"cfr","updateCycleInMs":0}`,
      ],
    ],
  });

  // Reload the providers
  await ASRouter._updateMessageProviders();
  await ASRouter.loadMessagesFromAllProviders();
  await TestUtils.waitForCondition(
    () => ASRouter.state.messages.length > initialMsgCount,
    "Should load the extra test message"
  );

  await TestUtils.waitForCondition(
    () => ASRouter.state.messages.find(m => m.id === testMessage.id),
    "Wait to load the message"
  );

  const msg = ASRouter.state.messages.find(m => m.id === testMessage.id);
  Assert.equal(msg.targeting, "true");
  Assert.equal(msg.groups[0], "messaging-experiments");

  registerCleanupFunction(async () => {
    Services.prefs.clearUserPref(TEST_PREF);
    await client.db.clear();
    // Reload the providers
    await ASRouter._updateMessageProviders();
    await ASRouter.loadMessagesFromAllProviders();
    await TestUtils.waitForCondition(
      () => ASRouter.state.messages.length === initialMsgCount,
      "Should reset messages"
    );
    await SpecialPowers.popPrefEnv();
  });
});

/**
 * Test group frequency capping.
 * Message has a lifetime frequency of 3 but it's group has a lifetime frequency
 * of 2, so the group is the binding constraint and the message should only show
 * up twice.
 */
add_task(async function test_group_frequency_cap() {
  const msg = ASRouter.state.messages.find(m =>
    m.groups.includes("messaging-experiments")
  );
  Assert.ok(msg, "Message found");
  const groupConfiguration = {
    id: "messaging-experiments",
    enabled: true,
    frequency: { lifetime: 2 },
  };
  const client = RemoteSettings("message-groups");
  await client.db.importChanges({}, Date.now(), [groupConfiguration], {
    clear: true,
  });

  // Force the message-groups provider cache to 0 by modifying updateCycleInMs
  await SpecialPowers.pushPrefEnv({
    set: [
      [
        "browser.newtabpage.activity-stream.asrouter.providers.message-groups",
        `{"id":"message-groups","enabled":true,"type":"remote-settings","collection":"message-groups","updateCycleInMs":0}`,
      ],
    ],
  });

  await TestUtils.waitForCondition(async () => {
    const msgs = await client.get();
    return msgs.find(m => m.id === groupConfiguration.id);
  }, "Wait for RS message");

  // Reload the providers
  await ASRouter._updateMessageProviders();
  await ASRouter.loadAllMessageGroups();

  let groupState = await TestUtils.waitForCondition(
    () => ASRouter.state.groups.find(g => g.id === groupConfiguration.id),
    "Wait for group config to load"
  );
  Assert.ok(groupState, "Group config found");
  Assert.ok(groupState.enabled, "Group is enabled");
  Assert.equal(
    msg.frequency.lifetime,
    3,
    "Message's own cap allows more impressions than the group's cap of 2"
  );

  await showAndDismissInfobar(msg.id, 1, 1);
  await showAndDismissInfobar(msg.id, 2, 2);

  Assert.ok(
    !ASRouter.isBelowFrequencyCaps(msg),
    "Should have reached freq limit"
  );

  // The group cap is lower than the message cap, so the message is no longer
  // eligible even though its own lifetime cap allows one more impression.
  const eligible = await ASRouter.handleMessageRequest({
    triggerId: "preferenceObserver",
    triggerParam: { type: TEST_PREF },
  });
  Assert.equal(
    eligible,
    null,
    "Message is not eligible once the group cap is reached"
  );

  Services.prefs.setIntPref(TEST_PREF, 3);
  await TestUtils.waitForTick();
  Assert.ok(!getInfobar(msg.id), "Infobar should not be shown once capped");
  Assert.equal(
    ASRouter.state.messageImpressions[msg.id].length,
    2,
    "Number of impressions did not increase"
  );

  info("Cleanup");
  Services.prefs.clearUserPref(TEST_PREF);
  await client.db.clear();
  // Reset group impressions
  await ASRouter.resetGroupsState();
  // Reload the providers
  await ASRouter._updateMessageProviders();
  await ASRouter.loadMessagesFromAllProviders();
  await SpecialPowers.popPrefEnv();
});
