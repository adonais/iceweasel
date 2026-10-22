/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { ToolUI } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/ui/modules/ToolUI.sys.mjs"
);

// Opening an AI Window records usage timestamps at runtime.
registerCleanupFunction(() => {
  for (const pref of [
    "browser.smartwindow.lastSmartWindowUsageTime",
    "browser.smartwindow.lastLLMTelemetryRunTime",
  ]) {
    Services.prefs.clearUserPref(pref);
  }
});

const CARD_MODULE_URL =
  "chrome://browser/content/aiwindow/components/smartwindow-resume-card.mjs";

const SAMPLE_CONTENT = {
  headline: "Team offsite planning",
  status: "Reviewed venue quotes and the calendar poll for next week.",
  previewTabs: [{ url: "https://a.example/" }, { url: "https://b.example/" }],
};

const RESUME_ACTIVITY_PREFS = [
  ["browser.smartwindow.memories.generateFromConversation", true],
  ["browser.smartwindow.memories.generateFromHistory", true],
  ["browser.smartwindow.resumeCards.enabled", true],
];

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

/**
 * Runs a test callback with a generated, rendered resume card.
 *
 * @param {Function} stub - Resume-activity generation stub
 * @param {Function} run - Receives {win, aiWindow, section, card, memories}
 */
async function withRenderedResumeCard(stub, run) {
  await SpecialPowers.pushPrefEnv({ set: RESUME_ACTIVITY_PREFS });

  const { memories, cleanup } = await stub();
  let win;
  try {
    win = await openAIWindow();
    const browser = win.gBrowser.selectedBrowser;
    const aiWindow = await TestUtils.waitForCondition(
      () => browser.contentDocument?.querySelector("ai-window"),
      "Wait for ai-window element"
    );
    const section = await TestUtils.waitForCondition(
      () => aiWindow.shadowRoot.querySelector("smartwindow-resume-section"),
      "Wait for smartwindow-resume-section element"
    );
    const card = await TestUtils.waitForCondition(
      () => section.shadowRoot.querySelector("smartwindow-resume-card"),
      "Wait for a resume card to render"
    );
    await run({ win, aiWindow, section, card, memories });
  } finally {
    if (win) {
      await BrowserTestUtils.closeWindow(win);
    }
    await cleanup();
  }
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

    // Open normally so panel-list registers its close-on-select listener.
    const panelList = shadow.querySelector("panel-list");
    const shown = BrowserTestUtils.waitForEvent(panelList, "shown");
    shadow.querySelector(".resume-card-more-button").click();
    await shown;

    // Each menu item must provide its own ID; native click detail has none.
    const menuSelected = new Promise(resolve =>
      el.addEventListener(
        "smartwindow-resume-card:menu-item-selected",
        e => resolve(e.detail),
        { once: true }
      )
    );
    const hidden = BrowserTestUtils.waitForEvent(panelList, "hidden");
    shadow.querySelectorAll("panel-item")[0].click();
    Assert.deepEqual(
      await menuSelected,
      { journeyId: "memory-42", itemId: "open-tabs" },
      "Clicking the first menu item should dispatch its itemId with the card's journeyId"
    );
    await hidden;

    el.remove();
  } finally {
    await BrowserTestUtils.closeWindow(win);
  }
});

add_task(async function test_resume_card_whole_card_click_resumes() {
  const win = await openAIWindow();
  try {
    const doc = win.gBrowser.selectedBrowser.contentDocument;
    const el = await createResumeCard(doc, {
      content: SAMPLE_CONTENT,
      journeyId: "memory-42",
    });
    const shadow = el.shadowRoot;

    let resumeCount = 0;
    el.addEventListener("smartwindow-resume-card:resume", () => {
      resumeCount++;
    });

    shadow.querySelector(".resume-card-title").click();
    Assert.equal(
      resumeCount,
      1,
      "Clicking anywhere on the card body should resume it"
    );

    // Dismiss, the More button, and its menu items must not also resume the
    // card - each stops propagation so only their own event fires.
    shadow.querySelector(".resume-card-dismiss").click();
    shadow.querySelector(".resume-card-more-button").click();
    shadow.querySelectorAll("panel-item")[0].click();
    Assert.equal(
      resumeCount,
      1,
      "Dismiss, More, and menu item clicks should not also dispatch resume"
    );

    el.remove();
  } finally {
    await BrowserTestUtils.closeWindow(win);
  }
});

