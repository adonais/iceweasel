/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from ../head.js */

"use strict";

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.urlbar.trustPanel.featureGate", false]],
  });
});

add_task(async function capture() {
  if (!shouldCapture()) {
    return;
  }
  registerCleanupFunction(async () => {
    // The ControlCenter configurations set every site permission for
    // test1.example.com, and unblock tracking.example.org.
    let principal =
      Services.scriptSecurityManager.createContentPrincipalFromOrigin(
        "https://test1.example.com"
      );
    await new Promise(resolve =>
      Services.clearData.deleteDataFromPrincipal(
        principal,
        false,
        Ci.nsIClearDataService.CLEAR_PERMISSIONS,
        resolve
      )
    );
    Services.perms.removeFromPrincipal(
      Services.scriptSecurityManager.createContentPrincipalFromOrigin(
        "https://tracking.example.org"
      ),
      "trackingprotection"
    );
  });
  let sets = ["LightweightThemes", "ControlCenter"];

  await TestRunner.start(sets, "controlCenter");
});
