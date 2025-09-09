/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

const SHORTCUT_TABLE = "moz_newtab_shortcuts_interaction";
const PLACES_TABLE = "moz_places";
const VISITS_TABLE = "moz_historyvisits";
const BASE_SEASONALITY_CACHE_EXPIRATION = 1e3 * 60 * 60 * 24 * 7; // 7 day in miliseconds
const ETA = 100;
const CLICK_BONUS = 10;

const FEATURE_META = {
  thom: { pref: "thom_weight", def: 20 },
  frec: { pref: "frec_weight", def: 70 },
  hour: { pref: "hour_weight", def: 5 },
  daily: { pref: "daily_weight", def: 5 },
  bias: { pref: "bias_weight", def: 1 },
};

const SHORTCUT_FSET = 6;
const SHORTCUT_FSETS = {
  0: ["frec"],
  1: ["frec", "thom", "bias"],
  2: ["frec", "thom", "hour", "bias"],
  3: ["frec", "thom", "daily", "bias"],
  4: ["frec", "hour", "daily", "bias"],
  5: ["thom", "hour", "daily", "bias"],
  6: ["frec", "thom", "hour", "daily", "bias"],
};

const SHORTCUT_POSITIVE_PRIOR = 1;
const SHORTCUT_NEGATIVE_PRIOR = 100;

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  BasePromiseWorker: "resource://gre/modules/PromiseWorker.sys.mjs",
  NewTabUtils: "resource://gre/modules/NewTabUtils.sys.mjs",
  PersistentCache: "resource://newtab/lib/PersistentCache.sys.mjs",
});

import { sortKeysValues } from "resource://newtab/lib/SmartShortcutsRanker/ThomSample.mjs";

/**
 * Get histogram of all site visits over day-of-week
 *
 * @param {object[]} topsites Array of topsites objects
 * @param {string} table Table to query
 * @param {string} placeTable Table to map guid->place_id
 * @returns {result: object} Dictionary of histograms of day-of-week site opens
 */
async function fetchDailyVisitsSpecific(topsites, table, placeTable) {
  if (!topsites.length) {
    return {};
  }
  const guidList = topsites.map(site => site.guid);

  const valuesClause = guidList
    .map(guid => `('${guid.replace(/'/g, "''")}')`)
    .join(", ");

  const sql = `
      WITH input_keys(guid) AS (
        VALUES ${valuesClause}
      ),
      place_ids AS (
        SELECT input_keys.guid, pTable.id AS place_id
        FROM input_keys
        LEFT JOIN ${placeTable} as pTable ON pTable.guid = input_keys.guid
      )
      SELECT
        place_ids.guid AS key,
        CAST(strftime('%w', dTable.visit_date / 1e6, 'unixepoch') AS INTEGER) AS day_of_week,
        COUNT(dTable.visit_date) AS visit_count
      FROM place_ids
      LEFT JOIN ${table} as dTable
        ON dTable.place_id = place_ids.place_id
        AND dTable.visit_date >= 1e6 * strftime('%s', 'now', '-2 months')
      GROUP BY place_ids.guid, day_of_week
      ORDER BY place_ids.guid, day_of_week;
      `;
  const { activityStreamProvider } = lazy.NewTabUtils;
  const rows = await activityStreamProvider.executePlacesQuery(sql);
  const histograms = {};
  for (const [key, day_of_week, visit_count] of rows) {
    if (!histograms[key]) {
      histograms[key] = Array(7).fill(0);
    }
    if (day_of_week !== null) {
      histograms[key][day_of_week] = visit_count;
    }
  }
  for (const site of topsites) {
    if (!histograms[site.guid]) {
      histograms[site.guid] = Array(7).fill(0);
    }
  }
  return histograms;
}

/**
 * Get histogram of all site visits over day-of-week
 *
 * @param {string} table Table to query
 * @returns {number[]} Histogram of day-of-week site opens
 */
