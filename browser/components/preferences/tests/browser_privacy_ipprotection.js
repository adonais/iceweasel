/* Any copyright is dedicated to the Public Domain.
 * https://creativecommons.org/publicdomain/zero/1.0/ */

// This file tests the Privacy pane's Firefox VPN UI.

"use strict";

const FEATURE_PREF = "browser.ipProtection.enabled";
const SITE_EXCEPTIONS_FEATURE_PREF =
  "browser.ipProtection.features.siteExceptions";
const AUTOSTART_FEATURE_ENABLED_PREF =
  "browser.ipProtection.features.autoStart";
const AUTOSTART_PREF = "browser.ipProtection.autoStartEnabled";
const AUTOSTART_PRIVATE_PREF = "browser.ipProtection.autoStartPrivateEnabled";
const ONBOARDING_MESSAGE_MASK_PREF =
  "browser.ipProtection.onboardingMessageMask";

const SECTION_ID = "dataIPProtectionGroup";

async function setupVpnPrefs({
  feature = false,
  siteExceptions = false,
  autostartFeatureEnabled = false,
  autostart = false,
  autostartprivate = false,
}) {
  return SpecialPowers.pushPrefEnv({
    set: [
      [FEATURE_PREF, feature],
      [SITE_EXCEPTIONS_FEATURE_PREF, siteExceptions],
      [AUTOSTART_FEATURE_ENABLED_PREF, autostartFeatureEnabled],
      [AUTOSTART_PREF, autostart],
      [AUTOSTART_PRIVATE_PREF, autostartprivate],
    ],
  });
}

function testSettingsGroupVisible(browser, sectionId) {
  let section = browser.contentDocument.getElementById(sectionId);
  let settingGroup = section.querySelector(
    `setting-group[groupid="ipprotection"]`
  );
  is_element_visible(section, "#dataIPProtectionGroup is shown");
  is_element_visible(settingGroup, "ipprotection setting group is shown");

  return settingGroup;
}

// Test the section is hidden on page load if the feature pref is disabled.
add_task(
  async function test_section_removed_when_set_to_ineligible_experiment_pref() {
    await setupVpnPrefs({ feature: false });

    await BrowserTestUtils.withNewTab(
      { gBrowser, url: "about:preferences#privacy" },
      async function (browser) {
        let section = browser.contentDocument.getElementById(SECTION_ID);
        is_element_hidden(section, "#dataIPProtectionGroup is hidden");
      }
    );

    await SpecialPowers.popPrefEnv();
  }
);

// Test the section is shown on page load if the feature pref is enabled
add_task(
  async function test_section_shown_when_set_to_eligible_experiment_pref() {
    await setupVpnPrefs({ feature: true });

    await BrowserTestUtils.withNewTab(
      { gBrowser, url: "about:preferences#privacy" },
      async function (browser) {
        testSettingsGroupVisible(browser, SECTION_ID);
      }
    );
  }
);

// Test the site exceptions controls load correctly.
add_task(async function test_exceptions_settings() {
  await setupVpnPrefs({ feature: true, siteExceptions: true });

  await BrowserTestUtils.withNewTab(
    { gBrowser, url: "about:preferences#privacy" },
    async function (browser) {
      let settingGroup = testSettingsGroupVisible(browser, SECTION_ID);
      let siteExceptionsGroup = settingGroup?.querySelector(
        "#ipProtectionExceptions"
      );
      is_element_visible(siteExceptionsGroup, "Site exceptions group is shown");

      let exceptionAllListButton = siteExceptionsGroup?.querySelector(
        "#ipProtectionExceptionAllListButton"
      );
      is_element_visible(
        exceptionAllListButton,
        "Button for list of exclusions is shown"
      );
    }
  );
});

