/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

const DEFAULT_FORM_HISTORY_PARAM = "searchbar-history";
const HTTP_OK = 200;
const REMOTE_TIMEOUT_DEFAULT = 500;
// If this value is updated, the labels for  the
// `search.suggestions.ohttp.request_counter` metric should also be updated.
const MAX_OHTTP_FAILURES_BEFORE_FALLBACK = 5;
// Minimum of 2 hours once the fallback is activated.
const MIN_DURATION_FOR_FALLBACK_MS = 2 * 60 * 60 * 1000;

const lazy = XPCOMUtils.declareLazy({
  FormHistory: "resource://gre/modules/FormHistory.sys.mjs",
  SearchUtils: "moz-src:///toolkit/components/search/SearchUtils.sys.mjs",
  // This is currently only used within experiment code.
  // eslint-disable-next-line mozilla/no-browser-refs-in-toolkit
  MerinoClient: "moz-src:///browser/components/urlbar/MerinoClient.sys.mjs",
  logConsole: () =>
    console.createInstance({
      prefix: "SearchSuggestionController",
      maxLogLevel: lazy.SearchUtils.loggingEnabled ? "Debug" : "Warn",
    }),
  /** Whether or not remote suggestions are turned on. */
  suggestionsEnabled: { pref: "browser.search.suggest.enabled", default: true },
  /** Whether or not remote suggestions are turned on in private browsing mode. */
  suggestionsInPrivateBrowsingEnabled: {
    pref: "browser.search.suggest.enabled.private",
    default: false,
  },
  /** Whether or not rich suggestions are turned on. */
  richSuggestionsEnabled: {
    pref: "browser.urlbar.richSuggestions.featureGate",
    default: false,
  },
  /** The maximum time (ms) to wait before giving up on a remote suggestions. */
  remoteTimeout: {
    pref: "browser.search.suggest.timeout",
    default: REMOTE_TIMEOUT_DEFAULT,
  },
  ohttpFeatureGateEnabled: {
    pref: "browser.search.suggest.ohttp.featureGate",
    default: false,
  },
  ohttpEnabled: {
    pref: "browser.search.suggest.ohttp.enabled",
    default: false,
  },
});

/**
 * @typedef {Awaited<ReturnType<typeof lazy.FormHistory.getAutoCompleteResults>>} FormHistoryResultType
 */

/**
 * @typedef {[
 *   suggestions: string[], descriptions:string[], richResultInformation: object[]
 * ]} SuggestionRemoteResult
 */

/**
 * @import {MerinoClient} from "moz-src:///browser/components/urlbar/MerinoClient.sys.mjs"
 */

/**
 * @typedef {object} SuggestionFetchOptions
 * @property {string} searchString
 *   The term to provide suggestions for.
 * @property {boolean} inPrivateBrowsing
 *   Whether the request is being made in the context of private browsing.
 * @property {nsISearchEngine} engine
 *   The search engine to use for suggestions.
 * @property {number} [userContextId]
 *   The userContextId of the selected tab.
 * @property {boolean} [restrictToEngine]
 *   Whether to restrict local historical suggestions to the ones registered
 *   under the given engine.
 * @property {boolean} [dedupeRemoteAndLocal]
 *   Whether to remove remote suggestions that duplicate local suggestions.
 * @property {boolean} [fetchTrending]
 *   Whether we should fetch trending suggestions.
 */

/**
 * @typedef {object} SuggestionExtraContext
 * @property {boolean} awaitingLocalResults
 *   Indicates if this request context is awaiting local results.
 * @property {XMLHttpRequest} [request]
 *   The request for this suggestion context.
 * @property {number} gleanTimerId
 *   The identifier of the Glean timer that is measuring latency of the request.
 * @property {nsITimer} timer
 *   A timer that is monitoring the connection for timeouts.
 * @property {boolean} [aborted]
 *   Set to true if the request is being aborted.
 * @property {boolean} [errorWasReceived]
 *   Set to true if there was an error on the request.
 */

/**
 * @typedef {SuggestionExtraContext & SuggestionFetchOptions} SuggestionRequestContext
 */

/**
 * Represents a search suggestion.
 * TODO: Support other Google tail fields: `a`, `dc`, `i`, `q`, `ansa`,
 * `ansb`, `ansc`, `du`. See bug 1626897 comment 2.
 */
