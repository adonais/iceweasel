/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const CARD_MODULE_URL =
  "chrome://browser/content/aiwindow/components/smartwindow-resume-card.mjs";

const SAMPLE_CONTENT = {
  headline: "Team offsite planning",
  status: "Reviewed venue quotes and the calendar poll for next week.",
  previewTabs: [{ url: "https://a.example/" }, { url: "https://b.example/" }],
};

async function ensureCardDefined(doc) {
  if (doc.defaultView.customElements.get("smartwindow-resume-card")) {
    return;
  }
  const script = doc.createElement("script");
  script.type = "module";
  script.src = CARD_MODULE_URL;
  doc.head.appendChild(script);
  await doc.defaultView.customElements.whenDefined("smartwindow-resume-card");
  script.remove();
}

async function createResumeCard(doc, { content, journeyId = "memory-1" }) {
  await ensureCardDefined(doc);
  const el = doc.createElement("smartwindow-resume-card");
  el.content = content;
  el.journeyId = journeyId;
  doc.body.appendChild(el);
  await el.updateComplete;
  return el;
}

add_task(async function test_resume_card_rendering() {
  const win = await openAIWindow();
  try {
    const doc = win.gBrowser.selectedBrowser.contentDocument;

    const el = await createResumeCard(doc, { content: SAMPLE_CONTENT });
    const shadow = el.shadowRoot;

    Assert.equal(
      shadow.querySelector(".resume-card-title").textContent,
      SAMPLE_CONTENT.headline,
      "Title should match content.headline"
    );
    Assert.equal(
      shadow.querySelector(".resume-card-description").textContent,
      SAMPLE_CONTENT.status,
      "Description should match content.status"
    );
    Assert.equal(
      shadow.querySelectorAll(".resume-card-favicon").length,
      SAMPLE_CONTENT.previewTabs.length,
      "Should render one favicon per preview tab when under the visible max"
    );
    el.remove();

    const manyTabsEl = await createResumeCard(doc, {
      content: {
        ...SAMPLE_CONTENT,
        previewTabs: Array.from({ length: 5 }, (_, i) => ({
          url: `https://site${i}.example/`,
        })),
      },
    });
    Assert.equal(
      manyTabsEl.shadowRoot.querySelectorAll(".resume-card-favicon").length,
      3,
      "Should cap at MAX_VISIBLE_FAVICONS favicons regardless of tab count"
    );
    manyTabsEl.remove();
  } finally {
    await BrowserTestUtils.closeWindow(win);
  }
});

add_task(async function test_resume_card_events() {
  const win = await openAIWindow();
  try {
    const doc = win.gBrowser.selectedBrowser.contentDocument;
    const el = await createResumeCard(doc, {
      content: SAMPLE_CONTENT,
      journeyId: "memory-42",
    });
    const shadow = el.shadowRoot;

    const resumed = new Promise(resolve =>
      el.addEventListener(
        "smartwindow-resume-card:resume",
        e => resolve(e.detail),
        { once: true }
      )
    );
    shadow.querySelector(".resume-card-resume-button").click();
    Assert.deepEqual(
      await resumed,
      { journeyId: "memory-42" },
      "Resume button should dispatch the card's journeyId"
    );

    const dismissed = new Promise(resolve =>
      el.addEventListener(
        "smartwindow-resume-card:dismiss",
        e => resolve(e.detail),
        { once: true }
      )
    );
    shadow.querySelector(".resume-card-dismiss").click();
    Assert.deepEqual(
      await dismissed,
      { journeyId: "memory-42" },
      "Dismiss button should dispatch the card's journeyId"
    );

    // Each menu item must provide its own ID; native click detail has none.
    const menuSelected = new Promise(resolve =>
      el.addEventListener(
        "smartwindow-resume-card:menu-item-selected",
        e => resolve(e.detail),
        { once: true }
      )
    );
    shadow.querySelectorAll("panel-item")[0].click();
    Assert.deepEqual(
      await menuSelected,
      { journeyId: "memory-42", itemId: "open-tabs" },
      "Clicking the first menu item should dispatch its itemId with the card's journeyId"
    );

    el.remove();
  } finally {
    await BrowserTestUtils.closeWindow(win);
  }
});
