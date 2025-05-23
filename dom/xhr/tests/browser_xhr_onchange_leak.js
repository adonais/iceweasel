/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

// Bug 1336811 - An XHR that has a .onreadystatechange waiting should
// not leak forever once the tab is closed. CC optimizations need to be
// turned off once it is closed.

add_task(async function test() {
  const url =
    "http://mochi.test:8888/browser/dom/xhr/tests/browser_xhr_onchange_leak.html";
  let newTab = await BrowserTestUtils.openNewForegroundTab(gBrowser, url);
  let browser = gBrowser.selectedBrowser;
  let origContentProcessId = browser.frameLoader.remoteTab.contentProcessId;
  let pageShowPromise = BrowserTestUtils.waitForContentEvent(
    browser,
    "pageshow",
    true
  );
  BrowserTestUtils.startLoadingURIString(browser, "http://mochi.test:8888/");
  await pageShowPromise;

  is(
    browser.frameLoader.remoteTab.contentProcessId,
    origContentProcessId,
    "we must still be in the same process after we navigate " +
      "so the entire process with the possibly-leaking window " +
      "doesn't get torn down"
  );

  BrowserTestUtils.removeTab(newTab);
});
