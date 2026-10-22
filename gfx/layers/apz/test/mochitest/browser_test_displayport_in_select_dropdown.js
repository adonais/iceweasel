/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

Services.scriptloader.loadSubScript(
  "chrome://mochikit/content/tests/SimpleTest/paint_listener.js",
  this
);

Services.scriptloader.loadSubScript(
  new URL("apz_test_utils.js", gTestPath).href,
  this
);

/* import-globals-from helper_browser_test_utils.js */
// For openSelectPopup and hideSelectPopup.
Services.scriptloader.loadSubScript(
  new URL("helper_browser_test_utils.js", gTestPath).href,
  this
);

// Cleanup for paint_listener.js.
add_task(() => {
  registerCleanupFunction(() => {
    delete window.waitForAllPaintsFlushed;
    delete window.waitForAllPaints;
    delete window.promiseAllPaintsDone;
  });
});

// Setup preferences.
add_task(async () => {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["apz.popups.enabled", true],
      ["apz.popups_without_remote.enabled", true],
      ["apz.test.logging_enabled", true],
    ],
  });
});

const LONG_SELECT_OPTION_COUNT = 300;

function httpURL(filename) {
  const chromeURL = getRootDirectory(gTestPath) + filename;
  return chromeURL.replace(
    "chrome://mochitests/content/",
    "http://mochi.test:8888/"
  );
}

/**
 * Returns the displayport for aScroller (a scollbox in aPopup) for every recorded
 * paint, as an array of {sequenceNumber, displayport}.
 */
function getScrollerDisplayportsPerPaint(aPopup, aScroller) {
  const utils = SpecialPowers.getDOMWindowUtils(aPopup.documentGlobal);
  const scrollId = utils.getViewId(aScroller);
  const raw = utils.getContentAPZTestData(aPopup);
  if (!raw) {
    return [];
  }
  const converted = convertTestData(raw);
  const perPaint = [];
  for (const bucket of raw.paints) {
    const scrollFrame = converted.paints[bucket.sequenceNumber]?.[scrollId];
    if (scrollFrame && "displayport" in scrollFrame) {
      perPaint.push({
        sequenceNumber: bucket.sequenceNumber,
        displayport: parseRect(scrollFrame.displayport),
      });
    }
  }
  return perPaint;
}

/**
 * Describes which edges of the scroll port fall outside the displayport.
 */
function edgesNotCovered(aDisplayport, aScroller) {
  // apz_test_utils' parseRect() yields rounded integers, so we allow for a
  // 1px tolerance.
  const tolerance = 1;
  const width = aScroller.clientWidth;
  const height = aScroller.clientHeight;

  const missing = [];
  if (aDisplayport.x > tolerance) {
    missing.push(`left by ${aDisplayport.x}px`);
  }
  if (aDisplayport.y > tolerance) {
    missing.push(`top by ${aDisplayport.y}px`);
  }
  if (aDisplayport.x + aDisplayport.width < width - tolerance) {
    missing.push(`right by ${width - (aDisplayport.x + aDisplayport.width)}px`);
  }
  if (aDisplayport.y + aDisplayport.height < height - tolerance) {
    missing.push(
      `bottom by ${height - (aDisplayport.y + aDisplayport.height)}px`
    );
  }
  return missing.join(", ");
}

