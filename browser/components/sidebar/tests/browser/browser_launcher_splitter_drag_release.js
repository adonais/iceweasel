/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/**
 * Releasing the launcher splitter must keep the width the drag ended on. The
 * width is only reported to SidebarState by a ResizeObserver, which runs at the
 * end of a rendering update. Ensure a release handled in the same turn as the
 * last movement stores the last width from the end of the drag.
 */

const DRAG_STEP = 25;

function launcherWidth() {
  return Math.round(
    SidebarController.sidebarContainer.getBoundingClientRect().width
  );
}

/**
 * Collapse the launcher and forget any width an earlier task stored, so each
 * task drags from the same place. head.js restores whatever state the file
 * found at cleanup, so this is only used to set a task up.
 */
async function resetLauncher() {
  await SidebarController.updateUIState({
    launcherExpanded: false,
    launcherVisible: true,
  });
  SidebarController._state.expandedLauncherWidth = undefined;
  SidebarController.sidebarContainer.style.width = "";
  await waitForRepaint();
}

/**
 * Run a drag with the a11y checks' "must have an accessible" rule off.
 *
 * The launcher splitter exposes no accessible at all — it is a bare XUL
 * <splitter> with no role and no keyboard affordance — so that one rule cannot
 * pass for any mouse event this file synthesizes. Every other test that drags
 * this splitter does the same. The rule is the only one suppressed: if the
 * splitter ever gains an accessible, the interactive, focusable, visible,
 * enabled and labelled checks all still run against it.
 *
 * @param {Function} task
 */
async function withSplitterDrag(task) {
  AccessibilityUtils.setEnv({ mustHaveAccessibleRule: false });
  try {
    await task();
  } finally {
    AccessibilityUtils.resetEnv();
  }
}

add_setup(async () => {
  await SpecialPowers.pushPrefEnv({
    set: [
      [SIDEBAR_VISIBILITY_PREF, "always-show"],
      [POSITION_SETTING_PREF, true],
      [VERTICAL_TABS_PREF, true],
    ],
  });
  await SidebarTestUtils.waitForTabstripOrientation(window, "vertical");
});

add_task(async function test_final_step_survives_a_release_in_the_same_turn() {
  await withSplitterDrag(async () => {
    await resetLauncher();
    const splitter = SidebarController._launcherSplitter;

    EventUtils.synthesizeMouseAtCenter(splitter, { type: "mousedown" });
    for (let i = 0; i < 9; i++) {
      EventUtils.synthesizeMouse(splitter, DRAG_STEP, 0, { type: "mousemove" });
      await waitForRepaint();
    }

    // No repaint here: the last movement and the release share a turn, which is
    // what a quick release does.
    EventUtils.synthesizeMouse(splitter, DRAG_STEP, 0, { type: "mousemove" });
    const releasedAt = launcherWidth();
    EventUtils.synthesizeMouse(splitter, 0, 0, { type: "mouseup" });
    await waitForRepaint();

    info(`Released at ${releasedAt}px, settled at ${launcherWidth()}px.`);
    Assert.equal(
      launcherWidth(),
      releasedAt,
      "The launcher keeps the width the drag ended on."
    );
  });
});

add_task(
  async function test_final_step_survives_a_release_without_a_layout_flush() {
    await withSplitterDrag(async () => {
      await resetLauncher();
      const splitter = SidebarController._launcherSplitter;
      const container = SidebarController.sidebarContainer;

      EventUtils.synthesizeMouseAtCenter(splitter, { type: "mousedown" });
      for (let i = 0; i < 9; i++) {
        EventUtils.synthesizeMouse(splitter, DRAG_STEP, 0, {
          type: "mousemove",
        });
        await waitForRepaint();
      }

      // As above, but the release coordinates are worked out before the last
      // movement and the width is read from the inline style the splitter writes,
      // so nothing flushes layout in between either.
      const { left, top } = splitter.getBoundingClientRect();
      EventUtils.synthesizeMouse(splitter, DRAG_STEP, 0, { type: "mousemove" });
      const releasedAt = Math.round(parseFloat(container.style.width));
      EventUtils.synthesizeMouseAtPoint(
        left + DRAG_STEP,
        top,
        { type: "mouseup" },
        window
      );
      await waitForRepaint();

      info(`Released at ${releasedAt}px, settled at ${launcherWidth()}px.`);
      Assert.equal(
        launcherWidth(),
        releasedAt,
        "The launcher keeps the width the drag ended on."
      );
    });
  }
);

add_task(async function test_flick_open_in_one_turn_is_not_discarded() {
  await withSplitterDrag(async () => {
    await resetLauncher();
    const splitter = SidebarController._launcherSplitter;

    // The whole gesture in one turn, so the observer never reports anything but
    // the collapsed width. That width is below the minimum the launcher stays
    // expanded at, so a release that trusted it would collapse the launcher.
    EventUtils.synthesizeMouseAtCenter(splitter, { type: "mousedown" });
    EventUtils.synthesizeMouse(splitter, 250, 0, { type: "mousemove" });
    const releasedAt = launcherWidth();
    EventUtils.synthesizeMouse(splitter, 0, 0, { type: "mouseup" });
    await waitForRepaint();

    info(`Released at ${releasedAt}px, settled at ${launcherWidth()}px.`);
    Assert.equal(
      launcherWidth(),
      releasedAt,
      "A drag completed within a single turn isn't discarded."
    );
  });
});