class SearchSuggestionEntry {
  /**
   * Creates an entry.
   *
   * @param {string} value
   *   The suggestion as a full-text string. Suitable for display directly to
   *   the user.
   * @param {object} options
   *   An object with the following properties:
   * @param {string} [options.matchPrefix]
   *   Represents the part of a tail suggestion that is already typed. For
   *   example, Google returns "…" as the match prefix to replace
   *   "what time is it in" in a tail suggestion for the query
   *   "what time is it in t".
   * @param {string} [options.tail]
   *   Represents the suggested part of a tail suggestion. For example, Google
   *   might return "toronto" as the tail for the query "what time is it in t".
   * @param {string} [options.icon]
   *   An icon representing the result in a data uri format.
   * @param {string} [options.description]
   *   A description of the result.
   * @param {boolean} [options.trending]
   *   Whether this is a trending suggestion.
   */
  constructor(value, { matchPrefix, tail, icon, description, trending } = {}) {
    this.#value = value;
    this.#matchPrefix = matchPrefix;
    this.#tail = tail;
    this.#trending = trending;
    this.#icon = icon;
    this.#description = description;
  }

  get value() {
    return this.#value;
  }

  get matchPrefix() {
    return this.#matchPrefix;
  }

  get tail() {
    return this.#tail;
  }

  get trending() {
    return this.#trending;
  }

  get icon() {
    return this.#icon;
  }

  get description() {
    return this.#description;
  }

  get tailOffsetIndex() {
    if (!this.#tail) {
      return -1;
    }

    let offsetIndex = this.#value.lastIndexOf(this.#tail);
    if (offsetIndex + this.#tail.length < this.#value.length) {
      // We might have a tail suggestion that starts with a word contained in
      // the full-text suggestion. e.g. "london sights in l" ... "london".
      let lastWordIndex = this.#value.lastIndexOf(" ");
      if (this.#tail.startsWith(this.#value.substring(lastWordIndex))) {
        offsetIndex = lastWordIndex;
      } else {
        // Something's gone wrong. Consumers should not show this result.
        offsetIndex = -1;
      }
    }

    return offsetIndex;
  }

  /**
   * Returns true if `otherEntry` is equivalent to this instance of
   * SearchSuggestionEntry.
   *
   * @param {SearchSuggestionEntry} otherEntry The entry to compare to.
   * @returns {boolean}
   */
  equals(otherEntry) {
    return otherEntry.value == this.value;
  }

  #value;
  #matchPrefix;
  #tail;
  #trending;
  #icon;
  #description;
}

/**
 *
 * The SearchSuggestionController class fetches search suggestions from two
 * sources: a remote search engine and the user's previous searches stored
 * locally in their profile (also called "form history").
 *
 * The number of each suggestion type is configurable, and the controller will
 * fetch and return both types at the same time. Instances of the class are
 * reusable, but one instance should be used per input. The fetch() method is
 * the main entry point. After creating an instance of the class, fetch() can
 * be called many times to fetch suggestions.
 *
 */
export class SearchSuggestionController {
  /**
   * Constructor
   *
   * @param {string} [formHistoryParam]
   *   The form history type to use with this controller.
   */
  constructor(formHistoryParam = DEFAULT_FORM_HISTORY_PARAM) {
    this.formHistoryParam = formHistoryParam;
  }

  /**
   * The maximum length of a value to be stored in search history.
   *
   *  @type {number}
   */
  static SEARCH_HISTORY_MAX_VALUE_LENGTH = 255;

  /**
   * Maximum time (ms) to wait before giving up on remote suggestions
   *
   *  @type {number}
   */
  static REMOTE_TIMEOUT_DEFAULT = REMOTE_TIMEOUT_DEFAULT;

  /**
   * Determines whether the given engine offers search suggestions.
   *
   * @param {nsISearchEngine} engine - The search engine
   * @param {boolean} fetchTrending - Whether we should fetch trending suggestions.
   * @returns {boolean} True if the engine offers suggestions and false otherwise.
   */
  static engineOffersSuggestions(engine, fetchTrending) {
    return engine.supportsResponseType(
      fetchTrending
        ? lazy.SearchUtils.URL_TYPE.TRENDING_JSON
        : lazy.SearchUtils.URL_TYPE.SUGGEST_JSON
    );
  }

