/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

/** @import { CanonicalURLParent } from "./CanonicalURLParent.sys.mjs" */

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  BrowserWindowTracker: "resource:///modules/BrowserWindowTracker.sys.mjs",
  TabNotes: "moz-src:///browser/components/tabnotes/TabNotes.sys.mjs",
});
ChromeUtils.defineLazyGetter(lazy, "logConsole", function () {
  return console.createInstance({
    prefix: "TabNotes",
    maxLogLevel: Services.prefs.getBoolPref("browser.tabs.notes.debug", false)
      ? "Debug"
      : "Warn",
  });
});
XPCOMUtils.defineLazyPreferenceGetter(
  lazy,
  "TAB_NOTES_ENABLED",
  "browser.tabs.notes.enabled",
  false
);

const EVENTS = [
  "CanonicalURL:Identified",
  "TabNote:Created",
  "TabNote:Edited",
  "TabNote:Removed",
];

/**
 * Orchestrates the tab notes life cycle.
 *
 * Singleton class within Firefox that observes tab notes-related topics,
 * listens for tab notes-related events, and ensures that the state of the
 * tabbrowser stays in sync with the TabNotes repository.
 *
 * Registers with the category manager in order to initialize on Firefox
 * startup and be notified when windows are opened/closed.
 *
 * @see https://firefox-source-docs.mozilla.org/browser/CategoryManagerIndirection.html
 */
class TabNotesControllerClass {
  /**
   * Registered with `browser-first-window-ready` to be notified of
   * app startup.
   *
   * @see tabnotes.manifest
   */
  init() {
    if (lazy.TAB_NOTES_ENABLED) {
      lazy.TabNotes.init();
    } else {
      lazy.logConsole.info("Tab notes disabled");
    }
  }

  /**
   * Registered with `browser-window-delayed-startup` to be notified of new
   * windows.
   *
   * @param {Window} win
   * @see tabnotes.manifest
   */
  registerWindow(win) {
    if (lazy.TAB_NOTES_ENABLED) {
      EVENTS.forEach(eventName => win.addEventListener(eventName, this));
      win.gBrowser.addTabsProgressListener(this);
      lazy.logConsole.debug("registerWindow", EVENTS, win);
    }
  }

  /**
   * Registered with `browser-window-unload` to be notified of unloaded windows.
   *
   * @param {Window} win
   * @see tabnotes.manifest
   */
  unregisterWindow(win) {
    if (lazy.TAB_NOTES_ENABLED) {
      EVENTS.forEach(eventName => win.removeEventListener(eventName, this));
      win.gBrowser.removeTabsProgressListener(this);
      lazy.logConsole.debug("unregisterWindow", EVENTS, win);
    }
  }

  /**
   * Registered with `browser-quit-application-granted` to be notified of
   * app shutdown.
   *
   * @see tabnotes.manifest
   */
  quit() {
    if (lazy.TAB_NOTES_ENABLED) {
      lazy.TabNotes.deinit();
    }
  }

  /**
   * @param {CanonicalURLIdentifiedEvent|TabNoteCreatedEvent|TabNoteEditedEvent|TabNoteRemovedEvent} event
   */
  handleEvent(event) {
    switch (event.type) {
      case "CanonicalURL:Identified":
        {
          // A browser identified its canonical URL, so we can determine whether
          // the tab has an associated note and should therefore display a tab
          // notes icon.
          const browser = event.target;
          const { canonicalUrl } = event.detail;
          const gBrowser = browser.getTabBrowser();
          const tab = gBrowser.getTabForBrowser(browser);
          tab.canonicalUrl = canonicalUrl;
          lazy.TabNotes.has(tab).then(hasTabNote => {
            tab.hasTabNote = hasTabNote;
          });

          lazy.logConsole.debug("CanonicalURL:Identified", tab, canonicalUrl);
        }
        break;
      case "TabNote:Created":
        {
          const { telemetrySource } = event.detail;
          if (telemetrySource) {
            Glean.tabNotes.added.record({
              source: telemetrySource,
            });
          }
          // A new tab note was created for a specific canonical URL. Ensure that
          // all tabs with the same canonical URL also indicate that there is a
          // tab note.
          const { canonicalUrl } = event.target;
          for (const win of lazy.BrowserWindowTracker.orderedWindows) {
            for (const tab of win.gBrowser.tabs) {
              if (tab.canonicalUrl == canonicalUrl) {
                tab.hasTabNote = true;
              }
            }
          }
          lazy.logConsole.debug("TabNote:Created", canonicalUrl);
        }
        break;
      case "TabNote:Edited":
        {
          const { canonicalUrl } = event.target;
          const { telemetrySource } = event.detail;
          if (telemetrySource) {
            Glean.tabNotes.edited.record({
              source: telemetrySource,
            });
          }
          lazy.logConsole.debug("TabNote:Edited", canonicalUrl);
        }
        break;
      case "TabNote:Removed":
        {
          const { telemetrySource, note } = event.detail;
          const now = Temporal.Now.instant();
          const noteAgeHours = Math.round(
            now.since(note.created).total("hours")
          );
          if (telemetrySource) {
            Glean.tabNotes.deleted.record({
              source: telemetrySource,
              note_age_hours: noteAgeHours,
            });
          }

          // A new tab note was removed from a specific canonical URL. Ensure that
          // all tabs with the same canonical URL also indicate that there is no
          // longer a tab note.
          const { canonicalUrl } = event.target;
          for (const win of lazy.BrowserWindowTracker.orderedWindows) {
            for (const tab of win.gBrowser.tabs) {
              if (tab.canonicalUrl == canonicalUrl) {
                tab.hasTabNote = false;
              }
            }
          }
          lazy.logConsole.debug("TabNote:Removed", canonicalUrl);
        }
        break;
    }
  }

