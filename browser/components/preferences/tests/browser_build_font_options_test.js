add_task(async function test_font_options_accessibility_pane() {
  await openPrefsTab("accessibility");
  let doc = gBrowser.selectedBrowser.contentDocument;
  let contentWindow = gBrowser.selectedBrowser.contentWindow;
  let langGroup = Services.locale.fontLanguageGroup;
  let defaultFontType = Services.prefs.getCharPref("font.default." + langGroup);
  let fontFamilyPref = "font.name." + defaultFontType + "." + langGroup;
  let fontFamily = Services.prefs.getCharPref(fontFamilyPref);

  await BrowserTestUtils.waitForMutationCondition(
    doc.getElementById("mainPrefPane"),
    { childList: true, subtree: true },
    () => doc.querySelector('setting-group[groupid="fonts"]')
  );

  let fontsGroup = doc.querySelector('setting-group[groupid="fonts"]');
  ok(fontsGroup, "Fonts setting-group exists on accessibility pane");

  let mozSelect = fontsGroup.querySelector("#defaultFont");
  ok(mozSelect, "defaultFont moz-select exists");
  is(mozSelect.localName, "moz-select", "Control is a moz-select");

  await BrowserTestUtils.waitForMutationCondition(
    mozSelect,
    { childList: true, subtree: true },
    () => mozSelect.inputEl?.options.length > 0
  );
  is(mozSelect.value, fontFamily, "Font family should be set correctly.");

  function fontFamilyPrefChanged() {
    return new Promise(resolve => {
      const observer = {
        observe(aSubject, aTopic, aData) {
          if (aData == fontFamilyPref) {
            Services.prefs.removeObserver(fontFamilyPref, observer);
            resolve();
          }
        },
      };
      Services.prefs.addObserver(fontFamilyPref, observer);
    });
  }

  let selectEl = mozSelect.inputEl;
  let options = [...selectEl.options];
  Assert.greater(options.length, 1, "There are multiple font options.");
  is(selectEl.selectedIndex, 0, "The first (default) font option is selected.");

  await BrowserTestUtils.waitForMutationCondition(
    options[0],
    { childList: true, characterData: true, subtree: true },
    () => !!options[0].textContent.trim().length
  );
  let defaultLabel = options[0].textContent.trim();
  Assert.ok(
    !defaultLabel.startsWith("fonts-label-"),
    `Default font label "${defaultLabel}" is not a raw l10n ID`
  );

  let prefChangePromise = fontFamilyPrefChanged();
  let pickerOpened = BrowserTestUtils.waitForSelectPopupShown(window);
  mozSelect.focus();
  EventUtils.synthesizeKey(" ", {}, contentWindow);
  let selectPopup = await pickerOpened;
  if (selectPopup.isNativeMenu) {
    selectPopup.activateItem(selectPopup.childNodes[1]);
  } else {
    EventUtils.synthesizeKey("KEY_ArrowDown", {}, contentWindow);
    EventUtils.synthesizeKey("KEY_Enter", {}, contentWindow);
  }
  await prefChangePromise;

  fontFamily = Services.prefs.getCharPref(fontFamilyPref);
  is(mozSelect.value, fontFamily, "The font family has been updated.");
  is(selectEl.selectedIndex, 1, "The second font option is now selected.");

  prefChangePromise = fontFamilyPrefChanged();
  pickerOpened = BrowserTestUtils.waitForSelectPopupShown(window);
  mozSelect.focus();
  EventUtils.synthesizeKey(" ", {}, contentWindow);
  selectPopup = await pickerOpened;
  if (selectPopup.isNativeMenu) {
    selectPopup.activateItem(selectPopup.childNodes[0]);
  } else {
    EventUtils.synthesizeKey("KEY_ArrowUp", {}, contentWindow);
    EventUtils.synthesizeKey("KEY_Enter", {}, contentWindow);
  }
  await prefChangePromise;

  let settingControl = fontsGroup.querySelector("#setting-control-defaultFont");
  await settingControl.updateComplete;
  await mozSelect.updateComplete;

  fontFamily = Services.prefs.getCharPref(fontFamilyPref);
  is(mozSelect.value, fontFamily, "The font family has been updated.");
  is(
    mozSelect.value,
    "",
    "The default font value should be the empty string sentinel."
  );
  is(
    selectEl.selectedIndex,
    0,
    "The first (default) font option is selected again."
  );

  let defaultFontSize = Services.prefs.getIntPref(
    "font.size.variable." + langGroup
  );
  let sizeSelect = fontsGroup.querySelector("#defaultFontSize");
  ok(sizeSelect, "defaultFontSize moz-select exists");
  is(sizeSelect.localName, "moz-select", "Size control is a moz-select");

  await BrowserTestUtils.waitForMutationCondition(
    sizeSelect,
    { childList: true, subtree: true },
    () => sizeSelect.inputEl?.options.length > 0
  );
  is(
    String(sizeSelect.value),
    String(defaultFontSize),
    "Font size should be set correctly."
  );

  let advancedButton = fontsGroup.querySelector("#advancedFonts");
  ok(advancedButton, "advancedFonts button exists");
  let promiseSubDialogLoaded = promiseLoadSubDialog(
    "chrome://browser/content/preferences/dialogs/fonts.xhtml"
  );
  synthesizeClick(advancedButton);
  let win = await promiseSubDialogLoaded;
  doc = win.document;

  // Simulate a dumb font backend.
  win.FontBuilder._enumerator = {
    _list: ["MockedFont1", "MockedFont2", "MockedFont3"],
    _defaultFont: null,
    EnumerateFontsAsync() {
      return Promise.resolve(this._list);
    },
    EnumerateAllFontsAsync() {
      return Promise.resolve(this._list);
    },
    getDefaultFont() {
      return this._defaultFont;
    },
    getStandardFamilyName(name) {
      return name;
    },
  };
  win.FontBuilder._allFonts = null;
  win.FontBuilder._langGroupSupported = false;

  let langGroupElement = win.Preferences.get("font.language.group");
  let selectLangsField = doc.getElementById("selectLangs");
  let serifField = doc.getElementById("serif");
  let armenian = "x-armn";
  let western = "x-western";

  function fontListsRebuilt() {
    return win.gFontsDialog._selectLanguageGroupPromise;
  }

  langGroupElement.value = armenian;
  await fontListsRebuilt();
  selectLangsField.value = armenian;
  is(serifField.value, "", "Font family should not be set.");

  let armenianSerifElement = win.Preferences.get("font.name.serif.x-armn");

  langGroupElement.value = western;
  await fontListsRebuilt();
  selectLangsField.value = western;

  win.FontBuilder._enumerator._list = ["MockedFont2"];

  langGroupElement.value = armenian;
  await fontListsRebuilt();
  selectLangsField.value = armenian;
  is(
    serifField.value,
    "",
    "Font family should still be empty for indicating using 'default' font."
  );

  langGroupElement.value = western;
  await fontListsRebuilt();
  selectLangsField.value = western;

  win.FontBuilder._enumerator._list = [];

  langGroupElement.value = armenian;
  await fontListsRebuilt();
  selectLangsField.value = armenian;
  is(serifField.value, "", "Font family should not be set.");

  win.FontBuilder._enumerator._list = [
    "MockedFont1",
    "MockedFont2",
    "MockedFont3",
  ];
  win.FontBuilder._enumerator._defaultFont = "MockedFont3";
  langGroupElement.value = armenian;
  await fontListsRebuilt();
  selectLangsField.value = armenian;
  is(
    serifField.value,
    "",
    "Font family should be empty even if there is a default font."
  );

  armenianSerifElement.value = "MockedFont2";
  serifField.value = "MockedFont2";
  is(
    serifField.value,
    "MockedFont2",
    'Font family should be "MockedFont2" for now.'
  );

  langGroupElement.value = western;
  await fontListsRebuilt();
  selectLangsField.value = western;
  is(serifField.value, "", "Font family of other language should not be set.");

  langGroupElement.value = armenian;
  await fontListsRebuilt();
  selectLangsField.value = armenian;
  is(
    serifField.value,
    "MockedFont2",
    "Font family should not be changed even after switching the language."
  );

  win.FontBuilder._enumerator._list = ["MockedFont1", "MockedFont3"];
  win.FontBuilder._enumerator._allFonts = ["MockedFont1", "MockedFont3"];
  serifField.removeAllItems();
  langGroupElement.value = armenian;
  await fontListsRebuilt();
  selectLangsField.value = armenian;
  is(
    serifField.value,
    "",
    "Font family should become empty due to the font uninstalled."
  );

  BrowserTestUtils.removeTab(gBrowser.selectedTab);
});
