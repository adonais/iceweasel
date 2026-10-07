/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

Services.scriptloader.loadSubScript(
  "chrome://mochitests/content/browser/devtools/client/shared/test/shared-head.js",
  this
);

// LocalizationHelper comes from shared-head.js.
const COMPONENTS_L10N = new LocalizationHelper(
  "devtools/client/locales/components.properties"
);

const TEST_URI = "data:text/html;charset=utf-8,Test page";

// Keep in sync with KEYBOARD_RESIZE_STEP in SplitBox.js.
const STEP = 5;
const INITIAL_PANEL_SIZE = 300;

/**
 * The debugger mounts two split boxes one inside the other: the outer one
 * controls its end panel, the inner one its start panel, so a single toolbox
 * covers both directions the splitter can be dragged in.
 *
 * @param {Document} doc
 *        The debugger panel's document.
 * @return {object}
 *         An object with a `start` and an `end` property, one per split box,
 *         each holding the split box element, its splitter, the panel that
 *         splitter sizes, the `minSize` prop the consumer passes in pixels and
 *         its `maxSize` prop as a ratio of the split box's width.
 */
function getSplitBoxes(doc) {
  const endBox = doc.querySelector(".debugger > .split-box");
  const startBox = endBox.querySelector(":scope > .uncontrolled > .split-box");
  return {
    end: {
      name: "secondary panes",
      box: endBox,
      splitter: endBox.querySelector(":scope > .splitter"),
      panel: endBox.querySelector(":scope > .controlled"),
      minSize: 30,
      maxRatio: 0.7,
    },
    start: {
      name: "sources",
      box: startBox,
      splitter: startBox.querySelector(":scope > .splitter"),
      panel: startBox.querySelector(":scope > .controlled"),
      minSize: 30,
      maxRatio: 0.85,
    },
  };
}

function checkSemantics({ name, splitter }) {
  is(
    splitter.getAttribute("role"),
    "separator",
    `The ${name} splitter has the separator role`
  );
  is(
    splitter.getAttribute("aria-orientation"),
    "horizontal",
    `The ${name} splitter separates horizontally laid out panels`
  );
  is(
    splitter.getAttribute("tabindex"),
    "0",
    `The ${name} splitter is in the tab order`
  );
  is(
    splitter.getAttribute("aria-label"),
    COMPONENTS_L10N.getStr("splitter.label"),
    `The ${name} splitter has an accessible name`
  );
}

async function checkAriaValues({
  name,
  box,
  splitter,
  panel,
  minSize,
  maxRatio,
}) {
  // The values are set from a ResizeObserver, so they may not be there yet.
  await waitFor(
    () => splitter.hasAttribute("aria-valuenow"),
    `The ${name} splitter reports a position`
  );
  is(
    splitter.getAttribute("aria-valuenow"),
    String(Math.round(panel.getBoundingClientRect().width)),
    `The ${name} splitter's aria-valuenow is the width of the panel it sizes`
  );
  is(
    splitter.getAttribute("aria-valuemin"),
    String(minSize),
    `The ${name} splitter's aria-valuemin is its minSize prop`
  );
  is(
    splitter.getAttribute("aria-valuemax"),
    String(Math.round(maxRatio * box.getBoundingClientRect().width)),
    `The ${name} splitter's aria-valuemax resolves its percentage maxSize prop`
  );
  Assert.deepEqual(
    splitter.ariaControlsElements,
    [panel],
    `The ${name} splitter controls the panel it sizes`
  );
}

async function waitForReportedRange({ name, box, splitter, maxRatio }) {
  await waitFor(
    () =>
      splitter.getAttribute("aria-valuemax") ==
      String(Math.round(maxRatio * box.getBoundingClientRect().width)),
    `The ${name} splitter's reported range caught up with the split box`
  );
}

/**
 * Press an arrow key on a focused splitter and check that the panel it sizes
 * and the reported position move together.
 *
 * @param {string} key
 *        An EventUtils key name, e.g. "KEY_ArrowLeft".
 * @param {object} splitBox
 *        One of the objects `getSplitBoxes` returns.
 * @return {number}
 *         How many pixels the panel's width changed by.
 */
async function pressArrow(key, { name, splitter, panel }) {
  const before = panel.getBoundingClientRect().width;
  const valueNowBefore = splitter.getAttribute("aria-valuenow");

  EventUtils.synthesizeKey(key, {}, splitter.ownerGlobal);
  await waitFor(
    () => splitter.getAttribute("aria-valuenow") != valueNowBefore,
    `The ${name} splitter moved on ${key}`
  );

  const after = panel.getBoundingClientRect().width;
  is(
    splitter.getAttribute("aria-valuenow"),
    String(Math.round(after)),
    `The ${name} splitter's aria-valuenow follows the panel it sizes`
  );
  return after - before;
}

