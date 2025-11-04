/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  AddonManager: "resource://gre/modules/AddonManager.sys.mjs",
  CustomizableUI:
    "moz-src:///browser/components/customizableui/CustomizableUI.sys.mjs",
  IPPExceptionsManager:
    "resource:///modules/ipprotection/IPPExceptionsManager.sys.mjs",
  IPProtection: "resource:///modules/ipprotection/IPProtection.sys.mjs",
  IPProtectionWidget: "resource:///modules/ipprotection/IPProtection.sys.mjs",
  IPProtectionService:
    "resource:///modules/ipprotection/IPProtectionService.sys.mjs",
  IPProtectionStates:
    "resource:///modules/ipprotection/IPProtectionService.sys.mjs",
  NimbusFeatures: "resource://nimbus/ExperimentAPI.sys.mjs",
});

import { IPPSignInWatcher } from "resource:///modules/ipprotection/IPPSignInWatcher.sys.mjs";

const VPN_ADDON_ID = "vpn@mozilla.com";

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
  }
}

/**
 * This simple class resets the account data when needed
 */
class AccountResetHelper {
  constructor() {
    this.handleEvent = this.#handleEvent.bind(this);
  }

  init() {
    lazy.IPProtectionService.addEventListener(
      "IPProtectionService:StateChanged",
      this.handleEvent
    );
  }

  uninit() {
    lazy.IPProtectionService.removeEventListener(
      "IPProtectionService:StateChanged",
      this.handleEvent
    );
  }

  #handleEvent(_event) {
    // Reset stored account information and stop the proxy,
    // if the account is no longer available.
    if (
      (lazy.IPProtectionService.hasEntitlement &&
        lazy.IPProtectionService.state ===
          lazy.IPProtectionStates.UNAVAILABLE) ||
      lazy.IPProtectionService.state === lazy.IPProtectionStates.UNAUTHENTICATED
    ) {
      lazy.IPProtectionService.resetAccount();
    }
  }
}

/**
 * This class removes the UI widget if the VPN add-on is installed.
 */
class VPNAddonHelper {
  /**
   * Adds an observer to monitor the VPN add-on installation
   */
  init() {
    this.addonVPNListener = {
      onInstallEnded(_install, addon) {
        if (addon.id === VPN_ADDON_ID && lazy.IPProtectionService.hasUpgraded) {
          // Place the widget in the customization palette.
          lazy.CustomizableUI.removeWidgetFromArea(
            lazy.IPProtectionWidget.WIDGET_ID
          );
        }
      },
    };

    lazy.AddonManager.addInstallListener(this.addonVPNListener);
  }

  /**
   * Removes the VPN add-on installation observer
   */
  uninit() {
    if (this.addonVPNListener) {
      lazy.AddonManager.removeInstallListener(this.addonVPNListener);
    }
  }
}

/**
 * This class monitors the eligibility flag from Nimbus
 */
class EligibilityHelper {
  init() {
    lazy.NimbusFeatures.ipProtection.onUpdate(
      lazy.IPProtectionService.updateState
    );
  }

  uninit() {
    lazy.NimbusFeatures.ipProtection.offUpdate(
      lazy.IPProtectionService.updateState
    );
  }
}

const IPPHelpers = [
  new AccountResetHelper(),
  new EligibilityHelper(),
  new VPNAddonHelper(),
  new UIHelper(),
  IPPSignInWatcher,
];

export { IPPHelpers };
