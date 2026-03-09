/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

const NO_TITLE_URL =
  "http://mochi.test:8888/browser/browser/components/urlbar/tests/browser/no_title.html";

add_setup(async function () {
  registerCleanupFunction(async () => {
    await PlacesTestUtils.clearInputHistory();
    await PlacesUtils.history.clear();
  });
});

add_task(async function places() {
  let targetTab = await BrowserTestUtils.openNewForegroundTab({
    gBrowser,
    url: NO_TITLE_URL,
  });
  let operationTab = await BrowserTestUtils.openNewForegroundTab(gBrowser);

  let context = await UrlbarTestUtils.promiseAutocompleteResultPopup({
    window,
    value: "mochi",
  });

  let result = context.results.find(
    r => r.type == UrlbarUtils.RESULT_TYPE.TAB_SWITCH
  );
  Assert.equal(result.providerName, "UrlbarProviderPlaces");
  let title = result.getDisplayableValueAndHighlights("title")?.value;
  Assert.equal(title, NO_TITLE_URL);

  BrowserTestUtils.removeTab(operationTab);
  BrowserTestUtils.removeTab(targetTab);
  await PlacesUtils.history.clear();
});

add_task(async function inputHistory() {
  let targetTab = await BrowserTestUtils.openNewForegroundTab({
    gBrowser,
    url: NO_TITLE_URL,
  });
  await UrlbarUtils.addToInputHistory(NO_TITLE_URL, "inputhistory");

  let operationTab = await BrowserTestUtils.openNewForegroundTab(gBrowser);

  let context = await UrlbarTestUtils.promiseAutocompleteResultPopup({
    window,
    value: "inputhistory",
  });

  let result = context.results.find(
    r => r.type == UrlbarUtils.RESULT_TYPE.TAB_SWITCH
  );
  Assert.equal(result.providerName, "UrlbarProviderInputHistory");
  let title = result.getDisplayableValueAndHighlights("title")?.value;
  Assert.equal(title, NO_TITLE_URL);

  BrowserTestUtils.removeTab(operationTab);
  BrowserTestUtils.removeTab(targetTab);
  await PlacesTestUtils.clearInputHistory();
  await PlacesUtils.history.clear();
});
