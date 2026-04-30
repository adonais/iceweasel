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
 * Returns the locations-list element.
 *
 * @param {object} state - Additional state to set on the panel.
 * @returns {Promise<{locationsList: Element, locationsView: Element}>}
 */
async function openLocationsList(state = {}) {
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

  await locationsView.querySelector(IPProtectionPanel.LOCATIONS_TAGNAME)
    ?.updateComplete;

  let locationsList = locationsView.querySelector("locations-list");
  await locationsList?.updateComplete;

  return { locationsList, locationsView };
}

/**
 * Tests that the locations list renders correctly with a locations list
 * and that the recommended location is selected by default.
 */
add_task(async function test_locations_list_default_rendering() {
  let { locationsList } = await openLocationsList({ location: null });

  Assert.ok(locationsList, "locations-list element should exist");

  let description = locationsList.querySelector("#locations-list-description");
  Assert.ok(description, "locations list description should be present");

  let locationList = locationsList.querySelector("#locations-list");
  Assert.ok(locationList, "location list should be present");

  let locationItems = locationList.querySelectorAll("li");
  Assert.equal(
    locationItems.length,
    MOCK_LOCATIONS_LIST.length + 1,
    "location list should contain all countries plus the recommended location"
  );

  let recButton = locationsList.querySelector("#location-option-REC");
  Assert.ok(recButton, "recommended location button should be present");
  Assert.equal(
    recButton.getAttribute("aria-selected"),
    "true",
    "recommended location should be selected by default"
  );

  let checkmark = recButton.querySelector(".location-check");
  Assert.ok(
    checkmark,
    "checkmark element should exist on the recommended button"
  );
  let checkmarkVisible =
    getComputedStyle(checkmark).visibility === "visible" ||
    recButton.getAttribute("aria-selected") === "true";
  Assert.ok(checkmarkVisible, "checkmark should be visible on selected item");

  // Other items should not be selected
  for (let { code } of MOCK_LOCATIONS_LIST) {
    let unSelectedButton = locationsList.querySelector(
      `#location-option-${code}`
    );
    Assert.equal(
      unSelectedButton.getAttribute("aria-selected"),
      "false",
      `${code} button should not be selected`
    );
    let checkmarkHidden =
      getComputedStyle(unSelectedButton.querySelector(".location-check"))
        .visibility === "hidden";
    Assert.ok(
      checkmarkHidden,
      `checkmark should be hidden on unselected ${code} button`
    );
  }

  await closePanel();
  cleanupService();
});

/**
 * Tests that a pre-selected location is shown as selected.
 */
add_task(async function test_locations_list_preselected_location() {
  let { locationsList } = await openLocationsList({ location: "CA" });

  Assert.ok(locationsList, "locations-list element should exist");

  let caButton = locationsList.querySelector("#location-option-CA");
  Assert.ok(caButton, "CA location button should be present");
  Assert.equal(
    caButton.getAttribute("aria-selected"),
    "true",
    "CA should be selected when passed as location"
  );

  let recButton = locationsList.querySelector("#location-option-REC");
  Assert.equal(
    recButton.getAttribute("aria-selected"),
    "false",
    "recommended location should not be selected"
  );

  await closePanel();
  cleanupService();
});

/**
 * Tests that an unknown selectedLocation falls back to the recommended location.
 */
add_task(async function test_locations_list_unknown_falls_back_to_rec() {
  let { locationsList } = await openLocationsList({ location: "invalidCode" });

  Assert.ok(locationsList, "locations-list element should exist");

  Assert.equal(
    locationsList.getSelectedLocation(),
    "REC",
    "getSelectedLocation should fall back to REC when an invalid code is passed"
  );

  let recButton = locationsList.querySelector("#location-option-REC");
  Assert.equal(
    recButton.getAttribute("aria-selected"),
    "true",
    "recommended location button should be selected when an invalid code is passed"
  );

  await closePanel();
  cleanupService();
});

/**
 * Tests that locations except for the recommended location are
 * rendered in alphabetical order by their localized country name.
 */
add_task(async function test_locations_list_sorted_alphabetically() {
  let { locationsList } = await openLocationsList({
    locationsList: [
      { code: "DE", available: true },
      { code: "US", available: true },
      { code: "CA", available: true },
    ],
  });

  Assert.ok(locationsList, "locations-list element should exist");

  let locationItems = locationsList.querySelectorAll(
    "#locations-list li:not(:first-child) button"
  );
  let renderedCodes = Array.from(locationItems).map(btn =>
    btn.id.replace("location-option-", "")
  );

  let expectedCodes = ["CA", "DE", "US"];

  Assert.deepEqual(
    renderedCodes,
    expectedCodes,
    "locations should be rendered in alphabetical order by localized country name"
  );

  await closePanel();
  cleanupService();
});

/**
 * Tests that disabled locations are rendered with the disabled attribute.
 */
add_task(async function test_locations_list_disabled_locations() {
  let { locationsList } = await openLocationsList({ location: null });

  let deButton = locationsList.querySelector("#location-option-DE");
  Assert.ok(deButton, "DE location button should be present");
  Assert.ok(deButton.disabled, "unavailable location should be disabled");

  let usButton = locationsList.querySelector("#location-option-US");
  Assert.ok(!usButton.disabled, "available location should not be disabled");

  await closePanel();
  cleanupService();
});