  /**
   * The maximum number of OHTTP failures before we'll fallback to direct HTTP.
   */
  static MAX_OHTTP_FAILURES_BEFORE_FALLBACK =
    MAX_OHTTP_FAILURES_BEFORE_FALLBACK;

  /**
   * The maximum number of local form history results to return. This limit is
   * only enforced if remote results are also returned.
   *
   * @type {number}
   */
  maxLocalResults = 5;

  /**
   * The maximum number of remote search engine results to return.
   * We'll actually only display at most
   * maxRemoteResults - <displayed local results count> remote results.
   *
   * @type {number}
   */
  maxRemoteResults = 10;

  /**
   * The identifier of the search engine that can currently be enabled for
   * OHTTP. May be overridden for tests.
   */
  static oHTTPEngineId = "google";

  /**
   * The additional parameter used when searching form history.
   *
   * @type {string}
   */
  formHistoryParam = DEFAULT_FORM_HISTORY_PARAM;

  /**
   * The last form history result used to improve the performance of
   * subsequent searches. This shouldn't be used for any other purpose as it
   * is never cleared and therefore could be stale.
   *
   * @type {object|null}
   */
  formHistoryResult = null;

  /**
   * @typedef {object} FetchResult
   * @property {string} term
   *   The search term used for obtaining the suggestions.
   * @property {FormHistoryResultType} [formHistoryResults]
   *   The results in a form history result object, used for `SearchSuggestions`.
   * @property {Array<SearchSuggestionEntry>} local
   *   Contains local search suggestions.
   * @property {Array<SearchSuggestionEntry>} remote
   *   Contains remote search suggestions.
   */

