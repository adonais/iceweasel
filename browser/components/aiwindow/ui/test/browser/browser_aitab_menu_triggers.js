/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

/**
 * The "Create AI Tab" entries in the tab, tab group and page context menus:
 * when they show, and the background tab activating one opens.
 */

"use strict";

const { MockEngineManager } = ChromeUtils.importESModule(
  "resource://testing-common/AIWindowTestUtils.sys.mjs"
);

const { MESSAGE_ROLE } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/ui/modules/ChatEnums.sys.mjs"
);

const TEST_URL = "https://example.com/";
const TEST_URL2 = "https://example.org/";
// A page with real body content, needed to synthesize a contextmenu event.
const TEST_PAGE_URL =
  "https://example.com/browser/browser/components/aiwindow/ui/test/browser/test_context_url_page.html";

const l10n = new Localization(["preview/aiWindow.ftl"]);

function getTabConversation(tab) {
  return tab.linkedBrowser.contentDocument?.querySelector("ai-window")
    ?.conversation;
}

// Activates the trigger and resolves with the tab it opened once that tab's
// chat carries the user turn.
async function activateAndWaitForAITab(
  win,
  activate,
  { expectCurrentChatUntouched = true } = {}
) {
  const selectedTab = win.gBrowser.selectedTab;
  const tabOpened = BrowserTestUtils.waitForEvent(
    win.gBrowser.tabContainer,
    "TabOpen"
  );
  await activate();
  const tab = (await tabOpened).target;

  let conversation;
  try {
    // Building the engine and system prompt comes before the user turn, which
    // can outlast the default timeout on a slow run.
    await TestUtils.waitForCondition(
      () => {
        conversation = getTabConversation(tab);
        return conversation?.messages.some(m => m.role === MESSAGE_ROLE.USER);
      },
      "Wait for the new tab's chat to submit its conversation",
      100,
      150
    );
  } catch (e) {
    throw new Error(
      `${e.message ?? e} | url=${tab.linkedBrowser.currentURI.spec}` +
        ` conversation=${conversation?.id} messages=${conversation?.messageCount}`
    );
  }

  Assert.equal(
    tab.linkedBrowser.currentURI.spec,
    AIWINDOW_URL,
    "The new tab is a full page chat"
  );
  Assert.equal(
    win.gBrowser.selectedTab,
    selectedTab,
    "The new tab opened in the background"
  );
  if (expectCurrentChatUntouched) {
    Assert.ok(
      !AIWindow.getActiveConversation(win)?.messageCount,
      "The current tab's chat is left alone"
    );
  }
  return tab;
}

// Also answers the pending model request so nothing is left dangling.
async function assertAITabConversation(tab, urls, mockEngineManager) {
  const userMessages = getTabConversation(tab).messages.filter(
    m => m.role === MESSAGE_ROLE.USER
  );
  Assert.equal(userMessages.length, 1, "The conversation has one user turn");
  const prompt = await l10n.formatValue("ai-tab-create-page-prompt", {
    tabCount: urls.length,
  });
  Assert.equal(
    userMessages[0].content.body,
    [prompt, ...urls].join("\n"),
    "The user turn is the localized prompt followed by the tab URLs"
  );
  Assert.ok(
    !userMessages[0].content.contextPageUrl,
    "The user turn carries no page context besides the listed URLs"
  );
  const { request, respond } = await mockEngineManager.captureRequest({
    purpose: "chat",
  });
  Assert.ok(request, "The submitted conversation requested a model response");
  respond("Mock AI Tab reply.");
}

async function openTabContextMenu(win, tab) {
  const menu = win.document.getElementById("tabContextMenu");
  const shown = BrowserTestUtils.waitForPopupEvent(menu, "shown");
  EventUtils.synthesizeMouseAtCenter(
    tab,
    { type: "contextmenu", button: 2 },
    win
  );
  await shown;
  return menu;
}

async function openPageContextMenu(win) {
  const menu = win.document.getElementById("contentAreaContextMenu");
  const shown = BrowserTestUtils.waitForPopupEvent(menu, "shown");
  await BrowserTestUtils.synthesizeMouseAtCenter(
    "p",
    { type: "contextmenu", button: 2 },
    win.gBrowser.selectedBrowser
  );
  await shown;
  return menu;
}

async function openTabGroupMenu(win, group) {
  const { panel } = win.gBrowser.tabGroupMenu;
  const shown = BrowserTestUtils.waitForPopupEvent(panel, "shown");
  win.gBrowser.tabGroupMenu.openEditModal(group);
  await shown;
  return panel;
}

