/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

/**
 * Tests that SmartBlock replaces blocked iframe embeds with a placeholder and redirects the blocked frame to the shim's empty page.
 */
add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.urlbar.trustPanel.featureGate", false],
      [SEC_DELAY_PREF, 1000],
      [TRACKING_PREF, true],
      [SMARTBLOCK_EMBEDS_ENABLED_PREF, true],
    ],
  });

  await UrlClassifierTestUtils.addTestTrackers();
  await generateTestShims();

  registerCleanupFunction(() => {
    UrlClassifierTestUtils.cleanupTestTrackers();
    Services.prefs.clearUserPref("browser.protections_panel.infoMessage.seen");
  });
});

add_task(async function test_smartblock_embed_replaced_for_blocked_iframe() {
  const tab = await BrowserTestUtils.openNewForegroundTab({
    gBrowser,
    waitForLoad: true,
  });

  await loadSmartblockPageOnTab(
    tab,
    TEST_PAGE_WITH_SMARTBLOCK_COMPATIBLE_IFRAME_EMBED
  );

  const TrackingProtection = gProtectionsHandler.blockers.TrackingProtection;
  ok(TrackingProtection, "TP is attached to the tab");
  ok(TrackingProtection.enabled, "TP is enabled");

  await SpecialPowers.spawn(tab.linkedBrowser, [], async () => {
    // The placeholder has to land in the page holding the iframe, not in the
    // iframe itself.
    let placeholders = content.document.querySelectorAll(
      ".shimmed-embedded-content"
    );
    is(placeholders.length, 1, "Embed is replaced with a placeholder");

    let unreplacedEmbed = content.document.querySelector(
      ".broken-embed-content"
    );
    ok(!unreplacedEmbed, "Original embed is no longer on the page");
  });

  // The blocked frame itself should have been replaced with the shim's local
  // empty page rather than reaching the network. The redirect races with the
  // placeholder creation, so it may not have committed yet.
  await TestUtils.waitForCondition(() => {
    const [frame] = tab.linkedBrowser.browsingContext.children;
    return frame?.currentURI.spec.endsWith("/shims/empty-page.html");
  }, "Frame is redirected to the shim's empty page");

  await BrowserTestUtils.removeTab(tab);
});
