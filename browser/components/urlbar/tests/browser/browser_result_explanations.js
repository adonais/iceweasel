/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

// Test for result explanations in the urlbar view ("Last visited {date}",
// "Bookmarked {date}").

"use strict";

const SEARCH_STRING = "explanation-strings";
const BASE_URL = "https://example.com/" + SEARCH_STRING;
const URL_VISITED = BASE_URL + "-visited";
const URL_BOOKMARKED = BASE_URL + "-bookmarked";
const URL_BOOKMARKED_AND_VISITED = BASE_URL + "-bookmarked-and-visited";

const VISIT_DATE = new Date("May 11, 2013 04:00:00 PDT");
const BOOKMARK_DATE = new Date("May 11, 2014 4:00:00 PDT");

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.urlbar.resultExplanations.featureGate", true]],
  });

  await PlacesTestUtils.addVisits([
    { url: URL_VISITED, visitDate: VISIT_DATE },
    { url: URL_BOOKMARKED_AND_VISITED, visitDate: VISIT_DATE },
  ]);
  await PlacesUtils.bookmarks.insert({
    parentGuid: PlacesUtils.bookmarks.unfiledGuid,
    url: URL_BOOKMARKED,
    title: SEARCH_STRING + " bookmarked",
    dateAdded: BOOKMARK_DATE,
  });
  await PlacesUtils.bookmarks.insert({
    parentGuid: PlacesUtils.bookmarks.unfiledGuid,
    url: URL_BOOKMARKED_AND_VISITED,
    title: SEARCH_STRING + " bookmarked and visited",
    dateAdded: BOOKMARK_DATE,
  });

  registerCleanupFunction(async () => {
    await PlacesUtils.bookmarks.eraseEverything();
    await PlacesUtils.history.clear();
  });
});

// The explanation string should be shown on hover.
add_task(async function hover() {
  await UrlbarTestUtils.promiseAutocompleteResultPopup({
    window,
    value: SEARCH_STRING,
  });

  let row = await getRowByUrl(URL_VISITED);
  await assertExplanationVisibility(row);

  // Hover over the visited row.
  EventUtils.synthesizeMouseAtCenter(row, { type: "mouseover" }, window);

  await assertExplanationVisibility(row, {
    lastVisited: {
      id: "urlbar-result-explanation-last-visited-absolute-2",
      args: {
        date: "May 11, 2013",
      },
    },
  });

  // Hover over something other than the visited row.
  EventUtils.synthesizeMouseAtCenter(gURLBar, { type: "mouseover" }, window);

  await assertExplanationVisibility(row);

  await UrlbarTestUtils.promisePopupClose(window);
});

// The explanation string should be shown on keyboard selection.
add_task(async function selection() {
  await UrlbarTestUtils.promiseAutocompleteResultPopup({
    window,
    value: SEARCH_STRING,
  });

  let row = await getRowByUrl(URL_VISITED);
  await assertExplanationVisibility(row);

  // Select the row.
  await selectRow(row);
  Assert.equal(
    UrlbarTestUtils.getSelectedRow(window),
    row,
    "The row should be selected"
  );

  await assertExplanationVisibility(row, {
    lastVisited: {
      id: "urlbar-result-explanation-last-visited-absolute-2",
      args: {
        date: "May 11, 2013",
      },
    },
  });

  // Move the selection to deselect the row.
  EventUtils.synthesizeKey("KEY_ArrowDown");
  Assert.notEqual(
    UrlbarTestUtils.getSelectedRow(window),
    row,
    "The row should not be selected"
  );

  await assertExplanationVisibility(row);

  await UrlbarTestUtils.promisePopupClose(window);
});

