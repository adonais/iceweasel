/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/**
 * This test verifies that when maximized, any browser chrome decoration is removed
 * so that chrome blocks are flush against the window edges. Any corner touching a
 * window edge has its radius removed to eliminate non-interative pixels.
 * *inner* corners are left as-is (rounded in nova)
 *
 * Split-view panels are excluded from these assertions: in both pref states they
 * are deliberately inset cards that keep their inline margin and rounded
 * corners.
 */

const NOVA_ENABLED = Services.prefs.getBoolPref("browser.nova.enabled", false);

// Allow for sub-pixel rounding
const EDGE_TOLERANCE = 1;

function getCustomPropertyPx(win, el, name) {
  return parseFloat(win.getComputedStyle(el).getPropertyValue(name)) || 0;
}

/**
 * The nova chrome-block radius is platform-dependent. Get the actual value rather
 * than assuming a non-zero value, so the "corner stays rounded" assertions only run
 * when necessary.
 */
function getBlockRadius(win) {
  return getCustomPropertyPx(
    win,
    win.document.documentElement,
    "--chrome-block-radius"
  );
}

function getChromeBlocks(win, extraSelectors = "") {
  // although deeply nested inside #browser, the .browserContainer elements
  // are where borders and corners live, so we measure those.
  let selector = ".chrome-block, .browserContainer";
  if (extraSelectors) {
    selector += ", " + extraSelectors;
  }
  let els = new Set(win.document.querySelectorAll(selector));
  // Split-view panels are deliberately inset cards rather than window-edge
  // blocks; assertSplitViewPanels covers them instead.
  return [...els].filter(
    el => !el.closest(".split-view-panel") && BrowserTestUtils.isVisible(el)
  );
}

function blockLabel(el) {
  return el.id || el.className.toString().split(/\s+/)[0] || el.localName;
}

function assertFlushToWindowEdges(win, blocks, label) {
  let width = win.innerWidth;
  let height = win.innerHeight;
  let rects = blocks.map(b => b.getBoundingClientRect());

  let minLeft = Math.min(...rects.map(r => r.left));
  let minTop = Math.min(...rects.map(r => r.top));
  let maxRight = Math.max(...rects.map(r => r.right));
  let maxBottom = Math.max(...rects.map(r => r.bottom));

  Assert.equal(
    Math.floor(minLeft),
    0,
    `${label}: chrome reaches the inline-start window edge (got ${minLeft})`
  );
  Assert.equal(
    Math.floor(minTop),
    0,
    `${label}: chrome reaches the top window edge (got ${minTop})`
  );
  Assert.lessOrEqual(
    Math.abs(maxRight - width),
    EDGE_TOLERANCE,
    `${label}: chrome reaches the inline-end window edge (got ${maxRight}, want ${width})`
  );
  Assert.lessOrEqual(
    Math.abs(maxBottom - height),
    EDGE_TOLERANCE,
    `${label}: chrome reaches the bottom window edge (got ${maxBottom}, want ${height})`
  );
}

function getWindowEdges(win, el) {
  let rect = el.getBoundingClientRect();
  return {
    atLeft: Math.abs(rect.left) <= EDGE_TOLERANCE,
    atRight: Math.abs(rect.right - win.innerWidth) <= EDGE_TOLERANCE,
    atTop: Math.abs(rect.top) <= EDGE_TOLERANCE,
    atBottom: Math.abs(rect.bottom - win.innerHeight) <= EDGE_TOLERANCE,
  };
}

/**
 * A border drawn against a window edge would be a stray 1px line hugging the
 * screen, so every side of a block that meets a window edge must be
 * border-less.
 */
function assertEdgeBordersRemoved(win, blocks, label) {
  for (let block of blocks) {
    let edges = getWindowEdges(win, block);
    let style = win.getComputedStyle(block);
    let sides = [
      ["borderLeftWidth", edges.atLeft, "left"],
      ["borderRightWidth", edges.atRight, "right"],
      ["borderTopWidth", edges.atTop, "top"],
      ["borderBottomWidth", edges.atBottom, "bottom"],
    ];
    for (let [prop, atEdge, name] of sides) {
      if (atEdge) {
        Assert.equal(
          parseFloat(style[prop]) || 0,
          0,
          `${label}: ${blockLabel(block)} has no ${name} border (touches the window edge)`
        );
      }
    }
  }
}

/**
 * For every chrome block, a corner whose x sits on a vertical window edge OR
 * whose y sits on a horizontal window edge must be squared.
 * When Nova is enabled, require that inner corners keep a > 0 radius.
 */
