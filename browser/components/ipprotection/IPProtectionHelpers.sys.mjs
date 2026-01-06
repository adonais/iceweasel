/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Note: If you add or modify the list of helpers, make sure to update the
 * corresponding documentation in the `docs` folder as well.
 */

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  IPPExceptionsManager:
    "resource:///modules/ipprotection/IPPExceptionsManager.sys.mjs",
  IPProtection: "resource:///modules/ipprotection/IPProtection.sys.mjs",
  IPProtectionService:
    "resource:///modules/ipprotection/IPProtectionService.sys.mjs",
  IPProtectionStates:
    "resource:///modules/ipprotection/IPProtectionService.sys.mjs",
});

import { IPPProxyManager } from "resource:///modules/ipprotection/IPPProxyManager.sys.mjs";
import { IPPAutoStartHelpers } from "resource:///modules/ipprotection/IPPAutoStart.sys.mjs";
import { IPPEnrollAndEntitleManager } from "resource:///modules/ipprotection/IPPEnrollAndEntitleManager.sys.mjs";
import { IPPNimbusHelper } from "resource:///modules/ipprotection/IPPNimbusHelper.sys.mjs";
import { IPPOnboardingMessage } from "resource:///modules/ipprotection/IPPOnboardingMessageHelper.sys.mjs";
import { IPProtectionServerlist } from "resource:///modules/ipprotection/IPProtectionServerlist.sys.mjs";
import { IPPSignInWatcher } from "resource:///modules/ipprotection/IPPSignInWatcher.sys.mjs";
import { IPPStartupCache } from "resource:///modules/ipprotection/IPPStartupCache.sys.mjs";
import { IPPOptOutHelper } from "resource:///modules/ipprotection/IPPOptOutHelper.sys.mjs";
import { IPPVPNAddonHelper } from "resource:///modules/ipprotection/IPPVPNAddonHelper.sys.mjs";

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

const IPPHelpers = [
  IPPStartupCache,
  IPPSignInWatcher,
  IPProtectionServerlist,
  IPPEnrollAndEntitleManager,
  IPPOnboardingMessage,
  IPPProxyManager,
  new UIHelper(),
  IPPVPNAddonHelper,
  ...IPPAutoStartHelpers,
  IPPOptOutHelper,
  IPPNimbusHelper,
];

export { IPPHelpers };
