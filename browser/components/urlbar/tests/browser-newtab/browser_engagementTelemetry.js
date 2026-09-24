/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

// The newtab search bar is its own search access point, so its sessions record
// `newtab_searchbar` as their sap. The bar lives in the page, so the events that
// end a session are not the address bar's: a tab switch or a navigation takes
// the bar with the page.

"use strict";

add_setup(async function () {
  await SearchTestUtils.installSearchExtension({}, { setAsDefault: true });
});

add_telemetry_task(async function engagement(browser) {
  await doSearch(browser);
  await doEnter(browser);

  await assertEngagementTelemetry([
    { sap: "newtab_searchbar", engagement_type: "enter" },
  ]);
});

add_telemetry_task(async function engagementByClick(browser) {
  await doSearch(browser);
  let loaded = BrowserTestUtils.browserLoaded(browser);
  await BrowserTestUtils.synthesizeMouseAtCenter(
    ".urlbarView-row[selected]",
    {},
    browser
  );
  await loaded;

  await assertEngagementTelemetry([
    { sap: "newtab_searchbar", engagement_type: "click" },
  ]);
});

add_telemetry_task(async function abandonmentOnBlur(browser) {
  await doSearch(browser);
  await NewtabSearchbarTestUtils.blur(browser);
  await NewtabSearchbarTestUtils.waitForViewClosed(browser);

  await assertAbandonmentTelemetry([
    { sap: "newtab_searchbar", abandonment_type: "blur" },
  ]);
});

// `tab_switch` is what the address bar records when a session survives the
// switch with the input still focused. The bar goes into the background along
// with its page, so the switch reaches it as the focus loss it is.
add_telemetry_task(async function abandonmentOnTabSwitch(browser) {
  await doSearch(browser);
  let tab = await BrowserTestUtils.openNewForegroundTab(gBrowser);

  await assertAbandonmentTelemetry([
    { sap: "newtab_searchbar", abandonment_type: "blur" },
  ]);

  BrowserTestUtils.removeTab(tab);
});

// A navigation takes the page and the bar with it, and the abandonment is
// recorded from the blur that tearing the bar down fires.
add_telemetry_task(async function abandonmentOnNavigation(browser) {
  await doSearch(browser);
  BrowserTestUtils.startLoadingURIString(browser, "https://example.com/");
  await BrowserTestUtils.browserLoaded(browser);

  await assertAbandonmentTelemetry([
    { sap: "newtab_searchbar", abandonment_type: "blur" },
  ]);
});
