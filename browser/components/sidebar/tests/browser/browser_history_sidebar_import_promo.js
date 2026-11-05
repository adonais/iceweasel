/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const HAS_IMPORTED_HISTORY_PREF = "browser.migrate.interactions.history";
const IMPORT_HISTORY_DISMISSED_PREF =
  "browser.tabs.firefox-view.importHistory.dismissed";

add_setup(async () => {
  await SpecialPowers.pushPrefEnv({
    set: [
      [IMPORT_HISTORY_DISMISSED_PREF, false],
      [HAS_IMPORTED_HISTORY_PREF, false],
    ],
  });
  await populateHistory();
  registerCleanupFunction(async () => {
    await PlacesUtils.history.clear();
  });
});

function getPromo(component) {
  return component.shadowRoot.querySelector(".import-history-promo");
}

async function waitForPromo(component, shouldShow, msg) {
  await BrowserTestUtils.waitForMutationCondition(
    component.shadowRoot,
    { childList: true, subtree: true },
    () => !!getPromo(component) == shouldShow,
    { msg }
  );
  await component.updateComplete;
  return getPromo(component);
}

add_task(async function test_import_promo_visibility() {
  const { component } = await showHistorySidebar();
  component.controller.profileAge = 0;
  let promo = await waitForPromo(
    component,
    true,
    "Import promo is shown for a new profile."
  );
  await promo.updateComplete;

  Assert.equal(
    document.l10n.getAttributes(promo).id,
    "sidebar-history-import-promo",
    "Import promo is shown for a new profile."
  );
  Assert.equal(
    promo.imageSrc,
    "chrome://browser/skin/sidebar/kit-history-import.svg",
    "Import promo shows the Kit illustration."
  );
  ok(
    promo.nextElementSibling.matches("moz-card"),
    "Import promo is shown above the history cards."
  );

  component.controller.profileAge = 8;
  await waitForPromo(
    component,
    false,
    "Import promo is hidden once the profile is older than a week."
  );

  component.controller.profileAge = 0;
  await waitForPromo(component, true, "Import promo is shown again.");
  Services.prefs.setBoolPref(HAS_IMPORTED_HISTORY_PREF, true);
  await waitForPromo(
    component,
    false,
    "Import promo is hidden once history has been imported."
  );
  Services.prefs.setBoolPref(HAS_IMPORTED_HISTORY_PREF, false);

  SidebarController.hide();
});

add_task(async function test_import_promo_opens_migration_wizard() {
  await BrowserTestUtils.withNewTab("about:robots", async () => {
    const { component, contentWindow } = await showHistorySidebar();
    component.controller.profileAge = 0;
    const promo = await waitForPromo(
      component,
      true,
      "Import promo is shown for a new profile."
    );

    const wizardReady = BrowserTestUtils.waitForEvent(
      window,
      "MigrationWizard:Ready"
    );
    const wizardTabPromise = BrowserTestUtils.waitForNewTab(gBrowser, url =>
      url.startsWith("about:preferences")
    );
    const importButton = promo.querySelector("moz-button[slot=actions]");
    EventUtils.synthesizeMouseAtCenter(importButton, {}, contentWindow);
    const wizardTab = await wizardTabPromise;
    await wizardReady;
    ok(getPromo(component), "Import promo stays visible after opening wizard.");

    BrowserTestUtils.removeTab(wizardTab);
    SidebarController.hide();
  });
});

add_task(async function test_import_promo_dismiss() {
  const { component, contentWindow } = await showHistorySidebar();
  component.controller.profileAge = 0;
  const promo = await waitForPromo(
    component,
    true,
    "Import promo is shown for a new profile."
  );
  await promo.updateComplete;

  EventUtils.synthesizeMouseAtCenter(promo.closeButton, {}, contentWindow);
  await waitForPromo(component, false, "Import promo is hidden on dismiss.");
  ok(
    Services.prefs.getBoolPref(IMPORT_HISTORY_DISMISSED_PREF),
    "Dismissing the promo is remembered."
  );
  ok(component.cards.length, "History cards are still shown.");

  Services.prefs.setBoolPref(IMPORT_HISTORY_DISMISSED_PREF, false);
  await waitForPromo(
    component,
    true,
    "Promo is rendered again by Lit after resetting the pref."
  );

  SidebarController.hide();
});
