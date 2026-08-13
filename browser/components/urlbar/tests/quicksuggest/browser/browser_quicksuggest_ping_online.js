/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

// Tests the `quick-suggest` ping using only online (Merino) suggestions. For
// online suggestions, the ping should conform to the following:
//
// * `requestId` should be non-null (but may be an empty string)
// * `suggestionId` should be non-null (but may be an empty string)

"use strict";

// A mock Merino suggestion
const SUGGESTION = {
  block_id: 1,
  url: "https://example.com/amp",
  title: "Amp Suggestion",
  advertiser: "Amp",
  keywords: ["amp"],
  click_url: "https://example.com/amp-click",
  impression_url: "https://example.com/amp-impression",
  iab_category: "22 - Shopping",
  provider: "adm",
  is_sponsored: true,
  custom_details: {
    amp: {
      suggestion_id: "amp-suggestion-id",
    },
  },
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

add_task(async function basic() {
  let matchType = "firefox-suggest";
  let source = "merino";
  let advertiser = SUGGESTION.advertiser.toLowerCase();

  await doQuickSuggestPingTest({
    index,
    suggestion: SUGGESTION,
    impressionOnly: {
      pingType: CONTEXTUAL_SERVICES_PING_TYPES.QS_IMPRESSION,
      matchType,
      advertiser,
      blockId: SUGGESTION.block_id.toString(),
      improveSuggestExperience: true,
      position,
      suggestedIndex: "-1",
      suggestedIndexRelativeToGroup: true,
      requestId: MerinoTestUtils.server.response.body.request_id,
      source,
      contextId: "",
      isClicked: false,
      reportingUrl: SUGGESTION.impression_url,
      suggestionId: SUGGESTION.custom_details.amp.suggestion_id,
    },
    click: [
      {
        pingType: CONTEXTUAL_SERVICES_PING_TYPES.QS_IMPRESSION,
        matchType,
        advertiser,
        blockId: SUGGESTION.block_id.toString(),
        improveSuggestExperience: true,
        position,
        suggestedIndex: "-1",
        suggestedIndexRelativeToGroup: true,
        requestId: MerinoTestUtils.server.response.body.request_id,
        source,
        contextId: "",
        isClicked: true,
        reportingUrl: SUGGESTION.impression_url,
        suggestionId: SUGGESTION.custom_details.amp.suggestion_id,
      },
      {
        pingType: CONTEXTUAL_SERVICES_PING_TYPES.QS_SELECTION,
        matchType,
        advertiser,
        blockId: SUGGESTION.block_id.toString(),
        improveSuggestExperience: true,
        position,
        suggestedIndex: "-1",
        suggestedIndexRelativeToGroup: true,
        requestId: MerinoTestUtils.server.response.body.request_id,
        source,
        contextId: "",
        reportingUrl: SUGGESTION.click_url,
        suggestionId: SUGGESTION.custom_details.amp.suggestion_id,
      },
    ],
    commands: [
      {
        command: "dismiss",
        pings: [
          {
            pingType: CONTEXTUAL_SERVICES_PING_TYPES.QS_IMPRESSION,
            matchType,
            advertiser,
            blockId: SUGGESTION.block_id.toString(),
            improveSuggestExperience: true,
            position,
            suggestedIndex: "-1",
            suggestedIndexRelativeToGroup: true,
            requestId: MerinoTestUtils.server.response.body.request_id,
            source,
            contextId: "",
            isClicked: false,
            reportingUrl: SUGGESTION.impression_url,
            suggestionId: SUGGESTION.custom_details.amp.suggestion_id,
          },
          {
            pingType: CONTEXTUAL_SERVICES_PING_TYPES.QS_BLOCK,
            matchType,
            advertiser,
            blockId: SUGGESTION.block_id.toString(),
            improveSuggestExperience: true,
            position,
            suggestedIndex: "-1",
            suggestedIndexRelativeToGroup: true,
            requestId: MerinoTestUtils.server.response.body.request_id,
            source,
            contextId: "",
            iabCategory: SUGGESTION.iab_category,
            suggestionId: SUGGESTION.custom_details.amp.suggestion_id,
          },
        ],
      },
      {
        command: "manage",
        pings: [
          {
            pingType: CONTEXTUAL_SERVICES_PING_TYPES.QS_IMPRESSION,
            matchType,
            advertiser,
            blockId: SUGGESTION.block_id.toString(),
            improveSuggestExperience: true,
            position,
            suggestedIndex: "-1",
            suggestedIndexRelativeToGroup: true,
            requestId: MerinoTestUtils.server.response.body.request_id,
            source,
            contextId: "",
            isClicked: false,
            reportingUrl: SUGGESTION.impression_url,
            suggestionId: SUGGESTION.custom_details.amp.suggestion_id,
          },
        ],
      },
    ],
  });
});

// Tests various types of values of `suggestion_id`.
add_task(async function suggestionId() {
  let matchType = "firefox-suggest";
  let source = "merino";
  let advertiser = SUGGESTION.advertiser.toLowerCase();
  let blockId = SUGGESTION.block_id.toString();

  let tuples = [undefined, null, "", "test-id"].map(sid => [
    sid,
    {
      ...structuredClone(SUGGESTION),
      custom_details: {
        amp: {
          suggestion_id: sid,
        },
      },
    },
  ]);

  for (let [expectedSuggestionId, suggestion] of tuples) {
    MerinoTestUtils.server.response.body.suggestions = [suggestion];

    await doQuickSuggestPingTest({
      index,
      suggestion,
      impressionOnly: {
        suggestionId: expectedSuggestionId,
        pingType: CONTEXTUAL_SERVICES_PING_TYPES.QS_IMPRESSION,
        matchType,
        advertiser,
        blockId,
        improveSuggestExperience: true,
        position,
        suggestedIndex: "-1",
        suggestedIndexRelativeToGroup: true,
        requestId: "request_id",
        source,
        contextId: "",
        isClicked: false,
        reportingUrl: suggestion.impression_url,
      },
      click: [
        {
          suggestionId: expectedSuggestionId,
          pingType: CONTEXTUAL_SERVICES_PING_TYPES.QS_IMPRESSION,
          matchType,
          advertiser,
          blockId,
          improveSuggestExperience: true,
          position,
          suggestedIndex: "-1",
          suggestedIndexRelativeToGroup: true,
          requestId: "request_id",
          source,
          contextId: "",
          isClicked: true,
          reportingUrl: suggestion.impression_url,
        },
        {
          suggestionId: expectedSuggestionId,
          pingType: CONTEXTUAL_SERVICES_PING_TYPES.QS_SELECTION,
          matchType,
          advertiser,
          blockId,
          improveSuggestExperience: true,
          position,
          suggestedIndex: "-1",
          suggestedIndexRelativeToGroup: true,
          requestId: "request_id",
          source,
          contextId: "",
          reportingUrl: suggestion.click_url,
        },
      ],
      commands: [
        {
          command: "dismiss",
          pings: [
            {
              suggestionId: expectedSuggestionId,
              pingType: CONTEXTUAL_SERVICES_PING_TYPES.QS_IMPRESSION,
              matchType,
              advertiser,
              blockId,
              improveSuggestExperience: true,
              position,
              suggestedIndex: "-1",
              suggestedIndexRelativeToGroup: true,
              requestId: "request_id",
              source,
              contextId: "",
              isClicked: false,
              reportingUrl: suggestion.impression_url,
            },
            {
              suggestionId: expectedSuggestionId,
              pingType: CONTEXTUAL_SERVICES_PING_TYPES.QS_BLOCK,
              matchType,
              advertiser,
              blockId,
              improveSuggestExperience: true,
              position,
              suggestedIndex: "-1",
              suggestedIndexRelativeToGroup: true,
              requestId: "request_id",
              source,
              contextId: "",
              iabCategory: suggestion.iab_category,
            },
          ],
        },
        {
          command: "manage",
          pings: [
            {
              suggestionId: expectedSuggestionId,
              pingType: CONTEXTUAL_SERVICES_PING_TYPES.QS_IMPRESSION,
              matchType,
              advertiser,
              blockId,
              improveSuggestExperience: true,
              position,
              suggestedIndex: "-1",
              suggestedIndexRelativeToGroup: true,
              requestId: "request_id",
              source,
              contextId: "",
              isClicked: false,
              reportingUrl: suggestion.impression_url,
            },
          ],
        },
      ],
    });
  }
});
