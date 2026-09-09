/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  actionTypes as at,
  actionCreators as ac,
} from "resource://newtab/common/Actions.mjs";
import {
  WIDGET_REGISTRY,
  isWidgetEnabled,
} from "resource://newtab/common/WidgetsRegistry.mjs";

const PREF_WIDGETS_ENABLED = "widgets.enabled";

const RECENT_SEARCHES_ENTRY = WIDGET_REGISTRY.find(
  w => w.id === "recentSearches"
);

// Prefs that can flip the widget's registry enablement, including trainhop
// config. A change to any of these should re-evaluate whether to send an update.
const ENABLEMENT_PREFS = new Set([
  PREF_WIDGETS_ENABLED,
  RECENT_SEARCHES_ENTRY.enabledPref,
  RECENT_SEARCHES_ENTRY.systemEnabledPref,
  "trainhopConfig",
]);

/**
 * Feed for the Recent Searches widget. Runs in the parent process.
 */
export class RecentSearchesFeed {
  get enabled() {
    const prefs = this.store.getState()?.Prefs.values;
    // Share the registry enablement logic the UI uses, so a trainhop rollout
    // starts the feed even when the system pref defaults false.
    return isWidgetEnabled(
      RECENT_SEARCHES_ENTRY,
      prefs,
      prefs?.[PREF_WIDGETS_ENABLED]
    );
  }

  /**
   * Broadcast the current recent searches to every tab.
   *
   * STUB. Always sends an empty array today.
   */
  async updateSearches() {
    this.store.dispatch(
      ac.BroadcastToContent({
        type: at.WIDGETS_RECENT_SEARCHES_UPDATE,
        data: { searches: [] },
      })
    );
  }

  async onAction(action) {
    switch (action.type) {
      case at.INIT:
        if (this.enabled) {
          await this.updateSearches();
        }
        break;
      case at.PREF_CHANGED:
        // Enablement can flip on after startup (e.g. a trainhop rollout lands
        // its config); update as soon as it does.
        if (ENABLEMENT_PREFS.has(action.data?.name) && this.enabled) {
          await this.updateSearches();
        }
        break;
    }
  }
}
