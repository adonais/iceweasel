/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { SuggestProvider } from "resource:///modules/urlbar/private/SuggestFeature.sys.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  QuickSuggest: "resource:///modules/QuickSuggest.sys.mjs",
  UrlbarPrefs: "resource:///modules/UrlbarPrefs.sys.mjs",
  UrlbarResult: "resource:///modules/UrlbarResult.sys.mjs",
  UrlbarUtils: "resource:///modules/UrlbarUtils.sys.mjs",
});

/**
 * A Suggest feature that manages realtime suggestions (a.k.a. "carrots"),
 * including both opt-in and online suggestions for a given realtime type. It is
 * intended to be subclassed rather than used as is.
 *
 * Each subclass should manage one realtime type. If the user has not opted in
 * to online suggestions, this class will serve the realtime type's opt-in
 * suggestion. Once the user has opted in, it will switch to serving online
 * Merino suggestions for the realtime type.
 */
export class RealtimeSuggestProvider extends SuggestProvider {
  // The following methods must be overridden.

  get realtimeType() {
    throw new Error("Trying to access the base class, must be overridden");
  }

  getViewTemplate(_result) {
    throw new Error("Trying to access the base class, must be overridden");
  }

  getViewUpdate(_result) {
    throw new Error("Trying to access the base class, must be overridden");
  }

  // The following getters depend on `realtimeType` and should be overridden as
  // necessary.

  /**
   * @returns {string[]}
   *   The opt-in suggestion is a dynamic Rust suggestion. `suggestion_type` in
   *   the RS record is `${this.realtimeType}_opt_in` by default.
   */
  get dynamicRustSuggestionTypes() {
    return [this.realtimeType + "_opt_in"];
  }

  /**
   * @returns {string}
   *   The online suggestions are served by Merino. The Merino provider is
   *   `this.realtimeType` by default.
   */
  get merinoProvider() {
    return this.realtimeType;
  }

  get baseTelemetryType() {
    return this.realtimeType;
  }

  get featureGatePref() {
    return this.realtimeType + "FeatureGate";
  }

  get suggestPref() {
    return "suggest." + this.realtimeType;
  }

  get minKeywordLengthPref() {
    return this.realtimeType + ".minKeywordLength";
  }

  get showLessFrequentlyCountPref() {
    return this.realtimeType + ".showLessFrequentlyCount";
  }

  get notInterestedCommandL10n() {
    return {
      id: "urlbar-result-menu-dont-show-" + this.realtimeType,
    };
  }

  get acknowledgeDismissalL10n() {
    return {
      id: "urlbar-result-dismissal-acknowledgment-" + this.realtimeType,
    };
  }

  get isSponsored() {
    return false;
  }

  // The following methods can be overridden but hopefully it's not necessary.

  get rustSuggestionType() {
    return "Dynamic";
  }

  get enablingPreferences() {
    return [
      "suggest.realtimeOptIn",
      "quicksuggest.realtimeOptIn.dismissTypes",
      "quicksuggest.realtimeOptIn.notNowTimeSeconds",
      "quicksuggest.realtimeOptIn.notNowReshowAfterPeriodDays",
      "quicksuggest.dataCollection.enabled",
      this.featureGatePref,
      this.suggestPref,

      // We could check `this.isSponsored` here and only include the appropriate
      // pref, but for maximum flexibility `this.isSponsored` is only a fallback
      // for when individual suggestions do not have an `isSponsored` property.
      // Since individual suggestions may be sponsored or not, we include both
      // prefs here.
      "suggest.quicksuggest.nonsponsored",
      "suggest.quicksuggest.sponsored",
    ];
  }

  get primaryUserControlledPreferences() {
    return [
      "suggest.realtimeOptIn",
      "quicksuggest.realtimeOptIn.dismissTypes",
      "quicksuggest.realtimeOptIn.notNowTimeSeconds",
      "quicksuggest.realtimeOptIn.notNowReshowAfterPeriodDays",
      this.suggestPref,
    ];
  }

  get shouldEnable() {
    if (!lazy.UrlbarPrefs.get(this.featureGatePref)) {
      // The feature gate is disabled. Don't show opt-in or online suggestions
      // for this realtime type.
      return false;
    }

    if (lazy.UrlbarPrefs.get("quicksuggest.dataCollection.enabled")) {
      // The user opted in to online suggestions. Show this realtime type if
      // they didn't disable it.
      return lazy.UrlbarPrefs.get(this.suggestPref);
    }

    if (!lazy.UrlbarPrefs.get("suggest.realtimeOptIn")) {
      // The user dismissed opt-in suggestions for all realtime types.
      return false;
    }

    let dismissTypes = lazy.UrlbarPrefs.get(
      "quicksuggest.realtimeOptIn.dismissTypes"
    );
    if (dismissTypes.has(this.realtimeType)) {
      // The user dismissed opt-in suggestions for this realtime type.
      return false;
    }

    let notNowTimeSeconds = lazy.UrlbarPrefs.get(
      "quicksuggest.realtimeOptIn.notNowTimeSeconds"
    );
    if (!notNowTimeSeconds) {
      return true;
    }

    let notNowReshowAfterPeriodDays = lazy.UrlbarPrefs.get(
      "quicksuggest.realtimeOptIn.notNowReshowAfterPeriodDays"
    );

    let timeSecs = notNowReshowAfterPeriodDays * 24 * 60 * 60;
    return Date.now() / 1000 - notNowTimeSeconds > timeSecs;
  }

