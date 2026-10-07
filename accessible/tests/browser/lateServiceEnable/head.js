/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* exported shutdownAccService */

// These tests need to control precisely when the accessibility service is
// created, so prevent common.js from instantiating it as a side effect of
// being loaded here.
window.gDisableAccServiceInit = true;

Services.scriptloader.loadSubScript(
  "chrome://mochitests/content/browser/accessible/tests/browser/shared-head.js",
  this
);

loadScripts(
  { name: "common.js", dir: MOCHITESTS_DIR },
  { name: "events.js", dir: MOCHITESTS_DIR },
  { name: "role.js", dir: MOCHITESTS_DIR }
);

delete window.gDisableAccServiceInit;

const { CommonUtils } = ChromeUtils.importESModule(
  "chrome://mochitests/content/browser/accessible/tests/browser/Common.sys.mjs"
);

async function shutdownAccService() {
  if (!Services.appinfo.accessibilityEnabled) {
    return;
  }
  CommonUtils.addAccServiceShutdownObserver();
  gAccService = null;
  forceGC();
  await CommonUtils.observeAccServiceShutdown();
  ok(!Services.appinfo.accessibilityEnabled, "a11y disabled");
}

registerCleanupFunction(shutdownAccService);