add_task(async function test_resume_card_click_ignores_text_selection() {
  const win = await openAIWindow();
  try {
    const doc = win.gBrowser.selectedBrowser.contentDocument;
    const el = await createResumeCard(doc, {
      content: SAMPLE_CONTENT,
      journeyId: "memory-42",
    });
    const shadow = el.shadowRoot;
    const title = shadow.querySelector(".resume-card-title");

    let resumeCount = 0;
    el.addEventListener("smartwindow-resume-card:resume", () => {
      resumeCount++;
    });

    const selection = doc.getSelection();
    const range = doc.createRange();
    range.selectNodeContents(title);
    selection.removeAllRanges();
    selection.addRange(range);

    // A pointer-style click should not resume while text is selected.
    // "click" must use PointerEvent here, or trusted dispatch crashes debug builds.
    title.dispatchEvent(
      new PointerEvent("click", { bubbles: true, composed: true, detail: 1 })
    );
    Assert.equal(
      resumeCount,
      0,
      "A real click shouldn't resume while releasing a text selection"
    );

    selection.collapseToStart();
    title.dispatchEvent(
      new PointerEvent("click", { bubbles: true, composed: true, detail: 1 })
    );
    Assert.equal(
      resumeCount,
      1,
      "A real click should resume once the selection is collapsed"
    );

    // Keyboard activation (detail 0) should still resume with an active
    // selection.
    range.selectNodeContents(title);
    selection.removeAllRanges();
    selection.addRange(range);
    title.click();
    Assert.equal(
      resumeCount,
      2,
      "Keyboard-style activation should resume regardless of selection"
    );

    selection.removeAllRanges();
    el.remove();
  } finally {
    await BrowserTestUtils.closeWindow(win);
  }
});

add_task(async function test_resume_card_click_closing_menu_does_not_resume() {
  const win = await openAIWindow();
  try {
    const doc = win.gBrowser.selectedBrowser.contentDocument;
    const el = await createResumeCard(doc, {
      content: SAMPLE_CONTENT,
      journeyId: "memory-42",
    });
    const shadow = el.shadowRoot;
    const title = shadow.querySelector(".resume-card-title");
    const panelList = shadow.querySelector("panel-list");

    let resumeCount = 0;
    el.addEventListener("smartwindow-resume-card:resume", () => {
      resumeCount++;
    });

    const shown = BrowserTestUtils.waitForEvent(panelList, "shown");
    shadow.querySelector(".resume-card-more-button").click();
    await shown;

    // panel-list closes on mousedown before the card receives click.
    const hidden = BrowserTestUtils.waitForEvent(panelList, "hidden");
    title.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, composed: true })
    );
    title.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, composed: true })
    );
    title.dispatchEvent(
      new PointerEvent("pointerup", { bubbles: true, composed: true })
    );
    title.dispatchEvent(
      new MouseEvent("mouseup", { bubbles: true, composed: true })
    );
    title.dispatchEvent(
      new PointerEvent("click", { bubbles: true, composed: true, detail: 1 })
    );
    await hidden;

    Assert.equal(
      resumeCount,
      0,
      "Closing the more menu by clicking elsewhere on the card should not also resume it"
    );

    title.click();
    Assert.equal(
      resumeCount,
      1,
      "A later click with the menu already closed should resume normally"
    );

    el.remove();
  } finally {
    await BrowserTestUtils.closeWindow(win);
  }
});

