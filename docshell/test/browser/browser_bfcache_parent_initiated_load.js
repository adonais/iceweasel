/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const TEST_URL =
  getRootDirectory(gTestPath).replace(
    "chrome://mochitests/content",
    "https://example.com"
  ) + "dummy_page.html";
const NEW_URL = TEST_URL.replace("example.com", "example.org");

// For a load started in the parent, the parent can decide whether the
// previous page goes into the BFCache before the content process has
// connected its DocumentChannel. Delay that connection to check the decision
// doesn't depend on it.
add_task(async function test_bfcache_before_document_channel_connects() {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.sessionhistory.max_total_viewers", 10]],
  });

  await BrowserTestUtils.withNewTab(TEST_URL, async browser => {
    await SpecialPowers.spawn(browser, [], () => {
      content.addEventListener("pageshow", event => {
        content.wrappedJSObject.wasRestored = event.persisted;
      });
    });

    // Keep this task alive until the observer has run; the empty spawn below
    // makes sure it is registered before the load starts.
    const blocked = SpecialPowers.spawn(browser, [], async () => {
      const { promise, resolve } = Promise.withResolvers();
      Services.obs.addObserver(function observer() {
        Services.obs.removeObserver(observer, "document-on-opening-request");
        const end = Date.now() + 1000;
        while (Date.now() < end) {
          // Block the content process before the DocumentChannel is sent,
          // giving the parent time to run its process switch check.
        }
        resolve();
      }, "document-on-opening-request");
      await promise;
    });
    await SpecialPowers.spawn(browser, [], () => {});

    // Hold the response so that the parent's process switch check runs while
    // the content process is blocked above.
    Services.obs.addObserver(function observer(subject) {
      const channel = subject.QueryInterface(Ci.nsIHttpChannel);
      if (channel.URI.spec != NEW_URL) {
        return;
      }
      Services.obs.removeObserver(observer, "http-on-modify-request");
      channel.suspend();
      // The content process can not signal while it is blocked.
      // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
      setTimeout(() => channel.resume(), 500);
    }, "http-on-modify-request");

    const loaded = BrowserTestUtils.browserLoaded(browser, false, NEW_URL);
    BrowserTestUtils.startLoadingURIString(browser, NEW_URL);
    await blocked;
    await loaded;

    const shown = BrowserTestUtils.waitForContentEvent(browser, "pageshow");
    browser.goBack();
    await shown;
    is(browser.currentURI.spec, TEST_URL, "Went back to the first page");
    // waitForContentEvent only resolves with the event name, so the listener
    // added above records whether the page came from the BFCache.
    await SpecialPowers.spawn(browser, [], () => {
      ok(
        content.wrappedJSObject.wasRestored,
        "The first page was restored from the BFCache"
      );
    });
  });
});
