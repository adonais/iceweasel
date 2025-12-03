/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Note: If you add or modify the list of helpers, make sure to update the
 * corresponding documentation in the `docs` folder as well.
 */

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
});

import { IPPAutoStartHelpers } from "resource:///modules/ipprotection/IPPAutoStart.sys.mjs";
import { IPPEnrollAndEntitleManager } from "resource:///modules/ipprotection/IPPEnrollAndEntitleManager.sys.mjs";
import { IPPNimbusHelper } from "resource:///modules/ipprotection/IPPNimbusHelper.sys.mjs";
import { IPProtectionServerlist } from "resource:///modules/ipprotection/IPProtectionServerlist.sys.mjs";
import { IPPSignInWatcher } from "resource:///modules/ipprotection/IPPSignInWatcher.sys.mjs";
import { IPPStartupCache } from "resource:///modules/ipprotection/IPPStartupCache.sys.mjs";

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
  }
}

/**
 * This simple class resets the account data when needed
 */
class ProxyResetHelper {
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
  }

  #handleEvent(_event) {
    if (!lazy.IPProtectionService.proxyManager) {
      return;
    }

    if (
      lazy.IPProtectionService.state === lazy.IPProtectionStates.UNAVAILABLE ||
      lazy.IPProtectionService.state === lazy.IPProtectionStates.UNAUTHENTICATED
    ) {
      if (lazy.IPProtectionService.proxyManager.active) {
        lazy.IPProtectionService.proxyManager.stop(false);
      }

      lazy.IPProtectionService.proxyManager.reset();
    }
  }
}

/**
 * This class removes the UI widget if the VPN add-on is installed.
 */
class VPNAddonHelper {
  init() {}

  /**
   * Adds an observer to monitor the VPN add-on installation
   */
  initOnStartupCompleted() {
    this.addonVPNListener = {
      onInstallEnded(_install, addon) {
        if (
          addon.id === VPN_ADDON_ID &&
          IPPEnrollAndEntitleManager.hasUpgraded
        ) {
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

// The order is important! NimbusHelper must be the last one because nimbus
// triggers the callback immdiately, which could compute a new state for all
// the helpers.
const IPPHelpers = [
  IPPStartupCache,
  IPPSignInWatcher,
  IPProtectionServerlist,
  IPPEnrollAndEntitleManager,
  new UIHelper(),
  new ProxyResetHelper(),
  new VPNAddonHelper(),
  ...IPPAutoStartHelpers,
  IPPNimbusHelper,
];

export { IPPHelpers };
