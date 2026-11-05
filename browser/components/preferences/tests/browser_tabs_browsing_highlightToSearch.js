/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const SETTING_ID = "highlightToSearchEnabled";
const ASK_SETTING_ID = "highlightToSearchAskChatbot";
const SEARCH_SETTING_ID = "highlightToSearchSearch";
const FEATURE_GATE_PREF = "browser.highlightToSearch.featureGate";
const ENABLED_PREF = "browser.highlightToSearch.enabled";
const SEARCH_ENABLED_PREF = "browser.highlightToSearch.search.enabled";
const SHORTCUTS_PREF = "browser.ml.chat.shortcuts";
const PROVIDER_PREF = "browser.ml.chat.provider";

/**
 * Open the pane that holds the setting.
 *
 * @returns {Promise<{tab: MozTabbrowserTab, control: Element}>}
 */
async function openPaneWithSetting() {
  let pane = "tabsBrowsing";
  let tab = await openPrefsTab(pane);
  let doc = tab.linkedBrowser.contentDocument;
  await TestUtils.waitForCondition(
    () => doc.getElementById(SETTING_ID),
    "Wait for the setting to render"
  );
  return { tab, control: doc.getElementById(SETTING_ID) };
}

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.ml.chat.enabled", true],
      ["browser.ml.chat.openSidebarOnProviderChange", false],
      ["sidebar.main.tools", "aichat,history"],
    ],
  });
});

add_task(async function test_visibility_follows_feature_gate() {
  Assert.ok(
    !Services.prefs.getBoolPref(FEATURE_GATE_PREF),
    "Feature gate is off by default"
  );
  let { tab, control } = await openPaneWithSetting();

  await TestUtils.waitForCondition(
    () => BrowserTestUtils.isHidden(control),
    "Wait for the setting to be hidden"
  );
  is_element_hidden(control, "Hidden while the feature gate is off");

  await SpecialPowers.pushPrefEnv({ set: [[FEATURE_GATE_PREF, true]] });
  await TestUtils.waitForCondition(
    () => BrowserTestUtils.isVisible(control),
    "Wait for the setting to be shown"
  );
  is_element_visible(control, "Shown once the feature gate turns on");

  await SpecialPowers.popPrefEnv();
  await TestUtils.waitForCondition(
    () => BrowserTestUtils.isHidden(control),
    "Wait for the setting to be hidden again"
  );
  is_element_hidden(control, "Hidden again once the feature gate turns off");

  await BrowserTestUtils.removeTab(tab);
});

