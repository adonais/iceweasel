/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { PromptTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/PromptTestUtils.sys.mjs"
);

const LOG_DIR = PathUtils.join(PathUtils.profileDir, "weave", "logs");
const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.now();

// One recent error log, one recent success log, and one error log old enough to
// be excluded by the "last 7 days" date filter.
const TEST_LOGS = [
  {
    name: `error-sync-${NOW}.txt`,
    contents: "1481 Sync.Service ERROR something failed\nstack frame\n",
  },
  {
    name: `success-sync-${NOW - 1}.txt`,
    contents: "1481 Sync.Service DEBUG all good here\n",
  },
  {
    name: `error-sync-${NOW - 10 * DAY_MS}.txt`,
    contents: "1481 Sync.Service ERROR ancient failure\n",
  },
];

async function setupLogs() {
  await IOUtils.makeDirectory(LOG_DIR, { ignoreExisting: true });
  // Start from a clean slate so row counts are deterministic.
  for (const path of await IOUtils.getChildren(LOG_DIR)) {
    await IOUtils.remove(path);
  }
  for (const log of TEST_LOGS) {
    await IOUtils.writeUTF8(PathUtils.join(LOG_DIR, log.name), log.contents);
  }
}

registerCleanupFunction(async () => {
  try {
    await IOUtils.remove(LOG_DIR, { recursive: true });
  } catch (ex) {
    // Directory may not exist; nothing to clean up.
  }
});

function rows(doc) {
  return doc.querySelectorAll(".log-row");
}

function dispatch(doc, el, type) {
  el.dispatchEvent(new doc.defaultView.Event(type, { bubbles: true }));
}

function search(doc, value) {
  const input = doc.getElementById("filter-search");
  input.value = value;
  dispatch(doc, input, "MozInputSearch:search");
}

async function withPage(taskFn) {
  await setupLogs();
  await BrowserTestUtils.withNewTab("about:sync-log", async browser => {
    const doc = browser.contentDocument;
    await TestUtils.waitForCondition(
      () => rows(doc).length === TEST_LOGS.length,
      "all test logs are rendered"
    );
    await taskFn(doc, browser);
  });
}

add_task(async function test_logs_are_listed() {
  await withPage(async doc => {
    is(rows(doc).length, 3, "All three logs are listed");
    const typeFilter = doc.getElementById("filter-type");
    is(typeFilter.value, "all", "The type filter defaults to all logs");
    ok(
      doc.querySelector("moz-radio[value=all]").checked,
      "The all logs radio is checked by default"
    );
  });
});

add_task(async function test_filters() {
  await withPage(async doc => {
    doc.querySelector("moz-radio[value=success]").click();
    await TestUtils.waitForCondition(
      () => rows(doc).length === 1,
      "Only the success log remains"
    );
    doc.querySelector("moz-radio[value=all]").click();
    await TestUtils.waitForCondition(
      () => rows(doc).length === 3,
      "All logs are shown again"
    );

    const select = doc.getElementById("filter-date");
    select.value = "7";
    dispatch(doc, select, "change");
    await TestUtils.waitForCondition(
      () => rows(doc).length === 2,
      "The 10-day-old log is filtered out"
    );

    select.value = "all";
    dispatch(doc, select, "change");
    search(doc, "all good here");
    await TestUtils.waitForCondition(
      () => rows(doc).length === 1,
      "Search matches the success log by contents"
    );
  });
});

add_task(async function test_search() {
  await withPage(async doc => {
    // Matches a filename.
    search(doc, "success");
    await TestUtils.waitForCondition(
      () => rows(doc).length === 1,
      "Search matches the success log by filename"
    );

    // Matches log contents.
    search(doc, "all good here");
    await TestUtils.waitForCondition(
      () =>
        rows(doc).length === 1 &&
        rows(doc)[0].querySelector(".log-badge").classList.contains("success"),
      "Search matches the success log by contents"
    );

    search(doc, "does not exist");
    await TestUtils.waitForCondition(
      () =>
        !rows(doc).length &&
        !doc.getElementById("empty-state").hidden &&
        doc.getElementById("empty-state").textContent ===
          "No logs match the current filters.",
      "An unmatched search shows the filtered empty state"
    );
    is(
      doc.getElementById("empty-state").textContent,
      "No logs match the current filters.",
      "The filtered empty state differs from an empty log directory"
    );
  });
});

add_task(async function test_inline_viewer() {
  await withPage(async doc => {
    const errorRow = [...rows(doc)].find(row =>
      row.querySelector(".log-badge").classList.contains("error")
    );
    const details = errorRow.querySelector(".log-row-details");
    const summary = errorRow.querySelector(".log-row-header");
    ok(!details.open, "The row starts collapsed");

    summary.click();
    await TestUtils.waitForCondition(
      () => details.open && errorRow.querySelector(".log-line"),
      "The log contents render when the row is expanded"
    );
    ok(
      errorRow.querySelector(".log-line.error"),
      "Error lines are highlighted in the inline viewer"
    );

    summary.click();
    await TestUtils.waitForCondition(
      () => !details.open,
      "The row collapses again"
    );
  });
});

add_task(async function test_clear_logs() {
  await withPage(async doc => {
    const promptPromise = PromptTestUtils.handleNextPrompt(
      null,
      { modalType: Services.prompt.MODAL_TYPE_WINDOW },
      { buttonNumClick: 0 }
    );
    doc.getElementById("clear-button").click();
    await promptPromise;

    await TestUtils.waitForCondition(
      () => !rows(doc).length && !doc.getElementById("empty-state").hidden,
      "All logs are cleared and the empty state is shown"
    );

    const remaining = await IOUtils.getChildren(LOG_DIR);
    is(remaining.length, 0, "Log files are deleted from disk");
  });
});
