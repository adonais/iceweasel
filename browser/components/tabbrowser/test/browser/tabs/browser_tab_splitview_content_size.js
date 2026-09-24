/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Selecting one panel of a split view must not resize either panel's content
// area. Decoration that distinguishes the selected panel from the non-selected
// one has to be drawn without taking up layout space, otherwise every
// selection change reflows both documents (bug 2051212).

// Give the document enough width- and height-dependent layout that resizing it
// has real work to do, so that an optimization which skips reflow for a trivial
// document could not quietly invalidate this test.
const PAGE =
  "data:text/html," +
  encodeURIComponent(
    "<!DOCTYPE html><title>Split view panel</title>" +
      '<div style="width:50%;height:50vh"></div>' +
      "<p>" +
      "Text that must be laid out again whenever the viewport changes. ".repeat(
        10
      ) +
      "</p>"
  );
const STOP_COUNTING = "TestStopCountingReflows";

registerCleanupFunction(() => {
  Services.prefs.clearUserPref("browser.tabs.splitview.hasUsed");
});

/**
 * Content area dimensions of a split view panel, measured both from the parent
 * process and from within the document itself.
 *
 * @param {MozTabbrowserTab} tab
 * @returns {Promise<object>}
 */
async function getContentDimensions(tab) {
  const browser = tab.linkedBrowser;
  await window.promiseDocumentFlushed(() => {});
  const { width, height } = browser.getBoundingClientRect();
  const inner = await SpecialPowers.spawn(browser, [], async () => {
    // Let a pending resize reach the document before measuring it.
    await new Promise(resolve =>
      content.requestAnimationFrame(() =>
        content.requestAnimationFrame(resolve)
      )
    );
    return { width: content.innerWidth, height: content.innerHeight };
  });
  return {
    browserWidth: width,
    browserHeight: height,
    innerWidth: inner.width,
    innerHeight: inner.height,
  };
}

/**
 * Counts reflows of each tab's document while a task runs in the parent
 * process. Interruptible reflows count too: a reflow caused by the content
 * area changing size is dispatched from a refresh driver tick, so it arrives
 * as an interruptible one.
 *
 * @param {MozTabbrowserTab[]} tabs
 * @param {Function} task
 * @returns {Promise<number[]>} Reflow count per tab, in the order given.
 */
async function countReflowsDuring(tabs, task) {
  const counts = tabs.map(tab =>
    SpecialPowers.spawn(tab.linkedBrowser, [STOP_COUNTING], async topic => {
      let reflows = 0;
      const observer = {
        reflow: () => reflows++,
        reflowInterruptible: () => reflows++,
        QueryInterface: ChromeUtils.generateQI([
          "nsIReflowObserver",
          "nsISupportsWeakReference",
        ]),
      };
      // The docshell holds the observer weakly, so it has to stay referenced
      // by this frame until the parent process says to stop.
      content.docShell.addWeakReflowObserver(observer);
      await new Promise(resolve =>
        content.addEventListener(topic, resolve, { once: true }, true)
      );
      // A reflow provoked by the task may still be pending.
      await new Promise(resolve =>
        content.requestAnimationFrame(() =>
          content.requestAnimationFrame(resolve)
        )
      );
      content.docShell.removeWeakReflowObserver(observer);
      return reflows;
    })
  );

  // Messages to a content process are ordered, so this round trip cannot
  // resolve before the observers above have been registered.
  await Promise.all(
    tabs.map(tab => SpecialPowers.spawn(tab.linkedBrowser, [], () => {}))
  );

  await task();

  await window.promiseDocumentFlushed(() => {});
  await Promise.all(
    tabs.map(tab =>
      SpecialPowers.spawn(tab.linkedBrowser, [STOP_COUNTING], topic => {
        content.dispatchEvent(new content.Event(topic));
      })
    )
  );
  return Promise.all(counts);
}

/**
 * Whether a panel's content area draws a visible edge, by either mechanism.
 *
 * @param {MozTabbrowserTab} tab
 * @returns {boolean}
 */
function hasSeparator(tab) {
  const container = tab.linkedBrowser.closest(".browserContainer");
  const style = getComputedStyle(container);
  const outlined =
    style.outlineStyle != "none" && parseFloat(style.outlineWidth) > 0;
  const bordered = ["Top", "Right", "Bottom", "Left"].every(
    side => parseFloat(style[`border${side}Width`]) > 0
  );
  return outlined || bordered;
}

add_task(async function test_selecting_a_panel_does_not_resize_content() {
  await SpecialPowers.pushPrefEnv({ set: [["browser.nova.enabled", true]] });

  const tab1 = BrowserTestUtils.addTab(gBrowser, PAGE);
  const tab2 = BrowserTestUtils.addTab(gBrowser, PAGE);
  await Promise.all([
    BrowserTestUtils.browserLoaded(tab1.linkedBrowser),
    BrowserTestUtils.browserLoaded(tab2.linkedBrowser),
  ]);

  await withSplitView(tab1, tab2, async () => {
    const panel1 = document.getElementById(tab1.linkedPanel);
    const panel2 = document.getElementById(tab2.linkedPanel);
    Assert.ok(
      panel1.classList.contains("deck-selected"),
      "First panel is selected."
    );

    const metrics1 = await getContentDimensions(tab1);
    const metrics2 = await getContentDimensions(tab2);
    Assert.greater(
      metrics1.innerWidth,
      0,
      "First panel has a laid out document."
    );
    Assert.greater(
      metrics2.innerWidth,
      0,
      "Second panel has a laid out document."
    );

    info("Select the second panel.");
    let [reflows1, reflows2] = await countReflowsDuring([tab1, tab2], () =>
      BrowserTestUtils.switchTab(gBrowser, tab2)
    );
    Assert.ok(
      panel2.classList.contains("deck-selected"),
      "Second panel is selected."
    );
    Assert.equal(
      reflows1,
      0,
      "Deselecting the first panel did not reflow its document."
    );
    Assert.equal(
      reflows2,
      0,
      "Selecting the second panel did not reflow its document."
    );
    Assert.deepEqual(
      await getContentDimensions(tab1),
      metrics1,
      "First panel's content area is unchanged after being deselected."
    );
    Assert.deepEqual(
      await getContentDimensions(tab2),
      metrics2,
      "Second panel's content area is unchanged after being selected."
    );
    Assert.ok(
      hasSeparator(tab1),
      "Deselected panel still draws a separator around its content area."
    );

    info("Select the first panel again.");
    [reflows1, reflows2] = await countReflowsDuring([tab1, tab2], () =>
      BrowserTestUtils.switchTab(gBrowser, tab1)
    );
    Assert.equal(
      reflows1,
      0,
      "Reselecting the first panel did not reflow its document."
    );
    Assert.equal(
      reflows2,
      0,
      "Deselecting the second panel did not reflow its document."
    );
    Assert.deepEqual(
      await getContentDimensions(tab1),
      metrics1,
      "First panel's content area is unchanged after being reselected."
    );
    Assert.deepEqual(
      await getContentDimensions(tab2),
      metrics2,
      "Second panel's content area is unchanged after being deselected."
    );
    Assert.ok(
      hasSeparator(tab2),
      "Deselected panel still draws a separator around its content area."
    );
  });
});
