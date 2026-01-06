/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

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

const EVENTS = ["CanonicalURL:Identified"];

const TOPICS = ["TabNote:Created", "TabNote:Edited", "TabNote:Removed"];

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
      TOPICS.forEach(topicName => Services.obs.addObserver(this, topicName));
      lazy.logConsole.debug("init", TOPICS);
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
      TOPICS.forEach(topicName => {
        try {
          Services.obs.removeObserver(this, topicName);
        } catch (e) {
          lazy.logConsole.warn(
            `Failed to remove self from topic '${topicName}'`
          );
        }
      });
      lazy.logConsole.debug("quit", TOPICS);
    }
  }

  /**
   * @param {CanonicalURLIdentifiedEvent} event
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
          tab.hasTabNote = lazy.TabNotes.has(canonicalUrl);
          lazy.logConsole.debug("CanonicalURL:Identified", tab, canonicalUrl);
        }
        break;
    }
  }

  /**
   * @param {nsISupports} subject
   * @param {string} topic
   * @param {string} data
   */
  observe(subject, topic, data) {
    switch (topic) {
      case "TabNote:Created":
        {
          // A new tab note was created for a specific canonical URL. Ensure that
          // all tabs with the same canonical URL also indicate that there is a
          // tab note.
          const canonicalUrl = data;
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
      case "TabNote:Removed":
        {
          // A new tab note was removed from a specific canonical URL. Ensure that
          // all tabs with the same canonical URL also indicate that there is no
          // longer a tab note.
          const canonicalUrl = data;
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
}

export const TabNotesController = new TabNotesControllerClass();
