/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const MOCK_SITE_NAME = "example.com";

/**
 * Tests that we can show ipprotection-site-settings-control when VPN is on.
 */
add_task(
  async function test_site_settings_control_visible_with_VPN_on_and_site_data() {
    let content = await openPanel({
      isSignedOut: false,
      isProtectionEnabled: false,
      siteData: {
        siteName: MOCK_SITE_NAME,
        isException: false,
      },
    });

    Assert.ok(
      BrowserTestUtils.isVisible(content),
      "ipprotection content component should be present"
    );

    let statusCard = content.statusCardEl;
    Assert.ok(
      content.statusCardEl,
      "ipprotection-status-card should be present"
    );

    // VPN is off, no site settings
    Assert.ok(
      !statusCard.siteSettingsEl,
      "ipprotection-site-settings-control should not be present with VPN off"
    );

    let siteSettingsVisiblePromise = BrowserTestUtils.waitForMutationCondition(
      statusCard.shadowRoot,
      { childList: true, subtree: true },
      () => statusCard.siteSettingsEl
    );

    // Turn VPN on
    await setPanelState({
      isSignedOut: false,
      isProtectionEnabled: true,
      siteData: {
        siteName: MOCK_SITE_NAME,
        isException: false,
      },
    });

    await Promise.all([statusCard.updateComplete, siteSettingsVisiblePromise]);

    Assert.ok(
      statusCard.siteSettingsEl,
      "Now ipprotection-site-settings-control should be present with VPN on"
    );

    await closePanel();
  }
);

/**
 * Tests that we don't show ipprotection-site-settings-control when there's no siteData.
 */
add_task(
  async function test_site_settings_control_hidden_with_VPN_on_and_no_site_data() {
    let content = await openPanel({
      isSignedOut: false,
      isProtectionEnabled: true,
      siteData: undefined,
    });

    Assert.ok(
      BrowserTestUtils.isVisible(content),
      "ipprotection content component should be present"
    );

    let statusCard = content.statusCardEl;
    Assert.ok(
      content.statusCardEl,
      "ipprotection-status-card should be present"
    );
    Assert.ok(
      !statusCard.siteSettingsEl,
      "ipprotection-site-settings-control should not be present because there's no site data"
    );

    await closePanel();
  }
);

/**
 * Tests that we don't show ipprotection-site-settings-control when an error occurs.
 */
add_task(async function test_site_settings_control_hidden_with_VPN_error() {
  let content = await openPanel({
    isSignedOut: false,
    isProtectionEnabled: true,
    siteData: {
      siteName: MOCK_SITE_NAME,
      isException: false,
    },
  });

  Assert.ok(
    BrowserTestUtils.isVisible(content),
    "ipprotection content component should be present"
  );

  let statusCard = content.statusCardEl;
  Assert.ok(content.statusCardEl, "ipprotection-status-card should be present");
  Assert.ok(
    statusCard.siteSettingsEl,
    "ipprotection-site-settings-control should be present"
  );

  let siteSettingsNotVisiblePromise = BrowserTestUtils.waitForMutationCondition(
    statusCard.shadowRoot,
    { childList: true, subtree: true },
    () => !statusCard.siteSettingsEl
  );

  // Turn VPN on
  await setPanelState({
    isSignedOut: false,
    isProtectionEnabled: true,
    error: "generic-error",
  });

  await Promise.all([statusCard.updateComplete, siteSettingsNotVisiblePromise]);

  Assert.ok(
    !statusCard.siteSettingsEl,
    "Now ipprotection-site-settings-control should not be present due to an error"
  );

  await closePanel();
});

/**
 * Tests that we dispatch expected events when we select the button
 * in ipprotection-site-settings-control.
 */
add_task(async function test_site_settings_control_click_event() {
  let content = await openPanel({
    isSignedOut: false,
    isProtectionEnabled: true,
    siteData: {
      siteName: MOCK_SITE_NAME,
      isException: false,
    },
  });

  Assert.ok(
    BrowserTestUtils.isVisible(content),
    "ipprotection content component should be present"
  );

  let statusCard = content.statusCardEl;
  Assert.ok(content.statusCardEl, "ipprotection-status-card should be present");
  Assert.ok(
    statusCard.siteSettingsEl,
    "ipprotection-site-settings-control should be present"
  );

  let button =
    statusCard.siteSettingsEl.shadowRoot.querySelector("moz-box-button");
  let eventPromise = BrowserTestUtils.waitForEvent(
    window,
    "IPProtection:UserShowSiteSettings"
  );

  button.click();

  await eventPromise;
  Assert.ok("Event was dispatched after clicking site settings button");

  await closePanel();
});
