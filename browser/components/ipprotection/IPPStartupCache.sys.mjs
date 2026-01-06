/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  IPProtectionService:
    "resource:///modules/ipprotection/IPProtectionService.sys.mjs",
  IPProtectionStates:
    "resource:///modules/ipprotection/IPProtectionService.sys.mjs",
});

const STATE_CACHE_PREF = "browser.ipProtection.stateCache";
const ENTITLEMENT_CACHE_PREF = "browser.ipProtection.entitlementCache";
const LOCATIONLIST_CACHE_PREF = "browser.ipProtection.locationListCache";

/**
 * This class implements a cache for the IPP state machine. The cache is used
 * until we receive the `sessionstore-windows-restored` event
 */
class IPPStartupCacheSingleton {
  #stateFromCache = null;
  #startupCompleted = false;

  constructor() {
    // For XPCShell tests, the cache must be disabled.
    if (
      Services.prefs.getBoolPref("browser.ipProtection.cacheDisabled", false)
    ) {
      this.#startupCompleted = true;
      return;
    }

    this.handleEvent = this.#handleEvent.bind(this);

    const stateFromCache = Services.prefs.getCharPref(
      STATE_CACHE_PREF,
      "unset"
    );
    if (stateFromCache !== "unset") {
      this.#stateFromCache = stateFromCache;
    }

    Services.obs.addObserver(this, "sessionstore-windows-restored");
  }

  init() {
    lazy.IPProtectionService.addEventListener(
      "IPProtectionService:StateChanged",
      this.handleEvent
    );
  }

  async initOnStartupCompleted() {}

  uninit() {
    lazy.IPProtectionService.removeEventListener(
      "IPProtectionService:StateChanged",
      this.handleEvent
    );
  }

  get isStartupCompleted() {
    return this.#startupCompleted;
  }

  get state() {
    if (this.#startupCompleted) {
      throw new Error("IPPStartupCache should not be used after the startup");
    }

    if (Object.values(lazy.IPProtectionStates).includes(this.#stateFromCache)) {
      return this.#stateFromCache;
    }

    // This should not happen.
    return lazy.IPProtectionStates.UNINITIALIZED;
  }

  async observe(_subject, topic, _) {
    if (topic !== "sessionstore-windows-restored") {
      return;
    }

    // The browser is ready! Let's invalidate the cache and let's recompute the
    // state.

    Services.obs.removeObserver(this, "sessionstore-windows-restored");
    this.#startupCompleted = true;
    this.#stateFromCache = null;

    await lazy.IPProtectionService.initOnStartupCompleted();
    lazy.IPProtectionService.updateState();
  }

  storeEntitlement(entitlement) {
    Services.prefs.setCharPref(
      ENTITLEMENT_CACHE_PREF,
      JSON.stringify(entitlement)
    );
  }

  get entitlement() {
    try {
      const entitlement = Services.prefs.getCharPref(
        ENTITLEMENT_CACHE_PREF,
        ""
      );
      return JSON.parse(entitlement);
    } catch (e) {
      return null;
    }
  }

  storeLocationList(locationList) {
    Services.prefs.setCharPref(
      LOCATIONLIST_CACHE_PREF,
      JSON.stringify(locationList)
    );
  }

  get locationList() {
    try {
      const locationList = Services.prefs.getCharPref(
        LOCATIONLIST_CACHE_PREF,
        ""
      );
      return JSON.parse(locationList);
    } catch (e) {
      return null;
    }
  }

  #handleEvent(_event) {
    const state = lazy.IPProtectionService.state;
    if (this.#startupCompleted) {
      Services.prefs.setCharPref(STATE_CACHE_PREF, state);
    } else {
      this.#stateFromCache = state;
    }
  }
}

const IPPStartupCache = new IPPStartupCacheSingleton();

export { IPPStartupCache, IPPStartupCacheSingleton };
