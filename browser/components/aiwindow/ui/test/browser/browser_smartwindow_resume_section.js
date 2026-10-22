/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const SECTION_MODULE_URL =
  "chrome://browser/content/aiwindow/components/smartwindow-resume-section.mjs";
const COLLAPSED_CARD_COUNT = 2;

function makeCards(count) {
  return Array.from({ length: count }, (_, i) => ({
    memory: { id: `memory-${i}` },
    content: {
      headline: `Journey ${i}`,
      status: `Status for journey ${i}`,
      previewTabs: [{ url: `https://site${i}.example/` }],
    },
  }));
}

async function ensureSectionDefined(doc) {
  if (doc.defaultView.customElements.get("smartwindow-resume-section")) {
    return;
  }
  const script = doc.createElement("script");
  script.type = "module";
  script.src = SECTION_MODULE_URL;
  doc.head.appendChild(script);
  await doc.defaultView.customElements.whenDefined(
    "smartwindow-resume-section"
  );
  script.remove();
}

async function createResumeSection(doc, cards, { emptyReason, loading } = {}) {
  await ensureSectionDefined(doc);
  const el = doc.createElement("smartwindow-resume-section");
  el.cards = cards;
  if (emptyReason) {
    el.emptyReason = emptyReason;
  }
  if (loading) {
    el.loading = loading;
  }
  doc.body.appendChild(el);
  await el.updateComplete;
  return el;
}

function getToggleCount(shadow) {
  const toggle = shadow.querySelector(".resume-section-toggle");
  return toggle ? JSON.parse(toggle.dataset.l10nArgs).count : null;
}

// Reuse one document for isolated component tests.
let gSharedDoc;

add_setup(async function () {
  const win = await openAIWindow();
  gSharedDoc = win.gBrowser.selectedBrowser.contentDocument;

  registerCleanupFunction(async () => {
    await BrowserTestUtils.closeWindow(win);
    // Opening an AI Window records usage timestamps at runtime.
    for (const pref of [
      "browser.smartwindow.lastSmartWindowUsageTime",
      "browser.smartwindow.lastLLMTelemetryRunTime",
    ]) {
      Services.prefs.clearUserPref(pref);
    }
  });
});

add_task(async function test_resume_section_no_cards() {
  const el = await createResumeSection(gSharedDoc, []);

  Assert.equal(
    el.shadowRoot.querySelector(".resume-section-grid"),
    null,
    "Nothing should render when there are no cards"
  );
  Assert.equal(
    el.shadowRoot.querySelector(".resume-section-empty"),
    null,
    "No empty state should render without an emptyReason"
  );
  el.remove();
});

add_task(async function test_resume_section_empty_states() {
  for (const [emptyReason, headingId, descriptionId] of [
    [
      "no-suggestions",
      "aiwindow-resume-section-empty-no-suggestions-heading",
      "aiwindow-resume-section-empty-no-suggestions-description",
    ],
    [
      "all-dismissed",
      "aiwindow-resume-section-empty-all-dismissed-heading",
      "aiwindow-resume-section-empty-all-dismissed-description",
    ],
  ]) {
    const el = await createResumeSection(gSharedDoc, [], { emptyReason });
    const shadow = el.shadowRoot;

    Assert.equal(
      shadow.querySelector(".resume-section-grid"),
      null,
      `Cards grid should not render for emptyReason "${emptyReason}"`
    );
    Assert.equal(
      shadow.querySelector(".resume-section-empty-heading").dataset.l10nId,
      headingId,
      `Heading should match emptyReason "${emptyReason}"`
    );
    Assert.equal(
      shadow.querySelector(".resume-section-empty-description").dataset.l10nId,
      descriptionId,
      `Description should match emptyReason "${emptyReason}"`
    );
    el.remove();
  }
});

add_task(async function test_resume_section_empty_hide_event() {
  const el = await createResumeSection(gSharedDoc, [], {
    emptyReason: "all-dismissed",
  });

  const hidePromise = BrowserTestUtils.waitForEvent(
    el,
    "smartwindow-resume-section:hide"
  );
  el.shadowRoot.querySelector(".resume-section-empty-hide").click();
  const { detail } = await hidePromise;

  Assert.equal(
    detail.reason,
    "all-dismissed",
    "The hide event should carry the emptyReason that triggered it"
  );
  el.remove();
});

