/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/** @import {Store} from "resource://newtab/lib/Store.sys.mjs" */

import {
  actionTypes as at,
  actionCreators as ac,
} from "resource://newtab/common/Actions.mjs";
import {
  WIDGET_REGISTRY,
  isWidgetEnabled,
} from "resource://newtab/common/WidgetsRegistry.mjs";

const PREF_WIDGETS_ENABLED = "widgets.enabled";

const TRAVEL_ENTRY = WIDGET_REGISTRY.find(w => w.id === "travel");

// Prefs whose change can turn the widget on or off. trainhopConfig is one of
// them because a rollout can reveal the widget.
const ENABLEMENT_PREFS = new Set([
  PREF_WIDGETS_ENABLED,
  TRAVEL_ENTRY.enabledPref,
  TRAVEL_ENTRY.systemEnabledPref,
  "region",
  "trainhopConfig",
]);

/**
 * Feed for the Travel widget. Runs in the parent process and broadcasts the
 * widget's state to every tab, for now an empty result set.
 */
export class TravelFeed {
  /** @type {Store} */
  store = null;

  get enabled() {
    const prefs = this.store.getState()?.Prefs.values;
    return isWidgetEnabled(TRAVEL_ENTRY, prefs, prefs?.[PREF_WIDGETS_ENABLED]);
  }

  broadcastResults() {
    this.store.dispatch(
      ac.BroadcastToContent({
        type: at.WIDGETS_TRAVEL_UPDATE,
        data: { results: [] },
      })
    );
  }

  onAction(action) {
    switch (action.type) {
      case at.INIT:
        if (this.enabled) {
          this.broadcastResults();
        }
        break;
      case at.PREF_CHANGED:
        if (ENABLEMENT_PREFS.has(action.data?.name) && this.enabled) {
          this.broadcastResults();
        }
        break;
    }
  }
}