  isSuggestionSponsored(suggestion) {
    switch (suggestion.source) {
      case "merino":
        if (suggestion.hasOwnProperty("is_sponsored")) {
          return !!suggestion.is_sponsored;
        }
        break;
      case "rust":
        if (suggestion.data?.result?.payload?.hasOwnProperty("isSponsored")) {
          return suggestion.data.result.payload.isSponsored;
        }
        break;
    }
    return this.isSponsored;
  }

  /**
   * The telemetry type for a suggestion from this provider. (This string does
   * not include the `${source}_` prefix, e.g., "rust_".)
   *
   * Since realtime providers serve two types of suggestions, the opt-in and the
   * online suggestion, this will return two possible telemetry types depending
   * on the passed-in suggestion. Telemetry types for each are:
   *
   *   Opt-in suggestion: `${this.baseTelemetryType}_opt_in`
   *   Online suggestion: this.baseTelemetryType
   *
   * Individual suggestions can override these telemetry types, but that's
   * expected to be uncommon.
   *
   * @param {object} suggestion
   *   A suggestion from this provider.
   * @returns {string}
   *   The suggestion's telemetry type.
   */
  getSuggestionTelemetryType(suggestion) {
    switch (suggestion.source) {
      case "merino":
        if (suggestion.hasOwnProperty("telemetry_type")) {
          return suggestion.telemetry_type;
        }
        break;
      case "rust":
        if (suggestion.data?.result?.payload?.hasOwnProperty("telemetryType")) {
          return suggestion.data.result.payload.telemetryType;
        }
        return this.baseTelemetryType + "_opt_in";
    }
    return this.baseTelemetryType;
  }

  filterSuggestions(suggestions) {
    // The Rust opt-in suggestion can continue to be matched after the user opts
    // in, so always return only Merino suggestions after opt in.
    if (lazy.UrlbarPrefs.get("quicksuggest.dataCollection.enabled")) {
      return suggestions.filter(s => s.source == "merino");
    }
    return suggestions;
  }

  makeResult(queryContext, suggestion, searchString) {
    // For maximum flexibility individual suggestions can indicate whether they
    // are sponsored or not, despite `this.isSponsored`, which is a fallback.
    let isSponsored = this.isSuggestionSponsored(suggestion);
    if (
      (isSponsored &&
        !lazy.UrlbarPrefs.get("suggest.quicksuggest.sponsored")) ||
      (!isSponsored &&
        !lazy.UrlbarPrefs.get("suggest.quicksuggest.nonsponsored"))
    ) {
      return null;
    }

    switch (suggestion.source) {
      case "merino":
        return this.makeMerinoResult(queryContext, suggestion, searchString);
      case "rust":
        return this.makeOptInResult(queryContext, suggestion);
    }
    return null;
  }

  makeMerinoResult(_queryContext, suggestion, searchString) {
    if (!this.isEnabled) {
      return null;
    }

    if (
      this.showLessFrequentlyCount &&
      searchString.length < this.#minKeywordLength
    ) {
      return null;
    }
    return Object.assign(
      new lazy.UrlbarResult(
        lazy.UrlbarUtils.RESULT_TYPE.DYNAMIC,
        lazy.UrlbarUtils.RESULT_SOURCE.SEARCH,
        {
          ...suggestion.custom_details,
          dynamicType: this.realtimeType,
        }
      ),
      {
        isBestMatch: true,
        hideRowLabel: true,
      }
    );
  }

  makeOptInResult(queryContext, _suggestion) {
    let notNowTypes = lazy.UrlbarPrefs.get(
      "quicksuggest.realtimeOptIn.notNowTypes"
    );
    let splitButtonMain = notNowTypes.has(this.realtimeType)
      ? {
          command: "dismiss",
          l10n: {
            id: "urlbar-result-realtime-opt-in-dismiss",
            cacheable: true,
          },
        }
      : {
          command: "not_now",
          l10n: {
            id: "urlbar-result-realtime-opt-in-not-now",
            cacheable: true,
          },
        };

    return Object.assign(
      new lazy.UrlbarResult(
        lazy.UrlbarUtils.RESULT_TYPE.TIP,
        lazy.UrlbarUtils.RESULT_SOURCE.OTHER_LOCAL,
        {
          // This `type` is the tip type, required for `TIP` results.
          type: "realtime_opt_in",
          icon: "chrome://browser/skin/illustrations/market-opt-in.svg",
          titleL10n: {
            id: "urlbar-result-market-opt-in-title",
            cacheable: true,
          },
          descriptionL10n: {
            id: "urlbar-result-market-opt-in-description",
            cacheable: true,
            parseMarkup: true,
          },
          descriptionLearnMoreTopic: lazy.QuickSuggest.HELP_TOPIC,
          buttons: [
            {
              command: "opt_in",
              l10n: {
                id: "urlbar-result-realtime-opt-in-allow",
                cacheable: true,
              },
              input: queryContext.searchString,
              attributes: {
                primary: "",
              },
            },
            {
              ...splitButtonMain,
              menu: [
                {
                  name: "not_interested",
                  l10n: {
                    id: "urlbar-result-realtime-opt-in-dismiss-all",
                  },
                },
              ],
            },
          ],
        }
      ),
      {
        isBestMatch: true,
        hideRowLabel: true,
      }
    );
  }

