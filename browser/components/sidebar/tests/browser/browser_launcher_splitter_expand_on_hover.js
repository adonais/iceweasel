/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/**
 * With expand-on-hover enabled and the launcher collapsed, the launcher
 * splitter must sit at the launcher's trailing edge and resize the launcher by
 * the distance it is dragged.
 */

const HOVER_DELAY_PREF = "sidebar.animation.expand-on-hover.delay-duration-ms";
const NOVA_PREF = "browser.nova.enabled";
const UIDENSITY_PREF = "browser.uidensity";

const MODE_NORMAL = 0;
const MODE_COMPACT = 1;
const MODE_TOUCH = 2;

const DENSITY_ATTRIBUTE = {
  [MODE_NORMAL]: null,
  [MODE_COMPACT]: "compact",
  [MODE_TOUCH]: "touch",
};

// Enough to clear LAUNCHER_MINIMUM_WIDTH (100) from any collapsed width, so the
// drag isn't snapped back to collapsed when it ends.
const DRAG_DISTANCE = 200;

// The splitter is deliberately pulled over the launcher's trailing edge by a
// negative margin, so its centre lands a few px either side of that edge.
const SPLITTER_EDGE_TOLERANCE = 10;

// Sub-pixel rounding in the launcher width.
const WIDTH_TOLERANCE = 2;

/**
 * Clear any launcher width carried over from an earlier task. Sidebar state is
 * persisted, so a new window would otherwise open with the launcher already
 * expanded to the width the previous drag left behind.
 *
 * @param {ChromeWindow} win
 */
function resetLauncherWidth(win) {
  const { _state: state, sidebarContainer } = win.SidebarController;
  state.launcherExpanded = false;
  state.expandedLauncherWidth = undefined;
  sidebarContainer.style.width = "";
  sidebarContainer.removeAttribute("width");
}

/**
 * Open a window with expand-on-hover enabled in the requested configuration,
 * run a task against it, then tear it all down.
 *
 * @param {object} options
 * @param {boolean} [options.nova] Enable Nova chrome.
 * @param {number} [options.density] One of MODE_NORMAL/COMPACT/TOUCH.
 * @param {boolean} [options.rtl] Use an RTL locale.
 * @param {boolean} [options.positionEnd] Put the sidebar on the inline-end side.
 * @param {Function} taskFn Called with the window once it is ready.
 */
async function withExpandOnHoverWindow(
  { nova = true, density = MODE_NORMAL, rtl = false, positionEnd = false },
  taskFn
) {
  if (rtl) {
    await BrowserTestUtils.enableRtlLocale();
  }
  await SpecialPowers.pushPrefEnv({
    set: [
      [NOVA_PREF, nova],
      ["sidebar.revamp", true],
      [VERTICAL_TABS_PREF, true],
      [SIDEBAR_VISIBILITY_PREF, "expand-on-hover"],
      [POSITION_SETTING_PREF, !positionEnd],
      [UIDENSITY_PREF, density],
      ["browser.compactmode.show", true],
      ["sidebar.animation.enabled", false],
      // Keep hovering the splitter from expanding the launcher mid-drag, which
      // would otherwise look like a successful resize.
      [HOVER_DELAY_PREF, 100000],
    ],
  });

  const win = await BrowserTestUtils.openNewBrowserWindow();
  try {
    win.gUIDensity.update();
    await SidebarTestUtils.waitForInitialized(win);
    await SidebarTestUtils.waitForTabstripOrientation(win, "vertical");

    Assert.equal(
      win.document.documentElement.getAttribute("uidensity"),
      DENSITY_ATTRIBUTE[density],
      `Window is in the requested density (${density})`
    );

    await BrowserTestUtils.waitForMutationCondition(
      win.document.documentElement,
      { attributes: true, attributeFilter: ["sidebar-expand-on-hover"] },
      () =>
        win.document.documentElement.hasAttribute("sidebar-expand-on-hover"),
      { msg: "Waiting for expand-on-hover to be applied" }
    );

    await SidebarTestUtils.ensureLauncherVisible(win);
    resetLauncherWidth(win);
    await win.SidebarController.waitUntilStable();
    await win.promiseDocumentFlushed(() => {});

    await taskFn(win);
  } finally {
    await BrowserTestUtils.closeWindow(win);
    await SpecialPowers.popPrefEnv();
    if (rtl) {
      await BrowserTestUtils.disableRtlLocale();
      // Switching to the bidi pseudo-locale leaves this behind, which the
      // harness reports as a leaked pref change.
      Services.prefs.clearUserPref("bidi.browser.ui");
    }
  }
}

/**
 * Which side of #browser the launcher is docked against.
 *
 * @param {ChromeWindow} win
 * @returns {{atStart: boolean, trailingEdge: number}}
 */
function getLauncherDocking(win) {
  const launcher =
    win.SidebarController.sidebarContainer.getBoundingClientRect();
  const browserRect = win.document
    .getElementById("browser")
    .getBoundingClientRect();
  const atStart =
    launcher.left - browserRect.left <= browserRect.right - launcher.right;
  return { atStart, trailingEdge: atStart ? launcher.right : launcher.left };
}

function assertSplitterAtLauncherEdge(win, label) {
  const splitter = win.document
    .getElementById("sidebar-launcher-splitter")
    .getBoundingClientRect();
  const { atStart, trailingEdge } = getLauncherDocking(win);
  const splitterCentre = (splitter.left + splitter.right) / 2;

  info(
    `${label}: launcher docked at inline-${atStart ? "start" : "end"}, ` +
      `trailing edge ${trailingEdge.toFixed(1)}, ` +
      `splitter centre ${splitterCentre.toFixed(1)}`
  );
  Assert.lessOrEqual(
    Math.abs(splitterCentre - trailingEdge),
    SPLITTER_EDGE_TOLERANCE,
    `${label}: splitter sits on the launcher's trailing edge ` +
      `(centre ${splitterCentre.toFixed(1)}, edge ${trailingEdge.toFixed(1)})`
  );
}

