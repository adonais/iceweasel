/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  PlacesUtils: "resource://gre/modules/PlacesUtils.sys.mjs",
  PersistentCache: "resource://newtab/lib/PersistentCache.sys.mjs",
});

import { actionTypes as at } from "resource://newtab/common/Actions.mjs";

const ETA = 100;

const PREF_SYSTEM_SHORTCUTS_PERSONALIZATION =
  "discoverystream.shortcuts.personalization.enabled";

function timeMSToSeconds(timeMS) {
  return Math.round(timeMS / 1000);
}

/**
 * A feature that periodically generates an interest vector for personalized shortcuts.
 */
export class SmartShortcutsFeed {
  constructor() {
    this.loaded = false;
  }

  isEnabled() {
    const { values } = this.store.getState().Prefs;
    const systemPref = values[PREF_SYSTEM_SHORTCUTS_PERSONALIZATION];
    const experimentVariable = values.smartShortcutsConfig?.enabled;

    return systemPref || experimentVariable;
  }

  async init() {
    if (!this.isEnabled()) {
      return;
    }
    const { values } = this.store.getState().Prefs;
    this.loaded = true;
    // shortcut ranking params, eta=learning_rate
    this.eta = (values.smartShortcutsConfig?.eta ?? ETA) / 10000;
  }

  async reset() {
    this.loaded = false;
  }

  async recordShortcutsInteraction(event_type, data) {
    // We don't need to worry about interactions that don't have a guid.
    if (!data.guid) {
      return;
    }
    // if learning rate (eta) is positive, update the shortcuts ranking weights
    if (this.eta > 0) {
      await this.updateShortcutRanker(
        {
          guid: data.guid,
          val: event_type,
          eta: this.eta,
        },
        "shortcut_cache"
      );
    }
    const insertValues = {
      guid: data.guid,
      event_type,
      timestamp_s: timeMSToSeconds(this.Date().now()),
      pinned: data.isPinned ? 1 : 0,
      tile_position: data.position,
    };

    let sql = `
      INSERT INTO moz_newtab_shortcuts_interaction (
        place_id, event_type, timestamp_s, pinned, tile_position
      )
      SELECT
        id, :event_type, :timestamp_s, :pinned, :tile_position
      FROM moz_places
      WHERE guid = :guid
    `;

    await lazy.PlacesUtils.withConnectionWrapper(
      "newtab/lib/SmartShortcutsFeed.sys.mjs: recordShortcutsInteraction",
      async db => {
        await db.execute(sql, insertValues);
      }
    );
  }

  async handleTopSitesOrganicImpressionStats(action) {
    switch (action.data?.type) {
      case "impression": {
        await this.recordShortcutsInteraction(0, action.data);
        break;
      }
      case "click": {
        await this.recordShortcutsInteraction(1, action.data);
        break;
      }
    }
  }

  async onPrefChangedAction(action) {
    switch (action.data.name) {
      case PREF_SYSTEM_SHORTCUTS_PERSONALIZATION: {
        await this.init();
        break;
      }
    }
  }

  async onAction(action) {
    switch (action.type) {
      case at.INIT:
        await this.init();
        break;
      case at.UNINIT:
        await this.reset();
        break;
      case at.TOP_SITES_ORGANIC_IMPRESSION_STATS:
        if (this.isEnabled()) {
          await this.handleTopSitesOrganicImpressionStats(action);
        }
        break;
      case at.PREF_CHANGED:
        this.onPrefChangedAction(action);
        if (action.data.name === "smartShortcutsConfig") {
          await this.init();
        }
        break;
    }
  }

  /**
   * Update the logistic regression weights for shortcuts ranking using gradient descent
   *
   * @param {object} params Stores the guid (topsite key), val (click or not), eta (learning rate)
   * @param {object} sc_obj Cache where we will read/write weights, read features
   * @returns {number} Sucessful or not flag
   */
  async updateShortcutRanker(params, cache_name) {
    // Create cache object
    const sc_obj = new lazy.PersistentCache(cache_name, true);
    // Check the cache
    const sc_cache = await sc_obj.get();
    // Check we have scores
    let score_map = {};
    if (!sc_cache.score_map || !sc_cache.weights) {
      return 0;
    }

    score_map = sc_cache.score_map;

    if (!score_map[params.guid]) {
      return 0;
    }

    // Now lets update the weights
    // Assume score_map[guid] is available as `entry`
    const delta = this.sigmoid(score_map[params.guid].final) - params.val;

    // Clone weights for mutation
    let new_weights = { ...sc_cache.weights };
    for (const feature of Object.keys(sc_cache.weights)) {
      const input = score_map[params.guid][feature] ?? 0;
      new_weights[feature] -= params.eta * delta * input;
    }

    new_weights = this.clampWeights(new_weights);
    await sc_obj.set("weights", new_weights);
    return 1;
  }

  sigmoid(x) {
    return 1 / (1 + Math.exp(-x));
  }

  clampWeights(weights, maxNorm = 100) {
    const norm = Math.hypot(...Object.values(weights));
    if (norm > maxNorm) {
      const scale = maxNorm / norm;
      return Object.fromEntries(
        Object.entries(weights).map(([k, v]) => [k, v * scale])
      );
    }
    return weights;
  }
}

/**
 * Creating a thin wrapper around Date.
 * This makes it easier for us to write automated tests that simulate responses.
 */
SmartShortcutsFeed.prototype.Date = () => {
  return Date;
};
