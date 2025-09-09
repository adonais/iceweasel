/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { thompsonSampleSort } from "resource://newtab/lib/SmartShortcutsRanker/ThomSample.mjs"; //"ThomSample.mjs";

/**
 * Linear interpolation of values in histogram, wraps from end to beginning
 *
 * @param {number[]} hist Defines histogram of counts
 * @param {number} t Time/Index we are interpolating to
 * @returns {normed: number} Normalized number
 */
export function interpolateWrappedHistogram(hist, t) {
  if (!hist.length) {
    return hist;
  }
  const n = hist.length;
  const lo = Math.floor(t) % n;
  const hi = (lo + 1) % n;
  const frac = t - Math.floor(t);

  // Adjust for negative t
  const loWrapped = (lo + n) % n;
  const hiWrapped = (hi + n) % n;

  return (1 - frac) * hist[loWrapped] + frac * hist[hiWrapped];
}
/**
 * Bayesian update of vec to reflect pvec weighted by tau
 *
 * @param {number[]} vec Array of values to update
 * @param {number[]} pvec Normalized array of values to reference
 * @param {number} tau Strength of the update
 * @returns {number[]} Normalized array
 */
export function bayesHist(vec, pvec, tau) {
  if (!pvec || !vec.length || vec.length !== pvec.length) {
    return vec;
  }
  const vsum = vec.reduce((a, b) => a + b, 0);
  if (vsum + tau === 0) {
    return vec;
  }
  const bhist = vec.map((v, i) => (v + tau * pvec[i]) / (vsum + tau));
  return bhist;
}

function getCurrentHourOfDay() {
  const now = new Date();
  return now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
}

function getCurrentDayOfWeek() {
  const now = new Date();
  return now.getDay(); // returns an int not a float
}

/**
 * Compute average clicks and imps over items
 * Smooth those averages towards priors
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
  if (!Number.isFinite(vsum) || vsum !== 0) {
    normed = vec.map(v => v / vsum);
  } else {
    normed = vec;
  }
  return normed;
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
    return [vals, input_normobj];
  }
  let normobj = {};
  if (
    !input_normobj ||
    !Number.isFinite(input_normobj.mean) ||
    !Number.isFinite(input_normobj.var)
  ) {
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
  if (normobj.var <= 1e-8) {
    normobj.var = 1e-8;
  }

  const std = Math.sqrt(normobj.var);
  const new_vals = vals.map(v => (v - normobj.mean) / std);
  return [new_vals, normobj];
}

/**
 * Normalize a dictionary of {key: hist[]} using squared values and column-wise normalization.
 * Returns {key: normedHist[]} where each hist[j] is divided by sum_k hist_k[j]^2.
 *
 * @param {Object<string, number[]>} dict - A dictionary mapping keys to arrays of P(t|s) values.
 * @returns {Object<string, number[]>} New dictionary with normalized histograms (P(s|t)).
 */