// Test that we show the "Add" button in the site exceptions permission dialog
// and correctly add site exclusions.
add_task(async function test_exclusions_add_button() {
  const PERM_NAME = "ipp-vpn";
  await setupVpnPrefs({ feature: "beta", siteExceptions: true });

  await BrowserTestUtils.withNewTab(
    { gBrowser, url: "about:preferences#privacy" },
    async function (browser) {
      let settingGroup = testSettingsGroupVisible(browser, SECTION_ID);
      let siteExceptionsGroup = settingGroup?.querySelector(
        "#ipProtectionExceptions"
      );
      let exceptionAllListButton = siteExceptionsGroup?.querySelector(
        "#ipProtectionExceptionAllListButton"
      );
      is_element_visible(
        exceptionAllListButton,
        "Button for list of exclusions is shown"
      );

      // Clear ipp-vpn to start with 0 exclusions
      Services.perms.removeByType(PERM_NAME);

      // Let's load the dialog
      let promiseSubDialogLoaded = promiseLoadSubDialog(
        "chrome://browser/content/preferences/dialogs/permissions.xhtml"
      );

      exceptionAllListButton.click();

      const win = await promiseSubDialogLoaded;

      let addButton = win.document.getElementById("btnAdd");
      Assert.ok(addButton, "Add button exists");
      Assert.ok(BrowserTestUtils.isVisible(addButton), "Add button is visible");
      Assert.ok(addButton.disabled, "Add button is disabled");

      // Now let's click the Add button to add a new exclusion
      let permissionsBox = win.document.getElementById("permissionsBox");
      let siteListUpdatedPromise = BrowserTestUtils.waitForMutationCondition(
        permissionsBox,
        { subtree: true, childList: true },
        () => {
          return permissionsBox.children.length;
        }
      );

      // Set up a mock url input value
      let urlField = win.document.getElementById("url");
      Assert.ok(urlField, "Dialog url field exists");
      const site1 = "https://example.com";
      urlField.focus();

      EventUtils.sendString(site1, win);
      Assert.ok(!addButton.disabled, "Add button is enabled");

      addButton.click();

      await siteListUpdatedPromise;

      permissionsBox = win.document.getElementById("permissionsBox");
      Assert.equal(
        permissionsBox.children.length,
        1,
        "Should have 1 site listed as an exclusion"
      );

      let shownSite1 = permissionsBox.children[0];
      Assert.equal(
        shownSite1.getAttribute("origin"),
        site1,
        "Should match inputted site in the list of sites"
      );

      // Apply the changes
      let saveButton = win.document.querySelector("dialog").getButton("accept");
      Assert.ok(saveButton, "Save button is shown");

      saveButton.click();

      let exclusions = Services.perms.getAllByTypes([PERM_NAME]);
      Assert.equal(
        exclusions.length,
        1,
        "Should have 1 exclusion after pressing the Add button"
      );
      Assert.equal(
        exclusions[0]?.principal.siteOrigin,
        site1,
        "Should match the inputted site"
      );

      // Clean up
      Services.perms.removeByType(PERM_NAME);
      Services.prefs.clearUserPref(ONBOARDING_MESSAGE_MASK_PREF);
    }
  );
});