add_task(async function testKeyboardResize() {
  await pushPref("devtools.debugger.start-panel-size", INITIAL_PANEL_SIZE);
  await pushPref("devtools.debugger.end-panel-size", INITIAL_PANEL_SIZE);
  await pushPref("devtools.debugger.start-panel-collapsed", false);
  await pushPref("devtools.debugger.end-panel-collapsed", false);

  const toolbox = await openNewTabAndToolbox(TEST_URI, "jsdebugger");
  const doc = toolbox.getPanel("jsdebugger").panelWin.document;
  const { start, end } = getSplitBoxes(doc);

  for (const splitBox of [start, end]) {
    checkSemantics(splitBox);
    await checkAriaValues(splitBox);
    is(
      Math.round(splitBox.panel.getBoundingClientRect().width),
      INITIAL_PANEL_SIZE,
      `The ${splitBox.name} panel starts at the size its preference holds`
    );

    splitBox.splitter.focus();
    is(
      doc.activeElement,
      splitBox.splitter,
      `The ${splitBox.name} splitter can take focus`
    );
  }

  info("Move the splitter which sizes the panel on its start side");
  start.splitter.focus();
  is(
    Math.round(await pressArrow("KEY_ArrowRight", start)),
    STEP,
    "ArrowRight grew the sources pane, which is on the splitter's start side"
  );
  is(
    Math.round(await pressArrow("KEY_ArrowLeft", start)),
    -STEP,
    "ArrowLeft shrank the sources pane again"
  );

  info("Move the splitter which sizes the panel on its end side");
  end.splitter.focus();
  is(
    Math.round(await pressArrow("KEY_ArrowLeft", end)),
    STEP,
    "ArrowLeft grew the secondary panes, which are on the splitter's end side"
  );
  is(
    Math.round(await pressArrow("KEY_ArrowRight", end)),
    -STEP,
    "ArrowRight shrank the secondary panes again"
  );

  info("The arrows across a vertical splitter do not move it");
  for (const key of ["KEY_ArrowUp", "KEY_ArrowDown"]) {
    const width = end.panel.getBoundingClientRect().width;
    const valueNow = end.splitter.getAttribute("aria-valuenow");
    EventUtils.synthesizeKey(key, {}, end.splitter.ownerGlobal);
    await waitForTick();
    is(
      end.panel.getBoundingClientRect().width,
      width,
      `${key} left the secondary panes' width alone`
    );
    is(
      end.splitter.getAttribute("aria-valuenow"),
      valueNow,
      `${key} left the reported position alone`
    );
  }

  info("The size a keyboard resize settles on is persisted on key up");
  start.splitter.focus();
  await pressArrow("KEY_ArrowLeft", start);
  is(
    Services.prefs.getIntPref("devtools.debugger.start-panel-size"),
    Math.round(start.panel.getBoundingClientRect().width),
    "The sources pane's new width was written to its preference"
  );

  await closeTabAndToolbox();
});

add_task(async function testWindowResizeUpdatesAriaValues() {
  const toolbox = await openNewTabAndToolbox(TEST_URI, "jsdebugger");
  const doc = toolbox.getPanel("jsdebugger").panelWin.document;
  // Narrowing the window puts the debugger in its vertical layout, which turns
  // the outer split box's splitter horizontal: that splitter's range is then a
  // share of the split box's height. The sources splitter stays vertical
  // whatever the debugger's layout, so it is the one checked here.
  const { start } = getSplitBoxes(doc);

  const originalWidth = window.outerWidth;
  const originalHeight = window.outerHeight;
  registerCleanupFunction(() => window.resizeTo(originalWidth, originalHeight));

  await checkAriaValues(start);
  const valueMaxBefore = Number(start.splitter.getAttribute("aria-valuemax"));

  info("Narrow the window");
  const widthBefore = start.box.getBoundingClientRect().width;
  window.resizeTo(Math.round(originalWidth / 2), originalHeight);
  await waitFor(
    () => start.box.getBoundingClientRect().width != widthBefore,
    "The window resize reached the split box"
  );
  await waitForReportedRange(start);
  await checkAriaValues(start);
  Assert.less(
    Number(start.splitter.getAttribute("aria-valuemax")),
    valueMaxBefore,
    "The sources splitter reports a smaller range in a narrower window"
  );

  await closeTabAndToolbox();
});

add_task(async function testSplitterWhichResizesNothing() {
  await pushPref("devtools.debugger.start-panel-collapsed", true);

  const toolbox = await openNewTabAndToolbox(TEST_URI, "jsdebugger");
  const doc = toolbox.getPanel("jsdebugger").panelWin.document;
  const { start } = getSplitBoxes(doc);
  const { splitter } = start;

  is(
    splitter.getAttribute("role"),
    "separator",
    "A splitter with a collapsed panel beside it is still a separator"
  );
  is(
    splitter.getAttribute("aria-orientation"),
    "horizontal",
    "A splitter with a collapsed panel beside it still reports its orientation"
  );
  ok(
    !splitter.hasAttribute("tabindex"),
    "A splitter which resizes nothing takes no tab stop"
  );
  ok(
    !splitter.hasAttribute("aria-label"),
    "A splitter which resizes nothing is not named as a resizing control"
  );
  for (const name of ["aria-valuenow", "aria-valuemin", "aria-valuemax"]) {
    ok(
      !splitter.hasAttribute(name),
      `A splitter which resizes nothing has no ${name}`
    );
  }
  ok(
    !splitter.ariaControlsElements,
    "A splitter which resizes nothing controls nothing"
  );

  await closeTabAndToolbox();
});
