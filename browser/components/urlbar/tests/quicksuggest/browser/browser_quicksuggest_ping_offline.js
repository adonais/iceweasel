/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

// Tests the `quick-suggest` ping using only offline (remote settings)
// suggestions. This ping is recorded only for AMP suggestions.

"use strict";

const SUGGESTION = QuickSuggestTestUtils.ampRemoteSettings();

const index = 1;
const position = index + 1;
const advertiser = SUGGESTION.advertiser.toLowerCase();
const source = "rust";

// Trying to avoid timeouts in TV mode.
requestLongerTimeout(3);

add_setup(async function () {
  GleanPings.quickSuggest.setEnabled(true); // bug 1957150
  await SpecialPowers.pushPrefEnv({
    set: [["browser.urlbar.suggest.quickactions", false]],
  });
  await initQuickSuggestPingTest({
    remoteSettingsRecords: [
      {
        collection: QuickSuggestTestUtils.RS_COLLECTION.AMP,
        type: QuickSuggestTestUtils.RS_TYPE.AMP,
        attachment: [SUGGESTION],
      },
    ],
  });
});

add_task(async function basic() {
  let matchType = "firefox-suggest";

  // Make sure `improveSuggestExperience` is recorded correctly.
  for (let onlineAvailable of [false, true]) {
    for (let onlineEnabled of [false, true]) {
      await SpecialPowers.pushPrefEnv({
        set: [
          ["browser.urlbar.quicksuggest.online.available", onlineAvailable],
          ["browser.urlbar.quicksuggest.online.enabled", onlineEnabled],
        ],
      });
      let improveSuggestExperience = onlineAvailable && onlineEnabled;
      await doQuickSuggestPingTest({
        index,
        suggestion: SUGGESTION,
        impressionOnly: {
          pingType: QUICK_SUGGEST_PING_TYPE.IMPRESSION,
          matchType,
          advertiser,
          blockId: SUGGESTION.id.toString(),
          improveSuggestExperience,
          position,
          suggestedIndex: "-1",
          suggestedIndexRelativeToGroup: true,
          requestId: undefined,
          source,
          contextId: "",
          isClicked: false,
          reportingUrl: SUGGESTION.impression_url,
          suggestionId: SUGGESTION.suggestion_id,
          experimentName: "",
          experimentBranch: "",
        },
        click: [
          {
            pingType: QUICK_SUGGEST_PING_TYPE.IMPRESSION,
            matchType,
            advertiser,
            blockId: SUGGESTION.id.toString(),
            improveSuggestExperience,
            position,
            suggestedIndex: "-1",
            suggestedIndexRelativeToGroup: true,
            requestId: undefined,
            source,
            contextId: "",
            isClicked: true,
            reportingUrl: SUGGESTION.impression_url,
            suggestionId: SUGGESTION.suggestion_id,
            experimentName: "",
            experimentBranch: "",
          },
          {
            pingType: QUICK_SUGGEST_PING_TYPE.CLICK,
            matchType,
            advertiser,
            blockId: SUGGESTION.id.toString(),
            improveSuggestExperience,
            position,
            suggestedIndex: "-1",
            suggestedIndexRelativeToGroup: true,
            requestId: undefined,
            source,
            contextId: "",
            reportingUrl: SUGGESTION.click_url,
            suggestionId: SUGGESTION.suggestion_id,
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
                blockId: SUGGESTION.id.toString(),
                improveSuggestExperience,
                position,
                suggestedIndex: "-1",
                suggestedIndexRelativeToGroup: true,
                requestId: undefined,
                source,
                contextId: "",
                isClicked: false,
                reportingUrl: SUGGESTION.impression_url,
                suggestionId: SUGGESTION.suggestion_id,
                experimentName: "",
                experimentBranch: "",
              },
              {
                pingType: QUICK_SUGGEST_PING_TYPE.BLOCK,
                matchType,
                advertiser,
                blockId: SUGGESTION.id.toString(),
                improveSuggestExperience,
                position,
                suggestedIndex: "-1",
                suggestedIndexRelativeToGroup: true,
                requestId: undefined,
                source,
                contextId: "",
                iabCategory: SUGGESTION.iab_category,
                suggestionId: SUGGESTION.suggestion_id,
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
                blockId: SUGGESTION.id.toString(),
                improveSuggestExperience,
                position,
                suggestedIndex: "-1",
                suggestedIndexRelativeToGroup: true,
                requestId: undefined,
                source,
                contextId: "",
                isClicked: false,
                reportingUrl: SUGGESTION.impression_url,
                suggestionId: SUGGESTION.suggestion_id,
                experimentName: "",
                experimentBranch: "",
              },
            ],
          },
        ],
      });
      await SpecialPowers.popPrefEnv();
    }
  }
});

