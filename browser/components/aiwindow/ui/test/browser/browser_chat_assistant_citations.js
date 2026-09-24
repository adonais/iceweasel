/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const TEST_PAGE =
  "chrome://mochitests/content/browser/browser/components/aiwindow/ui/test/browser/test_chat_assistant_citations_page.html";

const SOURCES = [
  { url: "https://www.mozilla.org/" },
  { url: "https://developer.mozilla.org/", title: "MDN" },
  { url: "https://example.com/" },
  { url: "https://support.mozilla.org/" },
  { url: "https://blog.mozilla.org/" },
];

async function openTestPage(pageUrl) {
  const tab = await BrowserTestUtils.openNewForegroundTab(gBrowser, pageUrl);
  await SpecialPowers.spawn(tab.linkedBrowser, [], async () => {
    await content.customElements.whenDefined("chat-assistant-citations");
  });
  return { tab, browser: tab.linkedBrowser };
}

/**
 * Set citations and let the width-based measurement settle.
 *
 * @param {Browser} browser - The test browser.
 * @param {string} id - The citations element id.
 * @param {Array<object>} citations - The sources to set.
 */
async function setCitationsAndSettle(browser, id, citations) {
  await SpecialPowers.spawn(browser, [id, citations], async (elId, list) => {
    const el = content.document.getElementById(elId);
    el.citations = list;
    await el.updateComplete;
    await content.settleOverflow(el);
  });
}

/**
 * Wait for the width-based measurement to settle.
 *
 * @param {Browser} browser - The test browser.
 * @param {string} id - The citations element id.
 */
async function settleCitations(browser, id) {
  await SpecialPowers.spawn(browser, [id], async elId => {
    await content.settleOverflow(content.document.getElementById(elId));
  });
}

function readLayout(browser, id) {
  return SpecialPowers.spawn(browser, [id], async elId => {
    const el = content.document.getElementById(elId);
    const row = el.shadowRoot.querySelector(".citations");
    // Visible items in flow, overflow items have attribute `[data-overflow]`
    const inline = row.querySelectorAll(
      ':scope > [role="listitem"]:not([data-overflow])'
    ).length;
    const moreButton = row.querySelector(
      ".citations-more:not([data-overflow])"
    );
    const overflowCount = moreButton
      ? JSON.parse(moreButton.getAttribute("data-l10n-args")).count
      : 0;
    return {
      // Without this class the shared sheet layout doesn’t apply
      isSmartwindowOverflowRow: row.classList.contains(
        "smartwindow-overflow-row"
      ),
      inline,
      hasMore: !!moreButton,
      overflowCount,
    };
  });
}