function assertCornerRadii(win, blocks, { nova, requireInnerRounded }, label) {
  for (let block of blocks) {
    let style = win.getComputedStyle(block);
    let { atLeft, atRight, atTop, atBottom } = getWindowEdges(win, block);

    let corners = [
      {
        name: "top-left",
        prop: "borderTopLeftRadius",
        atEdge: atLeft || atTop,
      },
      {
        name: "top-right",
        prop: "borderTopRightRadius",
        atEdge: atRight || atTop,
      },
      {
        name: "bottom-left",
        prop: "borderBottomLeftRadius",
        atEdge: atLeft || atBottom,
      },
      {
        name: "bottom-right",
        prop: "borderBottomRightRadius",
        atEdge: atRight || atBottom,
      },
    ];

    let name = blockLabel(block);
    let innerRoundedCount = 0;
    for (let corner of corners) {
      let radius = parseFloat(style[corner.prop]) || 0;
      if (corner.atEdge) {
        Assert.equal(
          radius,
          0,
          `${label}: ${name} ${corner.name} is squared (touches the window edge)`
        );
      } else if (radius > 0) {
        innerRoundedCount++;
      }
    }

    // A .browserContainer with a sidebar/toolbox-facing inner corner should keep
    // it rounded under Nova. Only assert on the content area, and only when the
    // caller opts in.
    if (
      nova &&
      requireInnerRounded &&
      getBlockRadius(win) > 0 &&
      block.classList.contains("browserContainer")
    ) {
      let innerCorners = corners.filter(c => !c.atEdge).length;
      if (innerCorners) {
        Assert.greater(
          innerRoundedCount,
          0,
          `${label}: ${name} keeps at least one inner corner rounded`
        );
      }
    }
  }
}

function assertSeparatorBorder(win, blocks, label) {
  for (let block of blocks) {
    // Borders against a window edge are removed, so check the side that faces
    // the gap between blocks. The toolbox spans the top of the window and only
    // its block-end border survives, while the blocks below it keep their
    // block-start border.
    let isToolbox = block.id == "navigator-toolbox";
    let prop = isToolbox ? "borderBottomWidth" : "borderTopWidth";
    let width = parseFloat(win.getComputedStyle(block)[prop]) || 0;
    Assert.greater(
      width,
      0,
      `${label}: ${blockLabel(block)} keeps its separator border (${prop})`
    );
  }
}

const CORNER_RADIUS_PROPS = [
  "borderTopLeftRadius",
  "borderTopRightRadius",
  "borderBottomLeftRadius",
  "borderBottomRightRadius",
];

/**
 * Split-view panels are inset cards rather than window-edge blocks. In both
 * pref states they intentionally keep an inline margin and a fully rounded
 * .browserContainer (--border-radius-medium without nova,
 * --chrome-block-radius with it), so maximizing must not square those corners
 * or pull the panels flush against the window.
 */
function assertSplitViewPanels(win, label) {
  let tabpanels = win.document.getElementById("tabbrowser-tabpanels");
  let panels = [
    ...tabpanels.querySelectorAll(".split-view-panel.split-view-panel-active"),
  ].filter(el => BrowserTestUtils.isVisible(el));
  Assert.greater(panels.length, 0, `${label}: split-view panels are present`);

  // Only the inline-end margin is checked: with nova and a sidebar shown, the
  // inline-start panel deliberately drops its margin because the #browser gap
  // beside the sidebar already supplies the separation.
  let outer = tabpanels.getBoundingClientRect();
  let rects = panels.map(p => p.getBoundingClientRect());
  Assert.greater(
    outer.right - Math.max(...rects.map(r => r.right)),
    0,
    `${label}: panels keep their inline-end margin`
  );

  for (let panel of panels) {
    let container = panel.querySelector(".browserContainer");
    let style = win.getComputedStyle(container);
    let expected = NOVA_ENABLED
      ? getBlockRadius(win)
      : getCustomPropertyPx(win, container, "--border-radius-medium");
    for (let prop of CORNER_RADIUS_PROPS) {
      Assert.equal(
        parseFloat(style[prop]) || 0,
        expected,
        `${label}: panel ${prop} matches the unsplit block radius`
      );
    }
  }
}

/**
 * Runs the universal decoration assertions, plus the nova-only checks when
 * `browser.nova.enabled` is set. `requireInnerRounded` and `checkBorder` are
 * only meaningful under nova, and are further opt-in per state (split-view and
 * customize states skip the border check: the active split panel intentionally
 * has no border, using a focus outline instead).
 */
function assertDecoration(
  win,
  blocks,
  label,
  { requireInnerRounded = false, checkBorder = false } = {}
) {
  if (NOVA_ENABLED && requireInnerRounded && !getBlockRadius(win)) {
    info(
      `${label}: --chrome-block-radius is 0 on this platform; ` +
        `skipping the inner-corner-rounded assertions.`
    );
  }
  assertFlushToWindowEdges(win, blocks, label);
  assertEdgeBordersRemoved(win, blocks, label);
  assertCornerRadii(
    win,
    blocks,
    { nova: NOVA_ENABLED, requireInnerRounded },
    label
  );
  if (NOVA_ENABLED && checkBorder) {
    assertSeparatorBorder(win, blocks, label);
  }
}

