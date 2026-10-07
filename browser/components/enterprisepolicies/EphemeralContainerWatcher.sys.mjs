/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  AsyncShutdown: "resource://gre/modules/AsyncShutdown.sys.mjs",
  ContextualIdentityService:
    "moz-src:///toolkit/components/contextualidentity/ContextualIdentityService.sys.mjs",
  DeferredTask: "resource://gre/modules/DeferredTask.sys.mjs",
  EveryWindow: "resource:///modules/EveryWindow.sys.mjs",
});

const DEBOUNCE_MS = 30000;
const PREF_EPHEMERAL_IDS = "browser.policies.ephemeralContainerIds";

export const EphemeralContainerWatcher = {
  _ephemeralIds: new Set(),
  _deferredTasks: new Map(),
  _initialized: false,
  _shutdownBlockerAdded: false,

  init(ephemeralUserContextIds) {
    this._ephemeralIds = ephemeralUserContextIds;
    this._cancelStaleTimers();

    // On first init, clear data for containers that were ephemeral in the
    // previous session but are no longer in the current policy. Handles the
    // case where we crashed before the shutdown blocker could run clearAll.
    if (!this._initialized) {
      this._clearStaleIds();
    }

    this._persistIds();

    if (this._initialized) {
      return;
    }
    this._initialized = true;

    lazy.EveryWindow.registerCallback(
      "EphemeralContainerWatcher",
      win => this._onWindowInit(win),
      (win, closing) => this._onWindowUninit(win, closing)
    );

    if (!this._shutdownBlockerAdded) {
      this._shutdownBlockerAdded = true;
      lazy.AsyncShutdown.profileBeforeChange.addBlocker(
        "EphemeralContainerWatcher: clear ephemeral container data",
        () => this.clearAll()
      );
    }
  },

  destroy() {
    if (!this._initialized) {
      return;
    }
    this._initialized = false;

    this._ephemeralIds.clear();
    this._cancelStaleTimers();
    this._persistIds();

    lazy.EveryWindow.unregisterCallback("EphemeralContainerWatcher");
  },

  _cancelStaleTimers() {
    for (let [userContextId, task] of this._deferredTasks) {
      if (!this._ephemeralIds.has(userContextId)) {
        task.disarm();
        this._deferredTasks.delete(userContextId);
      }
    }
  },

  _onWindowInit(win) {
    win.gBrowser.tabContainer.addEventListener("TabClose", this);
  },

  _onWindowUninit(win, closing) {
    win.gBrowser.tabContainer.removeEventListener("TabClose", this);
    if (closing) {
      for (let userContextId of this._ephemeralIds) {
        this._scheduleCheck(userContextId);
      }
    }
  },

  handleEvent(event) {
    let tab = event.target;
    let userContextId = tab.getAttribute("usercontextid");
    if (!userContextId) {
      return;
    }
    userContextId = parseInt(userContextId, 10);
    if (this._ephemeralIds.has(userContextId)) {
      this._scheduleCheck(userContextId);
    }
  },

  _scheduleCheck(userContextId) {
    let task = this._deferredTasks.getOrInsertComputed(userContextId, () => {
      return new lazy.DeferredTask(() => {
        if (
          lazy.ContextualIdentityService.countContainerTabs(userContextId) == 0
        ) {
          return this._clearData(userContextId);
        }
        return undefined;
      }, DEBOUNCE_MS);
    });
    task.disarm();
    task.arm();
  },

  _clearData(userContextId) {
    return new Promise(resolve => {
      Services.clearData.deleteDataFromOriginAttributesPattern(
        { userContextId },
        resolve
      );
    });
  },

  clearAll() {
    let promises = [];
    for (let userContextId of this._ephemeralIds) {
      promises.push(this._clearData(userContextId));
    }
    this.destroy();
    return Promise.all(promises);
  },

  _clearStaleIds() {
    let staleIds;
    try {
      staleIds = JSON.parse(
        Services.prefs.getStringPref(PREF_EPHEMERAL_IDS, "[]")
      );
    } catch (e) {
      return;
    }

    for (let id of staleIds) {
      if (!this._ephemeralIds.has(id)) {
        this._clearData(id);
      }
    }
  },

  _persistIds() {
    Services.prefs.setStringPref(
      PREF_EPHEMERAL_IDS,
      JSON.stringify([...this._ephemeralIds])
    );
  },

  async flushPendingChecks() {
    let tasks = [...this._deferredTasks.values()];
    this._deferredTasks.clear();
    await Promise.all(tasks.map(t => t.finalize()));
  },
};
