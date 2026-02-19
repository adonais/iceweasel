/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  AIWindow:
    "moz-src:///browser/components/aiwindow/ui/modules/AIWindow.sys.mjs",
});

/**
 * JSWindowActor to pass data between AIChatContent singleton and content pages.
 */
export class AIChatContentParent extends JSWindowActorParent {
  dispatchMessageToChatContent(response) {
    this.sendAsyncMessage("AIChatContent:DispatchMessage", response);
  }

  receiveMessage({ data, name }) {
    switch (name) {
      case "aiChatContentActor:search":
        this.#handleSearchFromChild(data);
        break;

      default:
        console.warn(`AIChatContentParent received unknown message: ${name}`);
        break;
    }
    return undefined;
  }

  #handleSearchFromChild(data) {
    try {
      const { topChromeWindow } = this.browsingContext;
      lazy.AIWindow.performSearch(data, topChromeWindow);
    } catch (e) {
      console.warn("Could not perform search from AI Window chat", e);
    }
  }
}
