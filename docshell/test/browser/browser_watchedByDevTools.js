/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const TEST_URI_COM =
  "https://example.com/document-builder.sjs?html=<div>com</div>";
const TEST_URI_ORG =
  "https://example.org/document-builder.sjs?headers=Cross-Origin-Opener-Policy:same-origin&html=<div>org</div>";

const ACTOR = "WatchedByDevToolsTest";

const base = getRootDirectory(gTestPath).slice(0, -1);

add_setup(function () {
  ChromeUtils.notifyDevToolsOpened();
  registerCleanupFunction(() => ChromeUtils.notifyDevToolsClosed());

  ChromeUtils.registerProcessActor(ACTOR, {
    includeParent: true,
    safeForUntrustedWebProcess: true,
    child: {
      esModuleURI: `${base}/WatchedByDevToolsTestChild.sys.mjs`,
      observers: [
        "initial-document-element-inserted",
        "document-element-inserted",
        "content-document-global-created",
      ],
    },
  });
  registerCleanupFunction(async () => {
    ChromeUtils.unregisterProcessActor(ACTOR);
  });
});

add_task(async function preserveWatchedByDevToolsOnCrossGroupNavigation() {
  await BrowserTestUtils.withNewTab(TEST_URI_COM, async browser => {
    info("Enable the watchedByDevTools flag");
    browser.browsingContext.watchedByDevTools = true;
    is(
      browser.browsingContext.watchedByDevTools,
      true,
      "The current BrowsingContext is flagged as watched by devtools"
    );

    info("Navigate to a new location, doing a cross-group navigation");
    const previousBrowsingContextId = browser.browsingContext.id;
    const onBrowserLoaded = BrowserTestUtils.browserLoaded(
      browser,
      false,
      encodeURI(TEST_URI_ORG)
    );
    BrowserTestUtils.startLoadingURIString(browser, TEST_URI_ORG);
    await onBrowserLoaded;
    isnot(
      browser.browsingContext.id,
      previousBrowsingContextId,
      "A new browsing context was created"
    );

    is(
      browser.browsingContext.watchedByDevTools,
      true,
      "The new BrowsingContext is also flagged as watched by devtools"
    );

    let success = await browser.browsingContext.currentWindowGlobal.domProcess
      .getActor(ACTOR)
      .sendQuery("wasWatchedEarly", {
        browsingContextId: browser.browsingContext.id,
      });
    is(
      success,
      true,
      "The watchedByDevTools flag was set to true the earliest possible in the content process"
    );
  });
});

add_task(async function assertWatchedByDevToolsCanBeSetEarlyFromParentForTab() {
  function listener(subject) {
    info(
      "Enable the watchedByDevTools flag from the browsing-context-attached listener"
    );
    subject.watchedByDevTools = true;
    Services.obs.removeObserver(listener, "browsing-context-attached");
  }
  Services.obs.addObserver(listener, "browsing-context-attached");

  await BrowserTestUtils.withNewTab(TEST_URI_COM, async browser => {
    is(
      browser.browsingContext.watchedByDevTools,
      true,
      "The BrowsingContext is immediately flagged as watched by devtools in the parent process"
    );

    let success = await browser.browsingContext.currentWindowGlobal.domProcess
      .getActor(ACTOR)
      .sendQuery("wasWatchedEarly", {
        browsingContextId: browser.browsingContext.id,
      });
    is(
      success,
      true,
      "The watchedByDevTools flag was set to true the earliest possible in the content process"
    );
  });
});

add_task(
  async function assertWatchedByDevToolsCanBeSetEarlyFromParentForTopLevelWindow() {
    function listener(subject) {
      info(
        "Enable the watchedByDevTools flag from the browsing-context-attached listener"
      );
      subject.watchedByDevTools = true;
      Services.obs.removeObserver(listener, "browsing-context-attached");
    }
    Services.obs.addObserver(listener, "browsing-context-attached");

    const newWin = await BrowserTestUtils.openNewBrowserWindow();
    is(
      newWin.browsingContext.watchedByDevTools,
      true,
      "The BrowsingContext is immediately flagged as watched by devtools in the parent process"
    );

    let success = await newWin.browsingContext.currentWindowGlobal.domProcess
      .getActor(ACTOR)
      .sendQuery("wasWatchedEarly", {
        browsingContextId: newWin.browsingContext.id,
      });
    is(
      success,
      true,
      "The watchedByDevTools flag was set to true the earliest possible in the content process"
    );
    await BrowserTestUtils.closeWindow(newWin);
  }
);
