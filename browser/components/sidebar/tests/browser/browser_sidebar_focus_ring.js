/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

add_setup(async () => {
  await SpecialPowers.pushPrefEnv({
    set: [
      [VERTICAL_TABS_PREF, true],
      [SIDEBAR_VISIBILITY_PREF, "always-show"],
      ["browser.ml.chat.enabled", true],
      ["sidebar.main.tools", "aichat,syncedtabs,history,bookmarks"],
    ],
  });
  await SidebarTestUtils.waitForTabstripOrientation(window, "vertical");
});

/**
 * How far outside its border box a button paints its focus indicator.
 *
 * @param {Element} background The moz-button's .button-background element.
 * @returns {number} Distance in CSS pixels, never negative.
 */
function focusRingReach(background) {
  const style = window.getComputedStyle(background);
  return Math.max(
    0,
    parseFloat(style.outlineOffset) + parseFloat(style.outlineWidth)
  );
}

function inflate(rect, by) {
  return {
    top: rect.top - by,
    bottom: rect.bottom + by,
    left: rect.left - by,
    right: rect.right + by,
  };
}

/**
 * Ancestors of a button that clip painting, each paired with the rect it clips
 * to once its overflow-clip-margin is taken into account.
 *
 * @param {Element} button
 * @returns {Array<{element: Element, rect: object}>}
 */
function clippingAncestors(button) {
  const clippers = [];
  for (let el = button.parentElement; el; el = el.parentElement) {
    const style = window.getComputedStyle(el);
    if (style.overflowX == "visible" && style.overflowY == "visible") {
      continue;
    }
    clippers.push({
      element: el,
      rect: inflate(
        el.getBoundingClientRect(),
        parseFloat(style.overflowClipMargin) || 0
      ),
    });
  }
  return clippers;
}

/**
 * Assert that nothing between a button and the sidebar root clips its focus
 * indicator. Compares geometry rather than painted pixels, so it holds whether
 * or not the button currently matches :focus-visible.
 *
 * @param {Element} button A moz-button in the sidebar launcher.
 * @param {string} description Identifies the launcher state under test.
 */
function assertFocusRingNotClipped(button, description) {
  const background = button.shadowRoot.querySelector(".button-background");
  const ring = inflate(
    background.getBoundingClientRect(),
    focusRingReach(background)
  );
  const label = button.getAttribute("view") || button.className || "button";

  for (const { element, rect } of clippingAncestors(button)) {
    const name = element.className || element.localName;
    const slack = {
      top: ring.top - rect.top,
      bottom: rect.bottom - ring.bottom,
      left: ring.left - rect.left,
      right: rect.right - ring.right,
    };
    for (const [edge, value] of Object.entries(slack)) {
      Assert.greaterOrEqual(
        Math.round(value),
        0,
        `${description}: focus indicator for ${label} is not clipped at the ${edge} by ${name}.`
      );
    }
  }
}

async function assertLauncherFocusRings(expanded) {
  const sidebarMain = SidebarController.sidebarMain;
  sidebarMain.expanded = expanded;
  await sidebarMain.updateComplete;
  await waitForRepaint();

  const description = `${expanded ? "Expanded" : "Collapsed"} launcher`;
  const buttons = [...sidebarMain.allButtons].filter(button =>
    BrowserTestUtils.isVisible(button)
  );
  Assert.greater(buttons.length, 0, `${description}: launcher has buttons.`);

  for (const button of buttons) {
    assertFocusRingNotClipped(button, description);
  }
}

// The expanded launcher lays its buttons out horizontally, with the row flush
// against the top of a clipping container. See bug 2049659.
add_task(async function test_focus_ring_expanded() {
  await assertLauncherFocusRings(true);
});

add_task(async function test_focus_ring_collapsed() {
  await assertLauncherFocusRings(false);
});
