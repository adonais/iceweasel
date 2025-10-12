"use strict";

// Test browsing-context-active-change notification which is fired on the parent process
// to know when a BrowsingContext becomes visible/hidden.

const TEST_PATH =
  getRootDirectory(gTestPath).replace(
    "chrome://mochitests/content",
    // eslint-disable-next-line @microsoft/sdl/no-insecure-url
    "http://example.com"
  ) + "dummy_page.html";

const TOPIC = "browsing-context-active-change";

async function waitForActiveChange() {
  return new Promise(resolve => {
    function observer(subject, topic) {
      is(topic, TOPIC, "observing correct topic");
      ok(
        BrowsingContext.isInstance(subject),
        "subject to be a BrowsingContext"
      );
      Services.obs.removeObserver(observer, TOPIC);
      resolve();
    }

    Services.obs.addObserver(observer, TOPIC);
  });
}

add_task(async function () {
  const tab = await BrowserTestUtils.openNewForegroundTab(gBrowser);
  const browser = tab.linkedBrowser;

  let onActiveChange = waitForActiveChange();
  browser.docShellIsActive = false;
  await onActiveChange;
  is(
    browser.browsingContext.isActive,
    false,
    "The browsing context is no longer active"
  );

  onActiveChange = waitForActiveChange();
  browser.docShellIsActive = true;
  await onActiveChange;
  is(
    browser.browsingContext.isActive,
    true,
    "The browsing context is active again"
  );

  BrowserTestUtils.removeTab(tab);
});
