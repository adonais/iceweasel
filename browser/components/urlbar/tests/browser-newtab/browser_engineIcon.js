/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

// A config engine's icon is a blob URL, which only resolves in the process that
// created it, and an add-on engine's is a moz-extension URL, which the page may
// not load, so a `<moz-urlbar>` in a content document takes either as a data
// URL.

"use strict";

// An identifier the packaged icon records cover, so the engine has an icon.
const ENGINE_WITH_ICON = "wikipedia";

const ADDON_ENGINE = "AddonEngine";
const ADDON_ENGINE_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16">' +
  '<rect width="16" height="16" fill="red"/></svg>';

add_setup(async function () {
  await SearchTestUtils.updateRemoteSettingsConfig([
    { identifier: "default" },
    { identifier: ENGINE_WITH_ICON, base: { aliases: [ENGINE_WITH_ICON] } },
  ]);

  let engine = SearchService.getEngineById(ENGINE_WITH_ICON);
  let iconUrl = await engine.getIconURL();
  Assert.ok(
    iconUrl?.startsWith("blob:"),
    "The engine's icon is a blob URL in the parent process"
  );
});

// The list of token alias engines "@" opens.
add_task(async function tokenAliasList() {
  let tab = await NewtabSearchbarTestUtils.openNewTabPage();

  await NewtabSearchbarTestUtils.promiseAutocompleteResultPopup({
    browser: tab.linkedBrowser,
    value: "@",
  });
  let icon = await NewtabSearchbarTestUtils.waitForRowIcon(
    tab.linkedBrowser,
    ENGINE_WITH_ICON,
    { notSrc: UrlbarShared.ICON.SEARCH_GLASS }
  );

  Assert.ok(icon.src.startsWith("data:"), "The page gets a data URL");
  Assert.ok(icon.loaded, "The icon loaded");

  BrowserTestUtils.removeTab(tab);
});

// The autofilled row a partially typed token alias produces.
add_task(async function tokenAliasAutofill() {
  let tab = await NewtabSearchbarTestUtils.openNewTabPage();

  await NewtabSearchbarTestUtils.promiseAutocompleteResultPopup({
    browser: tab.linkedBrowser,
    value: `@${ENGINE_WITH_ICON.slice(0, 3)}`,
  });
  let icon = await NewtabSearchbarTestUtils.waitForRowIcon(
    tab.linkedBrowser,
    ENGINE_WITH_ICON,
    { notSrc: UrlbarShared.ICON.SEARCH_GLASS }
  );

  Assert.ok(icon.src.startsWith("data:"), "The page gets a data URL");
  Assert.ok(icon.loaded, "The icon loaded");

  BrowserTestUtils.removeTab(tab);
});

// The search mode switcher's button, showing the default engine.
add_task(async function switcherButton() {
  let extension = await SearchTestUtils.installSearchExtension(
    { name: ADDON_ENGINE, icons: { 16: "icon.svg" } },
    { setAsDefault: true, skipUnload: true },
    { "icon.svg": ADDON_ENGINE_ICON }
  );
  let engine = SearchService.getEngineByName(ADDON_ENGINE);
  Assert.ok(
    (await engine.getIconURL())?.startsWith("moz-extension:"),
    "The engine's icon is a moz-extension URL in the parent process"
  );

  let tab = await NewtabSearchbarTestUtils.openNewTabPage();
  let icon = await NewtabSearchbarTestUtils.spawn(
    tab.linkedBrowser,
    [],
    async () => {
      let button = content.document.querySelector(".searchmode-switcher");
      await ContentTaskUtils.waitForCondition(
        () => button.getAttribute("iconsrc"),
        "waiting for the switcher button's icon"
      );
      // The button paints its icon from a stylesheet, so the page's own view of
      // the URL takes an image of its own.
      let src = button.getAttribute("iconsrc");
      let loaded = await new Promise(resolve => {
        let image = new content.Image();
        image.onload = () => resolve(true);
        image.onerror = () => resolve(false);
        image.src = src;
      });
      return { src, loaded };
    }
  );

  Assert.ok(icon.src.startsWith("data:"), "The page gets a data URL");
  Assert.ok(icon.loaded, "The icon loaded");

  BrowserTestUtils.removeTab(tab);
  await extension.unload();
});