add_task(async function test_resume_card_snooze_dismisses_for_session() {
  const sb = sinon.createSandbox();
  try {
    await withRenderedResumeCard(
      () => stubResumeActivityGeneration(sb),
      async ({ aiWindow, section, card, memories }) => {
        // stubResumeActivityGeneration only produces one valid journey.
        const [{ id: journeyId }] = memories;

        card.dispatchEvent(
          new CustomEvent("smartwindow-resume-card:menu-item-selected", {
            detail: { journeyId, itemId: "snooze" },
            bubbles: true,
            composed: true,
          })
        );
        await aiWindow.updateComplete;
        await section.updateComplete;

        Assert.equal(
          section.shadowRoot.querySelector("smartwindow-resume-card"),
          null,
          "Snoozing the only card should remove it"
        );
        Assert.equal(
          section.shadowRoot.querySelector(".resume-section-empty-heading")
            .dataset.l10nId,
          "aiwindow-resume-section-empty-all-dismissed-heading",
          "Snoozing the last card should show the all-dismissed empty state"
        );
        Assert.ok(
          ResumeActivity.isMemoryDismissed(journeyId),
          "Snoozing should record the dismissal so it doesn't reappear this session"
        );
      }
    );
  } finally {
    sb.restore();
  }
});

add_task(async function test_resume_card_open_tabs_opens_tab_group() {
  const sb = sinon.createSandbox();
  try {
    await withRenderedResumeCard(
      () => stubResumeActivityGeneration(sb),
      async ({ win, card, memories }) => {
        // stubResumeActivityGeneration only produces one valid journey.
        const [{ id: journeyId }] = memories;
        const { previewTabs } = card.content;

        const openAndGroupTabsStub = sb
          .stub(ToolUI, "openAndGroupTabs")
          .resolves({ success: true, group: { id: "group-1" } });

        card.dispatchEvent(
          new CustomEvent("smartwindow-resume-card:menu-item-selected", {
            detail: { journeyId, itemId: "open-tabs" },
            bubbles: true,
            composed: true,
          })
        );

        await TestUtils.waitForCondition(
          () => openAndGroupTabsStub.called,
          "Wait for ToolUI.openAndGroupTabs to be called"
        );

        const [{ tabs, window: openWindow }] =
          openAndGroupTabsStub.firstCall.args;
        Assert.deepEqual(
          tabs,
          previewTabs,
          "Should open every preview tab, not just the visible favicons"
        );
        Assert.equal(
          openWindow,
          win,
          "Should open the tabs in the ai-window's chrome window"
        );
      }
    );
  } finally {
    sb.restore();
  }
});

add_task(async function test_resume_card_open_tabs_switches_to_single_tab() {
  const sb = sinon.createSandbox();
  try {
    await withRenderedResumeCard(
      () => stubResumeActivityGenerationPool(sb, 1),
      async ({ win, card, memories }) => {
        const [{ id: journeyId }] = memories;
        const { previewTabs } = card.content;

        const openOrSwitchToTabStub = sb
          .stub(ToolUI, "openOrSwitchToTab")
          .resolves({ success: true, switched: false });
        const openAndGroupTabsStub = sb.stub(ToolUI, "openAndGroupTabs");

        card.dispatchEvent(
          new CustomEvent("smartwindow-resume-card:menu-item-selected", {
            detail: { journeyId, itemId: "open-tabs" },
            bubbles: true,
            composed: true,
          })
        );

        await TestUtils.waitForCondition(
          () => openOrSwitchToTabStub.called,
          "Wait for ToolUI.openOrSwitchToTab to be called"
        );

        const [{ tab, window: openWindow }] =
          openOrSwitchToTabStub.firstCall.args;
        Assert.deepEqual(
          tab,
          previewTabs[0],
          "Should switch to the card's single preview tab"
        );
        Assert.equal(
          openWindow,
          win,
          "Should open the tab in the ai-window's chrome window"
        );
        Assert.ok(
          !openAndGroupTabsStub.called,
          "Should not group a single tab"
        );
      }
    );
  } finally {
    sb.restore();
  }
});

