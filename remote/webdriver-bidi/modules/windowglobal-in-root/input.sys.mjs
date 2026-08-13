/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { Module } from "chrome://remote/content/shared/messagehandler/Module.sys.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  NavigableManager: "chrome://remote/content/shared/NavigableManager.sys.mjs",
  TabManager: "chrome://remote/content/shared/TabManager.sys.mjs",
  UserContextManager:
    "chrome://remote/content/shared/UserContextManager.sys.mjs",
});

class InputModule extends Module {
  destroy() {}

  interceptEvent(name, payload) {
    if (name == "input.fileDialogOpened") {
      const browsingContext = payload.context;
      if (!lazy.TabManager.isValidCanonicalBrowsingContext(browsingContext)) {
        // Discard events for invalid browsing contexts.
        return null;
      }

      // Resolve browsing context to a Navigable id.
      payload.context =
        lazy.NavigableManager.getIdForBrowsingContext(browsingContext);
      // Resolve the user context id for the browsing context.
      payload.userContext =
        lazy.UserContextManager.getIdByBrowsingContext(browsingContext);
    }

    return payload;
  }
}

export const input = InputModule;
