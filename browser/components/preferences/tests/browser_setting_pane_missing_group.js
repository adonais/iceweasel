/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Regression test for bug 2051119: an unregistered group used to make
// SettingPane.init() throw `Setting group "<id>" not found` and abort the
// whole pane.

add_task(async function setting_pane_tolerates_unregistered_group() {
  await openPreferencesViaOpenPreferencesAPI("privacy", { leaveOpen: true });
  registerCleanupFunction(() => {
    BrowserTestUtils.removeTab(gBrowser.selectedTab);
  });

  const doc = gBrowser.selectedBrowser.contentDocument;
  const win = doc.documentGlobal;

  const REGISTERED_GROUP = "bug2051119Registered";
  const MISSING_GROUP = "bug2051119Missing";
  const PANE_ID = "bug2051119MissingGroupPane";

  win.Preferences.addSetting({ id: "bug2051119Setting", get: () => true });
  win.SettingGroupManager.registerGroup(REGISTERED_GROUP, {
    headingLevel: 2,
    items: [
      { id: "bug2051119Setting", controlAttrs: { label: "Test setting" } },
    ],
  });
  // Leave MISSING_GROUP unregistered on purpose. A pane can be created before
  // its groups are registered. The newtab feed can register some of the Home
  // pane's groups after the pane is created.

  // Reuse an already-loaded l10nId. A fake one leaves a dangling Fluent
  // rejection that fails --verify.
  // Order the missing group first so init() must get past it to configure the
  // registered sibling.
  win.SettingPaneManager.registerPane(PANE_ID, {
    l10nId: "home-custom-homepage-subpage",
    groupIds: [MISSING_GROUP, REGISTERED_GROUP],
  });
  const pane = [...doc.querySelectorAll("setting-pane")].find(
    p => p.config?.id === PANE_ID
  );
  ok(pane, "The test setting-pane was created");

  let initError = null;
  try {
    pane.init();
  } catch (e) {
    initError = e;
  }
  ok(
    !initError,
    "SettingPane.init() must not abort when one of its groups is unregistered " +
      `(got: ${initError && initError.message})`
  );

  // Confirm init() continued past the missing group and still configured the
  // registered sibling.
  const registeredEl = pane.querySelector(
    `setting-group[groupid="${REGISTERED_GROUP}"]`
  );
  ok(registeredEl, "The registered sibling group element exists");
  if (registeredEl?.updateComplete) {
    await registeredEl.updateComplete;
  }
  ok(registeredEl?.config, "The registered sibling group has its config");
});
