/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

/**
 * Tests that the fallback paths of handleCommand (no view and no previous
 * result) work consistently against the normal case of picking the heuristic
 * result.
 */

const { UrlbarParentController } = ChromeUtils.importESModule(
  "moz-src:///browser/components/urlbar/UrlbarParentController.sys.mjs"
);

const TEST_STRINGS = [
  "test",
  "test/",
  "test.com",
  "test.invalid",
  "moz",
  "moz test",
  "@moz test",
  "keyword",
  "keyword test",
  "test/test/",
  "test /test/",
];

add_task(async function () {
  // Disable autofill so mozilla.org isn't autofilled below.
  await SpecialPowers.pushPrefEnv({
    set: [["browser.urlbar.autoFill", false]],
  });

  sandbox = sinon.createSandbox();
  await SearchTestUtils.installSearchExtension();
  await SearchTestUtils.installSearchExtension({ name: "Example2" });

  let bm = await PlacesUtils.bookmarks.insert({
    parentGuid: PlacesUtils.bookmarks.unfiledGuid,
    url: "https://example.com/?q=%s",
    title: "test",
  });
  await PlacesUtils.keywords.insert({
    keyword: "keyword",
    url: "https://example.com/?q=%s",
  });
  registerCleanupFunction(async () => {
    sandbox.restore();
    await PlacesUtils.bookmarks.remove(bm);
    await UrlbarTestUtils.formHistory.clear();
  });

  async function promiseLoadURL() {
    return new Promise(resolve => {
      sandbox
        .stub(gURLBar.controller, "loadURL")
        .callsFake(({ url, where }) => {
          sandbox.restore();
          // The remaining options are optional and apply only to some cases, so
          // we could not use deepEqual with them.
          resolve([url, where]);
          return {};
        });
    });
  }

  // Run the string through a normal search where the user types the string
  // and confirms the heuristic result, store the load arguments, then confirm
  // the same string without a view and without an input event, and compare the
  // arguments.
  for (let value of TEST_STRINGS) {
    info(`Input the value normally and Enter. Value: ${value}`);
    let promise = promiseLoadURL();
    await UrlbarTestUtils.promiseAutocompleteResultPopup({
      window,
      value,
    });
    EventUtils.synthesizeKey("KEY_Enter");
    let args = await promise;
    Assert.ok(args.length, "Sanity check");
    info("Close the panel and confirm again.");
    promise = promiseLoadURL();
    await UrlbarTestUtils.promisePopupClose(window);
    EventUtils.synthesizeKey("KEY_Enter");
    Assert.deepEqual(await promise, args, "Check arguments are coherent");

    info("Set the value directly and Enter.");
    // To properly testing the original value we must be out of search mode.
    if (gURLBar.searchMode) {
      await UrlbarTestUtils.exitSearchMode(window);
      // Exiting search mode may reopen the panel.
      await UrlbarTestUtils.promisePopupClose(window);
    }
    promise = promiseLoadURL();
    gURLBar.value = value;
    let spy = sinon.spy(gURLBar.controller, "resolveFallbackNavigation");
    EventUtils.synthesizeKey("KEY_Enter");
    spy.restore();
    Assert.ok(spy.called, "invoked resolveFallbackNavigation");
    Assert.deepEqual(await promise, args, "Check arguments are coherent");
    gURLBar.handleRevert();
  }
});

// This is testing the final fallback case that may happen when we can't
// get a heuristic result, maybe because the Places database is corrupt.
add_task(async function no_heuristic_test() {
  let stub = sinon
    .stub(UrlbarParentController.prototype, "getHeuristicResult")
    .rejects(new Error("I failed!"));

  registerCleanupFunction(async () => {
    stub.restore();
    await UrlbarTestUtils.formHistory.clear();
  });

  async function promiseLoadURL() {
    return new Promise(resolve => {
      sinon.stub(gURLBar.controller, "loadURL").callsFake(({ url, where }) => {
        gURLBar.controller.loadURL.restore();
        // The remaining options are optional and apply only to some cases, so
        // we could not use deepEqual with them.
        resolve([url, where]);
        return {};
      });
    });
  }

  // Run the string through a normal search where the user types the string
  // and confirms the heuristic result, store the load arguments, then confirm
  // the same string without a view and without an input event, and compare the
  // arguments.
  for (let value of TEST_STRINGS) {
    // To properly testing the original value we must be out of search mode.
    if (gURLBar.searchMode) {
      await UrlbarTestUtils.exitSearchMode(window);
    }
    let promise = promiseLoadURL();
    gURLBar.value = value;
    EventUtils.synthesizeKey("KEY_Enter");
    // The loaded url should always be a valid url, so this should never throw.
    // Awaiting it also lets the message path round-trip the fallback before we
    // check the stub below.
    new URL((await promise)[0]);
    Assert.ok(stub.called, "invoked getHeuristicResult");
  }
});