add_task(async function test_checkbox_controls_pref() {
  Services.fog.testResetFOG();
  await SpecialPowers.pushPrefEnv({
    set: [
      [FEATURE_GATE_PREF, true],
      [ENABLED_PREF, false],
    ],
  });
  let { tab, control } = await openPaneWithSetting();
  await TestUtils.waitForCondition(
    () => BrowserTestUtils.isVisible(control),
    "Wait for the setting to be shown"
  );
  Assert.ok(!control.checked, "Unchecked while the menu is turned off");

  control.scrollIntoView();
  EventUtils.synthesizeMouseAtCenter(
    control.labelEl,
    {},
    control.documentGlobal
  );
  await TestUtils.waitForCondition(
    () => Services.prefs.getBoolPref(ENABLED_PREF),
    "Wait for the pref to turn on"
  );
  Assert.ok(control.checked, "Checking the setting turns the menu on");

  control.scrollIntoView();
  EventUtils.synthesizeMouseAtCenter(
    control.labelEl,
    {},
    control.documentGlobal
  );
  await TestUtils.waitForCondition(
    () => !Services.prefs.getBoolPref(ENABLED_PREF),
    "Wait for the pref to turn off"
  );
  Assert.ok(!control.checked, "Unchecking the setting turns the menu off");

  Assert.deepEqual(
    Glean.selectionMenu.optionToggled
      .testGetValue()
      .map(({ extra: { action, enabled, source } }) => [
        action,
        enabled,
        source,
      ]),
    [
      ["master", "true", "settings"],
      ["master", "false", "settings"],
    ],
    "Both clicks on the menu setting are recorded"
  );

  await BrowserTestUtils.removeTab(tab);
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_ask_chatbot_toggle() {
  await SpecialPowers.pushPrefEnv({
    set: [
      [FEATURE_GATE_PREF, true],
      [PROVIDER_PREF, "https://chatgpt.com"],
      [SHORTCUTS_PREF, true],
    ],
  });
  let { tab } = await openPaneWithSetting();
  let doc = tab.linkedBrowser.contentDocument;
  let ask = doc.getElementById(ASK_SETTING_ID);
  await TestUtils.waitForCondition(
    () => BrowserTestUtils.isVisible(ask),
    "Wait for the ask setting to be shown"
  );

  await TestUtils.waitForCondition(
    () => ask.label == "Ask ChatGPT",
    "Wait for the provider name in the label"
  );
  Assert.equal(ask.label, "Ask ChatGPT", "Names the chosen provider");

  await SpecialPowers.pushPrefEnv({ set: [[PROVIDER_PREF, ""]] });
  await TestUtils.waitForCondition(
    () => ask.label == "Ask AI",
    "Wait for the generic label"
  );
  Assert.equal(
    ask.label,
    "Ask AI",
    "Falls back to a generic name once no provider is chosen"
  );
  await SpecialPowers.popPrefEnv();

  await BrowserTestUtils.removeTab(tab);
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_menu_never_on_without_an_action() {
  Services.fog.testResetFOG();
  await SpecialPowers.pushPrefEnv({
    set: [
      [FEATURE_GATE_PREF, true],
      [ENABLED_PREF, true],
      [SHORTCUTS_PREF, true],
      [SEARCH_ENABLED_PREF, true],
    ],
  });
  let { tab } = await openPaneWithSetting();
  let doc = tab.linkedBrowser.contentDocument;
  await TestUtils.waitForCondition(
    () =>
      BrowserTestUtils.isVisible(doc.getElementById(ASK_SETTING_ID)) &&
      BrowserTestUtils.isVisible(doc.getElementById(SEARCH_SETTING_ID)),
    "Wait for both actions to be shown"
  );

  // Re-fetch each control right before use: toggling one re-renders the
  // group, which detaches any element reference captured beforehand.
  let ask = doc.getElementById(ASK_SETTING_ID);
  ask.scrollIntoView();
  EventUtils.synthesizeMouseAtCenter(ask.labelEl, {}, ask.documentGlobal);
  await TestUtils.waitForCondition(
    () => !Services.prefs.getBoolPref(SHORTCUTS_PREF),
    "Wait for the ai action to turn off"
  );
  Assert.ok(
    doc.getElementById(SETTING_ID).checked,
    "Menu stays on while search is still checked"
  );

  let search = doc.getElementById(SEARCH_SETTING_ID);
  search.scrollIntoView();
  EventUtils.synthesizeMouseAtCenter(search.labelEl, {}, search.documentGlobal);
  await TestUtils.waitForCondition(
    () => !Services.prefs.getBoolPref(ENABLED_PREF),
    "Wait for the menu pref to turn off"
  );
  Assert.ok(
    !Services.prefs.getBoolPref(SEARCH_ENABLED_PREF),
    "Unchecking the setting hides the search action"
  );
  Assert.ok(
    !doc.getElementById(SETTING_ID).checked,
    "Unchecking the last action turns the menu off"
  );

  let control = doc.getElementById(SETTING_ID);
  control.scrollIntoView();
  EventUtils.synthesizeMouseAtCenter(
    control.labelEl,
    {},
    control.documentGlobal
  );
  await TestUtils.waitForCondition(
    () =>
      Services.prefs.getBoolPref(SHORTCUTS_PREF) &&
      Services.prefs.getBoolPref(SEARCH_ENABLED_PREF),
    "Wait for both actions to turn back on"
  );
  Assert.ok(
    Services.prefs.getBoolPref(ENABLED_PREF),
    "Checking the setting turns the menu on"
  );
  Assert.ok(
    doc.getElementById(ASK_SETTING_ID).checked &&
      doc.getElementById(SEARCH_SETTING_ID).checked,
    "Turning the menu on with no action checked checks every action"
  );

  Assert.deepEqual(
    Glean.selectionMenu.optionToggled
      .testGetValue()
      .map(({ extra: { action, enabled, source } }) => [
        action,
        enabled,
        source,
      ]),
    [
      ["ai", "false", "settings"],
      ["search", "false", "settings"],
      ["master", "false", "uncheck_all"],
      ["master", "true", "settings"],
    ],
    "Each click is recorded, and the menu turning itself off is recorded after the click that caused it"
  );

  await BrowserTestUtils.removeTab(tab);
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_search_toggle() {
  Services.fog.testResetFOG();
  await SpecialPowers.pushPrefEnv({
    set: [
      [FEATURE_GATE_PREF, true],
      [SEARCH_ENABLED_PREF, true],
    ],
  });
  let { tab } = await openPaneWithSetting();
  let doc = tab.linkedBrowser.contentDocument;
  let search = doc.getElementById(SEARCH_SETTING_ID);
  await TestUtils.waitForCondition(
    () => BrowserTestUtils.isVisible(search),
    "Wait for the search setting to be shown"
  );
  Assert.ok(search.checked, "Starts checked to match the pref");

  search.scrollIntoView();
  EventUtils.synthesizeMouseAtCenter(search.labelEl, {}, search.documentGlobal);
  await TestUtils.waitForCondition(
    () => !Services.prefs.getBoolPref(SEARCH_ENABLED_PREF),
    "Wait for the pref to turn off"
  );
  Assert.ok(!search.checked, "Unchecking the setting turns search off");

  let toggles = Glean.selectionMenu.optionToggled.testGetValue();
  Assert.equal(toggles.length, 1, "One option toggled");
  Assert.equal(toggles[0].extra.action, "search", "Toggled the search action");
  Assert.equal(toggles[0].extra.enabled, "false", "Turned off");
  Assert.equal(toggles[0].extra.source, "settings", "From the Settings pane");

  await BrowserTestUtils.removeTab(tab);
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_ask_chatbot_hidden_when_chatbot_blocked() {
  await SpecialPowers.pushPrefEnv({
    set: [
      [FEATURE_GATE_PREF, true],
      ["browser.ml.chat.enabled", false],
    ],
  });
  let { tab, control } = await openPaneWithSetting();
  let doc = tab.linkedBrowser.contentDocument;
  await TestUtils.waitForCondition(
    () => BrowserTestUtils.isVisible(control),
    "Wait for the menu setting to be shown"
  );

  await TestUtils.waitForCondition(
    () => doc.getElementById(ASK_SETTING_ID),
    "Wait for the ask setting to render"
  );
  let ask = doc.getElementById(ASK_SETTING_ID);
  await TestUtils.waitForCondition(
    () => BrowserTestUtils.isHidden(ask),
    "Wait for the ask setting to be hidden"
  );
  is_element_hidden(ask, "No AI action to offer when the chatbot is blocked");

  await BrowserTestUtils.removeTab(tab);
  await SpecialPowers.popPrefEnv();
});