  getResultCommands(result) {
    if (result.payload.source == "rust") {
      // The opt-in result should not have a result menu.
      return null;
    }

    let commands = [
      {
        name: "not_interested",
        l10n: this.notInterestedCommandL10n,
      },
    ];

    if (this.canShowLessFrequently) {
      commands.push({
        name: "show_less_frequently",
        l10n: {
          id: "urlbar-result-menu-show-less-frequently",
        },
      });
    }

    commands.push(
      { name: "separator" },
      {
        name: "manage",
        l10n: {
          id: "urlbar-result-menu-manage-firefox-suggest",
        },
      },
      {
        name: "help",
        l10n: {
          id: "urlbar-result-menu-learn-more-about-firefox-suggest",
        },
      }
    );

    return commands;
  }

  onEngagement(queryContext, controller, details, searchString) {
    switch (details.result.payload.source) {
      case "merino":
        this.onMerinoEngagement(
          queryContext,
          controller,
          details,
          searchString
        );
        break;
      case "rust":
        this.onOptInEngagement(queryContext, controller, details, searchString);
        break;
    }
  }

  onMerinoEngagement(queryContext, controller, details, searchString) {
    let { result } = details;
    switch (details.selType) {
      case "help":
      case "manage": {
        // "help" and "manage" are handled by UrlbarInput, no need to do
        // anything here.
        break;
      }
      case "not_interested": {
        lazy.UrlbarPrefs.set(this.suggestPref, false);
        result.acknowledgeDismissalL10n = this.acknowledgeDismissalL10n;
        controller.removeResult(result);
        break;
      }
      case "show_less_frequently": {
        controller.view.acknowledgeFeedback(result);
        this.incrementShowLessFrequentlyCount();
        if (!this.canShowLessFrequently) {
          controller.view.invalidateResultMenuCommands();
        }
        lazy.UrlbarPrefs.set(
          this.minKeywordLengthPref,
          searchString.length + 1
        );
        break;
      }
    }
  }

  onOptInEngagement(queryContext, controller, details, _searchString) {
    switch (details.selType) {
      case "opt_in":
        lazy.UrlbarPrefs.set("quicksuggest.dataCollection.enabled", true);
        controller.input.startQuery({ allowAutofill: false });
        break;
      case "not_now": {
        lazy.UrlbarPrefs.set(
          "quicksuggest.realtimeOptIn.notNowTimeSeconds",
          Date.now() / 1000
        );
        lazy.UrlbarPrefs.add(
          "quicksuggest.realtimeOptIn.notNowTypes",
          this.realtimeType
        );
        controller.removeResult(details.result);
        break;
      }
      case "dismiss": {
        lazy.UrlbarPrefs.add(
          "quicksuggest.realtimeOptIn.dismissTypes",
          this.realtimeType
        );
        details.result.acknowledgeDismissalL10n = this.acknowledgeDismissalL10n;
        controller.removeResult(details.result);
        break;
      }
      case "not_interested": {
        lazy.UrlbarPrefs.set("suggest.realtimeOptIn", false);
        details.result.acknowledgeDismissalL10n = {
          id: "urlbar-result-dismissal-acknowledgment-all",
        };
        controller.removeResult(details.result);
        break;
      }
    }
  }

  incrementShowLessFrequentlyCount() {
    if (this.canShowLessFrequently) {
      lazy.UrlbarPrefs.set(
        this.showLessFrequentlyCountPref,
        this.showLessFrequentlyCount + 1
      );
    }
  }

  get showLessFrequentlyCount() {
    const pref = this.showLessFrequentlyCountPref;
    const count = lazy.UrlbarPrefs.get(pref) || 0;
    return Math.max(count, 0);
  }

  get canShowLessFrequently() {
    const cap =
      lazy.UrlbarPrefs.get("realtimeShowLessFrequentlyCap") ||
      lazy.QuickSuggest.config.showLessFrequentlyCap ||
      0;
    return !cap || this.showLessFrequentlyCount < cap;
  }

  get #minKeywordLength() {
    let hasUserValue = Services.prefs.prefHasUserValue(
      "browser.urlbar." + this.minKeywordLengthPref
    );
    let nimbusValue = lazy.UrlbarPrefs.get("realtimeMinKeywordLength");
    let minLength =
      hasUserValue || nimbusValue === null
        ? lazy.UrlbarPrefs.get(this.minKeywordLengthPref)
        : nimbusValue;
    return Math.max(minLength, 0);
  }
}
