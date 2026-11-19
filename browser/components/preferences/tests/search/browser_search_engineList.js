/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

// This tests the search engine list in about:preferences#search.

"use strict";

const { SearchTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/SearchTestUtils.sys.mjs"
);
const { SearchUtils } = ChromeUtils.importESModule(
  "moz-src:///toolkit/components/search/SearchUtils.sys.mjs"
);

SearchTestUtils.init(this);

const CONFIG = [
  { identifier: "engine1" },
  { identifier: "engine2" },
  {
    identifier: "de_only_engine",
    base: {
      urls: {
        search: {
          base: "https://moz.test/",
          searchTermParamName: "search",
        },
      },
    },
    variants: [
      {
        environment: { locales: ["de"] },
      },
    ],
  },
];

let userEngine;
let extensionEngine;
let installedEngines;
let userInstalledAppEngine;

async function engine_list_test(fn) {
  let task = async () => {
    let prefs = await openPreferencesViaOpenPreferencesAPI("search", {
      leaveOpen: true,
    });
    Assert.equal(
      prefs.selectedPane,
      "paneSearch",
      "Search pane is selected by default"
    );
    let doc = gBrowser.contentDocument;
    let engineList = doc.querySelector("moz-box-group#engineList");
    Assert.ok(
      !engineList.hidden,
      "The search engine list should be visible when Search is requested"
    );
    // Scroll the engine list into view since mouse operations off screen can
    // act confusingly.
    engineList.scrollIntoView();
    await fn(engineList, doc);
    BrowserTestUtils.removeTab(gBrowser.selectedTab);
  };

  // Make sure the name of the passed function is used in logs.
  Object.defineProperty(task, "name", { value: fn.name });
  add_task(task);
}

add_setup(async function () {
  await SearchTestUtils.updateRemoteSettingsConfig(CONFIG);
  installedEngines = await SearchService.getAppProvidedEngines();

  await SearchTestUtils.installSearchExtension({
    keyword: ["testing", "customkeyword"],
    search_url: "https://example.com/engine1",
    search_url_get_params: "search={searchTerms}",
    name: "Extension Engine",
  });
  extensionEngine = SearchService.getEngineByName("Extension Engine");
  installedEngines.push(extensionEngine);

  userEngine = await SearchService.addUserEngine({
    name: "User Engine",
    url: "https://example.com/user?q={searchTerms}&b=ff",
    alias: "u",
  });
  installedEngines.push(userEngine);

  userInstalledAppEngine =
    await SearchService.findContextualSearchEngineByHost("moz.test");

  await SearchService.addSearchEngine(userInstalledAppEngine);

  registerCleanupFunction(async () => {
    let leftover = SearchService.getEngineByName("User Engine");
    if (leftover) {
      await SearchService.removeEngine(leftover);
    }
  });
});

async function test_engine_list(engineList) {
  for (let i = 0; i < installedEngines.length; i++) {
    let engine = installedEngines[i];
    let row = engineList.children[i].lastChild;
    let displayedName = row.getAttribute("label");
    Assert.equal(
      displayedName,
      engine.name,
      "Search engine " + engine.name + " displayed correctly."
    );
  }
}

engine_list_test(test_engine_list);

