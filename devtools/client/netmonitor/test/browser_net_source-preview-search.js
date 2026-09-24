/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

add_task(async function testSourcePreviewFileSearchBar() {
  // Open NetMonitor on a simple test page.
  const { monitor } = await initNetMonitor(SIMPLE_URL, {
    requestCount: 1,
  });

  // Access the NetMonitor panel window and document.
  const { panelWin } = monitor;
  const { document } = panelWin;

  info("Perform a predictable request for JavaScript source text");

  // Trigger a request with known response text so search results
  // are deterministic.
  await performRequestsInContent({
    url: EXAMPLE_URL + "sjs_test-module-script.sjs",
    method: "GET",
    nocache: true,
  });

  // Wait for the request to appear in NetMonitor.
  await waitUntil(
    () => document.querySelectorAll(".request-list-item").length >= 1
  );

  info("Open the Response source preview");

  // Open the response preview and wait for CodeMirror.
  await selectIndexAndWaitForSourceEditor(monitor, 0);

  // Verify keyboard search can be opened.
  const editor = document.querySelector(".cm-editor");
  ok(editor, "The CodeMirror editor exists");

  const editorContent = editor.querySelector(".cm-content");
  ok(editorContent, "The CodeMirror content exists");

  // Focus the editor before triggering the search shortcut.
  editorContent.focus();

  EventUtils.synthesizeKey("f", { accelKey: true }, panelWin);

  await waitUntil(() => document.querySelector(".search-field input"));

  const searchInput = document.querySelector(".search-field input");
  ok(searchInput, "The file search input is displayed");

  is(document.activeElement, searchInput, "The file search input is focused");

  const testSearchQuery = async ({
    query,
    expectedSummary,
    message,
    clickSelector,
  }) => {
    if (query !== undefined) {
      searchInput.focus();

      EventUtils.synthesizeKey("a", { accelKey: true }, panelWin);
      EventUtils.sendString(query, panelWin);

      await waitUntil(() => searchInput.value === query);
    }

    if (clickSelector) {
      const control = document.querySelector(clickSelector);
      ok(control, `The ${clickSelector} control exists`);

      EventUtils.synthesizeMouseAtCenter(control, {}, panelWin);
    }

    await waitUntil(() => {
      const summary = document.querySelector(".search-field-summary");
      return summary?.textContent === expectedSummary;
    });

    const searchFieldSummary = document.querySelector(".search-field-summary");

    ok(searchFieldSummary, "The search field summary is displayed");

    is(searchFieldSummary.textContent, expectedSummary, message);
  };

  // BEGIN TESTS
  const NEXT_BUTTON_SELECTOR = ".search-nav-buttons .next";
  const PREV_BUTTON_SELECTOR = ".search-nav-buttons .prev";
  const CASE_SENSITIVE_SELECTOR = ".case-sensitive-btn";
  const WHOLE_WORD_SELECTOR = ".whole-word-btn";
  const REGEX_SELECTOR = ".regex-match-btn";
  const CLOSE_SELECTOR = ".close-btn";

  await testSearchQuery({
    query: "o",
    expectedSummary: "1 of 7 results",
    message: "Searching for o finds seven results",
  });

  await testSearchQuery({
    clickSelector: NEXT_BUTTON_SELECTOR,
    expectedSummary: "2 of 7 results",
    message: "The next button advances to the next search result",
  });

  await testSearchQuery({
    clickSelector: PREV_BUTTON_SELECTOR,
    expectedSummary: "1 of 7 results",
    message: "The previous button returns to the previous search result",
  });

  // Verify case-sensitive search.
  await testSearchQuery({
    query: "F",
    expectedSummary: "1 of 2 results",
    message: "Search is case-insensitive by default",
  });

  await testSearchQuery({
    clickSelector: CASE_SENSITIVE_SELECTOR,
    expectedSummary: "No results found",
    message: "Case-sensitive search finds no uppercase F",
  });

  await testSearchQuery({
    clickSelector: CASE_SENSITIVE_SELECTOR,
    expectedSummary: "1 of 2 results",
    message: "Disabling case sensitivity restores both matches",
  });

  // Verify whole-word search.
  await testSearchQuery({
    query: "f",
    expectedSummary: "1 of 2 results",
    message: "Searching for f finds partial and whole-word matches",
  });

  await testSearchQuery({
    clickSelector: WHOLE_WORD_SELECTOR,
    expectedSummary: "1 of 1 result",
    message: "Whole-word search only matches the standalone f",
  });

  await testSearchQuery({
    clickSelector: WHOLE_WORD_SELECTOR,
    expectedSummary: "1 of 2 results",
    message: "Disabling whole-word search restores both matches",
  });

  // Verify regular-expression search.
  await testSearchQuery({
    query: "f\\(\\)",
    expectedSummary: "No results found",
    message: "The regex pattern is treated literally by default",
  });

  await testSearchQuery({
    clickSelector: REGEX_SELECTOR,
    expectedSummary: "1 of 1 result",
    message: "Regular-expression search matches f()",
  });

  // Verify closing the search bar.
  const closeButton = document.querySelector(CLOSE_SELECTOR);
  ok(closeButton, "The close-search button exists");

  EventUtils.synthesizeMouseAtCenter(closeButton, {}, panelWin);

  await waitUntil(() => !document.querySelector(".search-field input"));

  ok(
    !document.querySelector(".search-field input"),
    "The file search bar is closed"
  );

  await teardown(monitor);
});
