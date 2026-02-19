/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const TEST_CHAT_PROVIDER_URL = "http://mochi.test:8888/";

function mockSidebarChatbotUrls(providerControl) {
  let options = providerControl.inputEl.querySelectorAll("option");
  for (let option of options) {
    if (option.value.startsWith("https://")) {
      option.value = TEST_CHAT_PROVIDER_URL;
    }
  }
}

describe("settings ai features", () => {
  let doc, win;

  beforeEach(async function setup() {
    await SpecialPowers.pushPrefEnv({
      set: [["browser.preferences.aiControls", true]],
    });
    await openPreferencesViaOpenPreferencesAPI("general", { leaveOpen: true });
    doc = gBrowser.selectedBrowser.contentDocument;
    win = doc.ownerGlobal;
  });

  afterEach(() => {
    BrowserTestUtils.removeTab(gBrowser.selectedTab);
  });

  function waitForAnimationFrame() {
    return new Promise(r => win.requestAnimationFrame(r));
  }

  async function openAiFeaturePanel() {
    const paneLoaded = waitForPaneChange("ai");
    const categoryButton = doc.getElementById("category-ai-features");
    categoryButton.scrollIntoView();
    EventUtils.synthesizeMouseAtCenter(categoryButton, {}, win);
    await paneLoaded;
  }

  it("can change the chatbot provider value", async () => {
    await SpecialPowers.pushPrefEnv({
      set: [
        ["browser.ml.chat.page", false],
        ["browser.ml.chat.provider", ""],
        ["browser.ai.control.sidebarChatbot", "available"],
      ],
    });

    const categoryButton = doc.getElementById("category-ai-features");
    Assert.ok(categoryButton, "category exists");
    Assert.ok(
      BrowserTestUtils.isVisible(categoryButton),
      "category is visible"
    );

    await openAiFeaturePanel();

    const providerControl = doc.getElementById("aiControlSidebarChatbotSelect");
    mockSidebarChatbotUrls(providerControl);
    Assert.ok(providerControl, "control exists");
    Assert.ok(
      BrowserTestUtils.isVisible(providerControl),
      "control is visible"
    );
    Assert.equal(
      Services.prefs.getStringPref("browser.ml.chat.provider"),
      "",
      "Pref is empty"
    );

    Assert.equal(providerControl.value, "available", "No provider set");
    Assert.equal(
      Services.prefs.getBoolPref("browser.ml.chat.page"),
      false,
      "Chatbot page is disabled"
    );

    const settingChanged = waitForSettingChange(providerControl.setting);
    providerControl.focus();
    const pickerOpened = BrowserTestUtils.waitForSelectPopupShown(
      win.docShell.chromeEventHandler.ownerGlobal
    );
    EventUtils.sendKey("space");
    await pickerOpened;
    EventUtils.sendKey("down");
    EventUtils.sendKey("down");
    EventUtils.sendKey("return");
    await settingChanged;

    Assert.equal(
      providerControl.value,
      TEST_CHAT_PROVIDER_URL,
      "Provider enabled"
    );
    Assert.equal(
      Services.prefs.getStringPref("browser.ml.chat.provider"),
      TEST_CHAT_PROVIDER_URL,
      "Chatbot provider is set"
    );
    Assert.equal(
      Services.prefs.getBoolPref("browser.ml.chat.page"),
      true,
      "Chatbot page is enabled"
    );

    await gBrowser.ownerGlobal.SidebarController.hide();
  });

  it("can change the chatbot provider from blocked", async () => {
    await SpecialPowers.pushPrefEnv({
      set: [
        ["browser.ml.chat.page", false],
        ["browser.ml.chat.provider", ""],
        ["browser.ai.control.sidebarChatbot", "available"],
      ],
    });

    const categoryButton = doc.getElementById("category-ai-features");
    Assert.ok(categoryButton, "category exists");
    Assert.ok(
      BrowserTestUtils.isVisible(categoryButton),
      "category is visible"
    );

    await openAiFeaturePanel();

    let providerControl = doc.getElementById("aiControlSidebarChatbotSelect");
    Assert.ok(providerControl, "control exists");
    Assert.ok(
      BrowserTestUtils.isVisible(providerControl),
      "control is visible"
    );
    Assert.equal(
      Services.prefs.getStringPref("browser.ml.chat.provider"),
      "",
      "Pref is empty"
    );

    Assert.equal(providerControl.value, "available", "No provider set");

    // Set chatbot to Blocked
    let settingChanged = waitForSettingChange(providerControl.setting);
    providerControl.focus();
    let pickerOpened = BrowserTestUtils.waitForSelectPopupShown(
      win.docShell.chromeEventHandler.ownerGlobal
    );
    EventUtils.sendKey("space");
    await pickerOpened;
    EventUtils.sendKey("down");
    EventUtils.sendKey("return");
    await settingChanged;

    Assert.equal(providerControl.value, "blocked", "Provider blocked");
    Assert.equal(
      Services.prefs.getStringPref("browser.ml.chat.provider"),
      "",
      "Chatbot provider is empty"
    );
    Assert.equal(
      Services.prefs.getBoolPref("browser.ml.chat.page"),
      false,
      "Chatbot page stays disabled when blocked"
    );

    // Refresh the page
    await openPreferencesViaOpenPreferencesAPI("ai", { leaveOpen: true });

    // Verify it's still blocked
    providerControl = doc.getElementById("aiControlSidebarChatbotSelect");
    mockSidebarChatbotUrls(providerControl);
    Assert.equal(providerControl.value, "blocked", "Provider blocked");
    Assert.equal(
      Services.prefs.getStringPref("browser.ml.chat.provider"),
      "",
      "Chatbot provider is empty"
    );
    Assert.equal(
      Services.prefs.getBoolPref("browser.ml.chat.page"),
      false,
      "Chatbot page stays disabled when blocked"
    );

    // Change the selection to a chatbot
    settingChanged = waitForSettingChange(providerControl.setting);
    providerControl.focus();
    pickerOpened = BrowserTestUtils.waitForSelectPopupShown(
      win.docShell.chromeEventHandler.ownerGlobal
    );
    EventUtils.sendKey("space");
    await pickerOpened;
    EventUtils.sendKey("down");
    EventUtils.sendKey("return");
    await settingChanged;

    Assert.equal(
      providerControl.value,
      TEST_CHAT_PROVIDER_URL,
      "Provider enabled"
    );
    Assert.equal(
      Services.prefs.getStringPref("browser.ml.chat.provider"),
      TEST_CHAT_PROVIDER_URL,
      "Chatbot provider is set"
    );
    Assert.equal(
      Services.prefs.getBoolPref("browser.ml.chat.page"),
      true,
      "Chatbot page is enabled"
    );

    // Calling openPreferencesViaOpenPreferencesAPI again opened a blank tab
    BrowserTestUtils.removeTab(gBrowser.selectedTab);

    await gBrowser.ownerGlobal.SidebarController.hide();
    await SpecialPowers.popPrefEnv();
  });

  it("changes chatbot provider when the underlying pref changes", async () => {
    await SpecialPowers.pushPrefEnv({
      set: [
        ["browser.ml.chat.provider", ""],
        ["browser.ai.control.sidebarChatbot", "available"],
      ],
    });

    const categoryButton = doc.getElementById("category-ai-features");
    Assert.ok(categoryButton, "category exists");
    Assert.ok(
      BrowserTestUtils.isVisible(categoryButton),
      "category is visible"
    );

    await openAiFeaturePanel();

    const providerControl = doc.getElementById("aiControlSidebarChatbotSelect");
    mockSidebarChatbotUrls(providerControl);
    Assert.ok(providerControl, "control exists");
    Assert.ok(
      BrowserTestUtils.isVisible(providerControl),
      "control is visible"
    );
    Assert.equal(
      Services.prefs.getStringPref("browser.ml.chat.provider"),
      "",
      "Pref is empty"
    );
    Assert.equal(providerControl.value, "available", "No provider set");

    let settingChanged = waitForSettingChange(providerControl.setting);
    Services.prefs.setStringPref(
      "browser.ml.chat.provider",
      TEST_CHAT_PROVIDER_URL
    );
    await settingChanged;

    Assert.equal(
      Services.prefs.getStringPref("browser.ml.chat.provider"),
      TEST_CHAT_PROVIDER_URL,
      "Pref is set to provider URL"
    );
    Assert.equal(
      providerControl.value,
      TEST_CHAT_PROVIDER_URL,
      "Select is set to provider URL"
    );

    settingChanged = waitForSettingChange(providerControl.setting);
    Services.prefs.setStringPref("browser.ml.chat.provider", "");
    await settingChanged;

    Assert.equal(
      Services.prefs.getStringPref("browser.ml.chat.provider"),
      "",
      "Pref is cleared"
    );
    Assert.equal(
      providerControl.value,
      "available",
      "Select is back to available"
    );

    await gBrowser.ownerGlobal.SidebarController.hide();
    await SpecialPowers.popPrefEnv();
  });

  it("hides AI Window when preferences not enabled", async () => {
    await SpecialPowers.pushPrefEnv({
      set: [["browser.aiwindow.preferences.enabled", false]],
    });

    await openAiFeaturePanel();

    const aiWindowItem = doc.getElementById("AIWindowItem");
    const aiWindowFeatures = doc.getElementById("aiFeaturesAIWindowGroup");

    Assert.ok(
      !BrowserTestUtils.isVisible(aiWindowItem),
      "AIWindowItem is hidden when preferences not enabled"
    );
    Assert.ok(
      !BrowserTestUtils.isVisible(aiWindowFeatures),
      "aiWindowFeatures is hidden when preferences not enabled"
    );
  });

  it("shows AI Window activate when preferences enabled and feature not enabled", async () => {
    await SpecialPowers.pushPrefEnv({
      set: [
        ["browser.aiwindow.preferences.enabled", true],
        ["browser.aiwindow.enabled", false],
      ],
    });

    await openAiFeaturePanel();

    const aiWindowItem = doc.getElementById("AIWindowItem");
    Assert.ok(
      BrowserTestUtils.isVisible(aiWindowItem),
      "AIWindowItem is visible when preferences enabled and feature not enabled"
    );
  });

  it("hides AI Window activate when feature enabled", async () => {
    await SpecialPowers.pushPrefEnv({
      set: [
        ["browser.aiwindow.preferences.enabled", true],
        ["browser.aiwindow.enabled", true],
      ],
    });

    await openAiFeaturePanel();

    const aiWindowItem = doc.getElementById("AIWindowItem");
    Assert.ok(
      !BrowserTestUtils.isVisible(aiWindowItem),
      "AIWindowItem is hidden when feature enabled"
    );
  });

  describe("managed by policy", () => {
    async function runPolicyTest(name, pref, settingId) {
      try {
        Services.prefs.lockPref(pref);

        await openAiFeaturePanel();

        const control = doc.getElementById(settingId);
        Assert.ok(control, `${name} control exists`);
        Assert.ok(
          BrowserTestUtils.isVisible(control),
          `${name} control is visible when locked`
        );
        Assert.ok(
          control.disabled,
          `${name} control is disabled when pref is locked`
        );
      } finally {
        Services.prefs.unlockPref(pref);
      }
    }

    it("disables Smart Tab Groups control when pref is locked", async () => {
      await runPolicyTest(
        "Smart Tab Groups",
        "browser.tabs.groups.smart.userEnabled",
        "aiControlSmartTabGroupsSelect"
      );
    });

    it("disables Link Preview control when pref is locked", async () => {
      await runPolicyTest(
        "Link Preview",
        "browser.ml.linkPreview.optin",
        "aiControlLinkPreviewKeyPointsSelect"
      );
    });

    it("disables Sidebar Chatbot control when pref is locked", async () => {
      await runPolicyTest(
        "Sidebar Chatbot",
        "browser.ml.chat.enabled",
        "aiControlSidebarChatbotSelect"
      );
    });

    it("disables Translations control when pref is locked", async () => {
      await runPolicyTest(
        "Translations",
        "browser.translations.enable",
        "aiControlTranslationsSelect"
      );
    });
  });

  describe("block AI confirmation dialog", () => {
    it("closes dialog and does nothing on cancel", async () => {
      await SpecialPowers.pushPrefEnv({
        set: [
          ["browser.ai.control.default", "available"],
          ["extensions.ml.enabled", true],
        ],
      });

      await openAiFeaturePanel();

      const toggle = doc.getElementById("aiControlDefaultToggle");
      const dialogEl = doc.querySelector("block-ai-confirmation-dialog");
      await dialogEl.updateComplete;

      let dialogShown = BrowserTestUtils.waitForEvent(
        dialogEl.dialog,
        "toggle"
      );
      EventUtils.synthesizeMouseAtCenter(toggle.buttonEl, {}, win);
      await dialogShown;
      Assert.ok(dialogEl.dialog.open, "Dialog is open");
      Assert.equal(
        Services.prefs.getStringPref("browser.ai.control.default"),
        "available",
        "Pref unchanged after clicking toggle"
      );

      EventUtils.synthesizeMouseAtCenter(dialogEl.cancelButton, {}, win);

      Assert.ok(!dialogEl.dialog.open, "Dialog is closed after cancel");
      Assert.equal(
        Services.prefs.getStringPref("browser.ai.control.default"),
        "available",
        "Pref unchanged after cancel"
      );
      Assert.ok(
        Services.prefs.getBoolPref("extensions.ml.enabled"),
        "ML enabled pref unchanged after cancel"
      );
    });

    it("blocks AI features on confirm, unblocks on toggle off", async () => {
      await SpecialPowers.pushPrefEnv({
        set: [
          ["browser.ai.control.default", "available"],
          ["extensions.ml.enabled", true],
        ],
      });
      Services.fog.testResetFOG();

      await openAiFeaturePanel();

      // Flip the toggle to show confirmation dialog.
      const toggle = doc.getElementById("aiControlDefaultToggle");
      const dialogEl = doc.querySelector("block-ai-confirmation-dialog");
      await dialogEl.updateComplete;
      let dialogShown = BrowserTestUtils.waitForEvent(
        dialogEl.dialog,
        "toggle"
      );
      EventUtils.synthesizeMouseAtCenter(toggle.buttonEl, {}, win);
      await dialogShown;
      Assert.ok(dialogEl.dialog.open, "Dialog is open");
      Assert.ok(!toggle.pressed, "Toggle is unpressed during confirmation");
      Assert.equal(
        Services.prefs.getStringPref("browser.ai.control.default"),
        "available",
        "Pref unchanged after clicking toggle"
      );
      Assert.ok(
        !Glean.browser.globalAiControlToggled.testGetValue(),
        "No telemetry recorded before confirmation"
      );

      // Confirm the dialog to block
      let defaultSetting = win.Preferences.getSetting("aiControlDefaultToggle");
      let translationsSetting = win.Preferences.getSetting(
        "aiControlTranslationsSelect"
      );
      Assert.equal(
        translationsSetting.value,
        "available",
        "Translations are enabled"
      );
      await waitForSettingChange(defaultSetting, () =>
        EventUtils.synthesizeMouseAtCenter(dialogEl.confirmButton, {}, win)
      );
      Assert.ok(toggle.pressed, "Toggle is pressed after block");
      Assert.ok(!dialogEl.dialog.open, "Dialog is closed after confirm");
      Assert.equal(
        Services.prefs.getStringPref("browser.ai.control.default"),
        "blocked",
        "Pref set to blocked after confirm"
      );
      Assert.ok(
        !Services.prefs.getBoolPref("extensions.ml.enabled"),
        "ML enabled pref set to false after confirm"
      );
      Assert.equal(
        translationsSetting.value,
        "blocked",
        "Translations are now blocked"
      );
      let telemetryEvents = Glean.browser.globalAiControlToggled.testGetValue();
      Assert.equal(telemetryEvents.length, 1, "One telemetry event recorded");
      Assert.equal(
        telemetryEvents[0].extra.blocked,
        "true",
        "Telemetry recorded blocked=true"
      );

      // Enable STG to confirm it stays enabled on un-block
      let stgSetting = win.Preferences.getSetting(
        "aiControlSmartTabGroupsSelect"
      );
      Assert.equal(
        stgSetting.value,
        "blocked",
        "STG is blocked after global block"
      );
      await waitForAnimationFrame();
      const stgControl = doc.getElementById("aiControlSmartTabGroupsSelect");
      stgControl.focus();
      let pickerOpened = BrowserTestUtils.waitForSelectPopupShown(
        win.docShell.chromeEventHandler.ownerGlobal
      );
      EventUtils.sendKey("space");
      await pickerOpened;
      await waitForSettingChange(stgSetting, () => {
        EventUtils.sendKey("up");
        EventUtils.sendKey("return");
      });
      Assert.equal(stgSetting.value, "enabled", "STG is now enabled");

      // Unblock to confirm reset to available and STG is still enabled
      toggle.buttonEl.scrollIntoView();
      await waitForAnimationFrame();
      await waitForSettingChange(defaultSetting, () =>
        EventUtils.synthesizeMouseAtCenter(toggle.buttonEl, {}, win)
      );
      Assert.ok(!toggle.pressed, "Toggle is not pressed after unblocking");
      Assert.equal(
        Services.prefs.getStringPref("browser.ai.control.default"),
        "available",
        "Pref set to available after unblocking"
      );
      Assert.ok(
        Services.prefs.getBoolPref("extensions.ml.enabled"),
        "ML enabled pref set to true after unblocking"
      );
      Assert.equal(
        translationsSetting.value,
        "available",
        "Translations are now available"
      );
      Assert.equal(stgSetting.value, "enabled", "STG stayed enabled");
      telemetryEvents = Glean.browser.globalAiControlToggled.testGetValue();
      Assert.equal(telemetryEvents.length, 2, "Two telemetry events recorded");
      Assert.equal(
        telemetryEvents[1].extra.blocked,
        "false",
        "Telemetry recorded blocked=false"
      );
    });
  });

  describe("AI Controls visibility on General pane", () => {
    it("hides Link Preview setting when globally blocked via AI Controls toggle", async () => {
      await SpecialPowers.pushPrefEnv({
        set: [
          ["browser.ai.control.default", "available"],
          ["browser.ai.control.linkPreviewKeyPoints", "default"],
          ["browser.ml.linkPreview.enabled", true],
        ],
      });

      let aiControlsTab = gBrowser.selectedTab;
      await openAiFeaturePanel();

      await new Promise(resolve => open_preferences(resolve));
      let generalTab = gBrowser.selectedTab;
      let generalDoc = gBrowser.selectedBrowser.contentDocument;
      let generalWin = generalDoc.ownerGlobal;

      let linkPreviewSetting =
        generalWin.Preferences.getSetting("linkPreviewEnabled");
      let linkPreviewControl = generalDoc.getElementById("linkPreviewEnabled");
      Assert.ok(
        BrowserTestUtils.isVisible(linkPreviewControl),
        "Link Preview control is visible"
      );

      gBrowser.selectedTab = aiControlsTab;
      const toggle = doc.getElementById("aiControlDefaultToggle");
      const dialogEl = doc.querySelector("block-ai-confirmation-dialog");
      await dialogEl.updateComplete;
      let dialogShown = BrowserTestUtils.waitForEvent(
        dialogEl.dialog,
        "toggle"
      );
      EventUtils.synthesizeMouseAtCenter(toggle.buttonEl, {}, win);
      await dialogShown;
      Assert.ok(dialogEl.dialog.open, "Dialog is open");
      await waitForSettingChange(linkPreviewSetting, () =>
        EventUtils.synthesizeMouseAtCenter(dialogEl.confirmButton, {}, win)
      );

      gBrowser.selectedTab = generalTab;
      Assert.ok(
        !BrowserTestUtils.isVisible(linkPreviewControl),
        "Link Preview control is hidden after blocking"
      );

      // Explicitly enable Link Preview while globally blocked
      gBrowser.selectedTab = aiControlsTab;
      const linkPreviewSelect = doc.getElementById(
        "aiControlLinkPreviewKeyPointsSelect"
      );
      linkPreviewSelect.scrollIntoView();
      await waitForAnimationFrame();
      linkPreviewSelect.focus();
      let pickerOpened = BrowserTestUtils.waitForSelectPopupShown(
        win.docShell.chromeEventHandler.ownerGlobal
      );
      EventUtils.sendKey("space");
      await pickerOpened;
      await waitForSettingChange(linkPreviewSetting, () => {
        EventUtils.sendKey("up");
        EventUtils.sendKey("return");
      });

      gBrowser.selectedTab = generalTab;
      Assert.ok(
        BrowserTestUtils.isVisible(linkPreviewControl),
        "Link Preview control is visible after explicitly enabling"
      );

      BrowserTestUtils.removeTab(generalTab);
    });

    it("hides Tab Group Suggestions when globally blocked", async () => {
      await SpecialPowers.pushPrefEnv({
        set: [
          ["browser.ai.control.default", "available"],
          ["browser.ai.control.smartTabGroups", "default"],
          ["browser.tabs.groups.enabled", true],
          ["browser.tabs.groups.smart.enabled", true],
          ["browser.tabs.groups.smart.userEnabled", true],
        ],
      });

      // Tab Group Suggestions is only available in en-* locales
      if (!Services.locale.appLocaleAsBCP47.startsWith("en")) {
        Assert.ok(true, "Skipping: locale is not en-*");
        return;
      }

      let aiControlsTab = gBrowser.selectedTab;
      await openAiFeaturePanel();

      await new Promise(resolve => open_preferences(resolve));
      let generalTab = gBrowser.selectedTab;
      let generalDoc = gBrowser.selectedBrowser.contentDocument;
      let generalWin = generalDoc.ownerGlobal;

      let tabGroupSetting = generalWin.Preferences.getSetting(
        "tabGroupSuggestions"
      );
      let tabGroupControl = generalDoc.getElementById("tabGroupSuggestions");
      Assert.ok(
        BrowserTestUtils.isVisible(tabGroupControl),
        "Tab Group Suggestions control is visible"
      );

      gBrowser.selectedTab = aiControlsTab;
      const toggle = doc.getElementById("aiControlDefaultToggle");
      const dialogEl = doc.querySelector("block-ai-confirmation-dialog");
      await dialogEl.updateComplete;
      let dialogShown = BrowserTestUtils.waitForEvent(
        dialogEl.dialog,
        "toggle"
      );
      EventUtils.synthesizeMouseAtCenter(toggle.buttonEl, {}, win);
      await dialogShown;
      Assert.ok(dialogEl.dialog.open, "Dialog is open");
      await waitForSettingChange(tabGroupSetting, () =>
        EventUtils.synthesizeMouseAtCenter(dialogEl.confirmButton, {}, win)
      );

      gBrowser.selectedTab = generalTab;
      Assert.ok(
        !BrowserTestUtils.isVisible(tabGroupControl),
        "Tab Group Suggestions control is hidden after blocking"
      );

      BrowserTestUtils.removeTab(generalTab);
    });

    it("hides Translations setting when globally blocked via AI Controls toggle", async () => {
      await SpecialPowers.pushPrefEnv({
        set: [
          ["browser.ai.control.default", "available"],
          ["browser.ai.control.translations", "default"],
          ["browser.translations.enable", true],
          ["browser.settings-redesign.enable", false],
        ],
      });

      let aiControlsTab = gBrowser.selectedTab;
      await openAiFeaturePanel();

      await new Promise(resolve => open_preferences(resolve));
      let generalTab = gBrowser.selectedTab;
      let generalDoc = gBrowser.selectedBrowser.contentDocument;
      let generalWin = generalDoc.ownerGlobal;

      let translationsSetting = generalWin.Preferences.getSetting(
        "legacyTranslationsVisible"
      );
      let translationsGroup = generalDoc.getElementById("translationsGroup");
      Assert.ok(
        BrowserTestUtils.isVisible(translationsGroup),
        "Translations group is visible"
      );

      gBrowser.selectedTab = aiControlsTab;
      const toggle = doc.getElementById("aiControlDefaultToggle");
      const dialogEl = doc.querySelector("block-ai-confirmation-dialog");
      await dialogEl.updateComplete;
      let dialogShown = BrowserTestUtils.waitForEvent(
        dialogEl.dialog,
        "toggle"
      );
      EventUtils.synthesizeMouseAtCenter(toggle.buttonEl, {}, win);
      await dialogShown;
      Assert.ok(dialogEl.dialog.open, "Dialog is open");
      await waitForSettingChange(translationsSetting, () =>
        EventUtils.synthesizeMouseAtCenter(dialogEl.confirmButton, {}, win)
      );

      gBrowser.selectedTab = generalTab;
      Assert.ok(
        !BrowserTestUtils.isVisible(translationsGroup),
        "Translations group is hidden after blocking"
      );

      // Explicitly enable Translations while globally blocked
      gBrowser.selectedTab = aiControlsTab;
      const translationsSelect = doc.getElementById(
        "aiControlTranslationsSelect"
      );
      translationsSelect.scrollIntoView();
      await waitForAnimationFrame();
      translationsSelect.focus();
      let pickerOpened = BrowserTestUtils.waitForSelectPopupShown(
        win.docShell.chromeEventHandler.ownerGlobal
      );
      EventUtils.sendKey("space");
      await pickerOpened;
      await waitForSettingChange(translationsSetting, () => {
        EventUtils.sendKey("up");
        EventUtils.sendKey("return");
      });

      gBrowser.selectedTab = generalTab;
      Assert.ok(
        BrowserTestUtils.isVisible(translationsGroup),
        "Translations group is visible after explicitly enabling"
      );

      BrowserTestUtils.removeTab(generalTab);
    });

    it("shows settings when unblocked via global toggle", async () => {
      await SpecialPowers.pushPrefEnv({
        set: [
          ["browser.ai.control.default", "blocked"],
          ["browser.ai.control.linkPreviewKeyPoints", "default"],
          ["browser.ml.linkPreview.enabled", true],
          ["extensions.ml.enabled", false],
        ],
      });

      let aiControlsTab = gBrowser.selectedTab;
      await openAiFeaturePanel();

      await new Promise(resolve => open_preferences(resolve));
      let generalTab = gBrowser.selectedTab;
      let generalDoc = gBrowser.selectedBrowser.contentDocument;
      let generalWin = generalDoc.ownerGlobal;

      let linkPreviewSetting =
        generalWin.Preferences.getSetting("linkPreviewEnabled");
      let linkPreviewControl = generalDoc.getElementById("linkPreviewEnabled");
      Assert.ok(
        !BrowserTestUtils.isVisible(linkPreviewControl),
        "Link Preview control is hidden when blocked"
      );

      gBrowser.selectedTab = aiControlsTab;
      const toggle = doc.getElementById("aiControlDefaultToggle");
      Assert.ok(toggle.pressed, "Toggle is pressed (blocked state)");
      await waitForSettingChange(linkPreviewSetting, () =>
        EventUtils.synthesizeMouseAtCenter(toggle.buttonEl, {}, win)
      );

      gBrowser.selectedTab = generalTab;
      Assert.ok(
        BrowserTestUtils.isVisible(linkPreviewControl),
        "Link Preview control is visible after unblocking"
      );

      BrowserTestUtils.removeTab(generalTab);
    });
  });
});
