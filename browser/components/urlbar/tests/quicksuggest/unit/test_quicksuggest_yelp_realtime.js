/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Tests Market suggestions.

"use strict";

const OPT_IN_REMOTE_SETTINGS = [
  {
    type: "dynamic-suggestions",
    suggestion_type: "yelpRealtime_opt_in",
    attachment: [
      {
        keywords: ["coffee"],
      },
    ],
  },
];

const YELP_MERINO_SINGLE = [
  {
    provider: "yelp",
    is_sponsored: true,
  },
];

add_setup(async function init() {
  // Disable search suggestions so we don't hit the network.
  await Services.search.init();
  Services.prefs.setBoolPref("browser.search.suggest.enabled", false);

  await QuickSuggestTestUtils.ensureQuickSuggestInit({
    remoteSettingsRecords: OPT_IN_REMOTE_SETTINGS,
    merinoSuggestions: YELP_MERINO_SINGLE,
    prefs: [
      ["yelpRealtime.featureGate", true],
      ["suggest.yelpRealtime", true],
      ["suggest.quicksuggest.sponsored", true],
    ],
  });
});

add_task(async function opt_in() {
  setup();

  let input = "coffee";
  let optInResult = yelpOptInResult();
  let merinoResult = yelpMerinoResult();

  info("Confirm whether the opt-in result is shown");
  await check_results({
    context: createContext(input, {
      providers: [UrlbarProviderQuickSuggest.name],
      isPrivate: false,
    }),
    matches: [optInResult],
  });

  info("Trigger opt_in command");
  triggerCommand({
    result: optInResult,
    feature: QuickSuggest.getFeature("YelpRealtimeSuggestions"),
    command: "opt_in",
    searchString: input,
    expectedCountsByCall: {
      startQuery: 1,
    },
  });

  info("Check the prefs after triggering");
  Assert.ok(UrlbarPrefs.get("quicksuggest.dataCollection.enabled"));

  info("Check the result after triggering");
  await check_results({
    context: createContext(input, {
      providers: [UrlbarProviderQuickSuggest.name],
      isPrivate: false,
    }),
    matches: [merinoResult],
  });
});

add_task(async function not_now() {
  setup();

  let input = "coffee";
  let beforeNotNowResult = yelpOptInResult();
  let afterNotNowResult = yelpOptInResult({ dismissButton: true });

  info("Confirm whether the opt-in result is shown");
  await check_results({
    context: createContext(input, {
      providers: [UrlbarProviderQuickSuggest.name],
      isPrivate: false,
    }),
    matches: [beforeNotNowResult],
  });

  info("Trigger not_now command");
  triggerCommand({
    result: beforeNotNowResult,
    feature: QuickSuggest.getFeature("YelpRealtimeSuggestions"),
    command: "not_now",
    searchString: input,
    expectedCountsByCall: {
      removeResult: 1,
    },
  });

  info("Check the prefs after triggering");
  Assert.greaterOrEqual(
    Date.now() / 1000,
    UrlbarPrefs.get("quicksuggest.realtimeOptIn.notNowTimeSeconds")
  );
  Assert.ok(
    UrlbarPrefs.get("quicksuggest.realtimeOptIn.notNowTypes").has(
      "yelpRealtime"
    )
  );

  info("Check the result after triggering");
  await check_results({
    context: createContext(input, {
      providers: [UrlbarProviderQuickSuggest.name],
      isPrivate: false,
    }),
    matches: [],
  });

  info("Simulate the passage of some days to show the result again");
  let notNowTimeSeconds = UrlbarPrefs.get(
    "quicksuggest.realtimeOptIn.notNowTimeSeconds"
  );
  let notNowReshowAfterPeriodDays = UrlbarPrefs.get(
    "quicksuggest.realtimeOptIn.notNowReshowAfterPeriodDays"
  );
  let newTime =
    notNowTimeSeconds - notNowReshowAfterPeriodDays * 24 * 60 * 60 - 60;
  UrlbarPrefs.set("quicksuggest.realtimeOptIn.notNowTimeSeconds", newTime);

  info("Check the result again");
  await check_results({
    context: createContext(input, {
      providers: [UrlbarProviderQuickSuggest.name],
      isPrivate: false,
    }),
    matches: [afterNotNowResult],
  });
});

