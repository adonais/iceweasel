/* Any copyright is dedicated to the Public Domain.
 * https://creativecommons.org/publicdomain/zero/1.0/ */

// This file tests the Firefox VPN site rules sub-pane. The sub-pane only
// exists in the settings redesign, so this test is registered in
// browser-srd.toml only.

"use strict";

const FEATURE_PREF = "browser.ipProtection.enabled";
const SITE_EXCEPTIONS_FEATURE_PREF =
  "browser.ipProtection.features.siteExceptions";
const SITE_INCLUSIONS_FEATURE_PREF =
  "browser.ipProtection.features.siteInclusions";
const ENTITLEMENT_CACHE_PREF = "browser.ipProtection.entitlementCache";
const IPPROTECTION_CACHE_DISABLED_PREF = "browser.ipProtection.cacheDisabled";
const IPPROTECTION_ADDED_PREF = "browser.ipProtection.added";
const IPPROTECTION_STATE_CACHE_PREF = "browser.ipProtection.stateCache";

add_setup(async function ippSiteRulesSetup() {
  await SpecialPowers.pushPrefEnv({
    set: [
      [IPPROTECTION_CACHE_DISABLED_PREF, true],
      [FEATURE_PREF, true],
      [SITE_EXCEPTIONS_FEATURE_PREF, true],
      [SITE_INCLUSIONS_FEATURE_PREF, true],
      [ENTITLEMENT_CACHE_PREF, '{"some":"data"}'],
    ],
  });

  registerCleanupFunction(() => {
    Services.prefs.clearUserPref(IPPROTECTION_ADDED_PREF);
    Services.prefs.clearUserPref(IPPROTECTION_STATE_CACHE_PREF);
  });
});

// Test the site rules section replaces the site exceptions section when the
// site inclusions feature is on.
add_task(async function test_site_rules_replaces_site_exceptions() {
  await BrowserTestUtils.withNewTab(
    { gBrowser, url: "about:preferences#privacy" },
    async function (browser) {
      let settingGroup = browser.contentDocument.querySelector(
        `setting-group[groupid="ipprotection"]`
      );

      is_element_hidden(
        settingGroup?.querySelector("#ipProtectionExceptions"),
        "Site exceptions group is hidden"
      );

      let siteRulesButton = settingGroup?.querySelector(
        "#ipProtectionSiteRules"
      );
      is_element_visible(siteRulesButton, "Site rules button is shown");
      is(
        siteRulesButton.getAttribute("data-l10n-id"),
        "ip-protection-site-rules-button",
        "Site rules button uses the site rules string"
      );
    }
  );
});

// Test clicking the site rules button opens the vpnSiteRules sub-pane.
add_task(async function test_site_rules_opens_sub_pane() {
  await BrowserTestUtils.withNewTab(
    { gBrowser, url: "about:preferences#privacy" },
    async function (browser) {
      let doc = browser.contentDocument;
      let win = browser.contentWindow;

      let siteRulesButton = doc.querySelector(
        `setting-group[groupid="ipprotection"] #ipProtectionSiteRules`
      );
      is_element_visible(siteRulesButton, "Site rules button is shown");

      let paneLoaded = waitForPaneChange("vpnSiteRules", win);
      siteRulesButton.scrollIntoView();
      EventUtils.synthesizeMouseAtCenter(siteRulesButton, {}, win);
      await paneLoaded;

      is(doc.location.hash, "#vpnSiteRules", "Hash is the sub-pane");
      is_element_visible(
        doc.querySelector(`setting-pane[data-category="paneVpnSiteRules"]`),
        "Site rules sub-pane is shown"
      );
    }
  );
});

// Test the sub-pane can be linked to directly, e.g. from the VPN panel.
add_task(async function test_site_rules_sub_pane_direct_link() {
  await BrowserTestUtils.withNewTab(
    { gBrowser, url: "about:preferences#privacy-vpnsiterules" },
    async function (browser) {
      let doc = browser.contentDocument;
      let win = browser.contentWindow;

      await TestUtils.waitForCondition(
        () => win.gLastCategory?.category === "paneVpnSiteRules",
        "Navigated to the site rules sub-pane"
      );

      is(
        doc.location.hash,
        "#vpnSiteRules",
        "Legacy hash resolves to sub-pane"
      );
      is_element_visible(
        doc.querySelector(`setting-pane[data-category="paneVpnSiteRules"]`),
        "Site rules sub-pane is shown"
      );
    }
  );
});
