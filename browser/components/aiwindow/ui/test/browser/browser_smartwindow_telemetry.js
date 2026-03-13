/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

async function getConversationId(browser) {
  return SpecialPowers.spawn(browser, [], async () => {
    await content.customElements.whenDefined("ai-window");
    const aiWindow = await ContentTaskUtils.waitForCondition(
      () => content.document.querySelector("ai-window"),
      "Wait for ai-window element"
    );
    return aiWindow.conversationId.toString();
  });
}

async function dispatchSmartbarCommit(browser, value, action) {
  await SpecialPowers.spawn(browser, [value, action], async (val, act) => {
    const aiWindow = await ContentTaskUtils.waitForCondition(
      () => content.document.querySelector("ai-window"),
      "Wait for ai-window element"
    );
    const smartbar = await ContentTaskUtils.waitForCondition(
      () => aiWindow.shadowRoot.querySelector("#ai-window-smartbar"),
      "Wait for Smartbar to be rendered"
    );

    const commitEvent = new content.CustomEvent("smartbar-commit", {
      detail: {
        value: val,
        action: act,
      },
      bubbles: true,
      composed: true,
    });

    smartbar.ownerDocument.dispatchEvent(commitEvent);
  });
}

async function dispatchMemoriesToggle(browser, pressed) {
  await SpecialPowers.spawn(browser, [pressed], async pressedState => {
    const aiWindow = await ContentTaskUtils.waitForCondition(
      () => content.document.querySelector("ai-window"),
      "Wait for ai-window element"
    );
    const smartbar = await ContentTaskUtils.waitForCondition(
      () => aiWindow.shadowRoot.querySelector("#ai-window-smartbar"),
      "Wait for Smartbar to be rendered"
    );

    const toggleEvent = new content.CustomEvent(
      "aiwindow-memories-toggle:on-change",
      {
        detail: { pressed: pressedState },
        bubbles: true,
        composed: true,
      }
    );

    smartbar.dispatchEvent(toggleEvent);
  });
}

async function getFirstPromptTextAndClick(browser) {
  return SpecialPowers.spawn(browser, [], async () => {
    const aiWindow = await ContentTaskUtils.waitForCondition(
      () => content.document.querySelector("ai-window"),
      "Wait for ai-window element"
    );
    const promptsElement = await ContentTaskUtils.waitForCondition(
      () => aiWindow.shadowRoot.querySelector("smartwindow-prompts"),
      "Wait for smartwindow-prompts element"
    );
    const buttons =
      promptsElement.shadowRoot.querySelectorAll(".sw-prompt-button");
    const firstPromptText = buttons[0].textContent.trim();
    buttons[0].click();
    return firstPromptText;
  });
}

add_task(async function test_smartbar_commit_telemetry() {
  const sb = this.sinon.createSandbox();
  let win;

  try {
    Services.fog.testResetFOG();
    sb.stub(this.Chat, "fetchWithHistory");
    sb.stub(this.openAIEngine, "build");

    win = await openAIWindow();
    const browser = win.gBrowser.selectedBrowser;

    const conversationId = await getConversationId(browser);
    await dispatchSmartbarCommit(browser, "Telemetry prompt", "chat");
    await TestUtils.waitForTick();

    const events = Glean.smartWindow.chatSubmit.testGetValue();
    Assert.equal(events?.length, 1, "One smartbar commit event was recorded");
    Assert.equal(
      events[0].extra.chat_id,
      conversationId,
      "smartbar commit event includes the conversation id"
    );
  } finally {
    if (win) {
      await BrowserTestUtils.closeWindow(win);
    }
    sb.restore();
  }
});

add_task(async function test_memories_toggle_telemetry() {
  Services.fog.testResetFOG();

  const win = await openAIWindow();
  try {
    const browser = win.gBrowser.selectedBrowser;

    const conversationId = await getConversationId(browser);
    await dispatchMemoriesToggle(browser, true);
    await TestUtils.waitForTick();

    const events = Glean.smartWindow.memoriesToggle.testGetValue();
    Assert.equal(events?.length, 1, "One memories toggle event was recorded");
    Assert.equal(
      events[0].extra.chat_id,
      conversationId,
      "memories toggle event includes the conversation id"
    );
    Assert.equal(
      events[0].extra.toggle,
      "true",
      "memories toggle event includes the enabled state"
    );
  } finally {
    await BrowserTestUtils.closeWindow(win);
  }
});

add_task(async function test_prompt_selected_telemetry() {
  const sb = this.sinon.createSandbox();
  let win;

  try {
    Services.fog.testResetFOG();
    sb.stub(this.Chat, "fetchWithHistory");
    sb.stub(this.openAIEngine, "build");

    await SpecialPowers.pushPrefEnv({
      set: [["browser.smartwindow.endpoint", "http://localhost:0/v1"]],
    });

    win = await openAIWindow();
    const browser = win.gBrowser.selectedBrowser;

    const conversationId = await getConversationId(browser);
    const firstPromptText = await getFirstPromptTextAndClick(browser);
    Assert.ok(firstPromptText, "Prompt text is available");
    await TestUtils.waitForTick();

    const events = Glean.smartWindow.quickPromptClicked.testGetValue();
    Assert.equal(events?.length, 1, "One prompt selected event was recorded");
    Assert.equal(
      events[0].extra.chat_id,
      conversationId,
      "prompt selected event includes the conversation id"
    );
  } finally {
    await SpecialPowers.popPrefEnv();
    if (win) {
      await BrowserTestUtils.closeWindow(win);
    }
    sb.restore();
  }
});