async function fetchDailyVisitsAll(table) {
  const sql = `
    SELECT
      CAST(strftime('%w', ${table}.visit_date / 1e6, 'unixepoch') AS INTEGER) AS day_of_week,
      COUNT(*) AS visit_count
    FROM ${table}
    WHERE ${table}.visit_date >= 1e6 * strftime('%s', 'now', '-6 months')
    GROUP BY day_of_week
    ORDER BY day_of_week;
  `;

  const { activityStreamProvider } = lazy.NewTabUtils;
  const rows = await activityStreamProvider.executePlacesQuery(sql);
  const histogram = Array(7).fill(0);
  for (const [day_of_week, visit_count] of rows) {
    if (day_of_week !== null) {
      histogram[day_of_week] = visit_count;
    }
  }
  return histogram;
}
/**
 * Get histogram of all site visits over hour-of-day
 *
 * @param {object[]} topsites Array of topsites objects
 * @param {string} table Table to query
 * @param {string} placeTable Table to map guid->place_id
 * @returns {object} Dictionary of histograms of hour-of-day site opens
 */
async function fetchHourlyVisitsSpecific(topsites, table, placeTable) {
  if (!topsites.length) {
    return {};
  }
  const guidList = topsites.map(site => site.guid);

  const valuesClause = guidList
    .map(guid => `('${guid.replace(/'/g, "''")}')`)
    .join(", ");

  const sql = `
      WITH input_keys(guid) AS (
        VALUES ${valuesClause}
      ),
      place_ids AS (
        SELECT input_keys.guid, pTable.id AS place_id
        FROM input_keys
        LEFT JOIN ${placeTable} as pTable ON pTable.guid = input_keys.guid
      )
      SELECT
        place_ids.guid AS key,
        CAST(strftime('%H', hTable.visit_date / 1e6, 'unixepoch') AS INTEGER) AS hour_of_day,
        COUNT(hTable.visit_date) AS visit_count
      FROM place_ids
      LEFT JOIN ${table} as hTable
        ON hTable.place_id = place_ids.place_id
        AND hTable.visit_date >= 1e6 * strftime('%s', 'now', '-2 months')
      GROUP BY place_ids.guid, hour_of_day
      ORDER BY place_ids.guid, hour_of_day;
      `;
  const { activityStreamProvider } = lazy.NewTabUtils;
  const rows = await activityStreamProvider.executePlacesQuery(sql);
  const histograms = {};
  for (const [key, hour_of_day, visit_count] of rows) {
    if (!histograms[key]) {
      histograms[key] = Array(24).fill(0);
    }
    if (hour_of_day !== null) {
      histograms[key][hour_of_day] = visit_count;
    }
  }
  for (const site of topsites) {
    if (!histograms[site.guid]) {
      histograms[site.guid] = Array(24).fill(0);
    }
  }
  return histograms;
}

/**
 * Get histogram of all site visits over hour-of-day
 *
 * @param {string} table Table to query
 * @returns {number[]} Histogram of hour-of-day site opens
 */
async function fetchHourlyVisitsAll(table) {
  const sql = `
    SELECT
      CAST(strftime('%H', ${table}.visit_date / 1e6, 'unixepoch') AS INTEGER) AS hour_of_day,
      COUNT(*) AS visit_count
    FROM ${table}
    WHERE ${table}.visit_date >= 1e6 * strftime('%s', 'now', '-6 months')
    GROUP BY hour_of_day
    ORDER BY hour_of_day;
  `;

  const { activityStreamProvider } = lazy.NewTabUtils;
  const rows = await activityStreamProvider.executePlacesQuery(sql);
  const histogram = Array(24).fill(0);
  for (const [hour_of_day, visit_count] of rows) {
    if (hour_of_day !== null) {
      histogram[hour_of_day] = visit_count;
    }
  }
  return histogram;
}

/**
 * Build weights object only for the requested features.
 * @param {object} prefValues - contains smartShortcutsConfig
 * @param {string[]} features - e.g. ["thom","frec"] (bias optional)
 */