  /**
   * Invoked by Tabbrowser after we register with `Tabbrowser.addProgressListener`.
   *
   * Clears the tab note icon and canonical URL from a tab when navigation starts
   * within a tab.
   *
   * The CanonicalURL actor running in this tab's browser will report the canonical
   * URL of the new destination in the browser, which will determine whether the
   * new destination has an associated tab note.
   *
   * @type {TabbrowserWebProgressListener<"onLocationChange">}
   */
  onLocationChange(aBrowser, aWebProgress, aRequest, aLocation, aFlags) {
    // Tab notes only apply to the top-level frames loaded in tabs.
    if (!aWebProgress.isTopLevel) {
      return;
    }

    if (aFlags & Ci.nsIWebProgressListener.LOCATION_CHANGE_SAME_DOCUMENT) {
      if (
        aWebProgress.loadType & Ci.nsIDocShell.LOAD_CMD_RELOAD ||
        aWebProgress.loadType & Ci.nsIDocShell.LOAD_CMD_HISTORY
      ) {
        // User is reloading/returning to the same document via history. We
        // can count on CanonicalURLChild to listen for `pageshow` and tell us
        // about the canonical URL at the new location.
        lazy.logConsole.debug(
          "reload/history navigation, waiting for pageshow",
          aLocation.spec
        );
        return;
      }

      if (aFlags & Ci.nsIWebProgressListener.LOCATION_CHANGE_HASHCHANGE) {
        // The web site modified the hash/fragment identifier part of the URL
        // directly. TODO: determine how and whether to handle `hashchange`.
        lazy.logConsole.debug("fragment identifier changed", aLocation.spec);
        return;
      }

      if (aWebProgress.loadType & Ci.nsIDocShell.LOAD_CMD_PUSHSTATE) {
        // Web page is using `history.pushState()` to change URLs. There isn't
        // a way for CanonicalURLChild to detect this in the content process,
        // so we need to ask it to recalculate canonical URLs to see if they
        // changed.
        /** @type {CanonicalURLParent|undefined} */
        let parent =
          aBrowser.browsingContext?.currentWindowGlobal.getExistingActor(
            "CanonicalURL"
          );

        if (parent) {
          parent.sendAsyncMessage("CanonicalURL:Detect");
          lazy.logConsole.debug(
            "requesting CanonicalURL:Detect due to history.pushState",
            aLocation.spec
          );
        }

        return;
      }

      // General same document case: we are navigating in the same document,
      // so the tab note indicator does not need to change.
      return;
    }

    // General case: we are doing normal navigation to another URL, so we
    // clear the canonical URL/tab note state on the tab and wait for
    // `CanonicalURL:Identified` to tell us whether the new location has
    // a tab note.
    const tab = aBrowser.ownerGlobal.gBrowser.getTabForBrowser(aBrowser);
    tab.canonicalUrl = undefined;
    tab.hasTabNote = false;
    lazy.logConsole.debug("clear tab note due to location change", tab);
  }
}

export const TabNotesController = new TabNotesControllerClass();
