/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { ONBOARDING_PREF_FLAGS } from "chrome://browser/content/ipprotection/ipprotection-constants.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  IPPProxyManager: "resource:///modules/ipprotection/IPPProxyManager.sys.mjs",
  IPPProxyStates: "resource:///modules/ipprotection/IPPProxyManager.sys.mjs",
});

const ONBOARDING_MESSAGE_MASK_PREF =
  "browser.ipProtection.onboardingMessageMask";
const AUTOSTART_PREF = "browser.ipProtection.autoStartEnabled";
const MODE_PREF = "browser.ipProtection.exceptionsMode";
const PERM_NAME = "ipp-vpn";

/**
 * This class handles in-panel continuous onboarding messages, including setting
 * the browser.ipProtection.onboardingMessageMask, a pref that gates messages
 * according to feature (general VPN, autostart, site exceptions) through bit mask
 */
class IPPOnboardingMessageHelper {
  constructor() {
    this.handleEvent = this.#handleEvent.bind(this);

    Services.prefs.addObserver(AUTOSTART_PREF, () =>
      this.setOnboardingFlag(ONBOARDING_PREF_FLAGS.EVER_TURNED_ON_AUTOSTART)
    );

    let autoStartPref = Services.prefs.getBoolPref(AUTOSTART_PREF, false);
    if (autoStartPref) {
      this.setOnboardingFlag(ONBOARDING_PREF_FLAGS.EVER_TURNED_ON_AUTOSTART);
    }

    Services.prefs.addObserver(MODE_PREF, () =>
      this.setOnboardingFlag(ONBOARDING_PREF_FLAGS.EVER_USED_SITE_EXCEPTIONS)
    );

    // If at least one exception is saved, don't show site exceptions onboarding message
    let savedSites = Services.perms.getAllByTypes([PERM_NAME]);
    if (savedSites.length !== 0) {
      this.setOnboardingFlag(ONBOARDING_PREF_FLAGS.EVER_USED_SITE_EXCEPTIONS);
    }
  }

  init() {
    lazy.IPPProxyManager.addEventListener(
      "IPPProxyManager:StateChanged",
      this.handleEvent
    );
  }

  initOnStartupCompleted() {}

  uninit() {
    lazy.IPPProxyManager.removeEventListener(
      "IPPProxyManager:StateChanged",
      this.handleEvent
    );
  }

  readPrefMask() {
    return Services.prefs.getIntPref(ONBOARDING_MESSAGE_MASK_PREF, 0);
  }

  writeOnboardingTriggerPref(mask) {
    Services.prefs.setIntPref(ONBOARDING_MESSAGE_MASK_PREF, mask);
  }

  setOnboardingFlag(flag) {
    const mask = this.readPrefMask();
    this.writeOnboardingTriggerPref(mask | flag);
  }

  #handleEvent(event) {
    if (
      event.type == "IPPProxyManager:StateChanged" &&
      lazy.IPPProxyManager.state === lazy.IPPProxyStates.ACTIVE
    ) {
      this.setOnboardingFlag(ONBOARDING_PREF_FLAGS.EVER_TURNED_ON_VPN);
    }
  }
}

const IPPOnboardingMessage = new IPPOnboardingMessageHelper();

export { IPPOnboardingMessage };
