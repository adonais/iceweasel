/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

const { GenAI } = ChromeUtils.importESModule(
  "moz-src:///browser/components/genai/GenAI.sys.mjs"
);

registerCleanupFunction(() => {
  Services.prefs.clearUserPref("browser.ai.control.sidebarChatbot");
  Services.prefs.clearUserPref("browser.ml.chat.enabled");
  Services.prefs.clearUserPref("browser.ml.chat.page");
  Services.prefs.clearUserPref("browser.ml.chat.provider");
  Services.prefs.clearUserPref("sidebar.main.tools");
  Services.prefs.clearUserPref("sidebar.revamp");
});

/**
 * Check the sidebar chatbot AIFeature state transitions.
 */
add_task(async function test_chat_aifeature_states() {
  Services.prefs.setBoolPref("browser.ml.chat.enabled", false);
  Services.prefs.setBoolPref("browser.ml.chat.page", false);
  Services.prefs.setStringPref("browser.ml.chat.provider", "");

  Assert.equal(GenAI.isBlocked, true, "Blocked when chat is disabled");
  Assert.equal(GenAI.isEnabled, false, "Disabled without a provider");
  Assert.equal(GenAI.aiControlState, "blocked", "Blocked AI Controls state");

  await GenAI.makeAvailable();

  Assert.equal(
    Services.prefs.getBoolPref("browser.ml.chat.enabled"),
    true,
    "makeAvailable() enables the feature"
  );
  Assert.equal(
    Services.prefs.getBoolPref("browser.ml.chat.page"),
    true,
    "makeAvailable() restores the default page-chat state"
  );
  Assert.ok(
    !Services.prefs.prefHasUserValue("browser.ml.chat.page"),
    "makeAvailable() clears the page-chat user pref"
  );
  Assert.ok(
    !Services.prefs.prefHasUserValue("browser.ml.chat.provider"),
    "makeAvailable() clears the provider user pref"
  );
  Assert.equal(
    GenAI.aiControlState,
    "available",
    "Available without a chosen provider"
  );

  await GenAI.enable();

  Assert.equal(
    GenAI.aiControlState,
    "available",
    "enable() alone remains available until a provider is chosen"
  );
  Assert.equal(
    GenAI.isEnabled,
    false,
    "Not enabled until a provider is chosen"
  );

  Services.prefs.setStringPref(
    "browser.ml.chat.provider",
    "http://mochi.test:8888"
  );

  Assert.equal(GenAI.isEnabled, true, "Enabled once a provider is chosen");
  Assert.equal(
    GenAI.aiControlState,
    "enabled",
    "Choosing a provider makes the chatbot enabled"
  );

  await GenAI.block();

  Assert.equal(GenAI.isBlocked, true, "Blocked after block()");
  Assert.equal(GenAI.isEnabled, false, "Not enabled after block()");
  Assert.equal(
    Services.prefs.getBoolPref("browser.ml.chat.page"),
    false,
    "block() disables page chat"
  );
  Assert.ok(
    !Services.prefs.prefHasUserValue("browser.ml.chat.provider"),
    "block() clears the provider user pref"
  );
  Assert.equal(GenAI.aiControlState, "blocked", "Blocked after block()");
});

/**
 * Check various prefs for showing chat
 */
add_task(async function test_show_chat() {
  // Test should start with sidebar.revamp set to false
  Services.prefs.setBoolPref("sidebar.revamp", false);

  Assert.ok(!GenAI.canShowChatEntrypoint, "Default no");

  Services.prefs.setBoolPref("browser.ml.chat.enabled", true);

  Assert.ok(!GenAI.canShowChatEntrypoint, "Not enough to just enable");
  Assert.ok(GenAI.canOfferChatbot, "Can offer the chatbot with no provider");

  Services.prefs.setStringPref(
    "browser.ml.chat.provider",
    "http://mochi.test:8888"
  );

  Assert.ok(GenAI.canShowChatEntrypoint, "Can show with provider");

  Services.prefs.setStringPref("sidebar.main.tools", "aichat");
  Services.prefs.setBoolPref("sidebar.revamp", true);

  Assert.ok(
    GenAI.canShowChatEntrypoint,
    "Can show with revamp and aichat tool"
  );

  Services.prefs.setStringPref("sidebar.main.tools", "history");

  Assert.ok(!GenAI.canShowChatEntrypoint, "Not shown without chatbot tool");
  Assert.ok(!GenAI.canOfferChatbot, "Not offered without chatbot tool");

  Services.prefs.setBoolPref("sidebar.revamp", false);

  Assert.ok(GenAI.canShowChatEntrypoint, "Ignore tools without revamp");
});

/**
 * Check various prefs for showing the selection menu
 */
add_task(async function test_show_selection_menu() {
  Services.prefs.setBoolPref("sidebar.revamp", false);
  Services.prefs.setBoolPref("browser.ml.chat.enabled", true);
  Services.prefs.setBoolPref("browser.ml.chat.shortcuts", true);
  Services.prefs.setStringPref("browser.ml.chat.provider", "");
  Services.prefs.setBoolPref("browser.highlightToSearch.enabled", true);
  Services.prefs.setBoolPref("browser.highlightToSearch.featureGate", false);

  Assert.ok(!GenAI.canShowSelectionMenu, "No menu without provider or gate");

  Services.prefs.setBoolPref("browser.highlightToSearch.featureGate", true);

  Assert.ok(GenAI.canShowSelectionMenu, "Gate shows menu without provider");

  Services.prefs.setBoolPref("browser.ml.chat.enabled", false);

  Assert.ok(
    !GenAI.canShowSelectionMenu,
    "No menu when the chatbot is blocked, as it is the only action so far"
  );

  Services.prefs.setBoolPref("browser.ml.chat.enabled", true);
  Services.prefs.setBoolPref("browser.highlightToSearch.enabled", false);

  Assert.ok(!GenAI.canShowSelectionMenu, "Gate needs the feature enabled too");

  Services.prefs.setBoolPref("browser.highlightToSearch.featureGate", false);
  Services.prefs.setStringPref(
    "browser.ml.chat.provider",
    "http://mochi.test:8888"
  );

  Assert.ok(
    GenAI.canShowSelectionMenu,
    "Configured provider shows menu with the gate off"
  );

  Services.prefs.setBoolPref("browser.ml.chat.shortcuts", false);

  Assert.ok(!GenAI.canShowSelectionMenu, "No menu without chat shortcuts");
});

/**
 * Check the contexts that refuse gen-AI surfaces entirely
 */
add_task(async function test_supported_context() {
  const fakeBrowser = ({
    uri = "https://example.com/",
    isDocumentPiP = false,
    toolbarVisible = true,
  } = {}) => ({
    browsingContext: { currentURI: { spec: uri }, isDocumentPiP },
    documentGlobal: { toolbar: { visible: toolbarVisible } },
  });

  Assert.ok(GenAI.isSupportedContext(fakeBrowser()), "Regular page supported");
  Assert.ok(
    !GenAI.isSupportedContext(
      fakeBrowser({ uri: "moz-extension://abc/page.html" })
    ),
    "Extension page not supported"
  );
  Assert.ok(
    !GenAI.isSupportedContext(fakeBrowser({ isDocumentPiP: true })),
    "Document Picture-in-Picture not supported"
  );
  Assert.ok(
    !GenAI.isSupportedContext(fakeBrowser({ toolbarVisible: false })),
    "Popup window not supported"
  );
});