add_task(async function dismiss() {
  setup();

  let input = "coffee";
  let result = yelpOptInResult();

  info("Confirm whether the opt-in result is shown");
  await check_results({
    context: createContext(input, {
      providers: [UrlbarProviderQuickSuggest.name],
      isPrivate: false,
    }),
    matches: [result],
  });

  info("Trigger dismiss command");
  triggerCommand({
    result,
    feature: QuickSuggest.getFeature("YelpRealtimeSuggestions"),
    command: "dismiss",
    searchString: input,
    expectedCountsByCall: {
      removeResult: 1,
    },
  });

  info("Check the prefs after triggering");
  Assert.ok(
    UrlbarPrefs.get("quicksuggest.realtimeOptIn.dismissTypes").has(
      "yelpRealtime"
    )
  );

  info("Check the result after triggering");
  await check_results({
    context: createContext(input, {
      providers: [UrlbarProviderQuickSuggest.name],
      isPrivate: false,
    }),
    matches: [],
  });
});

add_task(async function not_interested() {
  setup();

  let input = "coffee";
  let result = yelpOptInResult();

  info("Confirm whether the opt-in result is shown");
  await check_results({
    context: createContext(input, {
      providers: [UrlbarProviderQuickSuggest.name],
      isPrivate: false,
    }),
    matches: [result],
  });

  info("Trigger not_interested command");
  triggerCommand({
    result,
    feature: QuickSuggest.getFeature("YelpRealtimeSuggestions"),
    command: "not_interested",
    searchString: input,
    expectedCountsByCall: {
      removeResult: 1,
    },
  });

  info("Check the prefs after triggering");
  Assert.ok(!UrlbarPrefs.get("suggest.realtimeOptIn"));

  info("Check the result after triggering");
  await check_results({
    context: createContext(input, {
      providers: [UrlbarProviderQuickSuggest.name],
      isPrivate: false,
    }),
    matches: [],
  });
});

function setup() {
  UrlbarPrefs.set("suggest.realtimeOptIn", true);
  UrlbarPrefs.set("quicksuggest.dataCollection.enabled", false);
  UrlbarPrefs.set("quicksuggest.realtimeOptIn.dismissTypes", "");
  UrlbarPrefs.set("quicksuggest.realtimeOptIn.notNowTimeSeconds", 0);
  UrlbarPrefs.set("quicksuggest.realtimeOptIn.notNowTypes", "");
}

function yelpOptInResult({ dismissButton = false } = {}) {
  let dismissOrNotNowButton = dismissButton
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
  return {
    type: UrlbarUtils.RESULT_TYPE.TIP,
    source: UrlbarUtils.RESULT_SOURCE.OTHER_LOCAL,
    heuristic: false,
    isBestMatch: true,
    payload: {
      source: "rust",
      provider: "Dynamic",
      type: "realtime_opt_in",
      suggestionType: "yelpRealtime_opt_in",
      telemetryType: "yelpRealtime_opt_in",
      isSponsored: true,
      icon: "chrome://browser/skin/illustrations/yelpRealtime-opt-in.svg",
      titleL10n: {
        id: "urlbar-result-yelp-realtime-opt-in-title",
        cacheable: true,
      },
      descriptionL10n: {
        id: "urlbar-result-yelp-realtime-opt-in-description",
        cacheable: true,
        parseMarkup: true,
      },
      descriptionLearnMoreTopic: "firefox-suggest",
      buttons: [
        {
          command: "opt_in",
          l10n: {
            id: "urlbar-result-realtime-opt-in-allow",
            cacheable: true,
          },
          input: "coffee",
          attributes: {
            primary: "",
          },
        },
        {
          ...dismissOrNotNowButton,
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
    },
  };
}

function yelpMerinoResult() {
  return {
    type: UrlbarUtils.RESULT_TYPE.DYNAMIC,
    source: UrlbarUtils.RESULT_SOURCE.SEARCH,
    heuristic: false,
    isBestMatch: true,
    payload: {
      source: "merino",
      provider: "yelp",
      dynamicType: "yelpRealtime",
      telemetryType: "yelpRealtime",
      isSponsored: true,
    },
  };
}
