/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

/**
 * Tests Smartbar focus outline behavior:
 * - Auto-focus on load suppresses the outline
 * - Mouse clicks suppress the outline
 * - Keyboard focus shows the outline
 */

"use strict";

add_task(async function test_smartbar_autofocus_suppresses_outline() {
  const win = await openAIWindow();
  const browser = win.gBrowser.selectedBrowser;

  const suppressFocusBorder = await SpecialPowers.spawn(
    browser,
    [],
    async () => {
      const aiWindowElement = content.document.querySelector("ai-window");
      const smartbar = await ContentTaskUtils.waitForCondition(
        () => aiWindowElement.shadowRoot?.querySelector("#ai-window-smartbar"),
        "Wait for Smartbar to be rendered"
      );
      await ContentTaskUtils.waitForCondition(
        () => smartbar.hasAttribute("suppress-focus-border"),
        "Wait for suppress-focus-border on auto-focus"
      );
      return smartbar.hasAttribute("suppress-focus-border");
    }
  );

  Assert.ok(
    suppressFocusBorder,
    "suppress-focus-border should be set on auto-focus"
  );

  await BrowserTestUtils.closeWindow(win);
});

add_task(async function test_smartbar_click_suppresses_outline() {
  const win = await openAIWindow();
  const browser = win.gBrowser.selectedBrowser;

  const suppressFocusBorder = await SpecialPowers.spawn(
    browser,
    [],
    async () => {
      const aiWindowElement = content.document.querySelector("ai-window");
      const smartbar = await ContentTaskUtils.waitForCondition(
        () => aiWindowElement.shadowRoot?.querySelector("#ai-window-smartbar"),
        "Wait for Smartbar to be rendered"
      );

      await ContentTaskUtils.waitForCondition(
        () => smartbar.hasAttribute("suppress-focus-border"),
        "Wait for initial auto-focus"
      );

      // Blur then simulate a mouse click
      smartbar.inputField.blur();
      smartbar.dispatchEvent(
        new content.MouseEvent("mousedown", { bubbles: true })
      );
      smartbar.inputField.focus();

      return smartbar.hasAttribute("suppress-focus-border");
    }
  );

  Assert.ok(
    suppressFocusBorder,
    "suppress-focus-border should be set on mouse click"
  );

  await BrowserTestUtils.closeWindow(win);
});

add_task(async function test_smartbar_keyboard_focus_shows_outline() {
  const win = await openAIWindow();
  const browser = win.gBrowser.selectedBrowser;

  const suppressFocusBorder = await SpecialPowers.spawn(
    browser,
    [],
    async () => {
      const aiWindowElement = content.document.querySelector("ai-window");
      const smartbar = await ContentTaskUtils.waitForCondition(
        () => aiWindowElement.shadowRoot?.querySelector("#ai-window-smartbar"),
        "Wait for Smartbar to be rendered"
      );

      await ContentTaskUtils.waitForCondition(
        () => smartbar.hasAttribute("suppress-focus-border"),
        "Wait for initial auto-focus suppress"
      );

      // Blur then focus without a mousedown (simulates keyboard navigation)
      smartbar.inputField.blur();
      smartbar.inputField.focus();

      await ContentTaskUtils.waitForCondition(
        () => !smartbar.hasAttribute("suppress-focus-border"),
        "Wait for suppress-focus-border to be cleared on keyboard focus"
      );

      return smartbar.hasAttribute("suppress-focus-border");
    }
  );

  Assert.ok(
    !suppressFocusBorder,
    "suppress-focus-border should be removed on keyboard focus"
  );

  await BrowserTestUtils.closeWindow(win);
});

add_task(async function test_smartbar_button_container_click_no_focus() {
  const win = await openAIWindow();
  const browser = win.gBrowser.selectedBrowser;

  await SpecialPowers.spawn(browser, [], async () => {
    const aiWindowElement = content.document.querySelector("ai-window");
    const smartbar = await ContentTaskUtils.waitForCondition(
      () => aiWindowElement.shadowRoot?.querySelector("#ai-window-smartbar"),
      "Wait for Smartbar to be rendered"
    );

    // Ensure the smartbar is not focused initially
    smartbar.inputField.blur();
    await ContentTaskUtils.waitForCondition(
      () => !smartbar.focused,
      "Smartbar should not be focused"
    );

    // Find the smartbar button container
    const buttonContainer = smartbar.querySelector(
      ".smartbar-button-container"
    );

    if (!buttonContainer) {
      throw new Error("Smartbar button container not found");
    }

    // Store initial focus state
    const initialFocused = smartbar.focused;
    Assert.ok(!initialFocused, "Smartbar should not be initially focused");

    // Create mousedown event with proper composedTarget
    const mousedownEvent = new content.MouseEvent("mousedown", {
      bubbles: true,
      composed: true,
    });
    // Manually set composedTarget to match what the browser would set
    Object.defineProperty(mousedownEvent, "composedTarget", {
      value: buttonContainer,
      writable: false,
    });

    buttonContainer.dispatchEvent(mousedownEvent);

    // Wait a moment for any focus changes to occur
    await new Promise(resolve => content.setTimeout(resolve, 50));

    // Verify the smartbar is still not focused
    Assert.ok(
      !smartbar.focused,
      "Smartbar should remain unfocused after clicking button container"
    );
    Assert.equal(
      content.document.activeElement === smartbar.inputField,
      false,
      "Input field should not be the active element"
    );
  });

  await BrowserTestUtils.closeWindow(win);
});
