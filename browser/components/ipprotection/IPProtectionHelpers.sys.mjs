/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Note: If you add or modify the list of helpers, make sure to update the
 * corresponding documentation in the `docs` folder as well.
 */

import { IPProtectionActivator } from "moz-src:///toolkit/components/ipprotection/IPProtectionActivator.sys.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  IPPExceptionsManager:
    "moz-src:///toolkit/components/ipprotection/IPPExceptionsManager.sys.mjs",
  IPProtection:
    "moz-src:///browser/components/ipprotection/IPProtection.sys.mjs",
  IPProtectionService:
    "moz-src:///toolkit/components/ipprotection/IPProtectionService.sys.mjs",
  IPProtectionStates:
    "moz-src:///toolkit/components/ipprotection/IPProtectionService.sys.mjs",
});

import { IPPUsageHelper } from "moz-src:///browser/components/ipprotection/IPPUsageHelper.sys.mjs";
import { IPPOnboardingMessage } from "moz-src:///browser/components/ipprotection/IPPOnboardingMessageHelper.sys.mjs";
import { IPPOptOutHelper } from "moz-src:///browser/components/ipprotection/IPPOptOutHelper.sys.mjs";
import { IPProtectionAlertManager } from "moz-src:///browser/components/ipprotection/IPProtectionAlertManager.sys.mjs";
import { IPProtectionInfobarManager } from "moz-src:///browser/components/ipprotection/IPProtectionInfobarManager.sys.mjs";

/**
 * This simple class controls the UI activation/deactivation.
 */
class UIHelper {
  constructor() {
    this.handleEvent = this.#handleEvent.bind(this);
  }

  init() {
    lazy.IPProtectionService.addEventListener(
      "IPProtectionService:StateChanged",
      this.handleEvent
    );
  }

  initOnStartupCompleted() {}

  uninit() {
    lazy.IPProtectionService.removeEventListener(
      "IPProtectionService:StateChanged",
      this.handleEvent
    );
    lazy.IPProtection.uninit();
    lazy.IPPExceptionsManager.uninit();
  }

  #handleEvent(_event) {
    const state = lazy.IPProtectionService.state;

    if (
      !lazy.IPProtection.isInitialized &&
      state !== lazy.IPProtectionStates.UNINITIALIZED &&
      state !== lazy.IPProtectionStates.UNAVAILABLE
    ) {
      lazy.IPProtection.init();
      lazy.IPPExceptionsManager.init();
    }

    if (
      lazy.IPProtection.isInitialized &&
      (state === lazy.IPProtectionStates.UNINITIALIZED ||
        state === lazy.IPProtectionStates.UNAVAILABLE)
    ) {
      lazy.IPProtection.uninit();
      lazy.IPPExceptionsManager.uninit();
    }
  }
}

IPProtectionActivator.addHelpers([
  IPPOnboardingMessage,
  IPPUsageHelper,
  new UIHelper(),
  IPPOptOutHelper,
  IPProtectionAlertManager,
  IPProtectionInfobarManager,
]);

export { IPProtectionActivator };
