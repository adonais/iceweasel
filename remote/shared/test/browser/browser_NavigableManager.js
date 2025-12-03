/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { NavigableManager } = ChromeUtils.importESModule(
  "chrome://remote/content/shared/NavigableManager.sys.mjs"
);

const BUILDER_URL = "https://example.com/document-builder.sjs?html=";
const FRAME_URL = "https://example.com/document-builder.sjs?html=frame";
const FRAME_MARKUP = `
  <iframe src="${encodeURI(FRAME_URL)}"></iframe>
  <iframe src="${encodeURI(FRAME_URL)}"></iframe>
`;
const TEST_URL = BUILDER_URL + encodeURI(FRAME_MARKUP);

const numberRegex = /[0-9]+/i;
const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("NavigableManager", function () {
  let testData;

  beforeEach(async () => {
    NavigableManager.startTracking();

    const initialBrowser = gBrowser.selectedBrowser;
    const initialContext = initialBrowser.browsingContext;

    info(`Open a new tab and navigate to ${TEST_URL}`);
    const newTab = await addTabAndWaitForNavigated(gBrowser, TEST_URL);

    const newBrowser = newTab.linkedBrowser;
    const newContext = newBrowser.browsingContext;
    const newFrameContexts = newContext
      .getAllBrowsingContextsInSubtree()
      .filter(context => context.parent);

    is(newFrameContexts.length, 2, "Top context has 2 child contexts");

    testData = {
      initialBrowser,
      initialContext,
      newBrowser,
      newContext,
      newFrameContexts,
      newTab,
    };
  });

  afterEach(() => {
    NavigableManager.stopTracking();

    gBrowser.removeAllTabsBut(gBrowser.tabs[0]);
  });

  it("Get the browser by its Navigable id", async function test_getBrowserById() {
    const { initialBrowser, newBrowser } = testData;

    const invalidValues = [undefined, null, 1, "foo", {}, []];
    invalidValues.forEach(value =>
      is(NavigableManager.getBrowserById(value), null)
    );

    const initialBrowserId = NavigableManager.getIdForBrowser(initialBrowser);
    const newBrowserId = NavigableManager.getIdForBrowser(newBrowser);

    Assert.stringMatches(
      initialBrowserId,
      uuidRegex,
      "Initial browser is a valid uuid"
    );
    Assert.stringMatches(
      newBrowserId,
      uuidRegex,
      "New tab's browser is a valid uuid"
    );
    isnot(initialBrowserId, newBrowserId, "Both browsers have different ids");

    is(NavigableManager.getBrowserById(initialBrowserId), initialBrowser);
    is(NavigableManager.getBrowserById(newBrowserId), newBrowser);
  });

  it("Get the BrowsingContext by its Navigable id", async function test_getBrowsingContextById() {
    const { newContext, newFrameContexts } = testData;

    const invalidValues = [undefined, null, "foo", {}, []];
    invalidValues.forEach(value =>
      is(NavigableManager.getBrowsingContextById(value), null)
    );

    const newContextId = NavigableManager.getIdForBrowsingContext(newContext);
    const newFrameContextIds = newFrameContexts.map(context =>
      NavigableManager.getIdForBrowsingContext(context)
    );

    Assert.stringMatches(
      newContextId,
      uuidRegex,
      "Top context is a valid uuid"
    );
    Assert.stringMatches(
      newFrameContextIds[0],
      numberRegex,
      "First child context has a valid id"
    );
    Assert.stringMatches(
      newFrameContextIds[1],
      numberRegex,
      "Second child context has a valid id"
    );
    isnot(
      newContextId,
      newFrameContextIds[0],
      "Id of top-level context is different from first child context"
    );
    isnot(
      newContextId,
      newFrameContextIds[0],
      "Id of top-level context is different from second child context"
    );
    is(
      NavigableManager.getBrowsingContextById(newFrameContextIds[0]),
      newFrameContexts[0],
      "Context of first child can be retrieved by id"
    );
    is(
      NavigableManager.getBrowsingContextById(newFrameContextIds[1]),
      newFrameContexts[1],
      "Context of second child can be retrieved by id"
    );
  });

  it("Get the Navigable id for a browser", async function test_getIdForBrowser() {
    const { initialBrowser, newBrowser, newContext } = testData;

    const invalidValues = [undefined, null, 1, "foo", {}, []];
    invalidValues.forEach(value =>
      is(NavigableManager.getBrowserById(value), null)
    );

    is(
      NavigableManager.getIdForBrowser(newContext),
      null,
      "Requires a browser instance as argument"
    );

    const newBrowserId = NavigableManager.getIdForBrowser(newBrowser);
    Assert.stringMatches(
      NavigableManager.getIdForBrowser(newBrowser),
      uuidRegex,
      "Got a valid uuid for the browser"
    );
    is(
      NavigableManager.getIdForBrowser(newBrowser),
      newBrowserId,
      "For the same browser the identical id is returned"
    );
    isnot(
      NavigableManager.getIdForBrowser(initialBrowser),
      newBrowserId,
      "For a different browser the id is not the same"
    );
  });

  it("Get the Navigable id for a BrowsingContext", async function test_getIdForBrowsingContext() {
    const { newBrowser, newContext, newFrameContexts } = testData;

    const invalidValues = [undefined, null, 1, "foo", {}, []];
    invalidValues.forEach(value =>
      is(NavigableManager.getIdForBrowsingContext(value), null)
    );

    const newContextId = NavigableManager.getIdForBrowsingContext(newContext);
    const newFrameContextIds = newFrameContexts.map(context =>
      NavigableManager.getIdForBrowsingContext(context)
    );

    Assert.stringMatches(
      newContextId,
      uuidRegex,
      "Got a valid uuid for top-level context"
    );
    is(
      NavigableManager.getIdForBrowsingContext(newContext),
      newContextId,
      "Id is always the same for a top-level context"
    );
    is(
      NavigableManager.getIdForBrowsingContext(newContext),
      NavigableManager.getIdForBrowser(newBrowser),
      "Id of a top-level context is equal to the browser id"
    );

    Assert.stringMatches(
      newFrameContextIds[0],
      numberRegex,
      "Got a valid id for a child context"
    );
    is(
      NavigableManager.getIdForBrowsingContext(newFrameContexts[0]),
      newFrameContextIds[0],
      "Id is always the same for a child context"
    );
  });

  it("Get the Navigable for a BrowsingContext", async function test_getNavigableForBrowsingContext() {
    const { newBrowser, newContext, newFrameContexts, newTab } = testData;

    const invalidValues = [undefined, null, 1, "test", {}, [], newBrowser];
    invalidValues.forEach(invalidValue =>
      Assert.throws(
        () => NavigableManager.getNavigableForBrowsingContext(invalidValue),
        /Expected browsingContext to be a CanonicalBrowsingContext/
      )
    );

    is(
      NavigableManager.getNavigableForBrowsingContext(newContext),
      newBrowser,
      "Top-Level context has the content browser as navigable"
    );
    is(
      NavigableManager.getNavigableForBrowsingContext(newFrameContexts[0]),
      newFrameContexts[0],
      "Child context has itself as navigable"
    );

    gBrowser.removeTab(newTab);
  });

  it("Get discarded BrowsingContext by id", async function test_getDiscardedBrowsingContextById() {
    const { newBrowser, newContext, newFrameContexts, newTab } = testData;

    const newContextId = NavigableManager.getIdForBrowsingContext(newContext);
    const newFrameContextIds = newFrameContexts.map(context =>
      NavigableManager.getIdForBrowsingContext(context)
    );

    is(
      NavigableManager.getBrowsingContextById(newContextId),
      newContext,
      "Top context can be retrieved by its id"
    );
    is(
      NavigableManager.getBrowsingContextById(newFrameContextIds[0]),
      newFrameContexts[0],
      "Child context can be retrieved by its id"
    );

    // Remove all the iframes
    await SpecialPowers.spawn(newBrowser, [], async () => {
      const frames = content.document.querySelectorAll("iframe");
      frames.forEach(frame => frame.remove());
    });

    is(
      NavigableManager.getBrowsingContextById(newContextId),
      newContext,
      "Top context can still be retrieved after removing all the frames"
    );
    is(
      NavigableManager.getBrowsingContextById(newFrameContextIds[0]),
      null,
      "Child context can no longer be retrieved by its id after removing all the frames"
    );

    gBrowser.removeTab(newTab);

    is(
      NavigableManager.getBrowsingContextById(newContextId),
      null,
      "Top context can no longer be retrieved by its id after the tab is closed"
    );
  });

  it("Support unloaded browsers", async function test_unloadedBrowser() {
    const { newBrowser, newContext, newTab } = testData;

    const newBrowserId = NavigableManager.getIdForBrowser(newBrowser);
    const newContextId = NavigableManager.getIdForBrowsingContext(newContext);

    await gBrowser.discardBrowser(newTab);

    is(
      NavigableManager.getIdForBrowser(newBrowser),
      newBrowserId,
      "Id for the browser is still available after unloading the tab"
    );
    is(
      NavigableManager.getBrowserById(newBrowserId),
      newBrowser,
      "Unloaded browser can still be retrieved by id"
    );

    is(
      NavigableManager.getIdForBrowsingContext(newContext),
      newContextId,
      "Id for the browsing context is still available after unloading the tab"
    );
    is(
      NavigableManager.getBrowsingContextById(newContextId),
      null,
      "Browsing context can no longer be retrieved after unloading the tab"
    );
    Assert.throws(
      () => NavigableManager.getNavigableForBrowsingContext(newContext),
      /Expected browsingContext to be a CanonicalBrowsingContext/
    );

    // Loading a new page for new browsing contexts
    await loadURL(newBrowser, TEST_URL);

    const newBrowsingContext = newBrowser.browsingContext;

    is(
      NavigableManager.getIdForBrowser(newBrowser),
      newBrowserId,
      "Id for the browser is still the same when navigating after unloading the tab"
    );
    is(
      NavigableManager.getBrowserById(newBrowserId),
      newBrowser,
      "New browser can be retrieved by its id"
    );

    is(
      NavigableManager.getIdForBrowsingContext(newBrowsingContext),
      newContextId,
      "Id for the new top-level context is still the same"
    );
    is(
      NavigableManager.getBrowsingContextById(newContextId),
      newBrowsingContext,
      "Top-level context can be retrieved again"
    );
    is(
      NavigableManager.getNavigableForBrowsingContext(newBrowsingContext),
      newBrowser,
      "The navigable can be retrieved again"
    );
  });

  it("Retrieve id for cross-group opener", async function test_crossGroupOpener() {
    const { newContext, newBrowser, newTab } = testData;

    const newContextId = NavigableManager.getIdForBrowsingContext(newContext);

    await SpecialPowers.spawn(newBrowser, [], async () => {
      content.open("", "_blank", "");
    });

    const browser = gBrowser.selectedBrowser;
    const openerContext = browser.browsingContext.crossGroupOpener;

    isnot(
      browser.browsingContext.crossGroupOpener,
      null,
      "Opened popup window has a cross-group opener"
    );
    is(
      NavigableManager.getIdForBrowsingContext(openerContext),
      newContextId,
      "Id of cross-group opener context is correct"
    );

    // Remove the tab which opened the popup window
    gBrowser.removeTab(newTab);

    is(
      NavigableManager.getIdForBrowsingContext(openerContext),
      newContextId,
      "Id of cross-group opener context is still correct after closing the opener tab"
    );
  });

  it("Start and stop tracking of browsing contexts", async function test_startStopTracking() {
    async function addUnloadedTab(tabBrowser) {
      info(`Open a new tab, navigate, and unload it immediately`);
      const newTab = await addTabAndWaitForNavigated(tabBrowser, TEST_URL);

      const newBrowser = newTab.linkedBrowser;
      const newContext = newBrowser.browsingContext;

      const newFrameContexts = newContext
        .getAllBrowsingContextsInSubtree()
        .filter(context => context.parent);

      info(`Unload the newly opened tab`);
      await tabBrowser.discardBrowser(newTab);

      return {
        newBrowser,
        newContext,
        newFrameContexts,
        newTab,
      };
    }

    // Calling start tracking multiple times doesn't cause failures.
    NavigableManager.startTracking();
    NavigableManager.startTracking();

    {
      // Stop tracking of new browsing contexts
      NavigableManager.stopTracking();

      let { newBrowser, newContext } = await addUnloadedTab(gBrowser);

      Assert.stringMatches(
        NavigableManager.getIdForBrowser(newBrowser),
        uuidRegex,
        "There is always a valid uuid for the browser"
      );
      is(
        NavigableManager.getIdForBrowsingContext(newContext),
        null,
        "There is no id of a temporarily open top-level context"
      );
    }

    // Calling stop tracking multiple times doesn't cause failures.
    NavigableManager.stopTracking();

    // Re-enable tracking
    NavigableManager.startTracking();

    let { newBrowser, newContext } = await addUnloadedTab(gBrowser);

    Assert.stringMatches(
      NavigableManager.getIdForBrowser(newBrowser),
      uuidRegex,
      "Got a valid uuid for the browser"
    );
    Assert.stringMatches(
      NavigableManager.getIdForBrowsingContext(newContext),
      uuidRegex,
      "Got a valid uuid for the top-level context"
    );
  });
});
