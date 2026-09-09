/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/**
 * With accessibility.force_disabled=-1 set before startup, the platform
 * accessibility engine should already be running by the time this test
 * starts, without any test code having requested it, and it should actually
 * be functional rather than merely reporting itself as running.
 */
add_task(async function testForceEnabledAtStartup() {
  ok(
    Services.appinfo.accessibilityEnabled,
    "Accessibility is enabled at startup because it is force enabled"
  );

  // Listen for an event directly via the observer service, without calling
  // any function on the accessibility service, so the test itself doesn't
  // instantiate it via XPCOM. Do this before the checks below, which do use
  // the service.
  const eventPromise = new Promise(resolve => {
    const observer = {
      observe() {
        // We don't actually care what event it is, as long as we get one.
        Services.obs.removeObserver(observer, "accessible-event");
        resolve();
      },
    };
    Services.obs.addObserver(observer, "accessible-event");
  });

  // Open a new tab so we can be sure we will get an accessibility event.
  const tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "https://example.com/"
  );
  await eventPromise;
  ok(true, "An accessible event fired for the new tab's document");
  BrowserTestUtils.removeTab(tab);

  const accService = Cc["@mozilla.org/accessibilityService;1"].getService(
    Ci.nsIAccessibilityService
  );
  const consumers = JSON.parse(accService.getConsumers());
  ok(
    consumers.PlatformAPI,
    "Accessibility was started for the PlatformAPI consumer, not just XPCOM"
  );
});
