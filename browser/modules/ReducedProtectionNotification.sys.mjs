/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  EveryWindow: "resource:///modules/EveryWindow.sys.mjs",
});

const NOTIFICATION_VALUE = "reduced-protection-reload";

const PREF = "privacy.reducePageProtection.infobar.enabled.pbmode";

export const ReducedProtectionNotification = {
  _initialized: false,
  _prefObserved: false,
  // Store per browsingContext whether we encountered blocked resources to only show the
  // ReducedProtectionNotification when a reload really would unblock resources
  _blockedTrackers: new WeakMap(),
  // We show the notification when the page loads and let it disappear again when the user
  // initiated a navigation
  _pendingNotification: new WeakMap(),
  // Per tab we only want to show the infobar at maximum once per host to not annoy users.
  // Keep track of hosts, where this infobar already appeared per tab.
  _shownHosts: new WeakMap(),

  observePref() {
    if (this._prefObserved) {
      return;
    }
    this._prefObserved = true;
    Services.prefs.addObserver(PREF, () => {
      if (Services.prefs.getBoolPref(PREF, false)) {
        this.init();
      } else {
        this.uninit();
      }
    });
    if (Services.prefs.getBoolPref(PREF, false)) {
      this.init();
    }
  },

  init() {
    if (this._initialized) {
      return;
    }
    lazy.EveryWindow.registerCallback(
      "reduced-protection-notification",
      win => {
        win.gBrowser?.addTabsProgressListener(this);
      },
      win => {
        win.gBrowser?.removeTabsProgressListener(this);
      }
    );
    this._initialized = true;
  },

  uninit() {
    if (!this._initialized) {
      return;
    }
    lazy.EveryWindow.unregisterCallback("reduced-protection-notification");
    this._initialized = false;
    this._blockedTrackers = new WeakMap();
    this._pendingNotification = new WeakMap();
    this._shownHosts = new WeakMap();
  },

  onContentBlockingEvent(aBrowser, aWebProgress, aRequest, aEvent) {
    if (!aWebProgress.isTopLevel) {
      return;
    }
    if (aEvent & Ci.nsIWebProgressListener.STATE_BLOCKED_TRACKING_CONTENT) {
      this._blockedTrackers.set(aBrowser, true);
    }
  },

  onStateChange(aBrowser, aWebProgress, aRequest, aStateFlags) {
    if (!aWebProgress.isTopLevel) {
      return;
    }

    const START_MASK =
      Ci.nsIWebProgressListener.STATE_START |
      Ci.nsIWebProgressListener.STATE_IS_NETWORK;
    const isStart = (aStateFlags & START_MASK) === START_MASK;

    const STOP_MASK =
      Ci.nsIWebProgressListener.STATE_STOP |
      Ci.nsIWebProgressListener.STATE_IS_NETWORK;
    const isStop = (aStateFlags & STOP_MASK) === STOP_MASK;

    const isReload =
      (aWebProgress.loadType & Ci.nsIDocShell.LOAD_CMD_RELOAD) !== 0;
    const isAddressBarNavigation =
      (aWebProgress.loadType & Ci.nsIDocShell.LOAD_CMD_NORMAL) !== 0;

    if (isStart) {
      if (isAddressBarNavigation) {
        this._shownHosts.delete(aBrowser);
      }

      if (isReload && this._blockedTrackers.get(aBrowser)) {
        this._pendingNotification.set(aBrowser, true);
        this._blockedTrackers.delete(aBrowser);
      }

      this.hideNotification(aBrowser);
    } else if (isStop && this._pendingNotification.get(aBrowser)) {
      this._pendingNotification.delete(aBrowser);
      this.showNotification(aBrowser);
    }
  },

  hideNotification(aBrowser) {
    const notificationBox = aBrowser
      .getTabBrowser()
      ?.getNotificationBox(aBrowser);
    const notification =
      notificationBox?.getNotificationWithValue(NOTIFICATION_VALUE);
    if (notification) {
      notificationBox.removeNotification(notification);
    }
  },

  async showNotification(aBrowser) {
    const tabbrowser = aBrowser.getTabBrowser();
    if (!tabbrowser) {
      return;
    }

    const currentURI = aBrowser.currentURI;
    if (!currentURI) {
      return;
    }

    const host = currentURI.host;
    if (this._shownHosts.get(aBrowser)?.has(host)) {
      return;
    }

    const notificationBox = tabbrowser.getNotificationBox(aBrowser);
    if (notificationBox.getNotificationWithValue(NOTIFICATION_VALUE)) {
      return;
    }

    const doc = tabbrowser.ownerDocument;
    const [buttonLabel] = await doc.l10n.formatValues([
      { id: "reduced-protection-infobar-reload-button" },
    ]);

    const notification = await notificationBox.appendNotification(
      NOTIFICATION_VALUE,
      {
        priority: notificationBox.PRIORITY_INFO_LOW,
      },
      [
        {
          label: buttonLabel,
          callback: () => {
            const scopedPrefs = aBrowser.browsingContext.scopedPrefs;
            if (scopedPrefs) {
              scopedPrefs.setBoolPrefScoped(
                Ci.nsIScopedPrefs.PRIVACY_TRACKINGPROTECTION_ENABLED,
                aBrowser.browsingContext,
                false
              );
            }
            aBrowser.reload();
          },
        },
      ]
    );
    notification.persistence = -1;

    const msgSpan = doc.createElementNS("http://www.w3.org/1999/xhtml", "span");
    msgSpan.setAttribute("slot", "message");
    doc.l10n.setAttributes(msgSpan, "reduced-protection-infobar-message");
    notification.appendChild(msgSpan);

    if (!this._shownHosts.has(aBrowser)) {
      this._shownHosts.set(aBrowser, new Set());
    }
    this._shownHosts.get(aBrowser).add(host);
  },
};