  /**
   * Fetch search suggestions from all of the providers. Fetches in progress
   * will be stopped and results from them will not be provided.
   *
   * @param {SuggestionFetchOptions} options
   * @returns {Promise<FetchResult>}
   */
  fetch({
    searchString,
    inPrivateBrowsing,
    engine,
    userContextId = 0,
    restrictToEngine = false,
    dedupeRemoteAndLocal = true,
    fetchTrending = false,
  }) {
    // There is no smart filtering from previous results here (as there is when
    // looking through history/form data) because the result set returned by the
    // server is different for every typed value - e.g. "ocean breathes" does
    // not return a subset of the results returned for "ocean".

    lazy.logConsole.debug(
      `SearchSuggestionController.fetch() called with searchString: ${searchString}`
    );

    this.stop();

    if (!Services.search.isInitialized) {
      throw new Error("Search not initialized yet (how did you get here?)");
    }
    if (typeof inPrivateBrowsing === "undefined") {
      throw new Error(
        "The inPrivateBrowsing argument is required to avoid unintentional privacy leaks"
      );
    }
    if (!engine.getSubmission) {
      throw new Error("Invalid search engine");
    }
    if (!this.maxLocalResults && !this.maxRemoteResults) {
      throw new Error("Zero results expected, what are you trying to do?");
    }
    if (this.maxLocalResults < 0 || this.maxRemoteResults < 0) {
      throw new Error("Number of requested results must be positive");
    }

    // Array of promises to resolve before returning results.
    let promises = [];
    this.#context = {
      awaitingLocalResults: false,
      dedupeRemoteAndLocal,
      engine,
      fetchTrending,
      inPrivateBrowsing,
      restrictToEngine,
      searchString,
      gleanTimerId: 0,
      timer: Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer),
      userContextId,
    };

    // Fetch local results from Form History, if requested.
    if (this.maxLocalResults && !fetchTrending) {
      this.#context.awaitingLocalResults = true;
      promises.push(this.#fetchFormHistory(this.#context));
    }
    // Fetch remote results from Search Service, if requested.
    if (
      (searchString || fetchTrending) &&
      lazy.suggestionsEnabled &&
      (!inPrivateBrowsing || lazy.suggestionsInPrivateBrowsingEnabled) &&
      this.maxRemoteResults &&
      SearchSuggestionController.engineOffersSuggestions(engine, fetchTrending)
    ) {
      promises.push(this.#fetchRemote(this.#context));
    }

    /**
     * Handles rejection of the promises, to log the result and ensure nothing
     * is returned.
     *
     * @param {string|Error} reason
     *   The reason for the rejection. May be an `Error` if a code error
     *   occurred.
     * @returns {null}
     */
    function handleRejection(reason) {
      if (
        typeof reason == "string" &&
        reason.startsWith("HTTP request aborted")
      ) {
        lazy.logConsole.debug(reason);
        // Do nothing since this is normal.
        return null;
      }
      console.error("SearchSuggestionController rejection:", reason);
      return null;
    }
    return Promise.all(promises).then(
      results => this.#dedupeAndReturnResults(this.#context, results),
      handleRejection
    );
  }

  /**
   * Stop pending fetches so no results are returned from them.
   *
   * Note: If there was no remote results fetched, the fetching cannot be
   * stopped and local results will still be returned because stopping relies
   * on aborting the XMLHTTPRequest to reject the promise for Promise.all.
   */
  stop() {
    if (this.#context) {
      this.#context.aborted = true;
      this.#context.request?.abort();
    }
    this.#context = null;
  }

  /**
   * Should be called at the end of a search engagement (e.g. on blur / search
   * complete), to reset the Merino session.
   */
  resetSession() {
    this.#merino?.resetSession();
  }

  /**
   * @type {SuggestionRequestContext}
   */
  #context;

  /**
   * @type {MerinoClient}
   *   The MerinoClient associated with any ObliviousHTTP requests.
   */
  #merino;

  /**
   * @type {number}
   *   The count of failed OHTTP requests.
   */
  #ohttpFailedRequestCount = 0;

  /**
   * @type {?number}
   *   The fractional number of milliseconds from process startup, see
   *   ChromeUtils.now(). Exposed for tests.
   */
  _ohttpLastFailureTimeMs;

  /**
   * Fetches search suggestions from the form history.
   *
   * @param {SuggestionRequestContext} context
   */
  async #fetchFormHistory(context) {
    // We don't cache these results as we assume that the in-memory SQL cache is
    // good enough in performance.
    let params = {
      fieldname: this.formHistoryParam,
    };

    if (context.restrictToEngine) {
      params.source = context.engine.name;
    }

    let results = await lazy.FormHistory.getAutoCompleteResults(
      context.searchString,
      params
    );

    context.awaitingLocalResults = false;

    return { localResults: results };
  }

  /**
   * Records per-engine telemetry after a search has finished.
   *
   * @param {SuggestionRequestContext} context
   *   The search context.
   * @param {boolean} usedOHTTP
   *   True if OHTTP was used for the suggestion request.
   */
  #reportTelemetryForEngine(context, usedOHTTP) {
    // If the timer id has been reset, then we have already handled telemetry.
    // This might occur in the context of an abort or or cancel.
    if (context.gleanTimerId) {
      let category = usedOHTTP
        ? Glean.searchSuggestionsOhttp
        : Glean.searchSuggestions;
      let engineId = context.engine.isConfigEngine
        ? context.engine.id
        : "other";
      // Stop the latency stopwatch.
      if (context.aborted) {
        category.latency[engineId].cancel(context.gleanTimerId);
      } else {
        category.latency[engineId].stopAndAccumulate(context.gleanTimerId);
      }
      context.gleanTimerId = 0;

      if (usedOHTTP) {
        if (context.aborted) {
          Glean.searchSuggestionsOhttp.requestCounter
            .get(engineId, "aborted")
            .add(1);
        } else if (context.errorWasReceived) {
          Glean.searchSuggestionsOhttp.requestCounter
            .get(engineId, "failed" + this.#ohttpFailedRequestCount)
            .add(1);
        } else {
          Glean.searchSuggestionsOhttp.requestCounter
            .get(engineId, "success")
            .add(1);
        }
      } else if (context.engine.isConfigEngine) {
        if (context.aborted) {
          Glean.searchSuggestions.abortedRequests[context.engine.id].add();
        } else if (context.errorWasReceived) {
          Glean.searchSuggestions.failedRequests[context.engine.id].add();
        } else {
          Glean.searchSuggestions.successfulRequests[context.engine.id].add();
        }
      }
    }
  }

  /**
   * Fetch suggestions from the search engine over the network, using Oblivious
   * HTTP or normal HTTP(s) as available.
   *
   * @param {SuggestionRequestContext} context
   *   The search context.
   * @returns {Promise}
   *   Returns a promise that is resolved when the response is received, or
   *   rejected if there is an error.
   */
  #fetchRemote(context) {
    let submission = context.engine.getSubmission(
      context.searchString,
      context.searchString
        ? lazy.SearchUtils.URL_TYPE.SUGGEST_JSON
        : lazy.SearchUtils.URL_TYPE.TRENDING_JSON
    );

    // Note: when we enable this for all engines, we need to make sure we have
    // the capability for POST submissions handled.
    if (
      lazy.ohttpFeatureGateEnabled &&
      lazy.ohttpEnabled &&
      lazy.MerinoClient.hasOHTTPPrefs &&
      context.engine.id == SearchSuggestionController.oHTTPEngineId
    ) {
      let expiredLastFailure =
        ChromeUtils.now() - this._ohttpLastFailureTimeMs >
        MIN_DURATION_FOR_FALLBACK_MS;
      if (
        this.#ohttpFailedRequestCount < MAX_OHTTP_FAILURES_BEFORE_FALLBACK ||
        expiredLastFailure
      ) {
        if (expiredLastFailure) {
          this.#ohttpFailedRequestCount = 0;
        }
        return this.#fetchRemoteObliviousHTTP(context, submission);
      }
      lazy.logConsole.debug(
        "Maximum failures reached, falling back to direct HTTP"
      );
    }
    return this.#fetchRemoteNormalHTTP(context, submission);
  }

  /**
   * Fetch suggestions from the search engine over the network using normal
   * HTTP(s).
   *
   * @param {SuggestionRequestContext} context
   *   The search context.
   * @param {nsISearchSubmission} submission
   *   The submission URL and data for the search suggestion.
   * @returns {Promise}
   *   Returns a promise that is resolved when the response is received, or
   *   rejected if there is an error.
   */
  #fetchRemoteNormalHTTP(context, submission) {
    let deferredResponse = Promise.withResolvers();
    let request = (context.request = new XMLHttpRequest());
    // Expect the response type to be JSON, so that the network layer will
    // decode it for us. This will also ignore incorrect Mime Types, as we are
    // dictating how we process it.
    request.responseType = "json";

    let method = submission.postData ? "POST" : "GET";
    request.open(method, submission.uri.spec, true);
    // Don't set or store cookies or on-disk cache.
    request.channel.loadFlags =
      Ci.nsIChannel.LOAD_ANONYMOUS | Ci.nsIChannel.INHIBIT_PERSISTENT_CACHING;

    lazy.logConsole.debug(
      `HTTP request started for ${submission.uri.spec} by method ${method}`
    );

    request.setOriginAttributes({
      userContextId: context.userContextId,
      privateBrowsingId: context.inPrivateBrowsing ? 1 : 0,
      firstPartyDomain: `${context.engine.id}.search.suggestions.mozilla`,
    });

    request.mozBackgroundRequest = true; // suppress dialogs and fail silently

    context.timer.initWithCallback(
      () => {
        // Abort if we already got local results.
        if (
          request.readyState != 4 /* not complete */ &&
          !context.awaitingLocalResults
        ) {
          deferredResponse.resolve("HTTP request timeout");
        }
      },
      lazy.remoteTimeout,
      Ci.nsITimer.TYPE_ONE_SHOT
    );

    request.addEventListener("load", () => {
      context.timer.cancel();
      this.#reportTelemetryForEngine(context, false);
      if (!this.#context || context != this.#context || context.aborted) {
        deferredResponse.resolve(
          "Got HTTP response after the request was cancelled"
        );
        return;
      }

      let status;
      try {
        status = context.request.status;
      } catch (e) {
        // The XMLHttpRequest can throw NS_ERROR_NOT_AVAILABLE.
        deferredResponse.resolve("Unknown HTTP status: " + e);
        return;
      }

      if (status != HTTP_OK) {
        deferredResponse.resolve(
          "Non-200 status or empty HTTP response: " + status
        );
        return;
      }

      this.#onRemoteLoaded(
        context,
        context.request.response,
        deferredResponse.resolve
      );
    });

    request.addEventListener("error", () => {
      this.#context.errorWasReceived = true;
      this.#reportTelemetryForEngine(context, false);
      deferredResponse.resolve("HTTP error");
    });

    // Reject for an abort assuming it's always from .stop() in which case we
    // shouldn't return local or remote results for existing searches.
    request.addEventListener("abort", () => {
      context.timer.cancel();
      this.#reportTelemetryForEngine(context, false);
      deferredResponse.reject(
        `HTTP request aborted for ${submission.uri.spec}}`
      );
    });

    if (submission.postData) {
      request.sendInputStream(submission.postData);
    } else {
      request.send();
    }

    context.gleanTimerId =
      Glean.searchSuggestions.latency[
        context.engine.isConfigEngine ? context.engine.id : "other"
      ].start();

    return deferredResponse.promise;
  }

  /**
   * Fetch suggestions from the search engine over the network using Oblivious
   * HTTP.
   *
   * POST submissions are not currently supported.
   *
   * @param {SuggestionRequestContext} context
   *   The search context.
   * @param {nsISearchSubmission} submission
   *   The submission URL and data for the search suggestion.
   * @returns {Promise}
   *   Returns a promise that is resolved when the response is received, or
   *   rejected if there is an error.
   */
  async #fetchRemoteObliviousHTTP(context, submission) {
    if (!this.#merino) {
      this.#merino = new lazy.MerinoClient("SearchSuggestions", {
        allowOhttp: true,
      });
    }

    let submissionURL = URL.fromURI(submission.uri);

    lazy.logConsole.debug(`OHTTP request started for ${submission.uri.spec}`);

    context.gleanTimerId =
      Glean.searchSuggestionsOhttp.latency[
        context.engine.isConfigEngine ? context.engine.id : "other"
      ].start();

    let merinoSuggestions = await this.#merino.fetch({
      query: context.searchString,
      providers: ["google_suggest"],
      timeoutMs: lazy.remoteTimeout,
      otherParams: {
        google_suggest_params: submissionURL.searchParams.toString(),
      },
    });

    if (!this.#context || context != this.#context || context.aborted) {
      this.#reportTelemetryForEngine(context, true);
      return "Got OHTTP response after the request was cancelled";
    }

    // The last fetch status covers errors as well as "no_suggestions". Currently
    // Merino will return no suggestions if it receives an error response from
    // the search engine, hence we have to handle that case here as well.
    // The suggestions list here is different from the search engine suggestions
    // which are live within the specific provider record within `merinoSuggestions`.
    if (this.#merino.lastFetchStatus != "success") {
      this.#context.errorWasReceived = true;
      this.#ohttpFailedRequestCount++;
      this.#reportTelemetryForEngine(context, true);
      this._ohttpLastFailureTimeMs = ChromeUtils.now();
      return "No suggestions received from Merino, the search engine probably failed to respond";
    }

    this.#reportTelemetryForEngine(context, true);
    this.#ohttpFailedRequestCount = 0;
    this._ohttpLastFailureTimeMs = undefined;

    return new Promise(resolve => {
      this.#onRemoteLoaded(
        context,
        merinoSuggestions[0]?.custom_details?.google_suggest?.suggestions || [],
        resolve
      );
    });
  }

  /**
   * Called when the request completed successfully so we can handle the
   * response data.
   *
   * @param {SuggestionRequestContext} context
   *   The search context.
   * @param {object[]} serverResults
   *   The results received from the server.
   * @param {(value: any | PromiseLike<any>) => void} resolve
   *   A promise resolver to resolve when a response is received.
   */
  #onRemoteLoaded(context, serverResults, resolve) {
    lazy.logConsole.debug("Remote results:", serverResults);

    try {
      if (
        !Array.isArray(serverResults) ||
        serverResults[0] == undefined ||
        (context.searchString.localeCompare(serverResults[0], undefined, {
          sensitivity: "base",
        }) &&
          // Some engines (e.g. Amazon) return a search string containing
          // escaped Unicode sequences. Try decoding the remote search string
          // and compare that with our typed search string.
          context.searchString.localeCompare(
            decodeURIComponent(
              JSON.parse('"' + serverResults[0].replace(/\"/g, '\\"') + '"')
            ),
            undefined,
            {
              sensitivity: "base",
            }
          ))
      ) {
        // something is wrong here so drop remote results
        resolve(
          "Unexpected response, searchString does not match remote response"
        );
        return;
      }
    } catch (ex) {
      resolve(`Failed to parse the remote response string: ${ex}`);
      return;
    }

    // Remove the search string from the server results since it is no longer
    // needed.
    let results = serverResults.slice(1) || [];
    resolve({ result: results });
  }

  /**
   * @param {SuggestionRequestContext} context
   *   The search context.
   * @param {{
   *   localResults?:FormHistoryResultType, result:SuggestionRemoteResult
   * }[]} suggestResults - an array of result objects from different
   *   sources (local or remote).
   * @returns {FetchResult?}
   */
  #dedupeAndReturnResults(context, suggestResults) {
    if (context.aborted) {
      return null;
    }

    /**
     * @type {FetchResult}
     */
    let results = {
      term: context.searchString,
      remote: [],
      local: [],
    };

    for (let resultData of suggestResults) {
      if (typeof resultData === "string") {
        // Failure message
        console.error(
          "SearchSuggestionController found an unexpected string value:",
          resultData
        );
      } else if (resultData.localResults) {
        results.formHistoryResults = resultData.localResults;
        results.local = resultData.localResults.map(
          s => new SearchSuggestionEntry(s.text)
        );
      } else if (resultData.result) {
        // Remote result
        let richSuggestionData = this.#getRichSuggestionData(resultData.result);
        let fullTextSuggestions = resultData.result[0];
        for (let i = 0; i < fullTextSuggestions.length; ++i) {
          results.remote.push(
            this.#newSearchSuggestionEntry(
              fullTextSuggestions[i],
              richSuggestionData?.[i],
              context.fetchTrending
            )
          );
        }
      }
    }

    // If we have remote results, cap the number of local results
    if (results.remote.length) {
      results.local = results.local.slice(0, this.maxLocalResults);
    }

    // We don't want things to appear in both history and suggestions so remove
    // entries from remote results that are already in local.
    if (
      results.remote.length &&
      results.local.length &&
      context.dedupeRemoteAndLocal
    ) {
      for (let i = 0; i < results.local.length; ++i) {
        let dupIndex = results.remote.findIndex(e =>
          e.equals(results.local[i])
        );
        if (dupIndex != -1) {
          results.remote.splice(dupIndex, 1);
        }
      }
    }

    // Trim the number of results to the maximum requested (now that we've pruned dupes).
    let maxRemoteCount = this.maxRemoteResults;
    if (context.dedupeRemoteAndLocal) {
      maxRemoteCount -= results.local.length;
    }
    results.remote = results.remote.slice(0, maxRemoteCount);

    lazy.logConsole.debug(
      `Deduplication completed. Final results count: local=${results.local.length}, remote=${results.remote.length}`
    );

    return results;
  }

  /**
   * Returns rich suggestion data from a remote fetch, if available.
   *
   * @param {Array} remoteResultData
   *  The results.remote array returned by SearchSuggestionsController.fetch.
   * @returns {Array}
   *  An array of additional rich suggestion data. Each element should
   *  correspond to the array of text suggestions.
   */
  #getRichSuggestionData(remoteResultData) {
    if (!remoteResultData || !Array.isArray(remoteResultData)) {
      return undefined;
    }

    for (let entry of remoteResultData) {
      if (
        typeof entry == "object" &&
        entry.hasOwnProperty("google:suggestdetail")
      ) {
        let richData = entry["google:suggestdetail"];
        if (
          Array.isArray(richData) &&
          richData.length == remoteResultData[0].length
        ) {
          return richData;
        }
      }
    }
    return undefined;
  }

  /**
   * Given a text suggestion and rich suggestion data, returns a
   * SearchSuggestionEntry.
   *
   * @param {string} suggestion
   *   A suggestion string.
   * @param {object} richSuggestionData
   *   Rich suggestion data returned by the engine. In Google's case, this is
   *   the corresponding entry at "google:suggestdetail".
   * @param {boolean} trending
   *   Whether the suggestion is a trending suggestion.
   * @returns {SearchSuggestionEntry}
   */
  #newSearchSuggestionEntry(suggestion, richSuggestionData, trending) {
    if (richSuggestionData && (!trending || lazy.richSuggestionsEnabled)) {
      // We have valid rich suggestions.
      let args = { trending };

      // RichSuggestions come with icon and tail data, we only want one or the other
      if (!richSuggestionData?.i) {
        args.matchPrefix = richSuggestionData?.mp;
        args.tail = richSuggestionData?.t;
      } else if (lazy.richSuggestionsEnabled) {
        args.icon = richSuggestionData?.i;
        args.description = richSuggestionData?.a;
      }

      return new SearchSuggestionEntry(suggestion, args);
    }
    // Return a regular suggestion.
    return new SearchSuggestionEntry(suggestion, { trending });
  }
}
