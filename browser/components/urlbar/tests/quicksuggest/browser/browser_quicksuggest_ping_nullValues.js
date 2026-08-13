/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

// In the `quick-suggest` ping, `undefined` and empty-string values should be
// recorded as `null`.

"use strict";

// A mock Merino suggestion. It's easier to test with Merino (online)
// suggestions because remote settings (offline) suggestions originate in the
// Suggest Rust component, and none of the suggestion fields reported in the
// ping are `Option`s, so they don't end up being `undefined` in JS.
const SUGGESTION = {
  // undefined
  impression_url: undefined,
  custom_details: {
    amp: {
      suggestion_id: undefined,
    },
  },

  // empty string
  advertiser: "",
  click_url: "",

  block_id: 1,
  url: "https://example.com/sponsored",
  title: "Sponsored suggestion",
  keywords: ["sponsored"],
  iab_category: "22 - Shopping",
  provider: "adm",
  is_sponsored: true,
};

const index = 1;
const position = index + 1;

// Trying to avoid timeouts in TV mode.
requestLongerTimeout(3);

add_setup(async function () {
  GleanPings.quickSuggest.setEnabled(true); // bug 1957150
  await SpecialPowers.pushPrefEnv({
    set: [["browser.urlbar.suggest.quickactions", false]],
  });
  await initQuickSuggestPingTest({
    merinoSuggestions: [SUGGESTION],
  });
});

add_task(async function () {
  let matchType = "firefox-suggest";
  let source = "merino";

  await doQuickSuggestPingTest({
    index,
    suggestion: SUGGESTION,
    impressionOnly: {
      reportingUrl: null, // impression_url
      suggestionId: null,
      advertiser: null,

      pingType: CONTEXTUAL_SERVICES_PING_TYPES.QS_IMPRESSION,
      matchType,
      blockId: SUGGESTION.block_id.toString(),
      improveSuggestExperience: true,
      position,
      suggestedIndex: "-1",
      suggestedIndexRelativeToGroup: true,
      requestId: MerinoTestUtils.server.response.body.request_id,
      source,
      contextId: "",
      isClicked: false,
    },
    click: [
      {
        reportingUrl: null, // impression_url
        suggestionId: null,
        advertiser: null,

        pingType: CONTEXTUAL_SERVICES_PING_TYPES.QS_IMPRESSION,
        matchType,
        blockId: SUGGESTION.block_id.toString(),
        improveSuggestExperience: true,
        position,
        suggestedIndex: "-1",
        suggestedIndexRelativeToGroup: true,
        requestId: MerinoTestUtils.server.response.body.request_id,
        source,
        contextId: "",
        isClicked: true,
      },
      {
        reportingUrl: null, // click_url
        suggestionId: null,
        advertiser: null,

        pingType: CONTEXTUAL_SERVICES_PING_TYPES.QS_SELECTION,
        matchType,
        blockId: SUGGESTION.block_id.toString(),
        improveSuggestExperience: true,
        position,
        suggestedIndex: "-1",
        suggestedIndexRelativeToGroup: true,
        requestId: MerinoTestUtils.server.response.body.request_id,
        source,
        contextId: "",
      },
    ],
    commands: [
      {
        command: "dismiss",
        pings: [
          {
            reportingUrl: null, // impression_url
            suggestionId: null,
            advertiser: null,

            pingType: CONTEXTUAL_SERVICES_PING_TYPES.QS_IMPRESSION,
            matchType,
            blockId: SUGGESTION.block_id.toString(),
            improveSuggestExperience: true,
            position,
            suggestedIndex: "-1",
            suggestedIndexRelativeToGroup: true,
            requestId: MerinoTestUtils.server.response.body.request_id,
            source,
            contextId: "",
            isClicked: false,
          },
          {
            reportingUrl: null, // not set
            suggestionId: null,
            advertiser: null,

            pingType: CONTEXTUAL_SERVICES_PING_TYPES.QS_BLOCK,
            matchType,
            blockId: SUGGESTION.block_id.toString(),
            improveSuggestExperience: true,
            position,
            suggestedIndex: "-1",
            suggestedIndexRelativeToGroup: true,
            requestId: MerinoTestUtils.server.response.body.request_id,
            source,
            contextId: "",
            iabCategory: SUGGESTION.iab_category,
          },
        ],
      },
      {
        command: "manage",
        pings: [
          {
            reportingUrl: null, // impression_url
            suggestionId: null,
            advertiser: null,

            pingType: CONTEXTUAL_SERVICES_PING_TYPES.QS_IMPRESSION,
            matchType,
            blockId: SUGGESTION.block_id.toString(),
            improveSuggestExperience: true,
            position,
            suggestedIndex: "-1",
            suggestedIndexRelativeToGroup: true,
            requestId: MerinoTestUtils.server.response.body.request_id,
            source,
            contextId: "",
            isClicked: false,
          },
        ],
      },
    ],
  });
});
