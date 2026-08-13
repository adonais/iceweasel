/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */
"use strict";

ChromeUtils.defineESModuleGetters(this, {
  CustomizableUITestUtils:
    "resource://testing-common/CustomizableUITestUtils.sys.mjs",
  SearchbarTestUtils: "resource://testing-common/UrlbarTestUtils.sys.mjs",
});

let gCUITestUtils = new CustomizableUITestUtils(window);
SearchbarTestUtils.init(this);

add_task(async function test_setup() {
  await gCUITestUtils.addSearchBar();
  registerCleanupFunction(() => {
    gCUITestUtils.removeSearchBar();
  });
});

// |shouldWork| should be true if opensearch is expected to work and false if
// it is not.
async function test_opensearch(shouldWork) {
  let rootDir = getRootDirectory(gTestPath);
  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    rootDir + "opensearch.html"
  );

  let popup = await SearchbarTestUtils.openSearchModeSwitcher(window);
  let engineElement = popup.querySelector(
    "panel-item[data-engine-name=newEngine]"
  );

  if (shouldWork) {
    ok(engineElement, "There should be search engines available to add");
  } else {
    is(
      engineElement,
      null,
      "There should be no search engines available to add"
    );
  }
  popup.hide();
  await BrowserTestUtils.removeTab(tab);
}

add_task(async function test_opensearch_works() {
  // Clear out policies so we can test with no policies applied
  await setupPolicyEngineWithJson({
    policies: {},
  });
  // Ensure that opensearch works before we make sure that it can be properly
  // disabled
  await test_opensearch(true);
});

add_task(async function setup_prevent_installs() {
  await setupPolicyEngineWithJson({
    policies: {
      SearchEngines: {
        PreventInstalls: true,
      },
    },
  });
});

add_task(async function test_prevent_install_ui() {
  // Check that about:preferences does not prompt user to install search engines
  // if that feature is disabled
  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:preferences#search"
  );
  await SpecialPowers.spawn(tab.linkedBrowser, [], async function () {
    if (
      Services.prefs.getBoolPref("browser.settings-redesign.enabled", false)
    ) {
      let isAddEngineHidden = () =>
        content.document.getElementById("setting-control-addEngineButton")
          ?.hidden;
      await ContentTaskUtils.waitForMutationCondition(
        content.document.documentElement,
        { subtree: true, childList: true, attributeFilter: ["hidden"] },
        isAddEngineHidden
      );
      ok(isAddEngineHidden(), '"Add search engine" button should be hidden');
      return;
    }
    let linkContainer = content.document.getElementById("addEnginesBox");
    if (!linkContainer.hidden) {
      await ContentTaskUtils.waitForMutationCondition(
        linkContainer,
        { attributeFilter: ["hidden"] },
        () => linkContainer.hidden
      );
    }
    ok(
      linkContainer.hidden,
      '"Find more search engines" link should be hidden'
    );
  });
  await BrowserTestUtils.removeTab(tab);
});

add_task(async function test_prevent_install_context_menu() {
  // Check that the "Add a Keyword for this Search" context menu item is not
  // offered when installing search engines is disabled.
  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "https://example.com/browser/browser/base/content/test/contextMenu/subtst_contextmenu_add_search_engine.html"
  );

  let contextMenu = document.getElementById("contentAreaContextMenu");
  let popupShown = BrowserTestUtils.waitForEvent(contextMenu, "popupshown");
  await BrowserTestUtils.synthesizeMouseAtCenter(
    "#search_text",
    { type: "contextmenu", button: 2 },
    tab.linkedBrowser
  );
  await popupShown;

  ok(
    document.getElementById("context-add-engine").hidden,
    "context-add-engine should be hidden when installs are prevented"
  );

  let popupHidden = BrowserTestUtils.waitForEvent(contextMenu, "popuphidden");
  contextMenu.hidePopup();
  await popupHidden;
  await BrowserTestUtils.removeTab(tab);
});

add_task(async function test_opensearch_disabled() {
  // Check that search engines cannot be added via opensearch
  await test_opensearch(false);
});