async function activateItemAndWait(menu, item) {
  const hidden = BrowserTestUtils.waitForPopupEvent(menu, "hidden");
  menu.activateItem(item);
  await hidden;
}

async function clickAndWaitForHidden(panel, button, win) {
  const hidden = BrowserTestUtils.waitForPopupEvent(panel, "hidden");
  EventUtils.synthesizeMouseAtCenter(button, {}, win);
  await hidden;
}

async function hidePopupAndWait(menu) {
  const hidden = BrowserTestUtils.waitForPopupEvent(menu, "hidden");
  menu.hidePopup();
  await hidden;
}

describe("Create AI Tab menu triggers in a Smart Window", () => {
  let gWin;
  let gRestoreSignIn;
  let gMockEngineManager;

  beforeEach(async () => {
    await SpecialPowers.pushPrefEnv({
      set: [["browser.smartwindow.aitab.enabled", true]],
    });
    gRestoreSignIn = skipSignIn();
    gMockEngineManager = new MockEngineManager();
    gWin = await openAIWindow();
  });

  afterEach(async () => {
    // Unanswered requests hold suspended async chains that keep the window
    // from being GC'd.
    gMockEngineManager.rejectAllRequests();
    gMockEngineManager.cleanupMocks();
    gRestoreSignIn();
    await BrowserTestUtils.closeWindow(gWin);
    await SpecialPowers.popPrefEnv();
  });

  describe("tab context menu", () => {
    describe("on an http tab", () => {
      let gTab;
      let gMenu;

      beforeEach(async () => {
        gTab = await BrowserTestUtils.openNewForegroundTab(
          gWin.gBrowser,
          TEST_URL
        );
        gMenu = await openTabContextMenu(gWin, gTab);
      });

      it("shows the entry", async () => {
        Assert.ok(
          !gWin.document.getElementById("context_createAITab").hidden,
          "Create AI Tab is shown for an http tab"
        );
        await hidePopupAndWait(gMenu);
      });

      it("opens a background tab whose chat asks for the tab URL", async () => {
        const aiTab = await activateAndWaitForAITab(gWin, () =>
          activateItemAndWait(
            gMenu,
            gWin.document.getElementById("context_createAITab")
          )
        );
        await assertAITabConversation(aiTab, [TEST_URL], gMockEngineManager);
      });

      it("opens another tab and conversation on a second activation", async () => {
        const aiTab = await activateAndWaitForAITab(gWin, () =>
          activateItemAndWait(
            gMenu,
            gWin.document.getElementById("context_createAITab")
          )
        );
        await assertAITabConversation(aiTab, [TEST_URL], gMockEngineManager);

        const secondAITab = await activateAndWaitForAITab(gWin, async () => {
          const menu = await openTabContextMenu(gWin, gTab);
          await activateItemAndWait(
            menu,
            gWin.document.getElementById("context_createAITab")
          );
        });
        Assert.notEqual(secondAITab, aiTab, "Each activation opens a new tab");
        Assert.notEqual(
          getTabConversation(secondAITab).id,
          getTabConversation(aiTab).id,
          "Each activation starts a new conversation"
        );
        await assertAITabConversation(
          secondAITab,
          [TEST_URL],
          gMockEngineManager
        );
      });
    });

    describe("with a preloaded new tab page", () => {
      let gTab;
      let gPreloadedBrowser;

      beforeEach(async () => {
        await SpecialPowers.pushPrefEnv({
          set: [["browser.newtab.preload", true]],
        });
        gTab = await BrowserTestUtils.openNewForegroundTab(
          gWin.gBrowser,
          TEST_URL
        );
        NewTabPagePreloading.maybeCreatePreloadedBrowser(gWin);
        await TestUtils.waitForCondition(
          () =>
            gWin.gBrowser.preloadedBrowser?.contentDocument?.querySelector(
              "ai-window"
            )?.conversation,
          "Wait for the preloaded new tab page's chat to connect"
        );
        gPreloadedBrowser = gWin.gBrowser.preloadedBrowser;
      });

      afterEach(async () => {
        NewTabPagePreloading.removePreloadedBrowser(gWin);
        await SpecialPowers.popPrefEnv();
      });

      it("submits into the preloaded page", async () => {
        const aiTab = await activateAndWaitForAITab(
          gWin,
          async () => {
            const menu = await openTabContextMenu(gWin, gTab);
            await activateItemAndWait(
              menu,
              gWin.document.getElementById("context_createAITab")
            );
          },
          { expectCurrentChatUntouched: false }
        );
        Assert.equal(
          aiTab.linkedBrowser,
          gPreloadedBrowser,
          "The new tab took the preloaded new tab page"
        );
        await assertAITabConversation(aiTab, [TEST_URL], gMockEngineManager);
      });
    });

    describe("on a non-http tab", () => {
      it("hides the entry", async () => {
        // The Smart Window's initial tab is a chrome page.
        const menu = await openTabContextMenu(gWin, gWin.gBrowser.selectedTab);
        Assert.ok(
          gWin.document.getElementById("context_createAITab").hidden,
          "Create AI Tab is hidden for a non-http tab"
        );
        await hidePopupAndWait(menu);
      });
    });

    describe("with the AI Tab pref off", () => {
      beforeEach(async () => {
        await SpecialPowers.pushPrefEnv({
          set: [["browser.smartwindow.aitab.enabled", false]],
        });
      });

      afterEach(async () => {
        await SpecialPowers.popPrefEnv();
      });

      it("hides the entry", async () => {
        const tab = await BrowserTestUtils.openNewForegroundTab(
          gWin.gBrowser,
          TEST_URL
        );
        const menu = await openTabContextMenu(gWin, tab);
        Assert.ok(
          gWin.document.getElementById("context_createAITab").hidden,
          "Create AI Tab is hidden when the AI Tab pref is off"
        );
        await hidePopupAndWait(menu);
      });
    });
  });

  describe("page context menu", () => {
    describe("on an http page", () => {
      let gMenu;

      beforeEach(async () => {
        await BrowserTestUtils.openNewForegroundTab(
          gWin.gBrowser,
          TEST_PAGE_URL
        );
        gMenu = await openPageContextMenu(gWin);
      });

      it("shows the entry", async () => {
        Assert.ok(
          !gWin.document.getElementById("context-create-aitab").hidden,
          "Create AI Tab is shown on an http page"
        );
        await hidePopupAndWait(gMenu);
      });

      it("opens a background tab whose chat asks for the page URL", async () => {
        const aiTab = await activateAndWaitForAITab(gWin, () =>
          activateItemAndWait(
            gMenu,
            gWin.document.getElementById("context-create-aitab")
          )
        );
        await assertAITabConversation(
          aiTab,
          [TEST_PAGE_URL],
          gMockEngineManager
        );
      });
    });
  });

  describe("tab group menu", () => {
    describe("for a group with http tabs", () => {
      let gPanel;

      beforeEach(async () => {
        const tab1 = await BrowserTestUtils.openNewForegroundTab(
          gWin.gBrowser,
          TEST_URL
        );
        const tab2 = await BrowserTestUtils.openNewForegroundTab(
          gWin.gBrowser,
          TEST_URL2
        );
        const group = gWin.gBrowser.addTabGroup([tab1, tab2]);
        gPanel = await openTabGroupMenu(gWin, group);
      });

      it("shows the entry", async () => {
        Assert.ok(
          !gWin.document.getElementById("tabGroupEditor_createAITab").hidden,
          "Create AI Tab is shown for the group"
        );
        await hidePopupAndWait(gPanel);
      });

      it("opens a background tab whose chat asks for every tab URL", async () => {
        const aiTab = await activateAndWaitForAITab(gWin, () =>
          clickAndWaitForHidden(
            gPanel,
            gWin.document.getElementById("tabGroupEditor_createAITab"),
            gWin
          )
        );
        await assertAITabConversation(
          aiTab,
          [TEST_URL, TEST_URL2],
          gMockEngineManager
        );
      });
    });
  });
});

describe("Create AI Tab menu triggers in a classic window", () => {
  let gTab;

  beforeEach(async () => {
    await SpecialPowers.pushPrefEnv({
      set: [["browser.smartwindow.aitab.enabled", true]],
    });
    gTab = await BrowserTestUtils.openNewForegroundTab(gBrowser, TEST_URL);
  });

  afterEach(async () => {
    BrowserTestUtils.removeTab(gTab);
    await SpecialPowers.popPrefEnv();
  });

  it("hides the entry in the tab context menu", async () => {
    const menu = await openTabContextMenu(window, gTab);
    Assert.ok(
      window.document.getElementById("context_createAITab").hidden,
      "Create AI Tab is hidden in a classic window"
    );
    await hidePopupAndWait(menu);
  });
});