function initShortcutWeights(prefValues, features) {
  const cfg = prefValues?.smartShortcutsConfig ?? {};
  const out = {};

  for (const f of features) {
    const meta = FEATURE_META[f];
    if (!meta) {
      continue;
    } // unknown feature: skip

    const raw = cfg[meta.pref];
    const percent = Number.isFinite(raw) ? raw : meta.def;
    out[f] = percent / 100;
  }

  return out;
}
/**
 * Check for bad numerical weights or changes in init config
 *
 * @param {object} all_weights Dictionary of weights from cache
 * @param {string[]} features List of features to have weights
 * @returns {object[]} current weights and the init weights
 */
function checkWeights(all_weights, features) {
  if (
    !all_weights.current ||
    !all_weights.old_init ||
    Object.keys(all_weights.current).length === 0
  ) {
    return [all_weights.new_init, all_weights.new_init];
  }
  for (const fkey of features) {
    if (
      !Number.isFinite(all_weights.current[fkey]) ||
      all_weights.old_init[fkey] !== all_weights.new_init[fkey]
    ) {
      return [all_weights.new_init, all_weights.new_init];
    }
  }
  return [all_weights.current, all_weights.old_init];
}

/**
 * Get clicks and impressions for sites in topsites array
 *
 * @param {object[]} topsites Array of topsites objects
 * @param {string} table Table for shortcuts interactions
 * @param {string} placeTable moz_places table
 * @returns {clicks: [number[], impressions: number[]]} Clicks and impressions for each site in topsites
 */
async function fetchShortcutInteractions(topsites, table, placeTable) {
  if (!topsites.length) {
    // Return empty clicks and impressions arrays
    return [[], []];
  }

  const guidList = topsites.map(site => site.guid);

  const valuesClause = guidList
    .map(guid => `('${guid.replace(/'/g, "''")}')`)
    .join(", ");

  // Only get records in the last 2 months!
  // Join no places table to map guid to place_id
  const sql = `
    WITH input_keys(guid) AS (
      VALUES ${valuesClause}
    ),
    place_ids AS (
      SELECT input_keys.guid, ${placeTable}.id AS place_id
      FROM input_keys
      JOIN ${placeTable} ON ${placeTable}.guid = input_keys.guid
    )
    SELECT
      place_ids.guid AS key,
      COALESCE(SUM(${table}.event_type), 0) AS total_clicks,
      COALESCE(SUM(1 - ${table}.event_type), 0) AS total_impressions
    FROM place_ids
    LEFT JOIN ${table} ON ${table}.place_id = place_ids.place_id
      AND ${table}.timestamp_s >= strftime('%s', 'now', '-2 months')
    GROUP BY place_ids.guid;
  `;

  const { activityStreamProvider } = lazy.NewTabUtils;
  const interactions = await activityStreamProvider.executePlacesQuery(sql);
  const interactionMap = new Map(
    interactions.map(row => {
      // Destructure the array into variables
      const [key, total_clicks, total_impressions] = row;
      return [key, { clicks: total_clicks, impressions: total_impressions }];
    })
  );

  // Rebuild aligned arrays in same order as input
  const clicks = guidList.map(guid =>
    interactionMap.has(guid) ? interactionMap.get(guid).clicks : 0
  );

  const impressions = guidList.map(guid =>
    interactionMap.has(guid) ? interactionMap.get(guid).impressions : 0
  );
  return [clicks, impressions];
}

export class RankShortcutsProvider {
  constructor() {
    this.sc_obj = new lazy.PersistentCache("shortcut_cache", true);
  }
  get rankShortcutsWorker() {
    if (!this._rankShortcutsWorker) {
      this._rankShortcutsWorker = new lazy.BasePromiseWorker(
        "resource://newtab/lib/SmartShortcutsRanker/RankShortcuts.worker.mjs",
        { type: "module" }
      );
    }
    return this._rankShortcutsWorker;
  }

