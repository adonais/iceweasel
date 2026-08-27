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
  // Prevent the RDM reload notification to be displayed so it doesn't impact the test
  await pushPref("devtools.responsive.reloadNotification.enabled", false);

  const tab = await addTab(URL);
  // Open a split view for the test so the notifications, as in such case notifications
  // are placed inside .browserContainer and will impact the available height for the toolbox.
  const otherTab = await addTab(URL);
  await BrowserTestUtils.switchTab(gBrowser, tab);
  gBrowser.addTabSplitView([tab, otherTab], {
    insertBefore: tab,
  });

  const panel = gBrowser.getPanel();
  const toolbox = await gDevTools.showToolboxForTab(tab);

  const bottomIframe = panel.querySelector(
    ".devtools-toolbox-iframe.bottom-host"
  );
  is(
    bottomIframe.getBoundingClientRect().height,
    TOOLBOX_INITIAL_SIZE,
    "The bottom toolbox iframe has the expected height"
  );
  const horzSplitter = panel.querySelector(
    "splitter.devtools-toolbox-splitter.for-bottom-host"
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

  // Wait for the initial calls that sets the aria-valuemax attribute
  await waitFor(() => horzSplitter.ariaValueMax);
  let previousAriaValueMax = horzSplitter.ariaValueMax;

  info("Show Find in page toolbar");
  {
    await gFindBarPromise;
    gFindBar.open();
    await waitFor(() => horzSplitter.ariaValueMax !== previousAriaValueMax);
    Assert.less(
      parseFloat(horzSplitter.ariaValueMax),
      parseFloat(previousAriaValueMax),
      "aria-valuemax is smaller now, as showing the findbar reduced available vertical space"
    );
  }

  info("Show RDM");
  {
    previousAriaValueMax = horzSplitter.ariaValueMax;
    await openRDM(tab);
    await waitFor(() => horzSplitter.ariaValueMax !== previousAriaValueMax);
    Assert.less(
      parseFloat(horzSplitter.ariaValueMax),
      parseFloat(previousAriaValueMax),
      "aria-valuemax is smaller now, as showing RDM reduced available vertical space"
    );
  }

  info("Show notification");
  previousAriaValueMax = horzSplitter.ariaValueMax;
  const notificationBox = gBrowser.getNotificationBox(tab.linkedBrowser);
  const notification = await notificationBox.appendNotification(
    "dt-test",
    {
      label: "Test for DevTools",
      image: "chrome://global/skin/icons/blocked.svg",
      priority: notificationBox.PRIORITY_CRITICAL_HIGH,
    },
    []
  );
  await waitFor(() => horzSplitter.ariaValueMax !== previousAriaValueMax);
  Assert.less(
    parseFloat(horzSplitter.ariaValueMax),
    parseFloat(previousAriaValueMax),
    "aria-valuemax is smaller now, as showing the findbar reduced available vertical space"
  );

  info("Hide RDM");
  {
    previousAriaValueMax = horzSplitter.ariaValueMax;
    await closeRDM(tab);
    await waitFor(() => horzSplitter.ariaValueMax !== previousAriaValueMax);
    Assert.greater(
      parseFloat(horzSplitter.ariaValueMax),
      parseFloat(previousAriaValueMax),
      "aria-valuemax is bigger now, as hiding RDM gave us more vertical space"
    );
  }

  info("Hide notification");
  {
    previousAriaValueMax = horzSplitter.ariaValueMax;
    notification.close();
    await waitFor(() => horzSplitter.ariaValueMax !== previousAriaValueMax);
    Assert.greater(
      parseFloat(horzSplitter.ariaValueMax),
      parseFloat(previousAriaValueMax),
      "aria-valuemax is bigger now, as hiding the notification gave us more vertical space"
    );
  }

  info("Hide find in page toolbar");
  {
    previousAriaValueMax = horzSplitter.ariaValueMax;
    const onFindBarClosePromise = BrowserTestUtils.waitForEvent(
      gBrowser,
      "findbarclose"
    );
    gFindBar.close(
      // by default, the findbar closing has an animation.
      // The `findbarclose` is emitted before the animation ends, meaning the elements
      // inside the findbar are still focusable for a bit, which might impact the
      // rest of the test.
      // So close without animation so we don't have to wait for the animation to end
      true
    );
    await onFindBarClosePromise;
    await waitFor(() => horzSplitter.ariaValueMax !== previousAriaValueMax);
    Assert.greater(
      parseFloat(horzSplitter.ariaValueMax),
      parseFloat(previousAriaValueMax),
      "aria-valuemax is bigger now, as hiding the findbar gave us more vertical space"
    );
  }

  info("Move focus to the content page");
  Services.focus.setFocus(tab.linkedBrowser, Services.focus.FLAG_BYKEY);

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
  const sideIframe = panel.querySelector(".devtools-toolbox-iframe.side-host");
  sideIframe.style.minWidth = "1px"; // Disable the min width set in css
  is(
    sideIframe.getBoundingClientRect().width,
    TOOLBOX_INITIAL_SIZE,
    "The iframe is resized properly"
  );

  const sideSplitter = panel.querySelector(
    ".devtools-toolbox-splitter.for-side-host"
  );

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

  info("Remove right tab on the split view");
  // Wait for the initial ResizeObserver callback to set the aria-valuemax attribute
  await waitFor(() => sideSplitter.ariaValueMax);
  previousAriaValueMax = sideSplitter.ariaValueMax;
  await removeTab(otherTab);
  await waitFor(() => sideSplitter.ariaValueMax !== previousAriaValueMax);
  Assert.greater(
    parseFloat(sideSplitter.ariaValueMax),
    parseFloat(previousAriaValueMax),
    "aria-valuemax is larger now as closing the split view gave us more available space"
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
