/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  MiniWindowManager:
    "moz-src:///browser/components/miniwindow/MiniWindowManager.sys.mjs",
});

/**
 * Parent actor for Mini Window.
 */
export class MiniWindowParent extends JSWindowActorParent {
  receiveMessage(message) {
    switch (message.name) {
      case "Scrolled": {
        let browser = this.browsingContext?.top?.embedderElement;
        let miniwindow = lazy.MiniWindowManager._miniWindowForBrowser(browser);
        if (message.data.up) {
          miniwindow?.revealToolbar();
        } else {
          miniwindow?.hideToolbarOnScrollDown();
        }
        break;
      }
    }
  }
}