// higher-placement sponsored, a.k.a sponsored priority, sponsored best match
add_task(async function sponsoredBestMatch() {
  let matchType = "best-match";

  await SpecialPowers.pushPrefEnv({
    set: [["browser.urlbar.quicksuggest.sponsoredPriority", true]],
  });
  await doQuickSuggestPingTest({
    index,
    suggestion: SUGGESTION,
    impressionOnly: {
      pingType: QUICK_SUGGEST_PING_TYPE.IMPRESSION,
      matchType,
      advertiser,
      blockId: SUGGESTION.id.toString(),
      improveSuggestExperience: false,
      position,
      suggestedIndex: "1",
      suggestedIndexRelativeToGroup: false,
      requestId: undefined,
      source,
      contextId: "",
      isClicked: false,
      reportingUrl: SUGGESTION.impression_url,
      suggestionId: SUGGESTION.suggestion_id,
      experimentName: "",
      experimentBranch: "",
    },
    click: [
      {
        pingType: QUICK_SUGGEST_PING_TYPE.IMPRESSION,
        matchType,
        advertiser,
        blockId: SUGGESTION.id.toString(),
        improveSuggestExperience: false,
        position,
        suggestedIndex: "1",
        suggestedIndexRelativeToGroup: false,
        requestId: undefined,
        source,
        contextId: "",
        isClicked: true,
        reportingUrl: SUGGESTION.impression_url,
        suggestionId: SUGGESTION.suggestion_id,
        experimentName: "",
        experimentBranch: "",
      },
      {
        pingType: QUICK_SUGGEST_PING_TYPE.CLICK,
        matchType,
        advertiser,
        blockId: SUGGESTION.id.toString(),
        improveSuggestExperience: false,
        position,
        suggestedIndex: "1",
        suggestedIndexRelativeToGroup: false,
        requestId: undefined,
        source,
        contextId: "",
        reportingUrl: SUGGESTION.click_url,
        suggestionId: SUGGESTION.suggestion_id,
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
            blockId: SUGGESTION.id.toString(),
            improveSuggestExperience: false,
            position,
            suggestedIndex: "1",
            suggestedIndexRelativeToGroup: false,
            requestId: undefined,
            source,
            contextId: "",
            isClicked: false,
            reportingUrl: SUGGESTION.impression_url,
            suggestionId: SUGGESTION.suggestion_id,
            experimentName: "",
            experimentBranch: "",
          },
          {
            pingType: QUICK_SUGGEST_PING_TYPE.BLOCK,
            matchType,
            advertiser,
            blockId: SUGGESTION.id.toString(),
            improveSuggestExperience: false,
            position,
            suggestedIndex: "1",
            suggestedIndexRelativeToGroup: false,
            requestId: undefined,
            source,
            contextId: "",
            iabCategory: SUGGESTION.iab_category,
            suggestionId: SUGGESTION.suggestion_id,
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
            blockId: SUGGESTION.id.toString(),
            improveSuggestExperience: false,
            position,
            suggestedIndex: "1",
            suggestedIndexRelativeToGroup: false,
            requestId: undefined,
            source,
            contextId: "",
            isClicked: false,
            reportingUrl: SUGGESTION.impression_url,
            suggestionId: SUGGESTION.suggestion_id,
            experimentName: "",
            experimentBranch: "",
          },
        ],
      },
    ],
  });
  await SpecialPowers.popPrefEnv();
});

