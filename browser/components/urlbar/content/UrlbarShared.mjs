/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * This module exports urlbar related constants and helpers. It can be imported
 * into system and content realms, so it should not use content-only globals
 * like `window`. Any state it holds is per-realm (each importing realm gets
 * its own copy of the module).
 */

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  UrlbarPrefs: "moz-src:///browser/components/urlbar/UrlbarPrefs.sys.mjs",
});

export const UrlbarShared = {
  // The query-lifecycle notifications the controller dispatches to its
  // listeners. Defined here so both the parent controller and the content-side
  // child controller name them identically without the child reaching into the
  // parent module.
  NOTIFICATIONS: Object.freeze({
    QUERY_STARTED: "onQueryStarted",
    QUERY_RESULTS: "onQueryResults",
    QUERY_RESULT_REMOVED: "onQueryResultRemoved",
    QUERY_CANCELLED: "onQueryCancelled",
    QUERY_FINISHED: "onQueryFinished",
    VIEW_OPEN: "onViewOpen",
    VIEW_CLOSE: "onViewClose",
  }),

  TOKEN_TYPE: Object.freeze({
    TEXT: 1,
    // `looksLikeOrigin()` returned a value for this token that was neither
    // `LOOKS_LIKE_ORIGIN.NONE` nor `LOOKS_LIKE_ORIGIN.OTHER`. It sure looks
    // like an origin.
    POSSIBLE_ORIGIN: 2,
    POSSIBLE_URL: 3, // Consumers should still check this with a fixup.
    RESTRICT_HISTORY: 4,
    RESTRICT_BOOKMARK: 5,
    RESTRICT_TAG: 6,
    RESTRICT_OPENPAGE: 7,
    RESTRICT_SEARCH: 8,
    RESTRICT_TITLE: 9,
    RESTRICT_URL: 10,
    RESTRICT_ACTION: 11,
    // `looksLikeOrigin()` returned `LOOKS_LIKE_ORIGIN.OTHER` for this token.
    // It may or may not be an origin.
    POSSIBLE_ORIGIN_BUT_SEARCH_ALLOWED: 12,
  }),

  /**
   * Special characters that can be typed to restrict the search to a certain
   * category, like history, bookmarks or open pages; or to force a match on
   * just the title or url.
   *
   * These restriction characters can be typed alone, or at word boundaries,
   * provided their meaning cannot be confused, for example # could be present
   * in a valid url, and thus it should not be interpreted as a restriction.
   */
  RESTRICT_TOKENS: Object.freeze({
    HISTORY: "^",
    BOOKMARK: "*",
    TAG: "+",
    OPENPAGE: "%",
    SEARCH: "?",
    TITLE: "#",
    URL: "$",
    ACTION: ">",
  }),

  // Defines UrlbarResult types.
  RESULT_TYPE: Object.freeze({
    // An open tab.
    TAB_SWITCH: 1,
    // A search suggestion or engine.
    SEARCH: 2,
    // A common url/title tuple, may be a bookmark with tags.
    URL: 3,
    // A bookmark keyword.
    KEYWORD: 4,
    // A WebExtension Omnibox result.
    OMNIBOX: 5,
    // A tab from another synced device.
    REMOTE_TAB: 6,
    // An actionable message to help the user with their query.
    TIP: 7,
    // A type of result which layout is defined at runtime.
    DYNAMIC: 8,
    // A restrict keyword result, could be @bookmarks, @history, or @tabs.
    RESTRICT: 9,
    // An AI chat result.
    AI_CHAT: 10,

    // When you add a new type, also add its schema to
    // UrlbarUtils.RESULT_PAYLOAD_SCHEMA. Also consider checking if
    // consumers of "urlbar-user-start-navigation" need updating.
  }),

  // This defines the source of results returned by a provider. Each provider
  // can return results from more than one source. This is used by the
  // ProvidersManager to decide which providers must be queried and which
  // results can be returned.
  // If you add new source types, consider checking if consumers of
  // "urlbar-user-start-navigation" need update as well.
  RESULT_SOURCE: Object.freeze({
    BOOKMARKS: 1,
    HISTORY: 2,
    SEARCH: 3,
    TABS: 4,
    OTHER_LOCAL: 5,
    OTHER_NETWORK: 6,
    ADDON: 7,
    ACTIONS: 8,
  }),

  /**
   * Set of characters in RESTRICT_TOKENS that will enter search mode.
   */
  get SEARCH_MODE_RESTRICT() {
    /** @type {Values<typeof UrlbarShared.RESTRICT_TOKENS>[]} */
    const keys = [
      this.RESTRICT_TOKENS.HISTORY,
      this.RESTRICT_TOKENS.BOOKMARK,
      this.RESTRICT_TOKENS.OPENPAGE,
      this.RESTRICT_TOKENS.SEARCH,
    ];
    if (lazy.UrlbarPrefs.get("scotchBonnet.enableOverride")) {
      keys.push(this.RESTRICT_TOKENS.ACTION);
    }
    return new Set(keys);
  },

  /**
   * Creates a console logger.
   *
   * In non-chrome contexts, `console.createInstance` is unavailable, so this
   * falls back to the global `console`.
   *
   * @param {object} [options]
   * @param {string} [options.prefix]
   *   Prefix to use for the logged messages.
   * @returns {Console}
   *   The console logger.
   */
  getLogger({ prefix = "" } = {}) {
    let logger = loggers.get(prefix);
    if (logger) {
      return logger;
    }

    let fullPrefix = `URLBar${prefix ? " - " + prefix : ""}`;
    if (console.createInstance) {
      logger = createLoggerChrome(fullPrefix);
    } else {
      logger = createLoggerContent(fullPrefix);
    }
    loggers.set(prefix, logger);
    return logger;
  },

  /**
   * Deep-equality check for plain JSON-like data (arrays, objects, primitives),
   * so content-realm modules needn't import ObjectUtils (a system module). Not a
   * general-purpose deepEqual: it treats Map/Set/Date/RegExp/typed arrays as
   * plain objects, so only use it on structured-clone-plain data.
   *
   * @param {any} a
   * @param {any} b
   * @returns {boolean}
   */
  deepEqual(a, b) {
    if (a === b) {
      return true;
    }
    if (typeof a != "object" || typeof b != "object" || !a || !b) {
      return false;
    }
    let aKeys = Object.keys(a);
    let bKeys = Object.keys(b);
    return (
      aKeys.length == bKeys.length &&
      aKeys.every(
        k => Object.hasOwn(b, k) && UrlbarShared.deepEqual(a[k], b[k])
      )
    );
  },
};