async function openDropdownAndMeasure(aBrowser, aSelectId, aSelectedIndex) {
  // openSelectPopup() synthesizes alt+ArrowDown, which is delivered to the
  // focused element of the focused window, so the window has to be focused
  // before the select is. Without this the dropdown intermittently fails to
  // open at all and the test times out.
  await SimpleTest.promiseFocus(window);
  await SpecialPowers.spawn(
    aBrowser,
    [aSelectId, aSelectedIndex],
    async (selectId, selectedIndex) => {
      const select = content.document.getElementById(selectId);
      select.selectedIndex = selectedIndex;
      // Only wait for a focus event if the select is not already focused.
      if (content.document.activeElement != select) {
        const focusPromise = new Promise(resolve => {
          select.addEventListener("focus", resolve, { once: true });
        });
        select.focus();
        await focusPromise;
      }
    }
  );

  const popup = await openSelectPopup(`#${aSelectId}`);
  await ensureApzReadyForPopup(popup);
  await promiseApzFlushedRepaints(popup);

  const arrowscrollbox = popup.shadowRoot.querySelector("arrowscrollbox");
  const scroller = arrowscrollbox.shadowRoot.querySelector("scrollbox");

  // Judge the last recorded paint, whose geometry is the settled geometry the
  // scroll port is measured against. Earlier paints can legitimately have a
  // smaller displayport, because the popup was still growing when they
  // happened, and comparing those against the final scroll port would report a
  // shortfall that the user never sees. A displayport that fails to cover is
  // not transient anyway.  Nothing fixes it until an unrelated repaint,
  // so it is still short when painting has settled.
  const paints = getScrollerDisplayportsPerPaint(popup, scroller);
  const lastPaint = paints[paints.length - 1];
  const result = {
    scrollPortHeight: scroller.clientHeight,
    scrollTop: scroller.scrollTop,
    scrollTopMax: scroller.scrollTopMax,
    // For diagnosis when the assertion below fails.
    allPaints: paints
      .map(
        dp =>
          `paint ${dp.sequenceNumber} (${dp.displayport.x},${dp.displayport.y},` +
          `${dp.displayport.width},${dp.displayport.height})`
      )
      .join(", "),
    edgesNotCovered: lastPaint
      ? edgesNotCovered(lastPaint.displayport, scroller)
      : "no displayport at all",
  };

  await hideSelectPopup("escape");

  return result;
}

/**
 * A dropdown opened after a shorter one, in the same window, must still have
 * its whole scroll port covered by its displayport.
 */
add_task(async () => {
  const tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    httpURL("helper_bug2041504_select.html")
  );

  await SpecialPowers.spawn(tab.linkedBrowser, [], async () => {
    await content.wrappedJSObject.promiseApzFlushedRepaints();
    await content.wrappedJSObject.waitUntilApzStable();
  });

  const short = await openDropdownAndMeasure(tab.linkedBrowser, "short", 0);
  const long = await openDropdownAndMeasure(tab.linkedBrowser, "long", 0);

  // The bug is only visible when the second dropdown is substantially taller
  // than the first, since the displayport margins absorb a small difference.
  // Fail if the window is too small for that.
  ok(
    long.scrollPortHeight > short.scrollPortHeight * 3,
    `the long dropdown's scroll port (${long.scrollPortHeight}px) should be ` +
      `much taller than the short one's (${short.scrollPortHeight}px)`
  );

  is(
    long.edgesNotCovered,
    "",
    "a dropdown opened after a shorter one should have its whole scroll " +
      `port (${long.scrollPortHeight}px) covered by its displayport ` +
      `[${long.allPaints}]`
  );

  BrowserTestUtils.removeTab(tab);
});

/**
 * The same, for a dropdown that opens already scrolled: selecting an option
 * near the end of the list makes nsMenuPopupFrame::LayoutPopup() scroll it
 * into view via EnsureActiveMenuListItemIsVisible() before the popup is first
 * painted.
 */
add_task(async () => {
  const tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    httpURL("helper_bug2041504_select.html")
  );

  await SpecialPowers.spawn(tab.linkedBrowser, [], async () => {
    await content.wrappedJSObject.promiseApzFlushedRepaints();
    await content.wrappedJSObject.waitUntilApzStable();
  });

  await openDropdownAndMeasure(tab.linkedBrowser, "short", 0);
  const long = await openDropdownAndMeasure(
    tab.linkedBrowser,
    "long",
    LONG_SELECT_OPTION_COUNT - 1
  );

  ok(long.scrollTop > 0, `the dropdown should have opened scrolled`);
  is(
    long.edgesNotCovered,
    "",
    "a dropdown that opens scrolled to the end of its range should have its " +
      `whole scroll port (${long.scrollPortHeight}px) covered by its ` +
      `displayport [${long.allPaints}]`
  );

  BrowserTestUtils.removeTab(tab);
});
