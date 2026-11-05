/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

// Tests for the browser language section

AddonTestUtils.initMochitest(this);

// Installed langpacks should appear in the language selector, sorted.
add_task(async function testInstalledLangpacksListedAndSorted() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["intl.multilingual.enabled", true],
      ["intl.multilingual.downloadEnabled", false],
      ["extensions.langpacks.signatures.required", false],
    ],
  });

  // Install "pl" then "fr" so they need to be sorted.
  let addons = await installLangpacks(["pl", "fr"]);
  let doc = await openLanguagesPrefs();
  await waitForLanguageUI(doc);

  Assert.deepEqual(
    getAvailableLocales(doc),
    ["en-US", "fr", "pl"],
    "Installed locales are listed and sorted"
  );

  await Promise.all(addons.map(addon => addon.uninstall()));
  BrowserTestUtils.removeTab(gBrowser.selectedTab);
});

// Selecting a different language when liveReload is off shows a restart
// confirmation.
add_task(async function testLanguageChangeShowsRestartConfirmation() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["intl.multilingual.enabled", true],
      ["intl.multilingual.downloadEnabled", false],
      ["intl.multilingual.liveReload", false],
      ["intl.multilingual.liveReloadBidirectional", false],
      ["intl.locale.requested", "en-US"],
      ["extensions.langpacks.signatures.required", false],
    ],
  });

  let addon = await installLangpack("fr");
  let doc = await openLanguagesPrefs();
  await waitForLanguageUI(doc);

  assertRestartMessageHidden(doc);

  await changeLocale(doc, "fr");
  await waitForRestartMessage(doc);

  await addon.uninstall();
  BrowserTestUtils.removeTab(gBrowser.selectedTab);
});

// Selecting a different language when liveReload is on applies it immediately
// without showing a restart confirmation.
add_task(async function testLanguageChangeLiveReload() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["intl.multilingual.enabled", true],
      ["intl.multilingual.downloadEnabled", false],
      ["intl.multilingual.liveReload", true],
      ["intl.multilingual.liveReloadBidirectional", true],
      ["intl.locale.requested", "en-US"],
      ["extensions.langpacks.signatures.required", false],
    ],
  });

  let addon = await installLangpack("fr");
  let doc = await openLanguagesPrefs();
  await waitForLanguageUI(doc);

  await changeLocale(doc, "fr");

  await TestUtils.waitForCondition(
    () => Services.locale.requestedLocales.includes("fr"),
    "The fr locale is applied immediately with live reload"
  );
  assertRestartMessageHidden(doc);

  await addon.uninstall();
  BrowserTestUtils.removeTab(gBrowser.selectedTab);
});
