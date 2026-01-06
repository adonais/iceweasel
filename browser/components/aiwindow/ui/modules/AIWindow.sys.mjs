/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

/**
 * AI Window Service
 */

export const AIWindow = {
  _initialized: false,
  _windowStates: new Map(),

  /**
   * Handles startup tasks
   */

  init(win) {
    if (this._initialized) {
      return;
    }

    XPCOMUtils.defineLazyPreferenceGetter(
      this,
      "AIWindowEnabled",
      "browser.aiwindow.enabled",
      false
    );

    this._initialized = true;
    this._windowStates.set(win, {});
  },

  /**
   * Sets options for new AI Window if new or inherited conditions are met
   *
   * @param {object} win opener window
   * @param {object} options options to be passed into BrowserWindowTracker.openWindow
   */
  handleAIWindowOptions(win, options = {}) {
    const { openerWindow } = options;

    const canInheritAIWindow =
      this.isAIWindowActive(win) &&
      !options.private &&
      !Object.hasOwn(options, "aiWindow");

    const willOpenAIWindow =
      openerWindow &&
      openerWindow.AIWindow?.isAIWindowEnabled &&
      (options.aiWindow || canInheritAIWindow);

    if (!willOpenAIWindow) {
      return;
    }

    options.args ??= Cc["@mozilla.org/array;1"].createInstance(
      Ci.nsIMutableArray
    );

    if (!options.args.length) {
      const aiWindowURI = Cc["@mozilla.org/supports-string;1"].createInstance(
        Ci.nsISupportsString
      );
      aiWindowURI.data = "chrome://browser/content/genai/smartAssist.html";
      options.args.appendElement(aiWindowURI);

      const aiOption = Cc["@mozilla.org/hash-property-bag;1"].createInstance(
        Ci.nsIWritablePropertyBag2
      );
      aiOption.setPropertyAsBool("ai-window", options.aiWindow);
      options.args.appendElement(aiOption);
    }
  },

  /**
   * Is current window an AI Window
   *
   * @param {object} win current Window
   * @returns {boolean} whether current Window is an AI Window
   */

  isAIWindowActive(win) {
    return win.document.documentElement.hasAttribute("ai-window");
  },

  /**
   * Is AI Window enabled
   *
   * @returns {boolean} whether AI Window is enabled
   */

  isAIWindowEnabled() {
    return this.AIWindowEnabled;
  },
};
