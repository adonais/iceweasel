/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { IPPUsageHelper, UsageStates } = ChromeUtils.importESModule(
  "moz-src:///browser/components/ipprotection/IPPUsageHelper.sys.mjs"
);

const { BANDWIDTH } = ChromeUtils.importESModule(
  "chrome://browser/content/ipprotection/ipprotection-constants.mjs"
);

// Populate IPPProxyManager.usageInfo so that new windows can read bandwidth
// data when initializing their panel. Without this, usageInfo is null because
// no previous test has gone through the real proxy start flow.
add_setup(async function () {
  await IPPProxyManager.refreshUsage();
});

/**
 * Fires an IPPProxyManager:UsageChanged event with the given remaining/max bytes
 * and waits for IPPUsageHelper to process it.
 *
 * @param {number} remaining - Remaining bytes.
 * @param {number} max - Maximum bytes.
 */
async function fireUsageChanged(remaining, max) {
  const usage = new ProxyUsage(
    String(max),
    String(remaining),
    "2026-12-31T00:00:00.000Z"
  );
  let stateChangedPromise = BrowserTestUtils.waitForEvent(
    IPPUsageHelper,
    "IPPUsageHelper:StateChanged"
  );
  IPPProxyManager.dispatchEvent(
    new CustomEvent("IPPProxyManager:UsageChanged", {
      bubbles: true,
      composed: true,
      detail: { usage },
    })
  );
  await stateChangedPromise;
}

/**
 * Tests that a bandwidth warning triggered in one window is reflected in a
 * newly opened regular window.
 */
add_task(async function test_bandwidth_warning_set_in_new_window() {
  const maxBytes = BANDWIDTH.MAX_IN_GB * BANDWIDTH.BYTES_IN_GB;
  // 25% remaining triggers WARNING_75_PERCENT
  const remainingWarning = maxBytes * BANDWIDTH.SECOND_THRESHOLD;

  await fireUsageChanged(remainingWarning, maxBytes);

  Assert.equal(
    IPPUsageHelper.state,
    UsageStates.WARNING_75_PERCENT,
    "IPPUsageHelper should be in WARNING_75_PERCENT state"
  );

  let newWindow = await BrowserTestUtils.openNewBrowserWindow();

  let content = await openPanel({ unauthenticated: false }, newWindow);

  Assert.ok(
    content.state.bandwidthWarning,
    "bandwidth warning should be set in new window after UsageChanged event"
  );

  let messageBar = content.shadowRoot.querySelector("ipprotection-message-bar");
  Assert.ok(
    messageBar,
    "bandwidth warning message bar should be visible in new window"
  );

  await closePanel(newWindow);
  await BrowserTestUtils.closeWindow(newWindow);

  // Reset IPPUsageHelper state
  await fireUsageChanged(maxBytes, maxBytes);

  Assert.equal(
    IPPUsageHelper.state,
    UsageStates.NONE,
    "IPPUsageHelper should be reset to NONE state"
  );
});

/**
 * Tests that a bandwidth warning triggered in one window is reflected in a
 * newly opened private window.
 */
add_task(async function test_bandwidth_warning_set_in_new_private_window() {
  const maxBytes = BANDWIDTH.MAX_IN_GB * BANDWIDTH.BYTES_IN_GB;
  // 10% remaining triggers WARNING_90_PERCENT
  const remainingWarning = maxBytes * BANDWIDTH.THIRD_THRESHOLD;

  await fireUsageChanged(remainingWarning, maxBytes);

  Assert.equal(
    IPPUsageHelper.state,
    UsageStates.WARNING_90_PERCENT,
    "IPPUsageHelper should be in WARNING_90_PERCENT state"
  );

  let privateWindow = await BrowserTestUtils.openNewBrowserWindow({
    private: true,
  });

  let content = await openPanel({ unauthenticated: false }, privateWindow);

  Assert.ok(
    content.state.bandwidthWarning,
    "bandwidth warning should be set in new private window after UsageChanged event"
  );

  let messageBar = content.shadowRoot.querySelector("ipprotection-message-bar");
  Assert.ok(
    messageBar,
    "bandwidth warning message bar should be visible in new private window"
  );

  await closePanel(privateWindow);
  await BrowserTestUtils.closeWindow(privateWindow);

  // Reset IPPUsageHelper state
  await fireUsageChanged(maxBytes, maxBytes);

  Assert.equal(
    IPPUsageHelper.state,
    UsageStates.NONE,
    "IPPUsageHelper should be reset to NONE state"
  );
});
