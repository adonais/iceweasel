/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

// Tests the `quick-suggest` ping using only online (Merino) suggestions. This
// ping is recorded only for AMP suggestions.
//
// Compared to offline suggestions, for online suggestions the ping should
// conform to the following:
//
// * `requestId` should be non-null (but may be an empty string)

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
const advertiser = SUGGESTION.advertiser.toLowerCase();
const source = "merino";
const matchType = "firefox-suggest";

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
  await doQuickSuggestPingTest({
    index,
    suggestion: SUGGESTION,
    impressionOnly: {
      pingType: QUICK_SUGGEST_PING_TYPE.IMPRESSION,
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
      experimentName: "",
      experimentBranch: "",
    },
    click: [
      {
        pingType: QUICK_SUGGEST_PING_TYPE.IMPRESSION,
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
        experimentName: "",
        experimentBranch: "",
      },
      {
        pingType: QUICK_SUGGEST_PING_TYPE.CLICK,
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
        experimentName: "",
        experimentBranch: "",
      },
    ],
    commands: [
      {
        command: "dismiss",
        pings: [
          {
            pingType: QUICK_SUGGEST_PING_TYPE.IMPRESSION,
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
            experimentName: "",
            experimentBranch: "",
          },
          {
            pingType: QUICK_SUGGEST_PING_TYPE.BLOCK,
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
            experimentName: "",
            experimentBranch: "",
          },
        ],
      },
      {
        command: "manage",
        pings: [
          {
            pingType: QUICK_SUGGEST_PING_TYPE.IMPRESSION,
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
            experimentName: "",
            experimentBranch: "",
          },
        ],
      },
    ],
  });
});

// Tests various types of values of `suggestion_id`.
add_task(async function suggestionId() {
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
        pingType: QUICK_SUGGEST_PING_TYPE.IMPRESSION,
        matchType,
        advertiser,
        blockId: SUGGESTION.block_id.toString(),
        improveSuggestExperience: true,
        position,
        suggestedIndex: "-1",
        suggestedIndexRelativeToGroup: true,
        requestId: "request_id",
        source,
        contextId: "",
        isClicked: false,
        reportingUrl: suggestion.impression_url,
        experimentName: "",
        experimentBranch: "",
      },
      click: [
        {
          suggestionId: expectedSuggestionId,
          pingType: QUICK_SUGGEST_PING_TYPE.IMPRESSION,
          matchType,
          advertiser,
          blockId: SUGGESTION.block_id.toString(),
          improveSuggestExperience: true,
          position,
          suggestedIndex: "-1",
          suggestedIndexRelativeToGroup: true,
          requestId: "request_id",
          source,
          contextId: "",
          isClicked: true,
          reportingUrl: suggestion.impression_url,
          experimentName: "",
          experimentBranch: "",
        },
        {
          suggestionId: expectedSuggestionId,
          pingType: QUICK_SUGGEST_PING_TYPE.CLICK,
          matchType,
          advertiser,
          blockId: SUGGESTION.block_id.toString(),
          improveSuggestExperience: true,
          position,
          suggestedIndex: "-1",
          suggestedIndexRelativeToGroup: true,
          requestId: "request_id",
          source,
          contextId: "",
          reportingUrl: suggestion.click_url,
          experimentName: "",
          experimentBranch: "",
        },
      ],
      commands: [
        {
          command: "dismiss",
          pings: [
            {
              suggestionId: expectedSuggestionId,
              pingType: QUICK_SUGGEST_PING_TYPE.IMPRESSION,
              matchType,
              advertiser,
              blockId: SUGGESTION.block_id.toString(),
              improveSuggestExperience: true,
              position,
              suggestedIndex: "-1",
              suggestedIndexRelativeToGroup: true,
              requestId: "request_id",
              source,
              contextId: "",
              isClicked: false,
              reportingUrl: suggestion.impression_url,
              experimentName: "",
              experimentBranch: "",
            },
            {
              suggestionId: expectedSuggestionId,
              pingType: QUICK_SUGGEST_PING_TYPE.BLOCK,
              matchType,
              advertiser,
              blockId: SUGGESTION.block_id.toString(),
              improveSuggestExperience: true,
              position,
              suggestedIndex: "-1",
              suggestedIndexRelativeToGroup: true,
              requestId: "request_id",
              source,
              contextId: "",
              iabCategory: suggestion.iab_category,
              experimentName: "",
              experimentBranch: "",
            },
          ],
        },
        {
          command: "manage",
          pings: [
            {
              suggestionId: expectedSuggestionId,
              pingType: QUICK_SUGGEST_PING_TYPE.IMPRESSION,
              matchType,
              advertiser,
              blockId: SUGGESTION.block_id.toString(),
              improveSuggestExperience: true,
              position,
              suggestedIndex: "-1",
              suggestedIndexRelativeToGroup: true,
              requestId: "request_id",
              source,
              contextId: "",
              isClicked: false,
              reportingUrl: suggestion.impression_url,
              experimentName: "",
              experimentBranch: "",
            },
          ],
        },
      ],
    });
  }

  MerinoTestUtils.server.response.body.suggestions = [SUGGESTION];
});

