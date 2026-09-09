/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * URLKeywordAnalyzer derives a search query from a failed URL, for the
 * dnsNotFound error-page Search CTA (meta bug 2055374).
 *
 * The single entry point, analyzeURL(), returns a content-free decision:
 *
 *   { action: one of SEARCH_CTA_ACTIONS,
 *     query:  string | null,
 *     reason: one of SEARCH_CTA_REASONS }
 *
 * Both vocabularies are exported so consumers and tests do not have to repeat
 * string literals. The decision layer that consumes this module adds reasons of
 * its own for outcomes this module cannot see, such as a missing search engine.
 *
 * Behavior:
 *   - Host viability is checked first: IP literals, single-label hosts, and
 *     reserved/special-use TLDs yield { none, null, host-unusable } (no CTA).
 *   - Keywords are extracted from the path: the in-tree CountVectorizer does the
 *     tokenizing only (lowercasing, digit stripping, Unicode-aware splitting)
 *     with its stopword filtering disabled, and we apply our own stopword list
 *     (SEARCH_CTA_STOP_WORDS, forked from the shared list; see bug 2057648).
 *     When the path yields keywords, the host's tokens (non-www subdomains kept,
 *     public suffix dropped) are appended so the query is anchored to the site,
 *     capped at MAX_SEARCH_KEYWORDS with the path first.
 *   - When the path yields nothing meaningful, the query falls back to the
 *     registrable domain only ({ host, ... }); userinfo, port, query string,
 *     and fragment are never inspected.
 *
 * Uses the effective-TLD service, so this runs with chrome privileges.
 */

import { SEARCH_CTA_STOP_WORDS } from "resource://gre/modules/URLKeywordStopWords.sys.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  CountVectorizer: "chrome://global/content/ml/NLPUtils.sys.mjs",
});

/**
 * What the caller should do with the failed URL. "keywords" and "host" both
 * mean a CTA is warranted, searching derived keywords or the registrable
 * domain respectively. "none" means no CTA.
 */
export const SEARCH_CTA_ACTIONS = Object.freeze({
  KEYWORDS: "keywords",
  HOST: "host",
  NONE: "none",
});

/**
 * Why analyzeURL() arrived at its action. These are the reasons this module can
 * reach on its own, and they double as Glean labels once the hyphens are
 * converted to underscores.
 */
export const SEARCH_CTA_REASONS = Object.freeze({
  KEYWORDS_FOUND: "keywords-found",
  NO_PATH: "no-path",
  NO_MEANINGFUL_KEYWORDS: "no-meaningful-keywords",
  HOST_UNUSABLE: "host-unusable",
});

const DEFAULT_MIN_KEYWORDS = 1;
// Upper bound on keywords fed into the search query.
const MAX_SEARCH_KEYWORDS = 8;

// Special-use / reserved TLDs that never resolve on the public internet
// (RFC 6761 plus ICANN's reserved .internal and .onion). A host under one of
// these is not a recoverable typo, so no CTA is offered.
const RESERVED_TLDS = new Set([
  "localhost",
  "local",
  "localdomain",
  "test",
  "example",
  "invalid",
  "internal",
  "onion",
]);

// Everything removed from derived keywords: function words plus URL-structure
// words, both carried by our forked list. Built once at load; the CTA
// deliberately does not use CountVectorizer's shared stopwords (bug 2057648).
const STOP_WORDS = new Set(SEARCH_CTA_STOP_WORDS);

/**
 * Return the registrable domain for a usable host, or null when the host fails
 * viability (IP literal, single-label host, or reserved/special-use TLD).
 *
 * @param {nsIURI} uri The failed URI.
 * @returns {?string} The registrable domain, or null if the host is unusable.
 */
