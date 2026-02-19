/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { AIWINDOW_URL } from "moz-src:///browser/components/aiwindow/ui/modules/AIWindow.sys.mjs";

export const AIWindowUI = {
  BOX_ID: "ai-window-box",
  SPLITTER_ID: "ai-window-splitter",
  BROWSER_ID: "ai-window-browser",
  STACK_CLASS: "ai-window-browser-stack",

  /**
   * @param {Window} win
   * @returns {{ chromeDoc: Document, box: Element, splitter: Element } | null}
   */
  _getSidebarElements(win) {
    if (!win) {
      return null;
    }
    const chromeDoc = win.document;
    const box = chromeDoc.getElementById(this.BOX_ID);
    const splitter = chromeDoc.getElementById(this.SPLITTER_ID);

    if (!box || !splitter) {
      return null;
    }
    return { chromeDoc, box, splitter };
  },

  /**
   * Ensure the aiwindow <browser> exists under the sidebar box.
   *
   * @param {Document} chromeDoc
   * @param {Element} box
   * @returns {XULElement} browser
   */
  ensureBrowserIsAppended(chromeDoc, box) {
    const existingBrowser = chromeDoc.getElementById(this.BROWSER_ID);
    if (existingBrowser) {
      // Already exists
      return existingBrowser;
    }

    const stack = box.querySelector(`.${this.STACK_CLASS}`);

    if (!stack.isConnected) {
      stack.className = this.STACK_CLASS;
      stack.setAttribute("flex", "1");
      box.appendChild(stack);
    }

    const browser = chromeDoc.createXULElement("browser");
    browser.id = this.BROWSER_ID;
    browser.setAttribute("transparent", "true");
    browser.setAttribute("flex", "1");
    browser.setAttribute("disablehistory", "true");
    browser.setAttribute("disablefullscreen", "true");
    browser.setAttribute("tooltip", "aHTMLTooltip");
    browser.setAttribute("src", AIWINDOW_URL);
    stack.appendChild(browser);
    return browser;
  },

  /**
   * @param {Window} win
   * @returns {boolean} whether the sidebar is open (visible)
   */
  isSidebarOpen(win) {
    const nodes = this._getSidebarElements(win);
    if (!nodes) {
      return false;
    }
    // The sidebar is considered open if the box is visible
    return !nodes.box.hidden;
  },

  /**
   * Open the AI Window sidebar
   *
   * @param {Window} win
   */
  openSidebar(win) {
    const nodes = this._getSidebarElements(win);

    if (!nodes) {
      return;
    }

    const { chromeDoc, box, splitter } = nodes;

    this.ensureBrowserIsAppended(chromeDoc, box);

    box.hidden = false;
    splitter.hidden = false;
    box.parentElement.hidden = false;
  },

  /**
   * Close the AI Window sidebar.
   *
   * @param {Window} win
   */
  closeSidebar(win) {
    const nodes = this._getSidebarElements(win);
    if (!nodes) {
      return;
    }
    const { box, splitter } = nodes;

    box.hidden = true;
    splitter.hidden = true;
  },

  /**
   * Toggle the AI Window sidebar
   *
   * @param {Window} win
   * @returns {boolean} true if now open, false if now closed
   */
  toggleSidebar(win) {
    const nodes = this._getSidebarElements(win);
    if (!nodes) {
      return false;
    }
    const { chromeDoc, box, splitter } = nodes;

    const opening = box.hidden;
    if (opening) {
      this.ensureBrowserIsAppended(chromeDoc, box);
    }

    box.hidden = !opening;
    splitter.hidden = !opening;

    if (opening && box.parentElement?.hidden) {
      box.parentElement.hidden = false;
    }

    return opening;
  },
};