// The ping should record the name (slug) and branch of the active `urlbar`
// Nimbus experiment or rollout.
add_task(async function nimbus_experiment_treatment() {
  await doNimbusTest({
    isRollout: false,
    slug: "test-ping-offline-experiment",
    branchSlug: "treatment",
  });
});

add_task(async function nimbus_experiment_control() {
  await doNimbusTest({
    isRollout: false,
    slug: "test-ping-offline-experiment",
    branchSlug: "control",
  });
});

add_task(async function nimbus_rollout() {
  await doNimbusTest({
    isRollout: true,
    slug: "test-ping-offline-rollout",
    branchSlug: "control",
  });
});

async function doNimbusTest({ isRollout, slug, branchSlug }) {
  let matchType = "firefox-suggest";

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
      blockId: SUGGESTION.id.toString(),
      improveSuggestExperience: false,
      position,
      suggestedIndex: "-1",
      suggestedIndexRelativeToGroup: true,
      requestId: undefined,
      source,
      contextId: "",
      isClicked: false,
      reportingUrl: SUGGESTION.impression_url,
      suggestionId: SUGGESTION.suggestion_id,
      experimentName: slug,
      experimentBranch: branchSlug,
    },
    click: [
      {
        pingType: QUICK_SUGGEST_PING_TYPE.IMPRESSION,
        matchType,
        advertiser,
        blockId: SUGGESTION.id.toString(),
        improveSuggestExperience: false,
        position,
        suggestedIndex: "-1",
        suggestedIndexRelativeToGroup: true,
        requestId: undefined,
        source,
        contextId: "",
        isClicked: true,
        reportingUrl: SUGGESTION.impression_url,
        suggestionId: SUGGESTION.suggestion_id,
        experimentName: slug,
        experimentBranch: branchSlug,
      },
      {
        pingType: QUICK_SUGGEST_PING_TYPE.CLICK,
        matchType,
        advertiser,
        blockId: SUGGESTION.id.toString(),
        improveSuggestExperience: false,
        position,
        suggestedIndex: "-1",
        suggestedIndexRelativeToGroup: true,
        requestId: undefined,
        source,
        contextId: "",
        reportingUrl: SUGGESTION.click_url,
        suggestionId: SUGGESTION.suggestion_id,
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
            blockId: SUGGESTION.id.toString(),
            improveSuggestExperience: false,
            position,
            suggestedIndex: "-1",
            suggestedIndexRelativeToGroup: true,
            requestId: undefined,
            source,
            contextId: "",
            isClicked: false,
            reportingUrl: SUGGESTION.impression_url,
            suggestionId: SUGGESTION.suggestion_id,
            experimentName: slug,
            experimentBranch: branchSlug,
          },
          {
            pingType: QUICK_SUGGEST_PING_TYPE.BLOCK,
            matchType,
            advertiser,
            blockId: SUGGESTION.id.toString(),
            improveSuggestExperience: false,
            position,
            suggestedIndex: "-1",
            suggestedIndexRelativeToGroup: true,
            requestId: undefined,
            source,
            contextId: "",
            iabCategory: SUGGESTION.iab_category,
            suggestionId: SUGGESTION.suggestion_id,
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
            blockId: SUGGESTION.id.toString(),
            improveSuggestExperience: false,
            position,
            suggestedIndex: "-1",
            suggestedIndexRelativeToGroup: true,
            requestId: undefined,
            source,
            contextId: "",
            isClicked: false,
            reportingUrl: SUGGESTION.impression_url,
            suggestionId: SUGGESTION.suggestion_id,
            experimentName: slug,
            experimentBranch: branchSlug,
          },
        ],
      },
    ],
  });

  await nimbusCleanup();
}
