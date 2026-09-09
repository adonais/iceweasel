/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

add_setup(async () => {
  await SpecialPowers.pushPrefEnv({
    set: [
      [VERTICAL_TABS_PREF, true],
      [SIDEBAR_VISIBILITY_PREF, "always-show"],
      ["browser.ml.chat.enabled", true],
      ["browser.contextual-password-manager.enabled", true],
      ["sidebar.main.tools", "aichat,passwords,syncedtabs,history"],
    ],
  });
});
registerCleanupFunction(async () => {
  await SpecialPowers.popPrefEnv();
  cleanUpExtraTabs();
});

async function resizeTools(deltaY) {
  AccessibilityUtils.setEnv({ mustHaveAccessibleRule: false });

  // Let the tools splitter stabilize before attempting a drag-and-drop.
  await waitForRepaint();

  info(`Drag the tools splitter by ${deltaY} px.`);
  const { toolsSplitter: splitter } = SidebarController.sidebarMain;
  EventUtils.synthesizeMouseAtCenter(splitter, { type: "mousedown" });
  await mouseMoveInChunksVertical(splitter, deltaY, 10);
  EventUtils.synthesizeMouse(splitter, 0, 0, { type: "mouseup" });

  info(`The tools container has been expanded.`);

  AccessibilityUtils.resetEnv();
}

async function mouseMoveInChunksVertical(el, deltaY, numberOfChunks) {
  let chunkIndex = 0;
  const chunkSize = deltaY / numberOfChunks;
  const finished = Promise.withResolvers();

  function synthesizeMouseMove() {
    info(`chunkSize: ${chunkSize}`);
    // mousemove by a single chunk. Queue up the next chunk if necessary.
    EventUtils.synthesizeMouse(el, 0, chunkSize, { type: "mousemove" });
    if (++chunkIndex === numberOfChunks) {
      finished.resolve();
    } else {
      requestAnimationFrame(synthesizeMouseMove);
    }
  }

  await waitForRepaint();
  requestAnimationFrame(synthesizeMouseMove);
  await finished.promise;
}

function getToolsHeight({ SidebarController } = window) {
  return SidebarController.sidebarMain.buttonsWrapper.clientHeight;
}

async function resetToolsHeight() {
  // Reset tools height
  await resizeTools(-500);
  await SidebarController.sidebarMain.requestUpdate();
  await SidebarController.sidebarMain.updateComplete;
  await SidebarController.waitUntilStable();
  await BrowserTestUtils.waitForMutationCondition(
    SidebarController.sidebarMain.buttonsWrapper,
    { attributes: true, attributeFilter: ["overflowing"] },
    () => !SidebarController.sidebarMain.shouldShowOverflowButton,
    {
      msg: "Tools stopped overflowing",
      // resizeTools drives the resize a frame at a time, which runs past a
      // minute under tsan. That leaves no room under the harness timeout for a
      // bound of our own, so let the harness be the one that gives up.
      timeout: Infinity,
    }
  );
}

add_task(async function test_resize_of_tools() {
  await SidebarController.updateUIState({
    launcherExpanded: false,
  });

  await SpecialPowers.pushPrefEnv({
    set: [
      ["sidebar.main.tools", "aichat,passwords,syncedtabs,history,bookmarks"],
    ],
  });

  await resetToolsHeight();
  let overflowButton = SidebarController.sidebarMain.moreToolsButton;
  Assert.ok(
    !overflowButton.checkVisibility(),
    "The overflow button is not visible before resize"
  );

  const originalHeight = getToolsHeight();
  info("Resize the tools container.");
  await resizeTools(600);
  await SidebarController.sidebarMain.updateComplete;
  await SidebarController.waitUntilStable();
  await BrowserTestUtils.waitForMutationCondition(
    SidebarController.sidebarMain.buttonsWrapper,
    { attributes: true, attributeFilter: ["overflowing"] },
    () => SidebarController.sidebarMain.shouldShowOverflowButton
  );
  const newHeight = getToolsHeight();
  info(`original: ${originalHeight}, new: ${newHeight}`);
  Assert.less(
    parseInt(newHeight),
    parseInt(originalHeight),
    "Tools container was resized."
  );

  overflowButton = SidebarController.sidebarMain.moreToolsButton;
  Assert.ok(
    overflowButton.checkVisibility(),
    "The overflow button is visible after resize"
  );

  await resetToolsHeight();

  while (gBrowser.tabs.length > 1) {
    BrowserTestUtils.removeTab(gBrowser.tabs.at(-1));
  }
});

