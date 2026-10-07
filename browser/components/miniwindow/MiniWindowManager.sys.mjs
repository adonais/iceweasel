/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};

ChromeUtils.defineLazyGetter(lazy, "logConsole", () =>
  console.createInstance({
    prefix: "MiniWindowManager",
    maxLogLevel: Services.prefs.getBoolPref("browser.mini-window.log", false)
      ? "Debug"
      : "Error",
  })
);

ChromeUtils.defineESModuleGetters(lazy, {
  MiniWindow: "moz-src:///browser/components/miniwindow/MiniWindow.sys.mjs",
});

/**
 * Cross-window manager for Mini Windows. Owns the registry of
 * open mini windows, the per-origin lifecycle observers, and SessionStore integration.
 */
export const MiniWindowManager = new (class {
  /** @type {Set<object>} live MiniWindow instances. */
  _miniwindows = new Set();

  /** @type {WeakMap<Window, Set<object>>} originWin -> its live mini windows. */
  #originWinToMinis = new WeakMap();

  /**
   * @type {WeakMap<Window, AbortController>} origin windows with lifecycle
   * hooks installed, mapped to the controller that removes them.
   */
  #originWinHooks = new WeakMap();

  #observing = false;

  get _enabled() {
    return Services.prefs.getBoolPref("browser.mini-window.enabled", false);
  }

  get _log() {
    return lazy.logConsole;
  }

  /**
   * Pop a cropped region of `tab` into a new mini window.
   *
   * TODO (later in the stack): the user-facing entry points that call this land
   * in a later commit; for now it is reached programmatically and by tests.
   *
   * @param {MozTabbrowserTab} tab - the tab to move.
   * @param {object} cropInfo - see MiniWindow.
   * @returns {Promise<object|null>} the MiniWindow, or null.
   */
  async popRegion(tab, cropInfo) {
    return this.#pop(tab, cropInfo);
  }

  /**
   * Pop the whole `tab` into a new always-on-top window.
   *
   * @param {MozTabbrowserTab} tab - the tab to move.
   * @returns {Promise<object|null>} the MiniWindow, or null.
   */
  async popTab(tab) {
    return this.#pop(tab, null);
  }

  /**
   * Opens a tab in a new Mini Window. Optionally, pop's just a region
   * that is passed in for the tab.
   *
   * @param {MozTabbrowserTab} tab - the tab to move.
   * @param {object|null} cropInfo - the region to frame (see MiniWindow),
   *   or null for a full-tab mini window.
   * @returns {Promise<object|null>} the MiniWindow, or null.
   */
  async #pop(tab, cropInfo) {
    let browser = tab.linkedBrowser;
    this._log.debug("pop: We're about to pop a mini window out: ", {
      url: browser.currentURI?.spec,
      crop: cropInfo,
    });

    if (!this._enabled) {
      return null;
    }

    this.#ensureObservers();

    let originWin = browser.documentGlobal;

    // Instantiate the per-window controller
    let miniwindow = new lazy.MiniWindow(this, originWin, tab, cropInfo);

    // Register before the multi-tick open() so the SSWindowClosing/quit
    // teardown below already knows about this popup if the origin window
    // starts closing while the popup is still opening.
    //
    // We want to move originWin's popped tabs home before SessionStore
    // collects it, whether it closes on its own or as part of quitting. Setup
    // the event listeners to move them back.
    this._miniwindows.add(miniwindow);
    let minisForOriginWin = this.#originWinToMinis.get(originWin);
    if (!minisForOriginWin) {
      minisForOriginWin = new Set();
      this.#originWinToMinis.set(originWin, minisForOriginWin);
    }
    minisForOriginWin.add(miniwindow);
    if (!this.#originWinHooks.has(originWin)) {
      this.#hookOriginWin(originWin);
    }

    let win = await miniwindow.open();
    if (!win) {
      this._log.debug("pop: open failed, returning null");
      this._unregister(miniwindow);
      return null;
    }

    this._log.debug("pop: mini window opened");
    return miniwindow;
  }

  /**
   * @param {XULBrowserElement} browser
   * @returns {object|undefined} the mini window hosting `browser`, if any. Keyed on
   * the mini window's <browser> element.
   */
  _miniWindowForBrowser(browser) {
    for (let mini of this._miniwindows) {
      if (mini.browser === browser) {
        return mini;
      }
    }
    return undefined;
  }

  _unregister(miniwindow) {
    this._miniwindows.delete(miniwindow);
    let minisForOriginWin = this.#originWinToMinis.get(miniwindow.originWin);
    if (!minisForOriginWin) {
      this._log.debug("_unregister", { remaining: this._miniwindows.size });
      return;
    }
    minisForOriginWin.delete(miniwindow);
    if (!minisForOriginWin.size) {
      this.#originWinToMinis.delete(miniwindow.originWin);
      this.#unhookOriginWin(miniwindow.originWin);
    }
    this._log.debug("_unregister", { remaining: this._miniwindows.size });
  }

  /** Register the shutdown observer. */
  #ensureObservers() {
    if (this.#observing) {
      return;
    }
    this.#observing = true;
    Services.obs.addObserver(this, "quit-application-granted");
  }

  observe(_subject, topic) {
    if (topic === "quit-application-granted") {
      this._log.debug(
        "observe: quit-application-granted, returning tabs home",
        {
          count: this._miniwindows.size,
        }
      );
      // Preserve the popped tabs by putting them back in their origin window.
      for (let mini of [...this._miniwindows]) {
        mini.returnToOriginWin(false);
      }
    }
  }

  /**
   * Install the per-origin-window lifecycle hooks. Every listener added here
   * must pass the controller's signal so #unhookOriginWin can drop them all.
   *
   * @param {Window} originWin
   */
  #hookOriginWin(originWin) {
    let abortController = new AbortController();
    originWin.addEventListener(
      "SSWindowClosing",
      () => this.#putBackMinisForOriginWins(originWin),
      { signal: abortController.signal }
    );
    this.#originWinHooks.set(originWin, abortController);
  }

  /**
   * Undo #hookOriginWin. No-op while the origin window still has mini windows -
   * they depend on the SSWindowClosing teardown, so removing it early would
   * leak them if the window closed.
   *
   * @param {Window} originWin
   */
  #unhookOriginWin(originWin) {
    if (this.#originWinToMinis.get(originWin)?.size) {
      return;
    }

    let abortController = this.#originWinHooks.get(originWin);
    if (!abortController) {
      return;
    }

    this.#originWinHooks.delete(originWin);
    abortController.abort();
  }

  /**
   * Moves the oldest popped tab back to the origin window.
   *
   * @param {Window} originWin
   * @returns {boolean} true if a popped tab was moved home.
   */
  maybeMoveOldestMiniWindow(originWin) {
    // The per-origin-window set preserves insertion order.
    let oldest = this.#originWinToMinis.get(originWin)?.values().next().value;
    if (!oldest) {
      // Looks like there's no more to put back.
      return false;
    }
    oldest.returnToOriginWin(true);
    return true;
  }

  #putBackMinisForOriginWins(originWin) {
    let minis = this.#minisForOriginWin(originWin);
    this._log.debug("#putBackMinisForOriginWins", { count: minis.length });

    for (let miniWin of minis) {
      miniWin.returnToOriginWin(false);
    }
  }

  /**
   * @param {Window} originWin
   * @returns {object[]} live popups whose originWin is `originWin` (a copy, so
   *   callers can iterate while teardown removes popups from the live set).
   */
  #minisForOriginWin(originWin) {
    let minis = this.#originWinToMinis.get(originWin);
    return minis ? [...minis] : [];
  }
})();