  /**
   * Get hourly seasonality priors and per-site histograms.
   *
   * @param {Array<object>} topsites
   * @param {object} shortcut_cache
   * @param {object} isStartup stores the boolean isStartup
   * @returns {Promise<{pvec: number[]|null, hists: any}>}
   */
  async getHourlySeasonalityData(topsites, shortcut_cache, isStartup) {
    const cache = (shortcut_cache && shortcut_cache.hourly_seasonality) || null;
    const startup = isStartup.isStartup;

    let hourly_prob = null;

    const expired =
      cache &&
      Date.now() - (cache.timestamp || 0) > BASE_SEASONALITY_CACHE_EXPIRATION;
    const missing = !cache || !cache.pvec;

    if (!startup && (missing || expired)) {
      const all_hourly_hist = await fetchHourlyVisitsAll(VISITS_TABLE);
      hourly_prob = await this.rankShortcutsWorker.post("sumNorm", [
        all_hourly_hist,
      ]);
      // persist fresh prior
      await this.sc_obj.set("hourly_seasonality", {
        pvec: hourly_prob,
        timestamp: Date.now(),
      });
    } else {
      // safe read with optional chaining + null fallback
      hourly_prob = cache?.pvec ?? null;
    }

    // Per-topsite histograms are needed regardless
    const hourly_hists = await fetchHourlyVisitsSpecific(
      topsites,
      VISITS_TABLE,
      PLACES_TABLE
    );

    return { pvec: hourly_prob, hists: hourly_hists };
  }

  /**
   * Get daily seasonality priors and per-site histograms.
   *
   * @param {Array<object>} topsites
   * @param {object} shortcut_cache
   * @param {object} isStartup stores the boolean isStartup
   * @returns {Promise<{pvec: number[]|null, hists: any}>}
   */
  async getDailySeasonalityData(topsites, shortcut_cache, isStartup) {
    const cache = shortcut_cache?.daily_seasonality ?? null;
    const startup = isStartup.isStartup;

    let daily_prob = null;

    const expired =
      cache &&
      Date.now() - (cache.timestamp || 0) > BASE_SEASONALITY_CACHE_EXPIRATION;
    const missing = !cache || !cache.pvec;

    if (!startup && (missing || expired)) {
      const all_daily_hist = await fetchDailyVisitsAll(VISITS_TABLE);
      daily_prob = await this.rankShortcutsWorker.post("sumNorm", [
        all_daily_hist,
      ]);
      // persist fresh prior
      await this.sc_obj.set("daily_seasonality", {
        pvec: daily_prob,
        timestamp: Date.now(),
      });
    } else {
      daily_prob = cache?.pvec ?? null;
    }

    // Per-topsite histograms are needed regardless
    const daily_hists = await fetchDailyVisitsSpecific(
      topsites,
      VISITS_TABLE,
      PLACES_TABLE
    );

    return { pvec: daily_prob, hists: daily_hists };
  }

  async getLatestInteractions(cache_data, table, placeTable = "moz_places") {
    const now_s = Math.floor(Date.now() / 1000);
    let tlu = Number(cache_data.time_last_update ?? 0);
    if (tlu > 1e11) {
      tlu = Math.floor(tlu / 1000);
    } // ms -> s
    const since = Math.max(tlu, now_s - 24 * 60 * 60);

    const { activityStreamProvider } = lazy.NewTabUtils;

    const rows = await activityStreamProvider.executePlacesQuery(
      `
      SELECT
          p.guid AS guid,
          SUM(CASE WHEN e.event_type = 1 THEN 1 ELSE 0 END) AS clicks,
          SUM(CASE WHEN e.event_type = 0 THEN 1 ELSE 0 END) AS impressions
        FROM ${table} e
        JOIN ${placeTable} p ON p.id = e.place_id
        WHERE e.timestamp_s >= ${since}
        GROUP BY p.guid  
      `
    );

    const dict = Object.create(null);

    for (const r of Array.isArray(rows) ? rows : (rows ?? [])) {
      const guid = r.guid ?? (Array.isArray(r) ? r[0] : undefined);
      if (!guid) {
        continue;
      }
      const clicks = Number(r.clicks ?? (Array.isArray(r) ? r[1] : 0)) || 0;
      const impressions =
        Number(r.impressions ?? (Array.isArray(r) ? r[2] : 0)) || 0;
      dict[guid] = { clicks, impressions };
    }

    await this.sc_obj.set("time_last_update", now_s);

    return dict;
  }