add_task(async function test_resume_section_hide_is_session_scoped() {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.smartwindow.resumeCards.enabled", true]],
  });

  ResumeActivity.hideSectionForSession();
  let win;
  try {
    win = await openAIWindow();
    const browser = win.gBrowser.selectedBrowser;
    const aiWindow = await TestUtils.waitForCondition(
      () => browser.contentDocument?.querySelector("ai-window"),
      "Wait for ai-window element"
    );

    Assert.ok(
      aiWindow.resumeSectionHidden,
      "A newly created ai-window should start hidden if a previous tab hid it this session"
    );
    Assert.equal(
      aiWindow.shadowRoot.querySelector("smartwindow-resume-section"),
      null,
      "The resume section should not render in a new tab this session"
    );
  } finally {
    if (win) {
      await BrowserTestUtils.closeWindow(win);
    }
    _resetResumeSectionHiddenForTesting();
  }
});

add_task(
  async function test_resume_section_hide_refreshes_on_preloaded_tab_reveal() {
    await SpecialPowers.pushPrefEnv({
      set: [["browser.smartwindow.resumeCards.enabled", true]],
    });

    let win, tab;
    try {
      win = await openAIWindow();

      // A backgrounded tab's ai-window constructs while its document is
      // still hidden, like a preloaded new tab would.
      tab = BrowserTestUtils.addTab(win.gBrowser, AIWINDOW_URL);
      await BrowserTestUtils.browserLoaded(tab.linkedBrowser);
      const aiWindow = await TestUtils.waitForCondition(
        () => tab.linkedBrowser.contentDocument?.querySelector("ai-window"),
        "Wait for the backgrounded tab's ai-window element"
      );

      Assert.ok(
        tab.linkedBrowser.contentDocument.hidden,
        "Sanity check: the tab should still be backgrounded"
      );
      Assert.ok(
        !aiWindow.resumeSectionHidden,
        "Sanity check: nothing has hidden the section yet"
      );

      // Another tab hides the section while this one is still backgrounded,
      // so its already-constructed ai-window missed the change.
      ResumeActivity.hideSectionForSession();

      await BrowserTestUtils.switchTab(win.gBrowser, tab);

      await TestUtils.waitForCondition(
        () => aiWindow.resumeSectionHidden,
        "Should refresh the hidden state once the backgrounded tab is revealed"
      );
    } finally {
      if (tab) {
        BrowserTestUtils.removeTab(tab);
      }
      if (win) {
        await BrowserTestUtils.closeWindow(win);
      }
      _resetResumeSectionHiddenForTesting();
    }
  }
);