// The ping should record the name (slug) and branch of the active `urlbar`
// Nimbus experiment or rollout.
add_task(async function nimbus_experiment_treatment() {
  await doNimbusTest({
    isRollout: false,
    slug: "test-ping-online-experiment",
    branchSlug: "treatment",
  });
});

add_task(async function nimbus_experiment_control() {
  await doNimbusTest({
    isRollout: false,
    slug: "test-ping-online-experiment",
    branchSlug: "control",
  });
});

add_task(async function nimbus_rollout() {
  await doNimbusTest({
    isRollout: true,
    slug: "test-ping-online-rollout",
    branchSlug: "control",
  });
});

async function doNimbusTest({ isRollout, slug, branchSlug }) {
  let nimbusCleanup = await UrlbarTestUtils.initNimbusFeature(
    {},
    { isRollout, slug, branchSlug }
  );

  await doQuickSuggestPingTest({
    index,
    suggestion: SUGGESTION,
    impressionOnly: {
      pingType: QUICK_SUGGEST_PING_TYPE.IMPRESSION,
      matchType,
      advertiser,
      blockId: SUGGESTION.block_id.toString(),
      improveSuggestExperience: true,
      position,
      suggestedIndex: "-1",
      suggestedIndexRelativeToGroup: true,
      requestId: "request_id",
      source,
      contextId: "",
      isClicked: false,
      reportingUrl: SUGGESTION.impression_url,
      suggestionId: SUGGESTION.custom_details.amp.suggestion_id,
      experimentName: slug,
      experimentBranch: branchSlug,
    },
    click: [
      {
        pingType: QUICK_SUGGEST_PING_TYPE.IMPRESSION,
        matchType,
        advertiser,
        blockId: SUGGESTION.block_id.toString(),
        improveSuggestExperience: true,
        position,
        suggestedIndex: "-1",
        suggestedIndexRelativeToGroup: true,
        requestId: "request_id",
        source,
        contextId: "",
        isClicked: true,
        reportingUrl: SUGGESTION.impression_url,
        suggestionId: SUGGESTION.custom_details.amp.suggestion_id,
        experimentName: slug,
        experimentBranch: branchSlug,
      },
      {
        pingType: QUICK_SUGGEST_PING_TYPE.CLICK,
        matchType,
        advertiser,
        blockId: SUGGESTION.block_id.toString(),
        improveSuggestExperience: true,
        position,
        suggestedIndex: "-1",
        suggestedIndexRelativeToGroup: true,
        requestId: "request_id",
        source,
        contextId: "",
        reportingUrl: SUGGESTION.click_url,
        suggestionId: SUGGESTION.custom_details.amp.suggestion_id,
        experimentName: slug,
        experimentBranch: branchSlug,
      },
    ],
    commands: [
      {
        command: "dismiss",
        pings: [
          {
            pingType: QUICK_SUGGEST_PING_TYPE.IMPRESSION,
            matchType,
            advertiser,
            blockId: SUGGESTION.block_id.toString(),
            improveSuggestExperience: true,
            position,
            suggestedIndex: "-1",
            suggestedIndexRelativeToGroup: true,
            requestId: "request_id",
            source,
            contextId: "",
            isClicked: false,
            reportingUrl: SUGGESTION.impression_url,
            suggestionId: SUGGESTION.custom_details.amp.suggestion_id,
            experimentName: slug,
            experimentBranch: branchSlug,
          },
          {
            pingType: QUICK_SUGGEST_PING_TYPE.BLOCK,
            matchType,
            advertiser,
            blockId: SUGGESTION.block_id.toString(),
            improveSuggestExperience: true,
            position,
            suggestedIndex: "-1",
            suggestedIndexRelativeToGroup: true,
            requestId: "request_id",
            source,
            contextId: "",
            iabCategory: SUGGESTION.iab_category,
            suggestionId: SUGGESTION.custom_details.amp.suggestion_id,
            experimentName: slug,
            experimentBranch: branchSlug,
          },
        ],
      },
      {
        command: "manage",
        pings: [
          {
            pingType: QUICK_SUGGEST_PING_TYPE.IMPRESSION,
            matchType,
            advertiser,
            blockId: SUGGESTION.block_id.toString(),
            improveSuggestExperience: true,
            position,
            suggestedIndex: "-1",
            suggestedIndexRelativeToGroup: true,
            requestId: "request_id",
            source,
            contextId: "",
            isClicked: false,
            reportingUrl: SUGGESTION.impression_url,
            suggestionId: SUGGESTION.custom_details.amp.suggestion_id,
            experimentName: slug,
            experimentBranch: branchSlug,
          },
        ],
      },
    ],
  });

  await nimbusCleanup();
}