// Tests all "last visited" l10n explanation strings, which depend on the visit
// date and current date.
add_task(async function lastVisited() {
  await doTest([
    {
      url: URL_VISITED,
      formattedDate: { isRelative: false, formattedDate: "May 11, 2013" },
      expected: {
        lastVisited: {
          id: "urlbar-result-explanation-last-visited-absolute-2",
          args: { date: "May 11, 2013" },
        },
      },
    },
    {
      url: URL_VISITED,
      formattedDate: { isRelative: true, formattedDate: "Today" },
      expected: {
        lastVisited: {
          id: "urlbar-result-explanation-last-visited-relative-2",
          args: { date: "Today" },
        },
      },
    },
  ]);
});

add_task(async function bookmark() {
  await doTest([
    {
      url: URL_BOOKMARKED,
      formattedDate: { isRelative: false, formattedDate: "May 11, 2013" },
      expected: {
        bookmarked: {
          id: "urlbar-result-explanation-bookmarked",
          args: { date: "May 11, 2013" },
        },
      },
    },
  ]);
});

add_task(async function visitedAndBookmarked() {
  await doTest([
    {
      url: URL_BOOKMARKED_AND_VISITED,
      formattedDate: { isRelative: false, formattedDate: "May 11, 2013" },
      expected: {
        lastVisited: {
          id: "urlbar-result-explanation-last-visited-absolute-2",
          args: { date: "May 11, 2013" },
        },
        bookmarked: {
          id: "urlbar-result-explanation-bookmarked",
          args: { date: "May 11, 2013" },
        },
      },
    },
  ]);
});

async function selectRow(row) {
  // Arrow down until the given row is selected.
  let count = UrlbarTestUtils.getResultCount(window);
  for (let i = 0; i <= count; i++) {
    if (UrlbarTestUtils.getSelectedRow(window) == row) {
      return;
    }
    EventUtils.synthesizeKey("KEY_ArrowDown");
  }
  Assert.equal(
    UrlbarTestUtils.getSelectedRow(window),
    row,
    "The row should be selectable"
  );
}

async function doTest(tests) {
  let sandbox = sinon.createSandbox();
  let formatDateStub = sandbox.stub(UrlbarUtils, "formatDate");

  for (let { url, formattedDate, expected } of tests) {
    formatDateStub.returns(formattedDate);

    await UrlbarTestUtils.promiseAutocompleteResultPopup({
      window,
      value: SEARCH_STRING,
    });

    let row = await getRowByUrl(url);
    await assertExplanationVisibility(row);

    // Hover over the row.
    EventUtils.synthesizeMouseAtCenter(row, { type: "mouseover" }, window);

    await assertExplanationVisibility(row, expected);

    await UrlbarTestUtils.promisePopupClose(window);
  }

  sandbox.restore();
}

async function getRowByUrl(url) {
  let count = UrlbarTestUtils.getResultCount(window);
  for (let i = 0; i < count; i++) {
    let details = await UrlbarTestUtils.getDetailsOfResultAt(window, i);
    if (details.url == url) {
      return details.element.row;
    }
  }
  Assert.ok(false, `The row for ${url} should be found`);
  return null;
}

function assertExplanationVisibility(
  row,
  { lastVisited = null, bookmarked = null } = {}
) {
  let explanationElement = row.querySelector(".urlbarView-explanation");
  Assert.ok(explanationElement, "Explanation element should be present");

  Assert.equal(
    BrowserTestUtils.isVisible(explanationElement),
    !!(lastVisited || bookmarked),
    "The explanation visibility should be as expected"
  );
  Assert.ok(
    row.hasAttribute("has-explanation"),
    "The row should have the has-explanation attribute regardless of visibility"
  );

  assertChildL10n(row, ".urlbarView-explanation-last-visited", lastVisited);
  assertChildL10n(row, ".urlbarView-explanation-bookmarked", bookmarked);
}

function assertChildL10n(row, selector, expectedL10nObject) {
  let element = row.querySelector(selector);
  Assert.ok(element, `The "${selector}" element should be present`);

  if (expectedL10nObject) {
    Assert.deepEqual(
      document.l10n.getAttributes(element),
      expectedL10nObject,
      `The "${selector}" l10n object should be as expected`
    );
  }
}
