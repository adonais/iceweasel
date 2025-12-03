/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { LINKS } = ChromeUtils.importESModule(
  "chrome://browser/content/ipprotection/ipprotection-constants.mjs"
);
const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  IPProtectionWidget: "resource:///modules/ipprotection/IPProtection.sys.mjs",
  IPProtectionPanel:
    "resource:///modules/ipprotection/IPProtectionPanel.sys.mjs",
});

/**
 * Tests UI updates to the status card in the panel after enable/disables.
 */
add_task(async function test_status_card_in_panel() {
  const l10nIdOn = "ipprotection-connection-status-on";
  const l10nIdOff = "ipprotection-connection-status-off";
  const fiveDaysInMS = 5 * 24 * 60 * 60 * 1000;
  const enabledSince = Date.now() - fiveDaysInMS;
  const mockLocation = {
    name: "United States",
    code: "us",
  };

  let content = await openPanel({
    isSignedOut: false,
    protectionEnabledSince: enabledSince,
    location: mockLocation,
  });

  Assert.ok(
    BrowserTestUtils.isVisible(content),
    "ipprotection content component should be present"
  );

  let statusCard = content.statusCardEl;
  Assert.ok(content.statusCardEl, "ipprotection-status-card should be present");

  Assert.equal(
    statusCard?.statusGroupEl.getAttribute("data-l10n-id"),
    l10nIdOff,
    "Status card connection toggle data-l10n-id should be correct by default"
  );

  let descriptionMetadata = statusCard?.statusGroupEl.description;

  Assert.ok(
    descriptionMetadata.values.length,
    "Ensure there are elements loaded in the description slot"
  );

  let locationNameFilter = descriptionMetadata.values.filter(
    locationName => locationName === mockLocation.name
  );
  Assert.ok(locationNameFilter.length, "Found location in status card");

  // We can't check the time value directly, so instead see if the lit timerDirective is loaded in the component.
  // Assert that there's no timerDirective, so that we know the timer is not running.
  let timerDirectiveFilter = descriptionMetadata.values.filter(
    value => value._$litDirective$?.name == "TimerDirective"
  );
  Assert.ok(
    !timerDirectiveFilter.length,
    "Timer should not be loaded in description meta data"
  );

  // Set state as if protection is enabled
  await setPanelState({
    isSignedOut: false,
    protectionEnabledSince: enabledSince,
    location: mockLocation,
    isProtectionEnabled: true,
  });

  content.requestUpdate();

  await content.updateComplete;

  Assert.equal(
    statusCard?.statusGroupEl.getAttribute("data-l10n-id"),
    l10nIdOn,
    "Status card connection toggle data-l10n-id should be correct when protection is enabled"
  );

  // Now check the timerDirective again and see if it's loaded. If found, then the timer is running.
  descriptionMetadata = statusCard?.statusGroupEl.description;
  timerDirectiveFilter = descriptionMetadata.values.filter(
    value => value._$litDirective$?.name == "TimerDirective"
  );
  Assert.ok(
    timerDirectiveFilter.length,
    "Timer should be loaded now in description meta data"
  );

  await closePanel();
});

/**
 * Tests that the correct IPProtection events are dispatched on toggle.
 */
add_task(async function test_ipprotection_events_on_toggle() {
  // These events are different from the ones sent by
  // ipprotection-status-card. The prefixed "IPProtection:" events
  // actually change the connection state in the service when dispatched.
  // If the IPProtection events are sent, then we know that the status-card
  // events worked.
  const userEnableEventName = "IPProtection:UserEnable";
  const userDisableEventName = "IPProtection:UserDisable";

  // Reset service state.
  cleanupService();
  IPProtectionService.updateState();

  setupService({
    isSignedIn: true,
    isEnrolledAndEntitled: true,
    canEnroll: true,
    proxyPass: {
      status: 200,
      error: undefined,
      pass: makePass(),
    },
  });
  await IPPEnrollAndEntitleManager.refetchEntitlement();

  let button = document.getElementById(lazy.IPProtectionWidget.WIDGET_ID);
  let panelView = PanelMultiView.getViewNode(
    document,
    lazy.IPProtectionWidget.PANEL_ID
  );

  let panelShownPromise = waitForPanelEvent(document, "popupshown");
  // Open the panel
  button.click();
  await panelShownPromise;

  let content = panelView.querySelector(lazy.IPProtectionPanel.CONTENT_TAGNAME);

  Assert.ok(
    BrowserTestUtils.isVisible(content),
    "ipprotection content component should be present"
  );

  let statusCard = content.statusCardEl;

  await BrowserTestUtils.waitForMutationCondition(
    content.shadowRoot,
    { childList: true, subtree: true },
    () => content.statusCardEl
  );

  Assert.ok(statusCard, "Status card should be present");

  let toggle = statusCard?.connectionToggleEl;
  Assert.ok(toggle, "Status card connection toggle should be present");

  let startedProxyPromise = BrowserTestUtils.waitForEvent(
    IPProtectionService,
    "IPProtectionService:StateChanged",
    false,
    () => !!IPProtectionService.activatedAt
  );
  let enableEventPromise = BrowserTestUtils.waitForEvent(
    window,
    userEnableEventName
  );

  toggle.click();
  info("Clicked toggle to turn VPN on");

  await Promise.all([startedProxyPromise, enableEventPromise]);
  Assert.ok(
    true,
    "Enable event and proxy started event were found after clicking the toggle"
  );

  let userEnabledPref = Services.prefs.getBoolPref(
    "browser.ipProtection.userEnabled",
    false
  );
  Assert.equal(userEnabledPref, true, "userEnabled pref should be set to true");

  let stoppedProxyPromise = BrowserTestUtils.waitForEvent(
    IPProtectionService,
    "IPProtectionService:StateChanged",
    false,
    () => !IPProtectionService.activatedAt
  );
  let disableEventPromise = BrowserTestUtils.waitForEvent(
    window,
    userDisableEventName
  );

  toggle = statusCard?.connectionToggleEl;
  toggle.click();
  info("Clicked toggle to turn VPN off");

  await Promise.all([stoppedProxyPromise, disableEventPromise]);
  Assert.ok(
    true,
    "Disable event and stopped proxy event were found after clicking the toggle"
  );

  userEnabledPref = Services.prefs.getBoolPref(
    "browser.ipProtection.userEnabled",
    true
  );
  Assert.equal(
    userEnabledPref,
    false,
    "userEnabled pref should be set to false"
  );

  // Close the panel
  let panelHiddenPromise = waitForPanelEvent(document, "popuphidden");
  EventUtils.synthesizeKey("KEY_Escape");
  await panelHiddenPromise;
  cleanupService();
});
