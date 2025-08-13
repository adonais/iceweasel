/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  NewTabUtils: "resource://gre/modules/NewTabUtils.sys.mjs",
  thompsonSampleSort: "chrome://global/content/ml/ThomSample.sys.mjs",
  sortKeysValues: "chrome://global/content/ml/ThomSample.sys.mjs",
  PersistentCache: "resource://newtab/lib/PersistentCache.sys.mjs",
});

const SHORTCUT_TABLE = "moz_newtab_shortcuts_interaction";
const PLACES_TABLE = "moz_places";
const SHORTCUT_THOM_WEIGHT = 0.3;
const SHORTCUT_FREC_WEIGHT = 0.7;
const SHORTCUT_BIAS_WEIGHT = 0.01;
const SHORTCUT_POSITIVE_PRIOR = 1;
const SHORTCUT_NEGATIVE_PRIOR = 100;

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

  // Only get records in the last month!
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
      AND ${table}.timestamp_s >= strftime('%s', 'now', '-2 month')
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

/**
 * Compute average clicks and imps over items
 * Smoooth those averages towards priors
 *
 * @param {number[]} clicks Array of clicks
 * @param {number[]} imps Array of impressions
 * @param {number} pos_rate prior for clicks
 * @param {number} neg_rate prior for impressions
 * @returns {number[]} smoothed click count and impression count
 */

/**
 * Normalize values in an array by the sum of the array
 *
 * @param {number[]} vec Array of values to normalize
 * @returns {number[]} Normalized array
 */
export function sumNorm(vec) {
  if (!vec.length) {
    return vec;
  }
  const vsum = vec.reduce((a, b) => a + b, 0);

  let normed = [];
  if (vsum !== 0) {
    normed = vec.map(v => v / vsum);
  } else {
    normed = vec;
  }
  return normed;
}

function initShortcutWeights(prefValues) {
  const cfg = prefValues.smartShortcutsConfig ?? {};
  return {
    thom: (cfg.thom_weight ?? SHORTCUT_THOM_WEIGHT * 100) / 100,
    frec: (cfg.frec_weight ?? SHORTCUT_FREC_WEIGHT * 100) / 100,
    bias: (cfg.bias_weight ?? SHORTCUT_BIAS_WEIGHT * 100) / 100,
  };
}

/**
 * this function normalizes all values in vals and updates
 * the running mean and variance in normobj
 * normobj stores info to calculate a running mean and variance
 * over a feature, this is stored in the shortcut cache
 *
 * @param {number[]} vals scores to normalize
 * @param {object} normobj Dictionary of storing info for running mean var
 * @returns {[number, obj]} normalized features and the updated object
 */
function normUpdate(vals, input_normobj) {
  if (!vals.length) {
    return vals;
  }
  let normobj = {};
  if (!input_normobj) {
    normobj = { beta: 1e-3, mean: vals[0], var: 1.0 };
  } else {
    normobj = { ...input_normobj };
  }
  let delta = 0;
  for (const v of vals) {
    delta = v - normobj.mean;
    normobj.mean += normobj.beta * delta;
    normobj.var =
      (1 - normobj.beta) * normobj.var + normobj.beta * delta * delta;
  }
  const std = Math.sqrt(normobj.var);
  const new_vals = vals.map(v => (v - normobj.mean) / std);
  return [new_vals, normobj];
}

/**
 * Compute linear combination of scores, weighted
 *
 * @param {object[]} scores Dictionary of scores
 * @param {object[]} weights Dictionary of weights
 * @returns {number} Linear combination of scores*weights
 */
export function computeLinearScore(scores, weights) {
  let final = 0;
  let score = 0;
  for (const [feature, weight] of Object.entries(weights)) {
    score = scores[feature] ?? 0;
    final += score * weight;
  }
  return final;
}

/**
 * Check for bad numerical weights or changes in init config
 *
 * @param {object} weights Dictionary of weights from cache
 * @param {object} fresh Dictionary of weights based on config
 * @param {object} used Weights used to initialize the model
 * @returns {number} Linear combination of scores*weights
 */
function checkWeights(weights, fresh, used) {
  if (!weights || !used) {
    return [fresh, fresh];
  }
  for (const fkey of ["frec", "thom"]) {
    if (!Number.isFinite(weights[fkey]) || fresh[fkey] !== used[fkey]) {
      return [fresh, fresh];
    }
  }
  return [weights, used];
}

/**
 * Apply thompson sampling to topsites array, considers frecency weights
 *
 * @param {object[]} topsites Array of topsites objects
 * @param {object} prefValues Store user prefs, controls how this ranking behaves
 * @returns {combined: object[]} Array of topsites in reranked order
 */
export async function tsampleTopSites(topsites, prefValues) {
  const alpha =
    prefValues.smartShortcutsConfig?.positive_prior ?? SHORTCUT_POSITIVE_PRIOR;
  const beta =
    prefValues.smartShortcutsConfig?.negative_prior ?? SHORTCUT_NEGATIVE_PRIOR;
  // cache stores weights and the last feature values used to produce ranking
  const sc_obj = new lazy.PersistentCache("shortcut_cache", true);
  const sc_cache = await sc_obj.get();

  // check for bad weights (numerical) or change in init configs
  const [weights, init_weights] = checkWeights(
    sc_cache.weights,
    initShortcutWeights(prefValues),
    sc_cache.init_weights
  );

  // write the weights and init... might be redundance sometimes
  await sc_obj.set("weights", weights);
  await sc_obj.set("init_weights", init_weights);

  // split topsites into two arrays
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
  // query for interactions
  const [clicks, impressions] = await fetchShortcutInteractions(
    withGuid,
    SHORTCUT_TABLE,
    PLACES_TABLE
  );

  // sample scores for the topsites
  const ranked_thetas = await lazy.thompsonSampleSort({
    key_array: withGuid,
    obs_positive: clicks,
    obs_negative: impressions.map((imp, i) => Math.max(0, imp - clicks[i])),
    prior_positive: clicks.map(() => alpha),
    prior_negative: impressions.map(() => beta),
    do_sort: false,
  });
  const [theta_scores, thom_norm] = normUpdate(
    ranked_thetas[1],
    sc_cache.thom_norm
  );
  await sc_obj.set("thom_norm", thom_norm);

  // get frecency from withGUID
  const [frec_scores, frec_norm] = normUpdate(
    withGuid.map(site => site.frecency),
    sc_cache.frec_norm
  );
  await sc_obj.set("frec_norm", frec_norm);

  // update cache of scores, compute final score
  const score_map = Object.fromEntries(
    withGuid.map((site, i) => {
      const entry = {
        frec: frec_scores[i],
        thom: theta_scores[i],
        bias: 1.0,
      };

      const final = computeLinearScore(entry, weights);

      return [site.guid, { ...entry, final }];
    })
  );

  const sortedSitesVals = lazy.sortKeysValues(
    withGuid.map(g => score_map[g.guid].final),
    withGuid
  );

  await sc_obj.set("score_map", score_map);

  // drop theta from ranked to keep just the keys, combine back
  const combined = sortedSitesVals[0].concat(withoutGuid);
  return combined; // returns keys ordered by sampled score
}
