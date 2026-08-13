/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { sinon } = ChromeUtils.importESModule(
  "resource://testing-common/Sinon.sys.mjs"
);
const { ASRouter } = ChromeUtils.importESModule(
  "resource:///modules/asrouter/ASRouter.sys.mjs"
);
const { SpecialMessageActions } = ChromeUtils.importESModule(
  "resource://messaging-system/lib/SpecialMessageActions.sys.mjs"
);

const CHAT_PROVIDER_URL = "http://mochi.test:8888/";

// There is no in-tree sidebar_chatbot_promo message yet: product hasn't
// decided the copy. These tests supply their own message so they exercise the
// routing, rendering and teardown without depending on shipped content.
const TEST_MESSAGE = {
  id: "TEST_SIDEBAR_CHATBOT_PROMO",
  template: "sidebar_chatbot_promo",
  groups: [],
  targeting: "true",
  trigger: { id: "sidebarToolOpened" },
  frequency: { lifetime: 1 },
  // FxMSCommon's `localizableText` is a plain string or `{ string_id }`; the
  // `{ raw }` form belongs to multistage screen content, not this template.
  content: {
    type: "default",
    heading: "Test heading",
    message: "Test body",
    primary_button: {
      label: "Try it",
      action: { type: "OPEN_URL", data: { args: "https://example.com/" } },
    },
    additional_button: {
      label: "Dismiss",
      action: { type: "CANCEL" },
    },
  },
};

/**
 * Make ASRouter behave as though `message` is the only eligible message, the
 * way browser/components/asrouter/tests/browser/head.js#withTestMessage does.
 * Duplicated here because that helper is a support-file of the asrouter suite.
 *
 * @param {SinonSandbox} sandbox Sandbox used for cleanup
 * @param {object} message The message to make available
 */
function stubMessage(sandbox, message) {
  sandbox
    .stub(ASRouter, "handleMessageRequest")
    .callsFake(async ({ template, triggerId, returnAll } = {}) => {
      // Match on trigger too, so unrelated triggers (notably `messagesLoaded`,
      // fired by loadMessagesFromAllProviders) don't also route this message.
      const matches =
        (!template || template === message.template) &&
        (!triggerId || triggerId === message.trigger.id);
      if (matches) {
        return returnAll ? [message] : message;
      }
      return returnAll ? [] : null;
    });
  sandbox.stub(ASRouter, "messagesEnabledInAutomation").value([message.id]);
  sandbox
    .stub(ASRouter, "getMessageById")
    .withArgs(message.id)
    .returns(message);
}

function fireTrigger(win) {
  return ASRouter.sendTriggerMessage({
    browser: win.gBrowser.selectedBrowser,
    id: "sidebarToolOpened",
    context: { view: "viewGenaiChatSidebar" },
  });
}

function getSidebarDoc(win) {
  return win.SidebarController.browser?.contentWindow?.document;
}

function getPromo(doc) {
  const promo = doc?.getElementById("chatbot-promo");
  return {
    promo,
    container: doc?.getElementById("footer"),
    // Buttons in render() order: dismiss first, then primary.
    buttons: promo ? [...promo.shadowRoot.querySelectorAll("moz-button")] : [],
  };
}

function isPromoShowing(doc) {
  const { promo, container } = getPromo(doc);
  return !!promo?.message && !!container?.classList.contains("promo-active");
}

/**
 * Wait for the promo to appear or disappear. `promo.message` is a plain JS
 * property and so isn't observable, but it is always set alongside the
 * `promo-active` class on #footer, so watching that class covers both.
 *
 * @param {Document} doc The sidebar panel document
 * @param {boolean} shouldShow Whether to wait for the promo to be showing
 */
function waitForPromo(doc, shouldShow = true) {
  return BrowserTestUtils.waitForMutationCondition(
    doc.getElementById("footer"),
    { attributes: true, attributeFilter: ["class"] },
    () => isPromoShowing(doc) === shouldShow
  );
}

async function openChatSidebar(win) {
  await SidebarTestUtils.showPanel(win, "viewGenaiChatSidebar");
  await TestUtils.waitForCondition(
    () => getSidebarDoc(win)?.getElementById("chatbot-promo"),
    "chatbot-promo element present"
  );
  return getSidebarDoc(win);
}

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.ml.chat.provider", CHAT_PROVIDER_URL],
      ["browser.ml.chat.page", true],
    ],
  });
  await ASRouter.waitForInitialized;

  registerCleanupFunction(async () => {
    await ASRouter.resetMessageState();
  });
});