// Test that we show the correct number of site exclusions
add_task(async function test_exclusions_count() {
  const PERM_NAME = "ipp-vpn";
  await setupVpnPrefs({ feature: "beta", siteExceptions: true });

  await BrowserTestUtils.withNewTab(
    { gBrowser, url: "about:preferences#privacy" },
    async function (browser) {
      let section = browser.contentDocument.getElementById(SECTION_ID);
      let settingGroup = section.querySelector(
        `setting-group[groupid="ipprotection"]`
      );
      is_element_visible(section, "#dataIPProtectionGroup is shown");
      is_element_visible(settingGroup, "ipprotection setting group is shown");

      let siteExceptionsGroup = settingGroup?.querySelector(
        "#ipProtectionExceptions"
      );
      is_element_visible(siteExceptionsGroup, "Site exceptions group is shown");

      let exceptionAllListButton = siteExceptionsGroup?.querySelector(
        "#ipProtectionExceptionAllListButton"
      );
      is_element_visible(
        exceptionAllListButton,
        "Button for list of exclusions is shown"
      );

      let sitesCountUpdatedPromise = BrowserTestUtils.waitForMutationCondition(
        exceptionAllListButton,
        { attributes: true, attributeFilter: ["data-l10n-args"] },
        () => {
          let args = exceptionAllListButton.getAttribute("data-l10n-args");
          return args && JSON.parse(args)?.count === 0;
        }
      );

      // Clear ipp-vpn to start with 0 exclusions
      Services.perms.removeByType(PERM_NAME);

      await sitesCountUpdatedPromise;

      Assert.ok(true, "Should show 0 exclusions initially");

      // Now test with 1 exclusion
      sitesCountUpdatedPromise = BrowserTestUtils.waitForMutationCondition(
        exceptionAllListButton,
        { attributes: true, attributeFilter: ["data-l10n-args"] },
        () => {
          let args = exceptionAllListButton.getAttribute("data-l10n-args");
          return args && JSON.parse(args)?.count === 1;
        }
      );
      let site1 = "https://example.com";
      let principal1 =
        Services.scriptSecurityManager.createContentPrincipalFromOrigin(site1);
      Services.perms.addFromPrincipal(
        principal1,
        PERM_NAME,
        Services.perms.DENY_ACTION
      );

      await sitesCountUpdatedPromise;

      Assert.ok(true, "Should show 1 exclusion after adding the first site");

      // Now test with 2 exclusions
      sitesCountUpdatedPromise = BrowserTestUtils.waitForMutationCondition(
        exceptionAllListButton,
        { attributes: true, attributeFilter: ["data-l10n-args"] },
        () => {
          let args = exceptionAllListButton.getAttribute("data-l10n-args");
          return args && JSON.parse(args)?.count === 2;
        }
      );
      let site2 = "https://example.org";
      let principal2 =
        Services.scriptSecurityManager.createContentPrincipalFromOrigin(site2);
      Services.perms.addFromPrincipal(
        principal2,
        PERM_NAME,
        Services.perms.DENY_ACTION
      );

      await sitesCountUpdatedPromise;

      Assert.ok(true, "Should show 2 exclusions after adding the second site");

      // Clean up
      Services.perms.removeByType(PERM_NAME);
      Services.prefs.clearUserPref(ONBOARDING_MESSAGE_MASK_PREF);
    }
  );
});

// Test that autostart checkboxes exist and map to the correct preferences
add_task(async function test_autostart_checkboxes() {
  await setupVpnPrefs({
    feature: true,
    autostartFeatureEnabled: true,
    autostart: true,
    autostartprivate: true,
  });

  await BrowserTestUtils.withNewTab(
    { gBrowser, url: "about:preferences#privacy" },
    async function (browser) {
      let settingGroup = testSettingsGroupVisible(browser, SECTION_ID);
      let autoStartSettings = settingGroup?.querySelector(
        "#ipProtectionAutoStart"
      );
      is_element_visible(
        autoStartSettings,
        "autoStart settings group is shown"
      );

      let autoStartCheckbox = autoStartSettings?.querySelector(
        "#ipProtectionAutoStartCheckbox"
      );
      let autoStartPrivateCheckbox = autoStartSettings?.querySelector(
        "#ipProtectionAutoStartPrivateCheckbox"
      );

      Assert.ok(
        autoStartCheckbox.checked,
        "Autostart checkbox should be checked"
      );
      Assert.ok(
        autoStartPrivateCheckbox.checked,
        "Autostart in private browsing checkbox should be checked"
      );
    }
  );
});

// Test that additional links exist
add_task(async function test_additional_links() {
  await setupVpnPrefs({
    feature: true,
  });

  await BrowserTestUtils.withNewTab(
    { gBrowser, url: "about:preferences#privacy" },
    async function (browser) {
      let settingGroup = testSettingsGroupVisible(browser, SECTION_ID);
      let additionalLinks = settingGroup?.querySelector(
        "#ipProtectionAdditionalLinks"
      );
      is_element_visible(additionalLinks, "Additional links section is shown");

      let ipProtectionSupportLink = additionalLinks?.querySelector(
        "#ipProtectionSupportLink"
      );
      let ipProtectionUpgradeLink = additionalLinks?.querySelector(
        "#ipProtectionUpgradeLink"
      );
      is_element_visible(ipProtectionSupportLink, "Support link is shown");
      is_element_visible(ipProtectionUpgradeLink, "Upgrade link is shown");
    }
  );
});