add_task(async function test_overflow_menu() {
  await SidebarController.updateUIState({
    launcherExpanded: false,
  });

  await SpecialPowers.pushPrefEnv({
    set: [
      ["sidebar.main.tools", "aichat,passwords,syncedtabs,history,bookmarks"],
    ],
  });

  await resetToolsHeight();
  let overflowButton = SidebarController.sidebarMain.moreToolsButton;
  Assert.ok(
    !overflowButton.checkVisibility(),
    "The overflow button is not visible before resize"
  );

  const originalHeight = getToolsHeight();
  info("Resize the tools container.");
  await resizeTools(600);
  await SidebarController.sidebarMain.updateComplete;
  await SidebarController.waitUntilStable();
  await BrowserTestUtils.waitForMutationCondition(
    SidebarController.sidebarMain.buttonsWrapper,
    { attributes: true, attributeFilter: ["overflowing"] },
    () => SidebarController.sidebarMain.shouldShowOverflowButton
  );
  const newHeight = getToolsHeight();
  info(`original: ${originalHeight}, new: ${newHeight}`);
  Assert.less(
    parseInt(newHeight),
    parseInt(originalHeight),
    "Tools container was resized."
  );

  overflowButton = SidebarController.sidebarMain.moreToolsButton;
  Assert.ok(
    overflowButton.checkVisibility(),
    "The overflow button is visible after resize"
  );

  // Open the overflow menu
  let overflowMenu = document.getElementById("sidebar-tools-overflow");
  let promiseMenuShown = BrowserTestUtils.waitForEvent(
    overflowMenu,
    "popupshown"
  );
  overflowButton.click();
  await promiseMenuShown;

  // Open the Customize Sidebar panel using the overflow menu
  let customizeSidebarButton = overflowMenu.querySelector(
    "moz-button[view=viewCustomizeSidebar]"
  );
  let promisePanelShown = BrowserTestUtils.waitForEvent(window, "SidebarShown");
  customizeSidebarButton.click();
  await promisePanelShown;
  Assert.equal(SidebarController.currentID, "viewCustomizeSidebar");

  ok(true, "Customize panel is shown.");

  // Close customize panel
  SidebarController.hide();

  await resetToolsHeight();

  while (gBrowser.tabs.length > 1) {
    BrowserTestUtils.removeTab(gBrowser.tabs.at(-1));
  }
});

add_task(async function test_overflow_menu_with_keyboard() {
  await SidebarController.updateUIState({
    launcherExpanded: false,
  });

  await SpecialPowers.pushPrefEnv({
    set: [
      ["sidebar.main.tools", "aichat,passwords,syncedtabs,history,bookmarks"],
    ],
  });

  await resetToolsHeight();
  let overflowButton = SidebarController.sidebarMain.moreToolsButton;
  Assert.ok(
    !overflowButton.checkVisibility(),
    "The overflow button is not visible before resize"
  );

  const originalHeight = getToolsHeight();
  info("Resize the tools container.");
  await resizeTools(600);
  await SidebarController.sidebarMain.updateComplete;
  await SidebarController.waitUntilStable();
  await BrowserTestUtils.waitForMutationCondition(
    SidebarController.sidebarMain.buttonsWrapper,
    { attributes: true, attributeFilter: ["overflowing"] },
    () => SidebarController.sidebarMain.shouldShowOverflowButton
  );
  const newHeight = getToolsHeight();
  info(`original: ${originalHeight}, new: ${newHeight}`);
  Assert.less(
    parseInt(newHeight),
    parseInt(originalHeight),
    "Tools container was resized."
  );

  overflowButton = SidebarController.sidebarMain.moreToolsButton;
  Assert.ok(
    overflowButton.checkVisibility(),
    "The overflow button is visible after resize"
  );

  const sidebar = document.querySelector("sidebar-main");
  const newTabButton = sidebar.querySelector("#tabs-newtab-button");
  newTabButton.focus();
  ok(isActiveElement(newTabButton), "New tab button is focused again.");

  info("Tab to get to tools.");
  EventUtils.synthesizeKey("KEY_Tab", {});
  if (isActiveElement(sidebar.toolButtons[0])) {
    ok(
      isActiveElement(sidebar.toolButtons[0]),
      "First tool button is focused."
    );
    info("Tab again to reach the overflow button");
    EventUtils.synthesizeKey("KEY_Tab", {});
  }

  ok(isActiveElement(overflowButton), "Overflow button is focused.");

  // Open the overflow menu
  let overflowMenu = document.getElementById("sidebar-tools-overflow");
  let promiseMenuShown = BrowserTestUtils.waitForEvent(
    overflowMenu,
    "popupshown"
  );
  info("Press Space key.");
  EventUtils.synthesizeKey(" ", {});
  await promiseMenuShown;

  // Open the Customize Sidebar panel using the overflow menu
  let customizeSidebarButton = overflowMenu.querySelector(
    "moz-button[view=viewCustomizeSidebar]"
  );
  customizeSidebarButton.focus();
  ok(
    isActiveElement(customizeSidebarButton),
    "Customize sidebar button is focused."
  );
  info("Press Space key.");
  EventUtils.synthesizeKey(" ", {});
  await BrowserTestUtils.waitForMutationCondition(
    overflowButton,
    { attributes: true },
    () => {
      return SidebarController.currentID === "viewCustomizeSidebar";
    }
  );

  ok(true, "Customize panel is shown.");

  // Close customize panel
  SidebarController.hide();

  await resetToolsHeight();

  while (gBrowser.tabs.length > 1) {
    BrowserTestUtils.removeTab(gBrowser.tabs.at(-1));
  }
});

