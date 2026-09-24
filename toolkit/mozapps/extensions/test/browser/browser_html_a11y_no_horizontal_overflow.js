/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Regression test for bug 2059864: on high page zoom levels the about:addons page
// should not get an horizontal scrollbar.

const ZOOM_LEVELS_TO_TEST = [1, 2, 3, 4];

function checkNoElementOverflow(win, selector, containerSelector, label) {
  for (const el of win.document.querySelectorAll(selector)) {
    const container = el.closest(containerSelector);
    const elWidth = el.getBoundingClientRect().width;
    const containerWidth = container.getBoundingClientRect().width;
    // Allow small difference due to subpixel rounding.
    Assert.lessOrEqual(
      Math.round(elWidth),
      Math.round(containerWidth) + 1,
      `${label}: ${selector} fits within its ${containerSelector} container ` +
        `(element=${elWidth}, container=${containerWidth})`
    );
  }
}

const VIEWS_TO_TEST = [
  { type: "extension", label: "extension list view" },
  {
    type: "theme",
    label: "theme list view",
    extraCheck: (win, label) =>
      checkNoElementOverflow(win, ".card-heading-image", ".card.addon", label),
  },
];

async function setZoom(browser, zoom) {
  browser.fullZoom = zoom;
  await TestUtils.waitForCondition(
    () => browser.fullZoom === zoom,
    `Waiting for fullZoom to become ${zoom}`
  );
}

function waitForReflow(win) {
  return new Promise(resolve => {
    win.requestAnimationFrame(() => win.requestAnimationFrame(resolve));
  });
}

function checkNoHorizontalOverflow(win, label) {
  const { scrollWidth, clientWidth } = win.document.documentElement;
  Assert.lessOrEqual(
    scrollWidth,
    clientWidth,
    `${label}: no horizontal overflow (scrollWidth=${scrollWidth}, clientWidth=${clientWidth})`
  );
}

add_task(async function test_no_horizontal_overflow_when_zoomed() {
  for (const { type, label, extraCheck } of VIEWS_TO_TEST) {
    info(`Checking ${label}`);
    let win = await loadInitialView(type);
    let browser = gBrowser.selectedBrowser;
    let initialZoom = browser.fullZoom;

    try {
      for (const zoom of ZOOM_LEVELS_TO_TEST) {
        await setZoom(browser, zoom);
        await waitForReflow(win);
        let zoomLabel = `${label} at ${Math.round(zoom * 100)}% zoom`;
        checkNoHorizontalOverflow(win, zoomLabel);
        extraCheck?.(win, zoomLabel);
      }
    } finally {
      await setZoom(browser, initialZoom);
      await closeView(win);
    }
  }
});
