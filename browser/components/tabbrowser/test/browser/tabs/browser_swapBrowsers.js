/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const PAGE_A = "https://example.com/";
const PAGE_B = "https://example.org/";
const PAGE_C = "https://example.net/";

async function contentLocation(browser) {
  return SpecialPowers.spawn(browser, [], () => content.location.href);
}

// nsIBrowser::swapBrowsers routes through Tabbrowser.swapBrowsers when both
// browsers are attached to a tabbrowser.
add_task(async function swapBrowsersAcrossWindows() {
  let ourTab = await BrowserTestUtils.openNewForegroundTab(gBrowser, PAGE_A);
  let otherWin = await BrowserTestUtils.openNewBrowserWindow();
  let otherTab = await BrowserTestUtils.openNewForegroundTab(
    otherWin.gBrowser,
    PAGE_B
  );

  // The swapped-in tab gets a fresh progress listener, which has to notify the
  // window its tab lives in.
  let notified = [];
  let listeners = [
    ["ours", window],
    ["other", otherWin],
  ].map(([name, win]) => {
    let listener = {};
    for (let method of [
      "onStateChange",
      "onLocationChange",
      "onProgressChange",
      "onStatusChange",
      "onSecurityChange",
      "onContentBlockingEvent",
    ]) {
      listener[method] = browser => {
        if (browser == otherTab.linkedBrowser) {
          notified.push(`${name}:${method}`);
        }
      };
    }
    win.gBrowser.addTabsProgressListener(listener);
    return [win, listener];
  });

  ourTab.linkedBrowser.swapBrowsers(otherTab.linkedBrowser);

  is(await contentLocation(ourTab.linkedBrowser), PAGE_B, "our tab swapped in");
  is(
    await contentLocation(otherTab.linkedBrowser),
    PAGE_A,
    "the other tab swapped in"
  );

  is(
    otherWin.gBrowser.constructor,
    gBrowser.constructor,
    "both windows share one Tabbrowser class"
  );

  BrowserTestUtils.startLoadingURIString(otherTab.linkedBrowser, PAGE_C);
  await BrowserTestUtils.browserLoaded(otherTab.linkedBrowser, false, PAGE_C);

  ok(
    notified.some(n => n.startsWith("other:")),
    "the tab's own window was notified"
  );
  Assert.deepEqual(
    notified.filter(n => n.startsWith("ours:")),
    [],
    "the swapping window was not notified"
  );

  for (let [win, listener] of listeners) {
    win.gBrowser.removeTabsProgressListener(listener);
  }

  BrowserTestUtils.removeTab(ourTab);
  await BrowserTestUtils.closeWindow(otherWin);
});
