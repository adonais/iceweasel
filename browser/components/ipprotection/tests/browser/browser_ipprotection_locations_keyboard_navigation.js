/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const MOCK_LOCATIONS_LIST = [
  { code: "US", available: true },
  { code: "CA", available: true },
  { code: "DE", available: false },
];

/**
 * Opens the IP Protection panel, then navigates to the locations subview.
 *
 * @param {object} state - Additional state to set on the panel.
 * @returns {Promise<{backButton: Element, firstListItem: Element, promoButton: Element|null, locationsView: Element}>}
 */
async function openLocationsSubview(state = {}) {
  await openPanel({
    isEnrolledAndEntitled: true,
    locationsList: MOCK_LOCATIONS_LIST,
    ...state,
  });

  let panel = IPProtection.getPanel(window);
  let locationsView = PanelMultiView.getViewNode(
    document,
    IPProtectionPanel.LOCATIONS_PANELVIEW
  );

  let viewShownPromise = BrowserTestUtils.waitForEvent(
    locationsView,
    "ViewShown"
  );
  panel.showLocationSelector();
  await viewShownPromise;

  let locationsEl = locationsView.querySelector(
    IPProtectionPanel.LOCATIONS_TAGNAME
  );
  await locationsEl?.updateComplete;

  let locationsList = locationsView.querySelector("locations-list");
  await locationsList?.updateComplete;

  let backButton = locationsView.querySelector(".subviewbutton-back");
  let firstListItem = locationsList?.querySelector(
    ".location-item:not([disabled])"
  );
  let promoButton = locationsView.querySelector("moz-promo moz-button");

  return {
    backButton,
    firstListItem,
    promoButton,
    locationsView,
  };
}

/**
 * Tests that we can tab through all elements in the subview with the promo shown,
 * ignoring list items.
 */
add_task(async function test_locations_tab_nav_with_promo() {
  let { backButton, firstListItem, promoButton } = await openLocationsSubview({
    hasUpgraded: false,
  });

  Assert.ok(promoButton, "promo button should be present when not upgraded");

  backButton.focus();

  await expectFocusAfterKey("Tab", firstListItem);
  await expectFocusAfterKey("Tab", promoButton);
  await expectFocusAfterKey("Tab", backButton);

  await expectFocusAfterKey("Shift+Tab", promoButton);
  await expectFocusAfterKey("Shift+Tab", firstListItem);
  await expectFocusAfterKey("Shift+Tab", backButton);

  await closePanel();
  cleanupService();
});

/**
 * Tests that we can tab through all elements in the subview with the promo hidden,
 * ignoring list items.
 */
add_task(async function test_locations_tab_nav_without_promo() {
  let { backButton, firstListItem, promoButton } = await openLocationsSubview({
    hasUpgraded: true,
  });

  Assert.ok(!promoButton, "promo button should not be present when upgraded");

  backButton.focus();

  await expectFocusAfterKey("Tab", firstListItem);
  await expectFocusAfterKey("Tab", backButton);

  // Shift+Tab reverses.
  await expectFocusAfterKey("Shift+Tab", firstListItem);
  await expectFocusAfterKey("Shift+Tab", backButton);

  await closePanel();
  cleanupService();
});

/**
 * Tests that Tab from any list item skips directly to promo,
 * and Shift+Tab from any list item goes back to the back button.
 */
add_task(async function test_locations_tab_exits_list_from_any_item() {
  let { locationsView, promoButton } = await openLocationsSubview({
    hasUpgraded: false,
  });

  Assert.ok(promoButton, "promo button should be present");

  let locationsList = locationsView.querySelector("locations-list");
  let listItems = Array.from(
    locationsList.querySelectorAll(".location-item:not([disabled])")
  );

  Assert.greater(listItems.length, 1, "should have more than one enabled item");

  // Tab from a non-first list item should jump straight to promo.
  listItems[1].focus();
  await expectFocusAfterKey("Tab", promoButton);

  // Shift+Tab from a non-first list item should jump straight to back button.
  let backButton = locationsView.querySelector(".subviewbutton-back");
  listItems[1].focus();
  await expectFocusAfterKey("Shift+Tab", backButton);

  await closePanel();
  cleanupService();
});

/**
 * Tests that ArrowDown and ArrowUp navigate only within the list items and
 * wrap correctly.
 */
add_task(async function test_locations_arrow_keys_navigate_list() {
  let { firstListItem, locationsView } = await openLocationsSubview();

  let locationsList = locationsView.querySelector("locations-list");
  let listItems = Array.from(
    locationsList.querySelectorAll(".location-item:not([disabled])")
  );

  Assert.greater(listItems.length, 1, "should have more than one enabled item");

  firstListItem.focus();

  await expectFocusAfterKey("ArrowDown", listItems[1]);
  await expectFocusAfterKey("ArrowUp", listItems[0]);

  // ArrowUp from first item wraps to last.
  await expectFocusAfterKey("ArrowUp", listItems[listItems.length - 1]);

  // ArrowDown from last item wraps to first.
  await expectFocusAfterKey("ArrowDown", listItems[0]);

  await closePanel();
  cleanupService();
});

/**
 * Tests that ArrowDown and ArrowUp do not move focus when on non-list elements.
 */
add_task(async function test_locations_arrow_keys_ignored_outside_list() {
  let { backButton } = await openLocationsSubview();

  backButton.focus();

  // ArrowDown on back button should not move focus.
  EventUtils.synthesizeKey("KEY_ArrowDown", {});
  Assert.equal(
    document.activeElement,
    backButton,
    "ArrowDown on back button should not move focus"
  );

  await closePanel();
  cleanupService();
});
