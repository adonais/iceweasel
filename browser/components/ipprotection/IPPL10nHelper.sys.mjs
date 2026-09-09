/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { AppConstants } from "resource://gre/modules/AppConstants.sys.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  IPProtectionService:
    "moz-src:///toolkit/components/ipprotection/IPProtectionService.sys.mjs",
  IPProtectionStates:
    "moz-src:///toolkit/components/ipprotection/IPProtectionService.sys.mjs",
});

const FTL_PATH = "browser/browser/ipProtection.ftl";
const MIN_COVERAGE = 0.8;
const HAS_SEEN_FEATURE_PREF = "browser.ipProtection.hasSeenFeature";
const GATE_VERSION_PREF = "browser.ipProtection.l10nGateVersion";

/**
 * Hides the IP protection UI from a user who never saw the feature while
 * `browser/ipProtection.ftl` is not localized enough in the current locale. Once
 * the UI has been exposed `hasSeenFeature` is set, so a later version adding
 * untranslated strings never takes the feature away again. The same pref forces
 * the UI on for testing.
 *
 * The gate only lasts for the Firefox major version that first hit it: the
 * version is recorded when the feature is hidden and, as soon as the browser is
 * updated to a new major version, the gate gives up and exposes the feature.
 */
class IPPL10nHelperSingleton {
  init() {
    lazy.IPProtectionService.addEventListener(
      "IPProtectionService:StateChanged",
      this
    );
  }

  initOnStartupCompleted() {}

  uninit() {
    lazy.IPProtectionService.removeEventListener(
      "IPProtectionService:StateChanged",
      this
    );
  }

  handleEvent() {
    const state = lazy.IPProtectionService.state;
    if (
      state !== lazy.IPProtectionStates.UNINITIALIZED &&
      state !== lazy.IPProtectionStates.UNAVAILABLE
    ) {
      Services.prefs.setBoolPref(HAS_SEEN_FEATURE_PREF, true);
    }
  }

  hidesFeature() {
    if (
      Services.locale.isLocalizedEnough(
        FTL_PATH,
        HAS_SEEN_FEATURE_PREF,
        MIN_COVERAGE
      )
    ) {
      return false;
    }

    const currentVersion = parseInt(AppConstants.MOZ_APP_VERSION, 10);
    const gateVersion = Services.prefs.getIntPref(GATE_VERSION_PREF, 0);

    if (!gateVersion) {
      Services.prefs.setIntPref(GATE_VERSION_PREF, currentVersion);
      return true;
    }

    return gateVersion == currentVersion;
  }
}

const IPPL10nHelper = new IPPL10nHelperSingleton();

export { IPPL10nHelper };