function getRegistrableDomain(uri) {
  let baseDomain;
  try {
    baseDomain = Services.eTLD.getBaseDomain(uri);
  } catch (e) {
    // Empty host, IP literal (NS_ERROR_HOST_IS_IP_ADDRESS), or a single-label
    // host (NS_ERROR_INSUFFICIENT_DOMAIN_LEVELS).
    return null;
  }
  const tld = baseDomain.split(".").pop();
  if (RESERVED_TLDS.has(tld)) {
    return null;
  }
  return baseDomain;
}

/**
 * Tokenize a string into ordered, de-duplicated keywords. CountVectorizer does
 * the tokenizing only (lowercasing, digit stripping, Unicode-aware splitting)
 * with its stopword filtering disabled; stopwords are then removed with our own
 * STOP_WORDS list.
 *
 * @param {string} text The text to tokenize.
 * @returns {string[]} Keywords in first-appearance order.
 */
function keywordsFrom(text) {
  // Pass an empty stopword arg so CountVectorizer acts as a pure tokenizer; we
  // own the stopword filtering (bug 2057648).
  const cv = new lazy.CountVectorizer([]);
  cv.fit([text]);
  return cv.getFeatureNamesOut().filter(word => word && !STOP_WORDS.has(word));
}

/**
 * The host's contribution to the query: non-www subdomains are kept, the
 * public suffix is dropped.
 *
 * @param {nsIURI} uri The failed URI.
 * @returns {string[]} Host keywords.
 */
function hostKeywords(uri) {
  let host = uri.asciiHost.replace(/^www\./, "");
  try {
    const suffix = Services.eTLD.getPublicSuffix(uri);
    if (suffix && host.length > suffix.length) {
      host = host.slice(0, host.length - suffix.length - 1);
    }
  } catch (e) {
    // No public suffix (e.g. an IP); viability is already checked, use as-is.
  }
  return keywordsFrom(host);
}

/**
 * Derive a search query from a failed URL. See the module comment for the
 * shape and guarantees of the returned object.
 *
 * @param {string} urlString The failed URL.
 * @param {object} [options]
 * @param {number} [options.minKeywords=1] Minimum path keywords required before
 *   a keyword query is preferred over the host fallback.
 */
export function analyzeURL(
  urlString,
  { minKeywords = DEFAULT_MIN_KEYWORDS } = {}
) {
  let url;
  let uri;
  try {
    url = new URL(urlString);
    // The eTLD service prefers the nsIURI overloads, so convert once here and
    // pass the URI to everything that needs the host.
    uri = Services.io.newURI(url.href);
  } catch (e) {
    return {
      action: SEARCH_CTA_ACTIONS.NONE,
      query: null,
      reason: SEARCH_CTA_REASONS.HOST_UNUSABLE,
    };
  }

  const registrableDomain = getRegistrableDomain(uri);
  if (!registrableDomain) {
    return {
      action: SEARCH_CTA_ACTIONS.NONE,
      query: null,
      reason: SEARCH_CTA_REASONS.HOST_UNUSABLE,
    };
  }

  let pathText = url.pathname;
  try {
    pathText = decodeURIComponent(url.pathname);
  } catch (e) {
    // Malformed escape sequence; fall back to the raw path.
  }
  const pathKeywords = keywordsFrom(pathText);

  if (pathKeywords.length >= minKeywords) {
    // Anchor the query to the site by appending the host's tokens, path first.
    // A Set dedups while keeping first-appearance order.
    const keywords = new Set(pathKeywords);
    for (const word of hostKeywords(uri)) {
      keywords.add(word);
    }
    return {
      action: SEARCH_CTA_ACTIONS.KEYWORDS,
      query: [...keywords].slice(0, MAX_SEARCH_KEYWORDS).join(" "),
      reason: SEARCH_CTA_REASONS.KEYWORDS_FOUND,
    };
  }

  const hadPath = url.pathname && url.pathname !== "/";
  return {
    action: SEARCH_CTA_ACTIONS.HOST,
    query: registrableDomain,
    reason: hadPath
      ? SEARCH_CTA_REASONS.NO_MEANINGFUL_KEYWORDS
      : SEARCH_CTA_REASONS.NO_PATH,
  };
}