add_task(async function test_resume_section_hide_clears_once_cards_reappear() {
  await SpecialPowers.pushPrefEnv({ set: RESUME_ACTIVITY_PREFS });

  // Hiding the section while it was empty should not carry over once real
  // cards are shown - a later empty state should be a fresh occurrence,
  // not still-suppressed from before.
  ResumeActivity.hideSectionForSession();

  const sb = sinon.createSandbox();
  let firstWin, secondWin;
  try {
    const { cleanup } = await stubResumeActivityGeneration(sb);
    try {
      firstWin = await openAIWindow();
      const firstBrowser = firstWin.gBrowser.selectedBrowser;
      const firstAiWindow = await TestUtils.waitForCondition(
        () => firstBrowser.contentDocument?.querySelector("ai-window"),
        "Wait for the first ai-window element"
      );
      const firstSection = await TestUtils.waitForCondition(
        () =>
          firstAiWindow.shadowRoot.querySelector("smartwindow-resume-section"),
        "The resume section should render once real cards are available"
      );
      const firstCard = await TestUtils.waitForCondition(
        () => firstSection.shadowRoot.querySelector("smartwindow-resume-card"),
        "Wait for a resume card to render"
      );
      Assert.ok(
        !firstAiWindow.resumeSectionHidden,
        "Real cards becoming available should clear the session-hidden flag"
      );

      // Dismiss the rendered journey directly, bypassing the card UI, so
      // the next tab's load finds nothing left to suggest.
      ResumeActivity.dismissMemory(firstCard.journeyId);

      secondWin = await openAIWindow();
      const secondBrowser = secondWin.gBrowser.selectedBrowser;
      const secondAiWindow = await TestUtils.waitForCondition(
        () => secondBrowser.contentDocument?.querySelector("ai-window"),
        "Wait for the second ai-window element"
      );
      const secondSection = await TestUtils.waitForCondition(
        () =>
          secondAiWindow.shadowRoot.querySelector("smartwindow-resume-section"),
        "The resume section should render its empty state, not stay suppressed"
      );
      await TestUtils.waitForCondition(
        () =>
          secondSection.shadowRoot.querySelector(
            ".resume-section-empty-heading"
          ),
        "Wait for the empty-state heading to render"
      );

      Assert.equal(
        secondSection.shadowRoot.querySelector(".resume-section-empty-heading")
          .dataset.l10nId,
        "aiwindow-resume-section-empty-all-dismissed-heading",
        "The empty state should reappear after real cards clear the hidden state"
      );
    } finally {
      await cleanup();
    }
  } finally {
    if (firstWin) {
      await BrowserTestUtils.closeWindow(firstWin);
    }
    if (secondWin) {
      await BrowserTestUtils.closeWindow(secondWin);
    }
    sb.restore();
    _resetResumeSectionHiddenForTesting();
  }
});

add_task(async function test_resume_card_click_shows_confirmation_card() {
  const sb = sinon.createSandbox();
  try {
    sb.stub(openAIEngine, "build").resolves({});
    const fetchWithHistoryStub = sb.stub(Chat, "fetchWithHistory").resolves();

    await SpecialPowers.pushPrefEnv({ set: RESUME_ACTIVITY_PREFS });

    const resumeActivityStubs = await stubResumeActivityGeneration(sb);
    let win;
    try {
      win = await openAIWindow();
      const browser = win.gBrowser.selectedBrowser;
      const aiWindow = await TestUtils.waitForCondition(
        () => browser.contentDocument?.querySelector("ai-window"),
        "Wait for ai-window element"
      );
      const section = await TestUtils.waitForCondition(
        () => aiWindow.shadowRoot.querySelector("smartwindow-resume-section"),
        "Wait for smartwindow-resume-section element"
      );
      const card = await TestUtils.waitForCondition(
        () => section.shadowRoot.querySelector("smartwindow-resume-card"),
        "Wait for a resume card to render"
      );

      const conversationIdAtClick = aiWindow.conversationId;
      // Clicking the card body should follow the
      // same resume flow as a pill click.
      card.shadowRoot.querySelector(".resume-card-title").click();

      await TestUtils.waitForCondition(
        () => fetchWithHistoryStub.calledOnce,
        "Should generate a response for the resume-activity conversation"
      );

      Assert.equal(
        aiWindow.conversationId,
        conversationIdAtClick,
        "Should resume in the conversation the card was clicked in"
      );

      const assistantMessage = aiWindow.conversation.messages.at(-1);
      Assert.equal(
        assistantMessage.toolUIData?.uiType,
        "tab-group-confirmation",
        "Clicking the card should attach the same confirmation card as a resume pill"
      );
    } finally {
      if (win) {
        await BrowserTestUtils.closeWindow(win);
      }
      await resumeActivityStubs?.cleanup();
      await SpecialPowers.popPrefEnv();
    }
  } finally {
    sb.restore();
  }
});