  async rankTopSites(topsites, prefValues, isStartup) {
    // get our feature set
    const fset = prefValues.smartShortcutsConfig?.fset ?? SHORTCUT_FSET;
    const features = SHORTCUT_FSETS[fset] ?? ["frec"];
    // split topsites into two arrays, we only rank those with guid
    const [withGuid, withoutGuid] = topsites.reduce(
      ([withG, withoutG], site) => {
        if (site.guid && typeof site.guid === "string") {
          withG.push(site);
        } else {
          withoutG.push(site);
        }
        return [withG, withoutG];
      },
      [[], []]
    );
    // query for interactions, sql cant be on promise
    const [clicks, impressions] = await fetchShortcutInteractions(
      withGuid,
      SHORTCUT_TABLE,
      PLACES_TABLE
    );

    // cache stores weights and the last feature values used to produce ranking
    // PersistentCache r/w cant be on promise
    const sc_cache = await this.sc_obj.get();

    // check for bad weights (numerical) or change in init configs
    let [weights, init_weights] = checkWeights(
      {
        current: sc_cache.weights,
        new_init: initShortcutWeights(prefValues, features),
        old_init: sc_cache.init_weights,
      },
      features
    );

    // update our weights
    const latest_interaction_data = await this.getLatestInteractions(
      sc_cache,
      SHORTCUT_TABLE
    );
    weights = await this.rankShortcutsWorker.post("updateWeights", [
      {
        data: latest_interaction_data,
        scores: sc_cache.score_map,
        features,
        weights,
        eta: (prefValues.smartShortcutsConfig?.eta ?? ETA) / 10000,
        click_bonus:
          (prefValues.smartShortcutsConfig?.click_bonus ?? CLICK_BONUS) / 10,
      },
    ]);

    // write the weights and init... sometimes redundant
    await this.sc_obj.set("weights", weights);
    await this.sc_obj.set("init_weights", init_weights);

    // call to the promise worker to do the ranking
    const frecency_scores = withGuid.map(t => t.frecency);
    const output = await this.rankShortcutsWorker.post(
      "weightedSampleTopSites",
      [
        {
          features,
          alpha:
            prefValues.smartShortcutsConfig?.positive_prior ??
            SHORTCUT_POSITIVE_PRIOR,
          beta:
            prefValues.smartShortcutsConfig?.negative_prior ??
            SHORTCUT_NEGATIVE_PRIOR,
          tau: 100,
          guid: withGuid.map(t => t.guid),
          clicks,
          impressions,
          norms:
            sc_cache.norms ??
            Object.fromEntries(features.map(key => [key, null])),
          weights,
          frecency: frecency_scores,
          hourly_seasonality: await this.getHourlySeasonalityData(
            withGuid,
            sc_cache,
            isStartup
          ),
          daily_seasonality: await this.getDailySeasonalityData(
            withGuid,
            sc_cache,
            isStartup
          ),
        },
      ]
    );
    // update the cache
    await this.sc_obj.set("norms", output.norms);
    await this.sc_obj.set("score_map", output.score_map);

    // final score for ranking as an array
    let final_scores = withGuid.map(g => output.score_map[g.guid].final);
    //catch nan errors
    if (final_scores.some(x => Number.isNaN(x))) {
      final_scores = frecency_scores;
    }

    // sort by scores
    const sortedSitesVals = sortKeysValues(final_scores, withGuid);

    // grab topsites without guid
    const combined = sortedSitesVals[0].concat(withoutGuid);
    return combined;
  }
}