/**
 * The splitter has to be reachable with the mouse, not merely laid out in the
 * right place. BrowserTestUtils.isVisible() only looks at `display`,
 * `visibility` and ancestors, so it happily passes a splitter positioned off
 * the edge of the window or buried under the launcher.
 *
 * @param {ChromeWindow} win
 * @param {string} label
 */
function assertSplitterIsHitTestable(win, label) {
  const splitter = win.document.getElementById("sidebar-launcher-splitter");
  const rect = splitter.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;

  Assert.ok(
    x >= 0 && x <= win.innerWidth && y >= 0 && y <= win.innerHeight,
    `${label}: splitter centre (${x.toFixed(1)}, ${y.toFixed(1)}) is inside ` +
      `the window (${win.innerWidth}x${win.innerHeight})`
  );

  const hit = win.document.elementFromPoint(x, y);
  const hitLabel = hit ? hit.id || hit.localName : "nothing";
  Assert.ok(
    hit && (hit == splitter || splitter.contains(hit)),
    `${label}: splitter is the topmost element at its centre (hit ${hitLabel})`
  );
}

/**
 * Drag the launcher splitter outwards by `growBy` px using window-absolute
 * coordinates, so the drag doesn't chase the splitter as the launcher resizes.
 *
 * @param {ChromeWindow} win
 * @param {number} growBy Distance to widen the launcher by.
 */
async function dragLauncherSplitter(win, growBy) {
  AccessibilityUtils.setEnv({ mustHaveAccessibleRule: false });
  try {
    const root = win.document.documentElement;
    const splitter = win.document.getElementById("sidebar-launcher-splitter");
    const rect = splitter.getBoundingClientRect();
    const { atStart } = getLauncherDocking(win);
    // Widening the launcher means moving the splitter away from the edge the
    // launcher is docked against.
    const delta = atStart ? growBy : -growBy;
    const x0 = rect.left + rect.width / 2;
    const y0 = rect.top + rect.height / 2;

    EventUtils.synthesizeMouse(root, x0, y0, { type: "mousedown" }, win);
    const steps = 10;
    for (let i = 1; i <= steps; i++) {
      EventUtils.synthesizeMouse(
        root,
        x0 + (delta * i) / steps,
        y0,
        { type: "mousemove" },
        win
      );
      await new Promise(r => win.requestAnimationFrame(r));
    }
    EventUtils.synthesizeMouse(root, x0 + delta, y0, { type: "mouseup" }, win);

    await win.SidebarController.waitUntilStable();
    await win.promiseDocumentFlushed(() => {});
  } finally {
    AccessibilityUtils.resetEnv();
  }
}

/**
 * Verify the splitter is reachable and dragging it resizes the launcher by the
 * drag distance.
 *
 * @param {ChromeWindow} win
 * @param {string} label
 */
async function assertLauncherIsResizable(win, label) {
  const launcher = win.SidebarController.sidebarContainer;

  Assert.ok(
    !win.SidebarController._state.launcherExpanded,
    `${label}: launcher starts collapsed`
  );
  assertSplitterAtLauncherEdge(win, label);
  assertSplitterIsHitTestable(win, label);

  const before = launcher.getBoundingClientRect().width;
  await dragLauncherSplitter(win, DRAG_DISTANCE);
  const after = launcher.getBoundingClientRect().width;

  info(
    `${label}: launcher width ${before.toFixed(1)} -> ${after.toFixed(1)} ` +
      `(expected ${(before + DRAG_DISTANCE).toFixed(1)})`
  );
  Assert.lessOrEqual(
    Math.abs(after - (before + DRAG_DISTANCE)),
    WIDTH_TOLERANCE,
    `${label}: dragging the splitter ${DRAG_DISTANCE}px widened the launcher ` +
      `by ${DRAG_DISTANCE}px (got ${(after - before).toFixed(1)}px)`
  );
}

add_task(async function test_normal_density() {
  await withExpandOnHoverWindow({}, win =>
    assertLauncherIsResizable(win, "normal density")
  );
});

add_task(async function test_compact_density() {
  await withExpandOnHoverWindow({ density: MODE_COMPACT }, win =>
    assertLauncherIsResizable(win, "compact density")
  );
});

add_task(async function test_touch_density() {
  await withExpandOnHoverWindow({ density: MODE_TOUCH }, win =>
    assertLauncherIsResizable(win, "touch density")
  );
});

add_task(async function test_rtl() {
  await withExpandOnHoverWindow({ rtl: true }, win =>
    assertLauncherIsResizable(win, "RTL")
  );
});

add_task(async function test_sidebar_position_end() {
  await withExpandOnHoverWindow({ positionEnd: true }, win =>
    assertLauncherIsResizable(win, "sidebar position end")
  );
});

add_task(async function test_rtl_position_end() {
  await withExpandOnHoverWindow({ rtl: true, positionEnd: true }, win =>
    assertLauncherIsResizable(win, "RTL, sidebar position end")
  );
});

// Control case: verify the same behaviour without Nova
add_task(async function test_without_nova() {
  await withExpandOnHoverWindow({ nova: false }, win =>
    assertLauncherIsResizable(win, "nova disabled")
  );
});
