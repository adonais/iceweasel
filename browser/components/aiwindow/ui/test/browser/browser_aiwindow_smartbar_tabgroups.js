/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

/**
 * Tests that the ActionsProviderTabGroups global action shows in the
 * Smart Window smartbar.
 */

"use strict";

ChromeUtils.defineESModuleGetters(this, {
  TabGroupTestUtils: "resource://testing-common/TabGroupTestUtils.sys.mjs",
});

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.tabs.groups.enabled", true]],
  });
  registerCleanupFunction(() => TabGroupTestUtils.forgetSavedTabGroups());
});

add_task(async function test_smartbar_renders_tabgroup_action() {
  const win = await openAIWindow();
  const chatBrowser = win.gBrowser.selectedBrowser;

  const aboutRobotsTab = BrowserTestUtils.addTab(win.gBrowser, "about:robots");
  const aboutMozillaTab = BrowserTestUtils.addTab(
    win.gBrowser,
    "about:mozilla"
  );
  const { COLORS } = win.customElements.get("tabgroup-menu");
  const color = COLORS[0];
  const tabGroup = win.gBrowser.addTabGroup([aboutRobotsTab, aboutMozillaTab], {
    color,
    label: "About Pages",
  });
  tabGroup.collapsed = true;

  await promiseSmartbarSuggestionsOpen(chatBrowser, () =>
    typeInSmartbar(chatBrowser, "About")
  );

  await SpecialPowers.spawn(chatBrowser, [color], async groupColor => {
    const aiWindowElement = content.document.querySelector("ai-window");
    const smartbar = aiWindowElement.shadowRoot.querySelector(
      "#ai-window-smartbar"
    );

    const BUTTON_SELECTOR = '.urlbarView-action-btn[data-action^="tabgroup-"]';
    const results = smartbar.querySelector(".urlbarView-results");
    await ContentTaskUtils.waitForMutationCondition(
      results,
      { childList: true, subtree: true, attributes: true },
      () =>
        results.querySelector(
          `${BUTTON_SELECTOR} > .urlbarView-action-btn-label[data-l10n-id]`
        ),
      "Wait for the tab group action button"
    );
    const button = results.querySelector(BUTTON_SELECTOR);
    const label = button.querySelector(".urlbarView-action-btn-label");

    Assert.equal(
      label.dataset.l10nId,
      "urlbar-result-action-switch-to-tabgroup",
      "Tab group action renders the tab group label"
    );
    Assert.equal(
      button.style.getPropertyValue("--tab-group-background-color"),
      `var(--tab-group-${groupColor})`,
      "Tab group action matches group color variable"
    );
    Assert.ok(
      content
        .getComputedStyle(button)
        .getPropertyValue("--tab-group-background-color"),
      "Group color resolves to a value"
    );
  });

  await TabGroupTestUtils.removeTabGroup(tabGroup);
  await BrowserTestUtils.closeWindow(win);
});
