/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/**
 * Test that WS connection created while the page is still loading
 * is properly tracked and there are WS frames displayed in the
 * Messages side panel.
 */
add_task(async function () {
  const { monitor } = await initNetMonitor(SIMPLE_URL, { requestCount: 1 });

  info("Starting test... ");

  const { document, store, windowRequire } = monitor.panelWin;
  const Actions = windowRequire("devtools/client/netmonitor/src/actions/index");

  store.dispatch(Actions.batchEnable(false));

  // Make the WS Messages side panel the default so, we avoid
  // request headers from the backend by selecting the Headers
  // panel
  store.dispatch(Actions.selectDetailsPanelTab("response"));

  // Load page that opens WS connection during the load time.
  const waitForEvents = waitForNetworkEvents(monitor, 3);
  await navigateTo(WS_PAGE_EARLY_CONNECTION_URL);
  await waitForEvents;

  const requests = document.querySelectorAll(
    ".request-list-item .requests-list-file"
  );
  is(requests.length, 3, "There should be three requests");

  // Get index of the WS connection request.
  const index = Array.from(requests).findIndex(element => {
    return element.textContent === "file_ws_early_backend";
  });

  Assert.notStrictEqual(index, -1, "There must be one WS connection request");

  // Select the connection request to see WS frames in the side panel.
  EventUtils.sendMouseEvent({ type: "mousedown" }, requests[index]);

  info("Waiting for WS frames...");

  // Wait for all frames to be displayed in the panel.
  await waitForDOM(
    document,
    "#messages-view .message-list-table .message-list-item",
    3
  );

  const frames = document.querySelectorAll(
    "#messages-view .message-list-table .message-list-item"
  );

  const hasFrame = (payload, type) =>
    Array.from(frames).some(
      frame =>
        frame.querySelector(".message-list-payload").textContent.trim() ===
          payload && frame.classList.contains(type)
    );

  ok(hasFrame("early server frame", "received"), "The early frame is received");
  ok(hasFrame("readyState:loading", "sent"), "The client frame is sent");
  ok(
    hasFrame("readyState:loading", "received"),
    "The echoed frame is received"
  );

  await teardown(monitor);
});
