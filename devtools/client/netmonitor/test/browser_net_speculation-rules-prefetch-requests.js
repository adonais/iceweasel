/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at <http://mozilla.org/MPL/2.0/>. */

"use strict";

/**
 * Assert the display of speculation rules prefetch requests in the network monitor.
 */

add_task(async function () {
  await pushPref("dom.speculation_rules.enabled", true);
  const TEST_URL = HTTPS_EXAMPLE_URL + "html_speculation-rules.html";
  const { tab, monitor } = await initNetMonitor(TEST_URL, {
    requestCount: 2,
  });
  info("Starting test... ");

  const { document, store, windowRequire } = monitor.panelWin;
  const Actions = windowRequire("devtools/client/netmonitor/src/actions/index");
  store.dispatch(Actions.batchEnable(false));

  // Wait for all the requests to be made and displayed in the network monitor.
  const waitForNetworkEventsPromise = waitForNetworkEvents(monitor, 2);
  tab.linkedBrowser.reload();
  await waitForNetworkEventsPromise;

  // Assert that the prefetch request is displayed in the network monitor.
  const requestItems = document.querySelectorAll(".request-list-item");
  is(
    requestItems[1].querySelector(".requests-list-file").innerText,
    "html_speculation-rules_subpage.html",
    "The second request should be a prefetch request of the subpage."
  );
});