add_task(
  async function test_overflowing_buttons_restored_switching_to_horizontal() {
    await SidebarController.updateUIState({
      launcherExpanded: false,
    });

    await SpecialPowers.pushPrefEnv({
      set: [
        ["sidebar.main.tools", "aichat,passwords,syncedtabs,history,bookmarks"],
      ],
    });

    const sidebar = SidebarController.sidebarMain;
    await resetToolsHeight();

    info("Resize the tools container to force overflow.");
    await resizeTools(600);
    await sidebar.updateComplete;
    await SidebarController.waitUntilStable();
    await BrowserTestUtils.waitForMutationCondition(
      sidebar.buttonsWrapper,
      { attributes: true, attributeFilter: ["overflowing"] },
      () => sidebar.shouldShowOverflowButton
    );

    await BrowserTestUtils.waitForMutationCondition(
      sidebar.buttonsWrapper,
      { attributes: true, attributeFilter: ["style"], subtree: true },
      () =>
        Array.from(sidebar.toolButtons).some(
          button => button.style.visibility === "hidden"
        ),
      {
        msg: "At least one tool button is hidden while overflowing in vertical tabs.",
      }
    );

    info("Switch to horizontal tabs.");
    await SpecialPowers.pushPrefEnv({ set: [[VERTICAL_TABS_PREF, false]] });
    await sidebar.updateComplete;
    await SidebarController.waitUntilStable();

    await BrowserTestUtils.waitForMutationCondition(
      sidebar.buttonsWrapper,
      { attributes: true, attributeFilter: ["style"], subtree: true },
      () =>
        Array.from(sidebar.toolButtons).every(
          button => button.style.visibility !== "hidden"
        ),
      {
        msg: "No tool buttons remain hidden after switching to horizontal tabs.",
      }
    );
    for (const button of sidebar.toolButtons) {
      is(
        window.getComputedStyle(button).visibility,
        "visible",
        `Tool button ${button.getAttribute("view")} is visible in horizontal tabs.`
      );
    }
    ok(
      !sidebar.shouldShowOverflowButton,
      "Overflow button is not shown in horizontal tabs."
    );
    is(
      document.getElementById("tools-overflow-list").childElementCount,
      0,
      "Overflow panel copies were cleared."
    );

    info("Switch back to vertical tabs.");
    await SpecialPowers.popPrefEnv();
    await sidebar.updateComplete;
    await resetToolsHeight();

    while (gBrowser.tabs.length > 1) {
      BrowserTestUtils.removeTab(gBrowser.tabs.at(-1));
    }
  }
);

add_task(async function test_tools_overflow() {
  const sidebar = document.querySelector("sidebar-main");
  ok(sidebar, "Sidebar is shown.");
  sidebar.expanded = true;
  await sidebar.updateComplete;

  let toolsAndExtensionsButtonGroup = sidebar.buttonGroup;
  Assert.strictEqual(
    toolsAndExtensionsButtonGroup.getAttribute("orientation"),
    "horizontal",
    "Tools are displaying horizontally"
  );

  await SpecialPowers.pushPrefEnv({
    set: [
      ["sidebar.main.tools", "aichat,passwords,syncedtabs,history,bookmarks"],
    ],
  });
  await sidebar.updateComplete;
  Assert.strictEqual(
    toolsAndExtensionsButtonGroup.getAttribute("orientation"),
    "horizontal",
    "Tools are displaying horizontally"
  );
  for (const toolMozButton of toolsAndExtensionsButtonGroup.children) {
    ok(
      !toolMozButton.innerText.length,
      `Tool button is not displaying label text`
    );
  }
});
