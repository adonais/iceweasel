/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

let containerHeight;

function assertContainerUnmoved() {
  Assert.equal(
    gURLBar.parentNode.getBoundingClientRect().height,
    containerHeight,
    "The container keeps its height"
  );
}

add_setup(async function setup() {
  await PlacesUtils.history.clear();
  await PlacesUtils.bookmarks.eraseEverything();
  containerHeight = gURLBar.parentNode.getBoundingClientRect().height;
});

add_task(async function focus() {
  info("Open view with some results");
  await UrlbarTestUtils.promiseAutocompleteResultPopup({
    value: "",
    window,
  });
  assertContainerUnmoved();
  Assert.ok(gURLBar.panel.matches(":popover-open"));

  info("Close view by ESC");
  await UrlbarTestUtils.promisePopupClose(window, () => {
    EventUtils.synthesizeKey("KEY_Escape");
  });
  Assert.ok(!gURLBar.view.isOpen);
  Assert.ok(gURLBar.hasAttribute("focused"));
  assertContainerUnmoved();
  Assert.ok(!gURLBar.panel.matches(":popover-open"));

  info("Blur the focus from the urlbar");
  EventUtils.synthesizeKey("KEY_Escape");
  Assert.ok(!gURLBar.view.isOpen);
  Assert.ok(!gURLBar.hasAttribute("focused"));
  assertContainerUnmoved();
  Assert.ok(!gURLBar.panel.matches(":popover-open"));
});

add_task(async function empty_to_some() {
  info("Open view and change the search mode");
  let manager = ProvidersManager.getInstanceForSap("urlbar");
  await UrlbarTestUtils.promiseAutocompleteResultPopup({ value: "", window });
  await UrlbarTestUtils.activateSearchModeSwitcherItem(
    window,
    ".search-button-history"
  );
  await UrlbarTestUtils.promiseSearchComplete(window);
  Assert.equal(UrlbarTestUtils.getResultCount(window), 0);
  Assert.ok(gURLBar.view.isOpen);
  Assert.ok(gURLBar.hasAttribute("focused"));
  assertContainerUnmoved();
  Assert.ok(gURLBar.panel.matches(":popover-open"));

  info("Open view with some results");
  let someProvider = new UrlbarTestUtils.TestProvider({
    results: [
      new UrlbarResult({
        type: UrlbarShared.RESULT_TYPE.URL,
        source: UrlbarShared.RESULT_SOURCE.HISTORY,
        suggestedIndex: 0,
        payload: {
          url: "https://example.com/",
          title: "example",
        },
      }),
    ],
    name: "someProvider",
    priority: Infinity,
  });
  manager.registerProvider(someProvider);

  await UrlbarTestUtils.promiseAutocompleteResultPopup({
    value: "test",
    window,
  });
  assertContainerUnmoved();
  Assert.ok(gURLBar.panel.matches(":popover-open"));

  manager.unregisterProvider(someProvider);
  await UrlbarTestUtils.promisePopupClose(window);
});

add_task(async function some_to_empty() {
  info("Open view with some results");
  let manager = ProvidersManager.getInstanceForSap("urlbar");
  let someProvider = new UrlbarTestUtils.TestProvider({
    results: [
      new UrlbarResult({
        type: UrlbarShared.RESULT_TYPE.URL,
        source: UrlbarShared.RESULT_SOURCE.HISTORY,
        suggestedIndex: 0,
        payload: {
          url: "https://example.com/",
          title: "example",
        },
      }),
    ],
    name: "someProvider",
    priority: Infinity,
  });
  manager.registerProvider(someProvider);

  await UrlbarTestUtils.promiseAutocompleteResultPopup({
    value: "test",
    window,
  });
  assertContainerUnmoved();
  Assert.ok(gURLBar.panel.matches(":popover-open"));
  manager.unregisterProvider(someProvider);

  info("Open view with empty results");
  let emptyProvider = new UrlbarTestUtils.TestProvider({
    results: [],
    name: "emptyProvider",
    priority: Infinity,
  });
  manager.registerProvider(emptyProvider);
  await UrlbarTestUtils.promiseAutocompleteResultPopup({
    value: "updated",
    window,
  });
  Assert.equal(UrlbarTestUtils.getResultCount(window), 0);
  Assert.ok(gURLBar.view.isOpen);
  Assert.ok(gURLBar.hasAttribute("focused"));
  assertContainerUnmoved();
  Assert.ok(gURLBar.panel.matches(":popover-open"));

  manager.unregisterProvider(emptyProvider);
  await UrlbarTestUtils.promisePopupClose(window);
});

add_task(async function oneoffs() {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.urlbar.scotchBonnet.enableOverride", false]],
  });

  let manager = ProvidersManager.getInstanceForSap("urlbar");
  let emptyProvider = new UrlbarTestUtils.TestProvider({
    results: [],
    name: "emptyProvider",
    priority: Infinity,
  });
  manager.registerProvider(emptyProvider);

  await UrlbarTestUtils.promiseAutocompleteResultPopup({
    value: "empty",
    window,
  });
  Assert.equal(UrlbarTestUtils.getResultCount(window), 0);
  assertContainerUnmoved();
  Assert.ok(gURLBar.hasAttribute("focused"));
  Assert.ok(gURLBar.panel.matches(":popover-open"));

  manager.unregisterProvider(emptyProvider);
  await UrlbarTestUtils.promisePopupClose(window);
  await SpecialPowers.popPrefEnv();
});
