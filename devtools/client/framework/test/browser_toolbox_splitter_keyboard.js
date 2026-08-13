/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

// Test that the toolbox splitter is focusable and can be controlled with the arrow keys
// resolutions regardless of whether it has opened first.

const URL = "data:text/html;charset=utf8,test splitter keyboard control";

const { Toolbox } = require("resource://devtools/client/framework/toolbox.js");

add_task(async function () {
  // Set size prefs to something reasonable, so we can check to make sure
  // they are being set properly.
  const TOOLBOX_INITIAL_SIZE = 200;
  await pushPref("devtools.toolbox.footer.height", TOOLBOX_INITIAL_SIZE);
  await pushPref("devtools.toolbox.sidebar.width", TOOLBOX_INITIAL_SIZE);
  registerCleanupFunction(() => {
    Services.prefs.clearUserPref("devtools.toolbox.host");
  });

  const tab = await addTab(URL);
  const panel = gBrowser.getPanel();
  const toolbox = await gDevTools.showToolboxForTab(tab);

  const bottomIframe = panel.querySelector(".devtools-toolbox-bottom-iframe");
  is(
    bottomIframe.clientHeight,
    TOOLBOX_INITIAL_SIZE,
    "The bottom toolbox iframe has the expected height"
  );
  const horzSplitter = panel.querySelector(
    "splitter.devtools-horizontal-splitter"
  );

  Assert.equal(
    horzSplitter.getAttribute("role"),
    "separator",
    "The horizontal splitter has the separator role"
  );
  Assert.equal(
    horzSplitter.getAttribute("aria-controls"),
    bottomIframe.id,
    "The horizontal splitter's aria-controls attribute points to the toolbox"
  );

  info("Move focus to the content page");
  Services.focus.setFocus(gBrowser.selectedBrowser, Services.focus.FLAG_BYKEY);

  const onHorizontalSplitterFocused = BrowserTestUtils.waitForEvent(
    horzSplitter,
    "focus"
  );
  EventUtils.synthesizeKey("KEY_Tab", {}, horzSplitter.ownerGlobal);
  await onHorizontalSplitterFocused;
  ok("Horizontal splitter can be focused");

  const beforeHeight = bottomIframe.getBoundingClientRect().height;
  const horizontalSplitterBeforeValueNow =
    horzSplitter.getAttribute("aria-valuenow");

  is(
    Math.floor(Number(horizontalSplitterBeforeValueNow)),
    TOOLBOX_INITIAL_SIZE,
    "horizontal splitter aria-valuenow has the expected default value"
  );
  let cmdEventPromise = BrowserTestUtils.waitForEvent(horzSplitter, "command");
  info(
    `Before the arrow key, horizontal splitter aria-valuenow value: ${horizontalSplitterBeforeValueNow}, beforeWidth: ${beforeHeight}`
  );

  await EventUtils.synthesizeKey("KEY_ArrowDown");
  await cmdEventPromise;
  await waitFor(
    () =>
      horzSplitter.getAttribute("aria-valuenow") !=
      horizontalSplitterBeforeValueNow
  );

  info(
    `New horizontal splitter aria-valuenow value: ${horzSplitter.getAttribute("aria-valuenow")}`
  );

  const afterHeight = bottomIframe.getBoundingClientRect().height;
  Assert.greater(
    beforeHeight,
    afterHeight,
    "The bottom toolbox shrank when the horizontal splitter was moved"
  );
  Assert.equal(
    Math.floor(Number(horzSplitter.ariaValueNow)),
    Math.floor(afterHeight),
    "The horizontal splitter aria-valuenow attribute reflects the new height of the bottom toolbox"
  );
  Assert.ok(
    horzSplitter.ariaValueMin,
    "The horizontal splitter has the aria-valuemin attribute"
  );
  Assert.ok(
    horzSplitter.ariaValueMax,
    "The horizontal splitter has the aria-valuemax attribute"
  );

  info("Dock the toolbox to the side");
  await toolbox.switchHost(Toolbox.HostType.RIGHT);
  const sideIframe = panel.querySelector(".devtools-toolbox-side-iframe");
  sideIframe.style.minWidth = "1px"; // Disable the min width set in css
  is(
    sideIframe.clientWidth,
    TOOLBOX_INITIAL_SIZE,
    "The iframe is resized properly"
  );

  const sideSplitter = panel.querySelector(".devtools-side-splitter");

  Assert.equal(
    sideSplitter.getAttribute("role"),
    "separator",
    "The side splitter has the separator role"
  );
  Assert.equal(
    sideSplitter.getAttribute("aria-controls"),
    sideIframe.id,
    "The side splitter's aria-controls attribute points to the toolbox"
  );

  info("Move focus to the content page");
  Services.focus.setFocus(gBrowser.selectedBrowser, Services.focus.FLAG_BYKEY);

  const onSideSplitterFocused = BrowserTestUtils.waitForEvent(
    sideSplitter,
    "focus"
  );
  EventUtils.synthesizeKey("KEY_Tab", {}, sideSplitter.ownerGlobal);
  await onSideSplitterFocused;
  ok("Side splitter can be focused");

  const beforeWidth = sideIframe.getBoundingClientRect().width;
  const sideSplitterBeforeValueNow = await waitFor(() => {
    const flooredValue = Math.floor(
      Number(sideSplitter.getAttribute("aria-valuenow"))
    );
    if (flooredValue === 0 || Number.isNaN(flooredValue)) {
      return false;
    }
    return flooredValue;
  });

  is(
    sideSplitterBeforeValueNow,
    TOOLBOX_INITIAL_SIZE,
    "Side splitter aria-valuenow has the expected default value"
  );
  cmdEventPromise = BrowserTestUtils.waitForEvent(sideSplitter, "command");
  info(
    `Before the arrow key, side splitter aria-valuenow value: ${sideSplitterBeforeValueNow}, beforeWidth: ${beforeWidth}`
  );

  await EventUtils.synthesizeKey("KEY_ArrowLeft");
  await cmdEventPromise;
  await waitFor(
    () =>
      Math.floor(Number(sideSplitter.getAttribute("aria-valuenow"))) !=
      sideSplitterBeforeValueNow
  );

  info(
    `New side splitter aria-valuenow value: ${sideSplitter.getAttribute("aria-valuenow")}`
  );

  const afterWidth = sideIframe.getBoundingClientRect().width;
  Assert.less(
    beforeWidth,
    afterWidth,
    "The side toolbox expanded when the side splitter was moved"
  );
  Assert.equal(
    Math.floor(Number(sideSplitter.ariaValueNow)),
    Math.floor(afterWidth),
    "The side splitter aria-valuenow attribute reflects the new width of the side toolbox"
  );
  Assert.ok(
    sideSplitter.ariaValueMin,
    "The side splitter has the aria-valuemin attribute"
  );
  Assert.ok(
    sideSplitter.ariaValueMax,
    "The side splitter has the aria-valuemax attribute"
  );
});
