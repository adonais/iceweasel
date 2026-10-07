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

async function createResumeSection(doc, cards) {
  await ensureSectionDefined(doc);
  const el = doc.createElement("smartwindow-resume-section");
  el.cards = cards;
  doc.body.appendChild(el);
  await el.updateComplete;
  return el;
}

function getToggleCount(shadow) {
  const toggle = shadow.querySelector(".resume-section-toggle");
  return toggle ? JSON.parse(toggle.dataset.l10nArgs).count : null;
}

add_task(async function test_resume_section_no_cards() {
  const win = await openAIWindow();
  try {
    const doc = win.gBrowser.selectedBrowser.contentDocument;
    const el = await createResumeSection(doc, []);

    Assert.equal(
      el.shadowRoot.querySelector(".resume-section-grid"),
      null,
      "Nothing should render when there are no cards"
    );
    el.remove();
  } finally {
    await BrowserTestUtils.closeWindow(win);
  }
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