describe("sidebar chatbot promo", () => {
  let sandbox, win;

  beforeEach(async () => {
    sandbox = sinon.createSandbox();
    await ASRouter.resetMessageState();
    win = await BrowserTestUtils.openNewBrowserWindow();
  });

  afterEach(async () => {
    await BrowserTestUtils.closeWindow(win);
    sandbox.restore();
  });

  describe("rendering", () => {
    it("renders the resolved content and marks the footer active", async () => {
      stubMessage(sandbox, TEST_MESSAGE);
      const doc = await openChatSidebar(win);
      await fireTrigger(win);
      await waitForPromo(doc);

      const { promo, buttons } = getPromo(doc);
      Assert.equal(promo.message.heading, "Test heading", "Heading resolved.");
      Assert.equal(promo.message.message, "Test body", "Body resolved.");
      Assert.equal(
        promo.message.primaryActionText,
        "Try it",
        "Primary label resolved from primary_button."
      );
      Assert.equal(
        promo.message.additionalActionText,
        "Dismiss",
        "Dismiss label resolved from additional_button."
      );
      Assert.equal(buttons.length, 2, "Both buttons rendered.");
    });

    it("records exactly one impression", async () => {
      stubMessage(sandbox, TEST_MESSAGE);
      const addImpression = sandbox.spy(ASRouter, "addImpression");
      const dispatch = sandbox.spy(ASRouter, "dispatchCFRAction");
      const doc = await openChatSidebar(win);
      await fireTrigger(win);
      await waitForPromo(doc);

      await TestUtils.waitForCondition(
        () => addImpression.calledWith(TEST_MESSAGE),
        "Impression recorded for the test message"
      );
      Assert.equal(
        addImpression.callCount,
        1,
        "Impression recorded exactly once."
      );
      Assert.ok(
        dispatch.calledWithMatch({
          type: "SIDEBAR_CHATBOT_PROMO_TELEMETRY",
          data: { message_id: TEST_MESSAGE.id, event: "IMPRESSION" },
        }),
        "IMPRESSION telemetry recorded."
      );
    });

    it("does nothing when the content resolves to nothing", async () => {
      stubMessage(sandbox, {
        ...TEST_MESSAGE,
        id: "TEST_SIDEBAR_CHATBOT_PROMO_EMPTY",
        content: {},
      });

      const doc = await openChatSidebar(win);
      await fireTrigger(win);

      Assert.ok(
        !isPromoShowing(doc),
        "Promo with no resolvable content does not render."
      );
    });
  });

  describe("buttons", () => {
    let handleAction, dispatch;

    beforeEach(() => {
      stubMessage(sandbox, TEST_MESSAGE);
      dispatch = sandbox.spy(ASRouter, "dispatchCFRAction");
      handleAction = sandbox
        .stub(SpecialMessageActions, "handleAction")
        .returns(undefined);
    });

    it("runs the primary action and tears the promo down", async () => {
      const doc = await openChatSidebar(win);
      await fireTrigger(win);
      await waitForPromo(doc);

      getPromo(doc).buttons.at(-1).click();

      await waitForPromo(doc, false);
      Assert.ok(
        handleAction.calledWith(
          TEST_MESSAGE.content.primary_button.action,
          sinon.match.any
        ),
        "Primary button dispatched its configured action."
      );
      Assert.ok(
        dispatch.calledWithMatch({
          type: "SIDEBAR_CHATBOT_PROMO_TELEMETRY",
          data: { message_id: TEST_MESSAGE.id, event: "CLICK" },
        }),
        "CLICK telemetry recorded."
      );
    });

    it("runs the dismiss action and tears the promo down", async () => {
      const doc = await openChatSidebar(win);
      await fireTrigger(win);
      await waitForPromo(doc);

      getPromo(doc).buttons.at(0).click();

      await waitForPromo(doc, false);
      Assert.ok(
        handleAction.calledWith(
          TEST_MESSAGE.content.additional_button.action,
          sinon.match.any
        ),
        "Dismiss button dispatched its configured action."
      );
      Assert.ok(
        dispatch.calledWithMatch({
          type: "SIDEBAR_CHATBOT_PROMO_TELEMETRY",
          data: { message_id: TEST_MESSAGE.id, event: "DISMISS" },
        }),
        "DISMISS telemetry recorded."
      );
    });
  });

  describe("timing", () => {
    // `sidebarToolOpened` fires without awaiting SidebarController.toggle(), so
    // the trigger can arrive while the panel is still loading.
    it("shows when the trigger beats the sidebar load", async () => {
      stubMessage(sandbox, TEST_MESSAGE);
      const panelShown = SidebarTestUtils.showPanel(
        win,
        "viewGenaiChatSidebar"
      );
      await fireTrigger(win);
      await panelShown;

      await TestUtils.waitForCondition(
        () => isPromoShowing(getSidebarDoc(win)),
        "Promo shows even though the trigger beat the sidebar load"
      );
    });
  });
});
