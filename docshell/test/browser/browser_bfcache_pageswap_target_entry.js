/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Checks that a traversal that restores a page from BFCache fires pageswap
// with the target entry in the outgoing page, and that a process which hosts
// only a cross-origin iframe of the outgoing page does not get that entry.
// ContentChild::RecvDeactivateDocuments asserts the latter, which would crash
// the process of the iframe.

const TEST_URL =
  getRootDirectory(gTestPath).replace(
    "chrome://mochitests/content",
    "https://example.com"
  ) + "dummy_page.html";
const FRAME_URL = TEST_URL.replace("example.com", "example.org");

function waitForTopPageShow(browser) {
  return BrowserTestUtils.waitForContentEvent(
    browser,
    "pageshow",
    true,
    event => event.target.defaultView === event.target.defaultView.top
  );
}

add_task(async function test_pageswap_target_entry_stays_in_owner_process() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["fission.bfcacheInParent", true],
      ["browser.sessionhistory.max_total_viewers", 10],
      ["dom.navigation.webidl.enabled", true],
      ["dom.viewTransitions.cross-document.enabled", true],
    ],
  });

  const oldURL = TEST_URL + "?old";
  const newURL = TEST_URL + "?new";
  await BrowserTestUtils.withNewTab(oldURL, async browser => {
    const loaded = BrowserTestUtils.browserLoaded(browser, false, newURL);
    BrowserTestUtils.startLoadingURIString(browser, newURL);
    await loaded;

    // The cross-origin iframe must be in the page that is current when the
    // traversal starts, so that its process gets the deactivation message.
    await SpecialPowers.spawn(browser, [FRAME_URL], async url => {
      content.addEventListener("pageswap", event => {
        content.wrappedJSObject.pageSwap = {
          type: event.activation?.navigationType,
          url: event.activation?.entry?.url,
        };
      });
      content.addEventListener("pageshow", event => {
        content.wrappedJSObject.wasRestored = event.persisted;
      });
      const iframe = content.document.createElement("iframe");
      iframe.src = url;
      const iframeLoaded = new Promise(resolve => {
        iframe.addEventListener("load", resolve, { once: true });
      });
      content.document.body.appendChild(iframe);
      await iframeLoaded;
    });
    const frame = browser.browsingContext.children[0];
    const topPID = await SpecialPowers.spawn(browser, [], () => {
      return Services.appinfo.processID;
    });
    const framePID = await SpecialPowers.spawn(frame, [], () => {
      content.addEventListener("pageshow", event => {
        content.wrappedJSObject.wasRestored = event.persisted;
      });
      return Services.appinfo.processID;
    });
    isnot(framePID, topPID, "The cross-origin iframe has a separate process");

    let shown = waitForTopPageShow(browser);
    browser.goBack();
    await shown;
    is(browser.currentURI.spec, oldURL, "Back restored the old URL");

    // Go forward to read what the page with the iframe saw.
    shown = waitForTopPageShow(browser);
    browser.goForward();
    await shown;
    is(browser.currentURI.spec, newURL, "Forward restored the new URL");

    const pageSwap = await SpecialPowers.spawn(browser, [], () => {
      ok(content.wrappedJSObject.wasRestored, "The page came from BFCache");
      return content.wrappedJSObject.pageSwap;
    });
    is(pageSwap?.type, "traverse", "pageswap fired for the traversal");
    is(
      pageSwap?.url,
      oldURL,
      "The owner process still receives the target entry for pageswap"
    );
    await SpecialPowers.spawn(frame, [], () => {
      ok(
        content.wrappedJSObject.wasRestored,
        "The iframe and its process survived and came from BFCache"
      );
    });
  });
});