/**
 * Create a logger that uses `console.createInstance`.
 *
 * @param {string} prefix
 * @returns {Console}
 */
function createLoggerChrome(prefix) {
  let logger = console.createInstance({
    prefix,
    maxLogLevelPref: "browser.urlbar.loglevel",
  });
  // Casting from ConsoleInstance to Console. Note that it is technically not a
  // `Console` because it is missing the chrome-only property `createInstance`.
  return /** @type {Console} */ (/** @type {unknown} */ (logger));
}

/**
 * Create a logger that uses the global `console`.
 *
 * @param {string} prefix
 * @returns {Console}
 */
function createLoggerContent(prefix) {
  let tag = `[${prefix}]`;
  const LEVEL_NUMBERS = {
    all: 0,
    trace: 1,
    debug: 2,
    log: 3,
    info: 3,
    warn: 4,
    error: 5,
    off: Infinity,
  };
  const LEVELS = ["debug", "log", "info", "trace", "warn", "error"];

  let shouldLog = level => {
    let maxLevel =
      LEVEL_NUMBERS[lazy.UrlbarPrefs.get("loglevel").toLowerCase()] ??
      LEVEL_NUMBERS.warn;
    return maxLevel <= LEVEL_NUMBERS[level];
  };

  return new Proxy(console, {
    get(target, prop) {
      if (typeof prop == "string" && LEVELS.includes(prop)) {
        return (...args) => shouldLog(prop) && target[prop](tag, ...args);
      }

      let value = target[prop];
      return typeof value == "function" ? value.bind(target) : value;
    },
  });
}

/** @type {Map<string, Console>} */
const loggers = new Map();