async function test_change_keyword(engineList) {
  let extensionEngineIndex = installedEngines.length - 2;
  let row = engineList.children[extensionEngineIndex].lastChild;
  let extensionEditBtn = row.children[0].children[0];

  Assert.equal(
    row.description,
    "testing, customkeyword",
    "Internal keywords are displayed."
  );

  // Open new subdialog and add "keyword" as the keyword.
  let promiseSubDialogLoaded = promiseLoadSubDialog(
    "chrome://browser/content/search/addEngine.xhtml"
  );
  extensionEditBtn.scrollIntoView();
  EventUtils.synthesizeMouseAtCenter(
    extensionEditBtn,
    {},
    gBrowser.selectedBrowser.contentWindow
  );
  await promiseSubDialogLoaded;

  let prefsWin = gBrowser.selectedBrowser.contentWindow;
  let subDialog = prefsWin.gSubDialog;
  let dialogDoc = subDialog._topDialog._frame.contentDocument;

  let inputElem = dialogDoc.getElementById("engineAlias");
  let acceptBtn = dialogDoc.getElementById("add-engine-dialog")._buttons.accept;

  let keywordBefore = "keyword";
  inputElem.value = keywordBefore;
  inputElem.dispatchEvent(new Event("input", { bubbles: true }));
  acceptBtn.scrollIntoView();
  EventUtils.synthesizeMouseAtCenter(acceptBtn, {}, dialogDoc.defaultView);

  // Open new subdialog and add "Keyword" as the keyword (note capitalization).
  promiseSubDialogLoaded = promiseLoadSubDialog(
    "chrome://browser/content/search/addEngine.xhtml"
  );
  extensionEditBtn.scrollIntoView();
  EventUtils.synthesizeMouseAtCenter(
    extensionEditBtn,
    {},
    gBrowser.selectedBrowser.contentWindow
  );
  await promiseSubDialogLoaded;

  // Need to re-access things, as this is a new subdialog.
  dialogDoc = subDialog._topDialog._frame.contentDocument;
  inputElem = dialogDoc.getElementById("engineAlias");
  acceptBtn = dialogDoc.getElementById("add-engine-dialog")._buttons.accept;

  inputElem.focus();
  inputElem.value = "Keyword";
  inputElem.dispatchEvent(new Event("input", { bubbles: true }));
  await TestUtils.waitForCondition(
    () => inputElem.validationMessage,
    "Wait for keyword validation to complete"
  );
  // Press Enter to reveal the validation error, as if the user tried to
  // submit the form.
  EventUtils.synthesizeKey("KEY_Enter", {}, dialogDoc.defaultView);
  acceptBtn.scrollIntoView();
  EventUtils.synthesizeMouseAtCenter(acceptBtn, {}, dialogDoc.defaultView);
  await TestUtils.waitForCondition(
    () => inputElem.parentElement.querySelector(".error-label").textContent,
    "Wait for error label to appear"
  );
  let errorLabel =
    inputElem.parentElement.querySelector(".error-label").textContent;
  Assert.notEqual(
    errorLabel,
    "",
    "Should have an error message because of duplicate keywords"
  );
  Assert.ok(
    acceptBtn.disabled,
    "Should not be able to submit an invalid keyword"
  );

  // Cancel the invalid dialog before opening a new one.
  let cancelBtn = dialogDoc.getElementById("add-engine-dialog")._buttons.cancel;
  EventUtils.synthesizeMouseAtCenter(cancelBtn, {}, dialogDoc.defaultView);

  // Open new subdialog and ensure keyword has not changed.
  promiseSubDialogLoaded = promiseLoadSubDialog(
    "chrome://browser/content/search/addEngine.xhtml"
  );
  extensionEditBtn.scrollIntoView();
  EventUtils.synthesizeMouseAtCenter(
    extensionEditBtn,
    {},
    gBrowser.selectedBrowser.contentWindow
  );
  await promiseSubDialogLoaded;

  // Need to re-access things, as this is a new subdialog.
  dialogDoc = subDialog._topDialog._frame.contentDocument;
  inputElem = dialogDoc.getElementById("engineAlias");
  acceptBtn = dialogDoc.getElementById("add-engine-dialog")._buttons.accept;

  Assert.equal(
    inputElem.value,
    keywordBefore,
    "Should not have modified original keyword"
  );
}

engine_list_test(test_change_keyword);