add_task(async function test_resume_section_loading() {
  const el = await createResumeSection(gSharedDoc, [], { loading: true });
  const shadow = el.shadowRoot;

  Assert.ok(
    shadow.querySelector(".resume-section-title"),
    "The heading should still render while loading"
  );
  Assert.equal(
    shadow.querySelector(".resume-section-toggle"),
    null,
    "No show more/less toggle while the real count is unknown"
  );
  Assert.equal(
    shadow.querySelectorAll(".resume-card-skeleton").length,
    COLLAPSED_CARD_COUNT,
    "Should show COLLAPSED_CARD_COUNT skeleton cards while loading"
  );

  el.cards = makeCards(1);
  el.loading = false;
  await el.updateComplete;

  Assert.equal(
    shadow.querySelector(".resume-card-skeleton"),
    null,
    "Skeleton cards should be gone once loading finishes"
  );
  Assert.equal(
    shadow.querySelectorAll("smartwindow-resume-card").length,
    1,
    "Real cards should render once loading finishes"
  );

  el.remove();
});

add_task(async function test_resume_section_no_toggle_when_not_collapsed() {
  const win = await openAIWindow();
  try {
    const doc = win.gBrowser.selectedBrowser.contentDocument;
    const el = await createResumeSection(doc, makeCards(COLLAPSED_CARD_COUNT));
    const shadow = el.shadowRoot;

    Assert.equal(
      shadow.querySelectorAll("smartwindow-resume-card").length,
      COLLAPSED_CARD_COUNT,
      "All cards should render when the total is at the collapsed count"
    );
    Assert.equal(
      shadow.querySelector(".resume-section-toggle"),
      null,
      "No show more/less toggle when there's nothing extra to reveal"
    );
    el.remove();
  } finally {
    await BrowserTestUtils.closeWindow(win);
  }
});

add_task(async function test_resume_section_collapse_and_expand() {
  const win = await openAIWindow();
  try {
    const doc = win.gBrowser.selectedBrowser.contentDocument;
    const cards = makeCards(4);
    const el = await createResumeSection(doc, cards);
    const shadow = el.shadowRoot;

    Assert.equal(
      shadow.querySelectorAll("smartwindow-resume-card").length,
      COLLAPSED_CARD_COUNT,
      "Should collapse to COLLAPSED_CARD_COUNT cards by default"
    );
    Assert.equal(
      getToggleCount(shadow),
      cards.length,
      "Toggle should report the total card count, not the hidden remainder"
    );

    shadow.querySelector(".resume-section-toggle").click();
    await el.updateComplete;

    Assert.equal(
      shadow.querySelectorAll("smartwindow-resume-card").length,
      cards.length,
      "Clicking the toggle should reveal every card"
    );
    Assert.equal(
      getToggleCount(shadow),
      cards.length,
      "Toggle should still report the total card count once expanded"
    );

    shadow.querySelector(".resume-section-toggle").click();
    await el.updateComplete;

    Assert.equal(
      shadow.querySelectorAll("smartwindow-resume-card").length,
      COLLAPSED_CARD_COUNT,
      "Clicking the toggle again should collapse back down"
    );

    el.remove();
  } finally {
    await BrowserTestUtils.closeWindow(win);
  }
});

add_task(async function test_resume_section_lone_card_spans_row() {
  const win = await openAIWindow();
  try {
    const doc = win.gBrowser.selectedBrowser.contentDocument;

    const soloEl = await createResumeSection(doc, makeCards(1));
    const soloShadow = soloEl.shadowRoot;
    const gridWidth = soloShadow
      .querySelector(".resume-section-grid")
      .getBoundingClientRect().width;
    const soloCardWidth = soloShadow
      .querySelector("smartwindow-resume-card")
      .getBoundingClientRect().width;
    Assert.greater(
      soloCardWidth,
      gridWidth * 0.9,
      "A single card should span the full row width"
    );
    soloEl.remove();

    const threeEl = await createResumeSection(doc, makeCards(3));
    threeEl.expanded = true;
    await threeEl.updateComplete;
    const [firstCard, , thirdCard] = threeEl.shadowRoot.querySelectorAll(
      "smartwindow-resume-card"
    );
    Assert.equal(
      Math.round(thirdCard.getBoundingClientRect().width),
      Math.round(firstCard.getBoundingClientRect().width),
      "A lone trailing card among several should not span the row"
    );
    threeEl.remove();
  } finally {
    await BrowserTestUtils.closeWindow(win);
  }
});
