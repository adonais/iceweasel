/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const WIDGET_ID = "smartwindow-monitor-button";

add_setup(async function setup() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.search.suggest.enabled", false],
      ["browser.urlbar.suggest.searches", false],
      ["browser.smartwindow.endpoint", "http://localhost:0/v1"],
      ["browser.smartwindow.firstrun.hasCompleted", true],
      ["browser.smartwindow.agent.enabled", true],
      ["browser.smartwindow.agent.toolbar.enabled", true],
    ],
  });
});

function getMonitorButton(win) {
  return win.document.getElementById(WIDGET_ID);
}

/**
 * The monitor button is visible in a Smart Window and routes activation to
 * AIWindowUI.toggleMonitorPanel, by mouse and by keyboard.
 */
add_task(async function test_monitor_button() {
  const sb = this.sinon.createSandbox();
  const toggleMonitorPanel = sb.stub(AIWindowUI, "toggleMonitorPanel");
  let win;
  try {
    win = await openAIWindow();
    await promiseNavigateAndLoad(
      win.gBrowser.selectedBrowser,
      "https://example.com/"
    );

    const monitorButton = getMonitorButton(win);
    Assert.ok(monitorButton, "Monitor button exists in the toolbar");
    Assert.ok(
      BrowserTestUtils.isVisible(monitorButton),
      "Monitor button is visible for AI Window"
    );

    EventUtils.synthesizeMouseAtCenter(monitorButton, {}, win);
    Assert.equal(
      toggleMonitorPanel.callCount,
      1,
      "Clicking the monitor button toggles the monitor panel"
    );
    Assert.equal(
      toggleMonitorPanel.firstCall.args[0],
      win,
      "The panel is toggled for the window the button belongs to"
    );

    // Toolbar buttons are only focusable while ToolbarKeyboardNavigator has
    // given them a tabindex, so take the same step it does before typing.
    monitorButton.setAttribute("tabindex", "-1");
    monitorButton.focus();
    Assert.equal(
      win.document.activeElement,
      monitorButton,
      "Monitor button can take keyboard focus"
    );
    // Space rather than Enter: on macOS, Return activates the default button
    // instead of the focused one (see XULButtonElement::AfterHandleEvent).
    EventUtils.synthesizeKey(" ", {}, win);
    Assert.equal(
      toggleMonitorPanel.callCount,
      2,
      "Pressing Space on the monitor button toggles the monitor panel"
    );
  } finally {
    sb.restore();
    await BrowserTestUtils.closeWindow(win);
  }
});

/**
 * Unlike the ask button, the monitor button stays available in immersive view
 * (the Smart Window full page).
 */
add_task(async function test_monitor_button_immersive_view() {
  const win = await openAIWindow();
  try {
    Assert.ok(
      win.document.documentElement.hasAttribute("aiwindow-immersive-view"),
      "Chrome window has the aiwindow-immersive-view attribute"
    );
    Assert.ok(
      !getMonitorButton(win).hidden,
      "Monitor button is not hidden in immersive view"
    );
  } finally {
    await BrowserTestUtils.closeWindow(win);
  }
});

/**
 * The monitor button is not visible in a Classic Window.
 */
add_task(async function test_monitor_button_classic_window() {
  const win = await BrowserTestUtils.openNewBrowserWindow({
    openerWindow: null,
  });
  try {
    Assert.ok(
      BrowserTestUtils.isHidden(getMonitorButton(win)),
      "Monitor button is not visible in the toolbar for classic window"
    );
  } finally {
    await BrowserTestUtils.closeWindow(win);
  }
});

/**
 * The button is a CustomizableUI widget: the user can move it out of the navbar
 * and the removal sticks across windows.
 */
add_task(async function test_monitor_button_is_customizable() {
  Assert.equal(
    CustomizableUI.getPlacementOfWidget(WIDGET_ID)?.area,
    CustomizableUI.AREA_NAVBAR,
    "Monitor button is placed in the navbar by default"
  );
  Assert.ok(
    CustomizableUI.isWidgetRemovable(WIDGET_ID),
    "Monitor button is removable"
  );

  CustomizableUI.removeWidgetFromArea(WIDGET_ID);
  try {
    Assert.equal(
      CustomizableUI.getPlacementOfWidget(WIDGET_ID),
      null,
      "Monitor button has no placement once removed"
    );

    const win = await openAIWindow();
    try {
      await promiseNavigateAndLoad(
        win.gBrowser.selectedBrowser,
        "https://example.com/"
      );
      Assert.ok(
        !getMonitorButton(win)?.closest("toolbar"),
        "A new window does not put the removed button back on a toolbar"
      );
      Assert.ok(
        CustomizableUI.getUnusedWidgets(win.gNavToolbox.palette).some(
          widget => widget.id == WIDGET_ID
        ),
        "Removed monitor button is available in the customize palette"
      );
    } finally {
      await BrowserTestUtils.closeWindow(win);
    }
  } finally {
    // Not CustomizableUI.reset(): it rebuilds every area from the areas'
    // defaultPlacements, which never contain widgets whose defaultArea is a
    // builtin toolbar (see CustomizableUIInternal.createWidget). That would
    // unplace ai-window-toggle for the rest of the browser session.
    CustomizableUI.addWidgetToArea(WIDGET_ID, CustomizableUI.AREA_NAVBAR);
  }
});

/**
 * The button needs both the agent feature pref and its own toolbar pref, so the
 * widget is not registered at all - and therefore stays out of the customize
 * palette - when either one is off.
 */
add_task(async function test_monitor_button_pref_gates() {
  for (const [agent, toolbar] of [
    [false, false],
    [true, false],
    [false, true],
  ]) {
    await SpecialPowers.pushPrefEnv({
      set: [
        ["browser.smartwindow.agent.enabled", agent],
        ["browser.smartwindow.agent.toolbar.enabled", toolbar],
      ],
    });
    const win = await openAIWindow();
    try {
      await promiseNavigateAndLoad(
        win.gBrowser.selectedBrowser,
        "https://example.com/"
      );
      Assert.equal(
        getMonitorButton(win),
        null,
        `Monitor button is absent with agent.enabled=${agent}, agent.toolbar.enabled=${toolbar}`
      );
      Assert.ok(
        !CustomizableUI.getUnusedWidgets(win.gNavToolbox.palette).some(
          widget => widget.id == WIDGET_ID
        ),
        `Monitor button is not in the customize palette with agent.enabled=${agent}, agent.toolbar.enabled=${toolbar}`
      );
    } finally {
      await BrowserTestUtils.closeWindow(win);
      await SpecialPowers.popPrefEnv();
    }
  }
});
