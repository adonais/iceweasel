/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  IPProtectionService:
    "resource:///modules/ipprotection/IPProtectionService.sys.mjs",
});

const OPTED_OUT_PREF = "browser.ipProtection.optedOut";

/**
 * This class monitors the optedOut pref and if it sees an opted-out state, it
 * sets the state on IPProtectionService
 */
class IPPOptedOutHelperSingleton {
  constructor() {
    XPCOMUtils.defineLazyPreferenceGetter(
      this,
      "optedOut",
      OPTED_OUT_PREF,
      false,
      () => {
        lazy.IPProtectionService.updateState();
      }
    );
  }

  init() {}

  uninit() {}

  initOnStartupCompleted() {}
}

const IPPOptOutHelper = new IPPOptedOutHelperSingleton();

export { IPPOptOutHelper };
