/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  IPProtectionService:
    "resource:///modules/ipprotection/IPProtectionService.sys.mjs",
  UIState: "resource://services-sync/UIState.sys.mjs",
});

ChromeUtils.defineLazyGetter(lazy, "fxAccounts", () => {
  return ChromeUtils.importESModule(
    "resource://gre/modules/FxAccounts.sys.mjs"
  ).getFxAccountsSingleton();
});

/**
 * This class monitors the Sign-In state and triggers the update of the service
 * if needed.
 */
class IPPSignInWatcherSingleton {
  #signedIn = false;

  get isSignedIn() {
    return this.#signedIn;
  }

  set isSignedIn(signedIn) {
    this.#signedIn = signedIn;
  }

  /**
   * Adds an observer for the FxA sign-in state.
   */
  async init() {
    this.fxaObserver = {
      QueryInterface: ChromeUtils.generateQI([
        Ci.nsIObserver,
        Ci.nsISupportsWeakReference,
      ]),

      observe() {
        let { status } = lazy.UIState.get();
        let signedIn = status == lazy.UIState.STATUS_SIGNED_IN;
        if (signedIn !== IPPSignInWatcher.isSignedIn) {
          IPPSignInWatcher.isSignedIn = signedIn;
          lazy.IPProtectionService.updateState();
        }
      },
    };

    Services.obs.addObserver(this.fxaObserver, lazy.UIState.ON_UPDATE);

    // Let's check the sign-in state only if we have seen the user signed in
    // once at least.
    if (Services.prefs.prefHasUserValue("services.sync.username")) {
      const userData = await lazy.fxAccounts.getSignedInUser();
      this.#signedIn = userData?.verified || false;
    }
  }

  /**
   * Removes the FxA sign-in state observer
   */
  uninit() {
    if (this.fxaObserver) {
      Services.obs.removeObserver(this.fxaObserver, lazy.UIState.ON_UPDATE);
      this.fxaObserver = null;
    }
  }
}

const IPPSignInWatcher = new IPPSignInWatcherSingleton();

export { IPPSignInWatcher };
