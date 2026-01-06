/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  AddonManager: "resource://gre/modules/AddonManager.sys.mjs",
  IPProtectionService:
    "resource:///modules/ipprotection/IPProtectionService.sys.mjs",
});

const VPN_ADDON_ID = "vpn@mozilla.com";

/**
 * This class monitors the VPN add-on installation.
 */
class VPNAddonHelperSingleton {
  #vpnAddonDetected = false;

  init() {}

  initOnStartupCompleted() {
    const self = this;
    this.addonVPNListener = {
      onInstalled(addon) {
        if (addon.id === VPN_ADDON_ID) {
          self.#vpnAddonDetected = true;
          lazy.IPProtectionService.updateState();
        }
      },

      onUninstalled(addon) {
        if (addon.id === VPN_ADDON_ID) {
          self.#vpnAddonDetected = false;
          lazy.IPProtectionService.updateState();
        }
      },
    };
    lazy.AddonManager.addAddonListener(this.addonVPNListener);

    lazy.AddonManager.readyPromise.then(() => {
      lazy.AddonManager.getAddonByID(VPN_ADDON_ID).then(addon => {
        this.#vpnAddonDetected = !!addon;
        lazy.IPProtectionService.updateState();
      });
    });
  }

  uninit() {
    if (this.addonVPNListener) {
      lazy.AddonManager.removeAddonListener(this.addonVPNListener);
      this.#vpnAddonDetected = false;
    }
  }

  get vpnAddonDetected() {
    return this.#vpnAddonDetected;
  }
}

const IPPVPNAddonHelper = new VPNAddonHelperSingleton();

export { IPPVPNAddonHelper };
