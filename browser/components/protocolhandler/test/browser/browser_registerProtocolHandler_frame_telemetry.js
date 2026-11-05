/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const PAGE = "browser_registerProtocolHandler_relative.html";

async function checkCounts(activation, expected) {
  await Services.fog.testFlushAllChildren();
  for (let [frame, count] of Object.entries(expected)) {
    is(
      Glean.dom.registerProtocolHandlerCalls
        .get(frame, activation)
        .testGetValue(),
      count,
      `${frame} ${activation} count`
    );
  }
}

add_setup(async function () {
  Services.fog.testResetFOG();
});

add_task(async function testFrameLabels() {
  await BrowserTestUtils.withNewTab(
    pageURL("https://example.com", PAGE),
    async browser => {
      await checkCounts("not_activated", {
        top_level: 1,
        same_origin_iframe: null,
        cross_origin_iframe: null,
      });

      await addIframe(browser, pageURL("https://example.com", PAGE));
      await checkCounts("not_activated", {
        top_level: 1,
        same_origin_iframe: 1,
        cross_origin_iframe: null,
      });

      info("A same-site iframe from another origin counts as cross-origin.");
      await addIframe(browser, pageURL("https://www.example.com", PAGE));
      await checkCounts("not_activated", {
        top_level: 1,
        same_origin_iframe: 1,
        cross_origin_iframe: 1,
      });

      await addIframe(browser, pageURL("https://example.org", PAGE));
      await checkCounts("not_activated", {
        top_level: 1,
        same_origin_iframe: 1,
        cross_origin_iframe: 2,
      });

      info("A same-origin iframe inside a cross-origin one counts as such.");
      await addIframe(
        browser.browsingContext.children.at(-1),
        pageURL("https://example.com", PAGE)
      );
      await checkCounts("not_activated", {
        top_level: 1,
        same_origin_iframe: 1,
        cross_origin_iframe: 3,
      });

      await checkCounts("activated", {
        top_level: null,
        same_origin_iframe: null,
        cross_origin_iframe: null,
      });
    }
  );
});

add_task(async function testUserActivation() {
  Services.fog.testResetFOG();
  await BrowserTestUtils.withNewTab(
    pageURL("https://example.com", PAGE),
    async browser => {
      await BrowserTestUtils.synthesizeMouseAtCenter("#register", {}, browser);
      await TestUtils.waitForCondition(async () => {
        await Services.fog.testFlushAllChildren();
        return Glean.dom.registerProtocolHandlerCalls
          .get("top_level", "activated")
          .testGetValue();
      }, "Wait for the call from the button's click handler to be counted.");
      await checkCounts("activated", { top_level: 1 });
      await checkCounts("not_activated", { top_level: 1 });
    }
  );
});