export function normHistDict(dict) {
  const keys = Object.keys(dict);
  if (keys.length === 0) {
    return {};
  }

  const t = dict[keys[0]].length;

  // square all hist values to emphasize differences
  const squared = {};
  for (const [key, hist] of Object.entries(dict)) {
    squared[key] = hist.map(v => v * v);
  }

  // compute column-wise sums
  const colSums = Array(t).fill(0);
  for (let j = 0; j < t; j++) {
    for (const key of keys) {
      colSums[j] += squared[key][j];
    }
  }

  // normalize
  const normalized = {};
  for (const [key, row] of Object.entries(squared)) {
    normalized[key] = row.map((val, j) => (colSums[j] ? val / colSums[j] : 0));
  }

  return normalized;
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

export function processSeasonality(guids, input, tau, curtime) {
  const { hists } = input;
  const { pvec } = input;
  // normalize new/rare site visits using general seasonlity to control against "fliers"
  const b_hists = Object.fromEntries(
    Object.entries(hists).map(([guid, hist]) => [
      guid,
      bayesHist(hist, pvec, tau),
    ])
  );
  // convert to P(time | site), prepare for bayes
  const timegivensite = Object.fromEntries(
    Object.entries(b_hists).map(([guid, hist]) => [guid, sumNorm(hist)])
  );
  // use bayes to convert to P(site | time)
  const sitegiventime = normHistDict(timegivensite);
  // interpolate P(site | time) to weight each site
  const weights = Object.fromEntries(
    Object.entries(sitegiventime).map(([guid, hist]) => [
      guid,
      interpolateWrappedHistogram(hist, curtime),
    ])
  );
  // make it an array
  const weightsarr = guids.map(key => weights[key]);
  // normalize to account for interpolation oddities
  const normweights = sumNorm(weightsarr);
  return normweights;
}

/**
 * Apply thompson sampling to topsites array, considers frecency weights
 *
 * @param {object[]} topsites Array of topsites objects
 * @param {object} prefValues Store user prefs, controls how this ranking behaves
 * @returns {combined: object[]} Array of topsites in reranked order
 */
export async function weightedSampleTopSites(input) {
  let updated_norms = {};
  let score_map = Object.fromEntries(
    input.guid.map(guid => [
      guid,
      Object.fromEntries(input.features.map(feature => [feature, 0])),
    ])
  );

  // THOMPSON FEATURES
  // sample scores for the topsites
  if (input.features.includes("thom")) {
    const ranked_thetas = await thompsonSampleSort({
      key_array: input.guid,
      obs_positive: input.clicks,
      obs_negative: input.impressions.map((imp, i) =>
        Math.max(0, imp - input.clicks[i])
      ),
      prior_positive: input.clicks.map(() => input.alpha),
      prior_negative: input.impressions.map(() => input.beta),
      do_sort: false,
    });
    const [thom_scores, thom_norm] = normUpdate(
      ranked_thetas[1],
      input.norms.thom
    );
    updated_norms.thom = thom_norm;
    input.guid.forEach((guid, i) => {
      score_map[guid].thom = thom_scores[i];
    });
  }
  // FRECENCY FEATURES
  // get frecency from withGUID
  if (input.features.includes("frec")) {
    const [frec_scores, frec_norm] = normUpdate(
      input.frecency,
      input.norms.frec
    );
    updated_norms.frec = frec_norm;
    input.guid.forEach((guid, i) => {
      score_map[guid].frec = frec_scores[i];
    });
  }

  // HOURLY SEASONALITY FEATURES
  if (input.features.includes("hour")) {
    const raw_hour_scores = processSeasonality(
      input.guid,
      input.hourly_seasonality,
      input.tau,
      getCurrentHourOfDay()
    );
    const [hour_scores, hour_norm] = normUpdate(
      raw_hour_scores,
      input.norms.hour
    );
    updated_norms.hour = hour_norm;
    input.guid.forEach((guid, i) => {
      score_map[guid].hour = hour_scores[i];
    });
  }

  // DAILY SEASONALITY FEATURES
  if (input.features.includes("daily")) {
    const raw_daily_scores = processSeasonality(
      input.guid,
      input.daily_seasonality,
      input.tau,
      getCurrentDayOfWeek()
    );
    const [daily_scores, daily_norm] = normUpdate(
      raw_daily_scores,
      input.norms.daily
    );
    updated_norms.daily = daily_norm;
    input.guid.forEach((guid, i) => {
      score_map[guid].daily = daily_scores[i];
    });
  }

  // BIAS
  if (input.features.includes("bias")) {
    input.guid.forEach(guid => {
      score_map[guid].bias = 1;
    });
  }
  // FINAL SCORE, track other scores
  for (const guid of Object.keys(score_map)) {
    score_map[guid].final = computeLinearScore(score_map[guid], input.weights);
  }

  const output = {
    score_map,
    norms: updated_norms,
  };
  return output;
}

export function clampWeights(weights, maxNorm = 100) {
  const norm = Math.hypot(...Object.values(weights));
  if (norm > maxNorm) {
    const scale = maxNorm / norm;
    return Object.fromEntries(
      Object.entries(weights).map(([k, v]) => [k, v * scale])
    );
  }
  return weights;
}

/**
 * Update the logistic regression weights for shortcuts ranking using gradient descent.
 *
 * @param {object} input
 * @param {string[]} input.features
 *   The list of feature names (keys in weights and score_map[guid]).
 * @param {object} input.data
 *   Mapping guid -> { clicks: number, impressions: number }.
 * @param {object} input.scores
 *   Mapping guid -> { final: number, [feature]: number } (final = w·x).
 * @param {object} input.weights
 *   Current weight vector, keyed by feature
 * @param {number} input.eta
 *   Learning rate.
 * @param {number} [input.click_bonus=1]
 *   Multiplicative weight for click events.
 * @param {boolean} [do_clamp=true]
 *   If true, clamp weights after update.
 * @returns {object}
 *   Updated weights object.
 */
export function updateWeights(input, do_clamp = true) {
  const { features } = input;
  const { data } = input;
  const score_map = input.scores;
  let { weights } = input;
  const { eta } = input;
  const click_bonus = input.click_bonus ?? 1;

  const grads = Object.create(null);
  let total = 0;

  // init gradient accumulator
  for (let j = 0; j < features.length; j += 1) {
    grads[features[j]] = 0;
  }

  for (const guid of Object.keys(data)) {
    if (
      score_map &&
      score_map[guid] &&
      typeof score_map[guid].final === "number"
    ) {
      const clicks = (data[guid].clicks | 0) * click_bonus;
      const impressions = data[guid].impressions | 0;
      if (clicks === 0 && impressions === 0) {
        continue;
      }

      const z = score_map[guid].final;
      const p = 1 / (1 + Math.exp(-z)); // sigmoid
      const factor = clicks * (p - 1) + impressions * p;

      for (const feature of features) {
        const fval = score_map[guid][feature] || 0;
        grads[feature] += factor * fval;
      }

      total += clicks + impressions;
    }
  }

  if (total > 0) {
    const scale = eta / total;
    for (const feature of features) {
      weights[feature] -= scale * grads[feature];
    }
  }
  if (do_clamp) {
    weights = clampWeights(weights);
  }
  return weights;
}

export class RankShortcutsWorker {
  async weightedSampleTopSites(input) {
    return weightedSampleTopSites(input);
  }
  async sumNorm(vec) {
    return sumNorm(vec);
  }
  async updateWeights(input) {
    return updateWeights(input);
  }
}