add_task(async function test_empty_renders_nothing() {
  const { tab, browser } = await openTestPage(TEST_PAGE);

  await setCitationsAndSettle(browser, "wide-citations", []);

  await SpecialPowers.spawn(browser, [], async () => {
    const el = content.document.getElementById("wide-citations");
    Assert.equal(
      el.shadowRoot.querySelector(".citations"),
      null,
      "No citations container renders for an empty list"
    );
  });

  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_wide_layout_fits_all_on_one_row() {
  const { tab, browser } = await openTestPage(TEST_PAGE);

  await setCitationsAndSettle(browser, "wide-citations", SOURCES.slice(0, 3));

  const layout = await readLayout(browser, "wide-citations");
  Assert.ok(
    layout.isSmartwindowOverflowRow,
    "The row opts into the shared overflow layout"
  );
  Assert.equal(layout.inline, 3, "All three sources fit inline in a wide box");
  Assert.ok(!layout.hasMore, "No overflow button when everything fits");

  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_wide_layout_shows_more_inline_than_narrow() {
  const { tab, browser } = await openTestPage(TEST_PAGE);

  await setCitationsAndSettle(browser, "wide-citations", SOURCES);
  await setCitationsAndSettle(browser, "narrow-citations", SOURCES);

  const wide = await readLayout(browser, "wide-citations");
  const narrow = await readLayout(browser, "narrow-citations");

  Assert.greater(
    wide.inline,
    narrow.inline,
    "A wider box fits more sources inline than a narrow one"
  );
  Assert.equal(
    wide.inline + wide.overflowCount,
    SOURCES.length,
    "Inline and overflow items account for every source in the wide box"
  );

  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_all_sources_inline_when_they_fit() {
  const { tab, browser } = await openTestPage(TEST_PAGE);

  await setCitationsAndSettle(browser, "wide-citations", SOURCES);

  const layout = await readLayout(browser, "wide-citations");
  Assert.equal(
    layout.inline,
    SOURCES.length,
    "Every source renders inline when they all fit"
  );
  Assert.ok(!layout.hasMore, "No overflow button when everything fits");

  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_narrow_layout_collapses_to_fewer() {
  const { tab, browser } = await openTestPage(TEST_PAGE);

  await setCitationsAndSettle(browser, "narrow-citations", SOURCES);

  const layout = await readLayout(browser, "narrow-citations");
  Assert.ok(layout.hasMore, "The narrow box overflows into the menu");
  Assert.less(
    layout.inline,
    SOURCES.length,
    "The narrow box cannot show every source inline"
  );
  Assert.equal(
    layout.inline + layout.overflowCount,
    SOURCES.length,
    "Inline and overflow item account for every source"
  );

  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_overflow_panel_holds_hidden_sources() {
  const { tab, browser } = await openTestPage(TEST_PAGE);

  await setCitationsAndSettle(browser, "narrow-citations", SOURCES);

  await SpecialPowers.spawn(browser, [], async () => {
    const el = content.document.getElementById("narrow-citations");
    const row = el.shadowRoot.querySelector(".citations");
    const moreButton = row.querySelector("moz-button");
    const overflowCount = JSON.parse(
      moreButton.getAttribute("data-l10n-args")
    ).count;

    const panel = row.querySelector("smartwindow-panel-list");
    Assert.ok(panel, "A panel list holds the overflow sources");
    await panel.updateComplete;
    const innerList = panel.shadowRoot.querySelector("panel-list");
    Assert.equal(
      innerList.querySelectorAll("ai-website-chip").length,
      overflowCount,
      "The overflow panel holds exactly the hidden sources"
    );
  });

  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_overflow_panel_keeps_duplicate_urls() {
  const { tab, browser } = await openTestPage(TEST_PAGE);

  // Assistants can cite the same page more than once (e.g. several details
  // pulled from one recipe). The overflow panel must keep every citation even
  // when they share a URL.
  const DUPLICATE_SOURCES = [
    { url: "https://recipes.example/potato", title: "Potato recipe A" },
    { url: "https://recipes.example/potato", title: "Potato recipe B" },
    { url: "https://recipes.example/potato", title: "Potato recipe C" },
    { url: "https://recipes.example/potato", title: "Potato recipe D" },
    { url: "https://recipes.example/potato", title: "Potato recipe E" },
  ];

  await setCitationsAndSettle(browser, "narrow-citations", DUPLICATE_SOURCES);

  await SpecialPowers.spawn(browser, [DUPLICATE_SOURCES], async sources => {
    const el = content.document.getElementById("narrow-citations");
    const row = el.shadowRoot.querySelector(".citations");
    const moreButton = row.querySelector(
      ".citations-more:not([data-overflow])"
    );
    Assert.ok(moreButton, "The duplicate sources overflow into the menu");
    const overflowCount = JSON.parse(
      moreButton.getAttribute("data-l10n-args")
    ).count;
    Assert.greater(overflowCount, 1, "More than one source overflows");

    const inline = row.querySelectorAll(
      ':scope > [role="listitem"]:not([data-overflow])'
    ).length;
    Assert.equal(
      inline + overflowCount,
      sources.length,
      "Inline and overflow items account for every duplicate source"
    );

    const panel = row.querySelector("smartwindow-panel-list");
    Assert.ok(panel, "A panel list holds the overflow sources");
    await panel.updateComplete;
    const innerList = panel.shadowRoot.querySelector("panel-list");
    const hiddenTitles = sources.slice(inline).map(s => s.title);
    Assert.deepEqual(
      [...innerList.querySelectorAll("ai-website-chip")].map(c => c.label),
      hiddenTitles,
      "The overflow panel lists every hidden source even with duplicate URLs"
    );
  });

  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_widening_re_expands_collapsed_sources() {
  const { tab, browser } = await openTestPage(TEST_PAGE);

  await setCitationsAndSettle(browser, "narrow-citations", SOURCES);
  const collapsed = await readLayout(browser, "narrow-citations");
  Assert.ok(collapsed.hasMore, "Sources start collapsed in the narrow box");

  // Resize the box and let the ResizeObserver re-run the measurement.
  await SpecialPowers.spawn(browser, [], async () => {
    content.document.getElementById("narrow").style.inlineSize = "900px";
  });
  await settleCitations(browser, "narrow-citations");

  const widened = await readLayout(browser, "narrow-citations");
  Assert.greater(
    widened.inline,
    collapsed.inline,
    "Widening the box shows more sources inline again"
  );
  Assert.equal(
    widened.inline,
    SOURCES.length,
    "All sources render inline once there is space"
  );
  Assert.ok(!widened.hasMore, "Nothing overflows once everything fits");

  BrowserTestUtils.removeTab(tab);
});
