/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

// Tests that getPanelWhenReady returns the correct panel in promise
// resolutions regardless of whether it has opened first.

const URL = "data:text/html;charset=utf8,test for host sizes";

const { Toolbox } = require("resource://devtools/client/framework/toolbox.js");

add_task(async function () {
  // Set size prefs to make the hosts way too big, so that the size has
  // to be clamped to fit into the browser window.
  Services.prefs.setIntPref("devtools.toolbox.footer.height", 10000);
  Services.prefs.setIntPref("devtools.toolbox.sidebar.width", 10000);

  const tab = await addTab(URL);
  const panel = gBrowser.getPanel();
  const browserContainer = panel.querySelector(".browserContainer");
  const {
    clientHeight: browserContainerHeight,
    clientWidth: browserContainerWidth,
  } = browserContainer;
  const toolbox = await gDevTools.showToolboxForTab(tab);

  is(
    browserContainer.clientHeight,
    browserContainerHeight,
    "Opening the toolbox hasn't changed the height of the browserContainer"
  );
  is(
    browserContainer.clientWidth,
    browserContainerWidth,
    "Opening the toolbox hasn't changed the width of the browserContainer"
  );

  let iframe = panel.querySelector(".devtools-toolbox-iframe.bottom-host");
  const minContentSize = parseFloat(
    panel.documentGlobal
      .getComputedStyle(panel)
      .getPropertyValue("--content-area-min-size")
  );
  is(
    iframe.getBoundingClientRect().height,
    browserContainerHeight - minContentSize,
    "The iframe fits within the available space"
  );

  // The max-height is set in a ResizeObserver callback, so we need to wait for the style
  // to be set before manually setting the height
  await waitFor(() => iframe.style.maxHeight);
  iframe.style.height = "10000px"; // Set height to something unreasonably large.
  Assert.less(
    iframe.getBoundingClientRect().height,
    browserContainerHeight,
    `The iframe fits within the available space (${iframe.getBoundingClientRect().height} < ${browserContainerHeight})`
  );

  await toolbox.switchHost(Toolbox.HostType.RIGHT);
  iframe = panel.querySelector(".devtools-toolbox-iframe.side-host");
  iframe.style.minWidth = "1px"; // Disable the min width set in css
  is(
    iframe.getBoundingClientRect().width,
    browserContainerWidth - minContentSize,
    "The iframe fits within the available space"
  );

  // The max-width is set in a ResizeObserver callback, so we need to wait for the style
  // to be set before manually setting the width
  await waitFor(() => iframe.style.maxWidth);
  const oldWidth = iframe.style.width;
  iframe.style.width = "10000px"; // Set width to something unreasonably large.
  Assert.less(
    iframe.getBoundingClientRect().width,
    browserContainerWidth,
    `The iframe fits within the available space (${iframe.getBoundingClientRect().width} < ${browserContainerWidth})`
  );
  iframe.style.width = oldWidth;

  // on shutdown, the sidebar width will be set to the clientWidth of the iframe
  const expectedWidth = iframe.getBoundingClientRect().width;

  info("waiting for cleanup");
  await cleanup(toolbox);
  // Wait until the toolbox-host-manager was destroyed and updated the preferences
  // to avoid side effects in the next test.
  await waitUntil(() => {
    const savedWidth = Services.prefs.getIntPref(
      "devtools.toolbox.sidebar.width"
    );
    info(`waiting for saved pref: ${savedWidth}, ${expectedWidth}`);
    return savedWidth === expectedWidth;
  });
});

add_task(async function () {
  // Set size prefs to something reasonable, so we can check to make sure
  // they are being set properly.
  Services.prefs.setIntPref("devtools.toolbox.footer.height", 100);
  Services.prefs.setIntPref("devtools.toolbox.sidebar.width", 100);

  const tab = await addTab(URL);
  const panel = gBrowser.getPanel();
  const { clientHeight: panelHeight, clientWidth: panelWidth } = panel;
  const toolbox = await gDevTools.showToolboxForTab(tab);

  is(
    panel.clientHeight,
    panelHeight,
    "Opening the toolbox hasn't changed the height of the panel"
  );
  is(
    panel.clientWidth,
    panelWidth,
    "Opening the toolbox hasn't changed the width of the panel"
  );

  let iframe = panel.querySelector(".devtools-toolbox-iframe.bottom-host");
  is(
    iframe.getBoundingClientRect().height,
    100,
    "The iframe is resized properly"
  );
  const horzSplitter = panel.querySelector(
    ".devtools-toolbox-splitter.for-bottom-host"
  );
  dragElement(horzSplitter, { startX: 1, startY: 1, deltaX: 0, deltaY: -50 });
  is(
    iframe.getBoundingClientRect().height,
    150,
    "The iframe was resized by the splitter"
  );

  await toolbox.switchHost(Toolbox.HostType.RIGHT);
  iframe = panel.querySelector(".devtools-toolbox-iframe.side-host");
  iframe.style.minWidth = "1px"; // Disable the min width set in css
  is(
    iframe.getBoundingClientRect().width,
    100,
    "The iframe is resized properly"
  );

  info("Resize the toolbox manually by 50 pixels");
  const sideSplitter = panel.querySelector(
    ".devtools-toolbox-splitter.for-side-host"
  );
  dragElement(sideSplitter, { startX: 1, startY: 1, deltaX: -50, deltaY: 0 });
  is(
    iframe.getBoundingClientRect().width,
    150,
    "The iframe was resized by the splitter"
  );

  await cleanup(toolbox);
});

function dragElement(el, { startX, startY, deltaX, deltaY }) {
  const endX = startX + deltaX;
  const endY = startY + deltaY;
  EventUtils.synthesizeMouse(el, startX, startY, { type: "mousedown" }, window);
  EventUtils.synthesizeMouse(el, endX, endY, { type: "mousemove" }, window);
  EventUtils.synthesizeMouse(el, endX, endY, { type: "mouseup" }, window);
}

async function cleanup(toolbox) {
  Services.prefs.clearUserPref("devtools.toolbox.host");
  Services.prefs.clearUserPref("devtools.toolbox.footer.height");
  Services.prefs.clearUserPref("devtools.toolbox.sidebar.width");
  await toolbox.destroy();
  gBrowser.removeCurrentTab();
}