const BASE_PREFS = [["sidebar.revamp", true]];

add_task(async function test_vertical_tabs_sidebar_start() {
  await withMaximizedWindow(
    {
      prefs: [
        ...BASE_PREFS,
        ["sidebar.verticalTabs", true],
        ["sidebar.position_start", true],
      ],
    },
    win => {
      let blocks = getChromeBlocks(win);
      assertDecoration(win, blocks, "vertical tabs, sidebar start", {
        requireInnerRounded: true,
        checkBorder: true,
      });
    }
  );
});

add_task(async function test_vertical_tabs_sidebar_end() {
  await withMaximizedWindow(
    {
      prefs: [
        ...BASE_PREFS,
        ["sidebar.verticalTabs", true],
        ["sidebar.position_start", false],
      ],
    },
    win => {
      let blocks = getChromeBlocks(win);
      assertDecoration(win, blocks, "vertical tabs, sidebar end", {
        requireInnerRounded: true,
        checkBorder: true,
      });
    }
  );
});

add_task(async function test_compact_density() {
  await withMaximizedWindow(
    {
      density: gUIDensity.MODE_COMPACT,
      prefs: [
        ...BASE_PREFS,
        ["sidebar.verticalTabs", true],
        ["sidebar.position_start", true],
      ],
    },
    win => {
      let blocks = getChromeBlocks(win);
      // Compact deliberately squares some inner corners, so don't require inner
      // corners to stay rounded here.
      assertDecoration(win, blocks, "compact density", { checkBorder: true });
    }
  );
});

add_task(async function test_horizontal_tabs() {
  await withMaximizedWindow(
    { prefs: [...BASE_PREFS, ["sidebar.verticalTabs", false]] },
    win => {
      let blocks = getChromeBlocks(win);
      assertDecoration(win, blocks, "horizontal tabs", { checkBorder: true });
    }
  );
});

add_task(async function test_private_window() {
  await withMaximizedWindow(
    {
      privateWindow: true,
      prefs: [
        ...BASE_PREFS,
        ["sidebar.verticalTabs", true],
        ["sidebar.position_start", true],
      ],
    },
    win => {
      let blocks = getChromeBlocks(win);
      assertDecoration(win, blocks, "private window", { checkBorder: true });
    }
  );
});

add_task(async function test_split_view() {
  await withMaximizedWindow(
    {
      prefs: [
        ...BASE_PREFS,
        ["sidebar.verticalTabs", true],
        ["browser.tabs.splitView.enabled", true],
      ],
    },
    async win => {
      if (typeof win.gBrowser.addTabSplitView != "function") {
        info("addTabSplitView unavailable; skipping split-view assertions.");
        ok(true, "split view API unavailable - skipped");
        return;
      }

      let tab1 = await BrowserTestUtils.openNewForegroundTab(
        win.gBrowser,
        "about:blank"
      );
      let tab2 = await BrowserTestUtils.openNewForegroundTab(
        win.gBrowser,
        "about:blank"
      );
      win.gBrowser.addTabSplitView([tab1, tab2]);
      await BrowserTestUtils.switchTab(win.gBrowser, tab1);

      let tabpanels = win.document.getElementById("tabbrowser-tabpanels");
      await BrowserTestUtils.waitForMutationCondition(
        tabpanels,
        { attributes: true, attributeFilter: ["splitview"] },
        () => tabpanels.hasAttribute("splitview")
      );
      await win.promiseDocumentFlushed(() => {});

      let blocks = getChromeBlocks(win);
      // The active split panel has no separator border (it uses a focus
      // outline), so skip the border check here.
      assertDecoration(win, blocks, "split view");
      assertSplitViewPanels(win, "split view");
    }
  );
});

add_task(async function test_customize_mode() {
  await withMaximizedWindow(
    { prefs: [...BASE_PREFS, ["sidebar.verticalTabs", true]] },
    async win => {
      let customizeDone = BrowserTestUtils.waitForEvent(
        win.gNavToolbox,
        "customizationready"
      );
      win.gCustomizeMode.enter();
      await customizeDone;
      await win.promiseDocumentFlushed(() => {});

      let blocks = getChromeBlocks(win, "#customization-container");
      assertDecoration(win, blocks, "customize mode");

      let afterExit = BrowserTestUtils.waitForEvent(
        win.gNavToolbox,
        "aftercustomization"
      );
      win.gCustomizeMode.exit();
      await afterExit;
    }
  );
});
