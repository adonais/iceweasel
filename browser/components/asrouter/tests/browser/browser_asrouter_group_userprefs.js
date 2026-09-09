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
const TEST_PREF = "test.asrouter.groupUserPrefs";
// Must be a pref ASRouterPreferences observes, otherwise changing it does not
// notify ASRouter and the group's enabled state is never recomputed.
const GROUP_USER_PREF =
  "browser.newtabpage.activity-stream.asrouter.userprefs.cfr.features";

function getInfobarBox() {
  return gBrowser.getNotificationBox(gBrowser.selectedBrowser);
}

function getInfobar(id) {
  return getInfobarBox().getNotificationWithValue(id);
}

/**
 * Load and modify a message for the test.
 */
add_setup(async function () {
  const initialMsgCount = ASRouter.state.messages.length;
  const testMessage = {
    // Ensure no overlap due to frequency capping with other tests
    id: `GROUP_USERPREFS_MESSAGE_${Date.now()}`,
    template: "infobar",
    groups: ["messaging-experiments"],
    targeting: "true",
    trigger: { id: "preferenceObserver", params: [TEST_PREF] },
    content: {
      type: "tab",
      text: "Group user preferences test infobar",
      buttons: [{ label: "OK", primary: true, action: { type: "CANCEL" } }],
    },
  };
  const client = RemoteSettings("cfr");
  await client.db.importChanges({}, Date.now(), [testMessage], { clear: true });

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
 * Test group user preferences.
 * Group is enabled if both user preferences are enabled.
 */
add_task(async function test_group_user_preferences() {
  const msg = ASRouter.state.messages.find(m =>
    m.groups.includes("messaging-experiments")
  );
  Assert.ok(msg, "Message found");
  const groupConfiguration = {
    id: "messaging-experiments",
    enabled: true,
    userPreferences: [GROUP_USER_PREF],
  };
  const client = RemoteSettings("message-groups");
  await client.db.importChanges({}, Date.now(), [groupConfiguration], {
    clear: true,
  });

  await SpecialPowers.pushPrefEnv({
    set: [
      [
        "browser.newtabpage.activity-stream.asrouter.providers.message-groups",
        `{"id":"message-groups","enabled":true,"type":"remote-settings","collection":"message-groups","updateCycleInMs":0}`,
      ],
      [GROUP_USER_PREF, true],
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
  Assert.ok(ASRouter.isUnblockedMessage(msg), "Message is unblocked");

  Services.prefs.setIntPref(TEST_PREF, 1);

  const node = await TestUtils.waitForCondition(
    () => getInfobar(msg.id),
    "Infobar should be shown (userprefs enabled)"
  );
  getInfobarBox().removeNotification(node);
  // Removal is animated, so InfoBar's stacking guard clears after the node is
  // already unreachable. Wait on the guard, otherwise the final assertion below
  // would pass because stacking was blocked rather than the group was disabled.
  await TestUtils.waitForCondition(
    () => !InfoBar._activeInfobar,
    "Active infobar should be cleared"
  );

  await SpecialPowers.pushPrefEnv({
    set: [[GROUP_USER_PREF, false]],
  });

  await TestUtils.waitForCondition(
    () =>
      ASRouter.state.groups.find(
        g => g.id === groupConfiguration.id && !g.enabled
      ),
    "Wait for the group to be disabled"
  );
  Assert.ok(
    !ASRouter.isUnblockedMessage(msg),
    "Message is blocked while the group is disabled"
  );

  const eligible = await ASRouter.handleMessageRequest({
    triggerId: "preferenceObserver",
    triggerParam: { type: TEST_PREF },
  });
  Assert.equal(
    eligible,
    null,
    "Message is not eligible while the group is disabled"
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
