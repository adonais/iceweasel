/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const TEST_URL =
  getRootDirectory(gTestPath).replace(
    "chrome://mochitests/content",
    "https://example.com"
  ) + "dummy_page.html";
const FRAME_URL = TEST_URL.replace("example.com", "example.org");

add_task(async function test_previous_entry_stays_in_owner_process() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["fission.bfcacheInParent", true],
      ["browser.sessionhistory.max_total_viewers", 10],
      ["dom.navigation.webidl.enabled", true],
    ],
  });

  const oldURL = TEST_URL + "?old";
  const newURL = TEST_URL + "?new";
  await BrowserTestUtils.withNewTab(oldURL, async browser => {
    async function preparePage(state) {
      await SpecialPowers.spawn(
        browser,
        [FRAME_URL, state],
        async (url, value) => {
          content.history.replaceState(value, "");
          content.addEventListener("pageshow", event => {
            content.wrappedJSObject.wasRestored = event.persisted;
          });
          const iframe = content.document.createElement("iframe");
          iframe.src = url;
          const loaded = new Promise(resolve => {
            iframe.addEventListener("load", resolve, { once: true });
          });
          content.document.body.appendChild(iframe);
          await loaded;
        }
      );

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
      return frame;
    }

    const oldFrame = await preparePage("old page state");
    const oldContext = browser.browsingContext;
    const oldWindow = oldContext.currentWindowGlobal;
    const oldFrameWindow = oldFrame.currentWindowGlobal;

    const loaded = BrowserTestUtils.browserLoaded(browser, false, newURL);
    BrowserTestUtils.startLoadingURIString(browser, newURL);
    await loaded;
    await preparePage("previous entry secret");

    const shown = BrowserTestUtils.waitForContentEvent(
      browser,
      "pageshow",
      true,
      event => event.target.defaultView === event.target.defaultView.top
    );
    browser.goBack();
    await shown;

    is(browser.currentURI.spec, oldURL, "Back restored the old URL");
    is(
      browser.browsingContext,
      oldContext,
      "The old browsing context survived"
    );
    is(oldContext.currentWindowGlobal, oldWindow, "The top document survived");
    is(
      oldFrame.currentWindowGlobal,
      oldFrameWindow,
      "The iframe document survived"
    );

    await SpecialPowers.spawn(browser, [newURL], previousURL => {
      ok(content.wrappedJSObject.wasRestored, "The top page came from BFCache");
      is(content.history.state, "old page state", "The old state was restored");
      is(
        content.navigation.activation.from?.url,
        previousURL,
        "The owner still receives the previous entry for navigation.activation"
      );
    });
    await SpecialPowers.spawn(oldFrame, [], () => {
      ok(content.wrappedJSObject.wasRestored, "The iframe came from BFCache");
    });
  });
});
