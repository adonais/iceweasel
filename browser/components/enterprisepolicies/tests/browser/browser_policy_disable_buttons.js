/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Locking one of these legacy prefs disables (or hides) the associated
// control in the settings UI. Each case names the pref, the pane the control
// lives in, and the setting id of the control.
const CASES = [
  {
    pref: "pref.privacy.disable_button.cookie_exceptions",
    pane: "privacy",
    controlId: "cookieExceptions",
  },
  {
    pref: "pref.privacy.disable_button.tracking_protection_exceptions",
    pane: "etp",
    controlId: "etpManageExceptionsButton",
  },
  {
    pref: "security.disable_button.openCertManager",
    pane: "connectionSecurity",
    controlId: "viewCertificatesButton",
  },
  {
    pref: "security.disable_button.openDeviceManager",
    pane: "connectionSecurity",
    controlId: "viewSecurityDevicesButton",
  },
  {
    pref: "pref.privacy.disable_button.view_passwords_exceptions",
    pane: "passwordsAutofill",
    controlId: "managePasswordExceptions",
  },
  {
    // A moz-box-link can't be disabled, so a locked pref hides it instead.
    pref: "pref.privacy.disable_button.view_passwords",
    pane: "passwordsAutofill",
    controlId: "manageSavedPasswords",
    hidden: true,
  },
  {
    pref: "app.update.disable_button.showUpdateHistory",
    pane: "about",
    controlId: "showUpdateHistory",
  },
];

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.settings-redesign.enabled", true]],
  });
  await setupPolicyEngineWithJson({
    policies: {
      Preferences: {
        "pref.privacy.disable_button.cookie_exceptions": true,
        "pref.privacy.disable_button.tracking_protection_exceptions": true,
        "pref.privacy.disable_button.view_passwords": true,
        "pref.privacy.disable_button.view_passwords_exceptions": true,
        "pref.downloads.disable_button.edit_actions": true,
        "app.update.disable_button.showUpdateHistory": true,
        "security.disable_button.openCertManager": true,
        "security.disable_button.openDeviceManager": true,
      },
    },
  });
});

add_task(async function test_disable_buttons_locked() {
  for (let { pref, pane, controlId, hidden } of CASES) {
    ok(Services.prefs.prefIsLocked(pref), `${pref} should be locked`);

    let tab = await BrowserTestUtils.openNewForegroundTab(
      gBrowser,
      "about:preferences"
    );
    let win = tab.linkedBrowser.contentWindow;
    win.location.hash = `#${pane}`;

    let settingControl = await TestUtils.waitForCondition(() =>
      win.document.getElementById(`setting-control-${controlId}`)
    );
    await settingControl.updateComplete;

    if (hidden) {
      ok(
        BrowserTestUtils.isHidden(settingControl),
        `${controlId} should be hidden when ${pref} is locked`
      );
    } else {
      ok(
        settingControl.controlEl.disabled,
        `${controlId} should be disabled when ${pref} is locked`
      );
    }

    BrowserTestUtils.removeTab(tab);
  }
});

add_task(async function test_disable_download_actions_locked() {
  ok(
    Services.prefs.prefIsLocked("pref.downloads.disable_button.edit_actions"),
    "edit_actions pref should be locked"
  );

  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:preferences"
  );
  let win = tab.linkedBrowser.contentWindow;
  win.location.hash = "#downloads";

  let menus = await TestUtils.waitForCondition(() => {
    let found = win.document.querySelectorAll(
      "#applicationsHandlersView .actionsMenu"
    );
    return found.length ? found : false;
  });

  for (let menu of menus) {
    ok(
      menu.disabled,
      "File handler action menu should be disabled when edit_actions is locked"
    );
  }

  BrowserTestUtils.removeTab(tab);
});