async function test_toggle_engine(engineList, doc) {
  let appProvidedEngines = await SearchService.getAppProvidedEngines();
  let defaultEngineId = SearchService.defaultEngine.id;
  let defaultPrivateEngineId = SearchService.defaultPrivateEngine?.id;
  let engineToHide = appProvidedEngines.find(
    e => e.id != defaultEngineId && e.id != defaultPrivateEngineId
  );
  let defaultEngineDropdown = doc.getElementById("defaultEngineNormal");
  let includesHiddenEngine = () =>
    defaultEngineDropdown.options.some(opt => opt.value == engineToHide.id);

  Assert.ok(
    engineToHide,
    "Found a non-default app-provided engine to hide via toggle."
  );
  registerCleanupFunction(() => {
    engineToHide.hidden = false;
  });
  // Validate that the engine is included in the dropdown before we toggle it off.
  Assert.ok(
    includesHiddenEngine(),
    "Non-default app-provided engine is included in the default engine dropdown."
  );

  info(`Hiding app-provided engine "${engineToHide.name}".`);
  let toggle = doc.getElementById(`toggleEngine-${engineToHide.id}`);
  let editButton = doc.getElementById(`editEngine-${engineToHide.id}`);
  Assert.ok(toggle.pressed, "Toggle is initially pressed (engine visible).");
  Assert.ok(
    !editButton.disabled,
    "Edit button is initially enabled (engine visible)."
  );

  let dropdownChanged = waitForSettingControlChange(defaultEngineDropdown);
  let changedPromise = SearchTestUtils.promiseSearchNotification(
    SearchUtils.MODIFIED_TYPE.CHANGED,
    SearchUtils.TOPIC_ENGINE_MODIFIED
  );
  let editChanged = waitForSettingControlChange(editButton);

  toggle.scrollIntoView();
  EventUtils.synthesizeMouseAtCenter(toggle, {}, doc.defaultView);

  await changedPromise;
  Assert.ok(engineToHide.hidden, "Engine should be hidden after toggling off.");
  await dropdownChanged;
  // Hidden engines (i.e. app-provided engines not displayed in the UI) should
  // be removed from the default engine dropdown. (See bug 2007059)
  Assert.ok(
    !includesHiddenEngine(),
    "Hidden engine is not displayed in the default engine dropdown."
  );
  await editChanged;
  Assert.ok(
    editButton.disabled,
    "Edit button is disabled when engine is hidden."
  );

  info(
    `Re-show app-provided engine "${engineToHide.name}" when toggled back on.`
  );
  let dropdownRestored = waitForSettingControlChange(defaultEngineDropdown);
  let restoredPromise = SearchTestUtils.promiseSearchNotification(
    SearchUtils.MODIFIED_TYPE.CHANGED,
    SearchUtils.TOPIC_ENGINE_MODIFIED
  );
  toggle.scrollIntoView();
  EventUtils.synthesizeMouseAtCenter(toggle, {}, doc.defaultView);
  await restoredPromise;
  Assert.ok(
    !engineToHide.hidden,
    "Engine should be visible again after toggling on."
  );
  await dropdownRestored;
  Assert.ok(
    includesHiddenEngine(),
    "Re-shown engine is included in the default engine dropdown again."
  );
  Assert.ok(
    !editButton.disabled,
    "Edit button becomes enabled again when engine is visible."
  );
}

engine_list_test(test_toggle_engine);

engine_list_test(async function test_engine_list_accessible_name(engineList) {
  await assertBoxGroupHasListboxAccessibleName(engineList);
});

engine_list_test(async function test_no_toggle_for_non_config_engines(_, doc) {
  Assert.equal(
    doc.getElementById(`toggleEngine-${userEngine.id}`),
    null,
    "User engine has no toggle."
  );
  Assert.ok(
    doc.getElementById(`deleteEngine-${userEngine.id}`),
    "User engine has a delete button instead."
  );

  Assert.equal(
    doc.getElementById(`toggleEngine-${extensionEngine.id}`),
    null,
    "Extension (addon) engine has no toggle."
  );
  Assert.equal(
    doc.getElementById(`deleteEngine-${extensionEngine.id}`),
    null,
    "Extension (addon) engine has no delete button."
  );
});
