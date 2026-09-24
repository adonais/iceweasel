/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

// Tests that a recorded engagement survives the Urlbar actor's
// `RecordEngagement` message and that recording it parent-side from the
// deserialized payload produces the same Glean event the in-process path would.
// The child builds the Glean event content-side; the picked result rides along
// in wire form (structured-clone drops its private-field data unless reduced) so
// the parent can run the provider notifications.

"use strict";

const { UrlbarTelemetryUtils } = ChromeUtils.importESModule(
  "chrome://browser/content/urlbar/UrlbarTelemetryUtils.mjs"
);

function makeResult(url) {
  return new UrlbarResult({
    type: UrlbarShared.RESULT_TYPE.URL,
    source: UrlbarShared.RESULT_SOURCE.HISTORY,
    payload: { url, title: "Title for " + url },
  });
}

// Builds a recorded engagement the way the child collector would: collectSnapshot()
// from a (faked) DOM event/element and the picked result, then the Glean event
// via buildEventInfo(), leaving the parent-only fields to the recorder.
function makeRecordedEngagement({ exposures = null } = {}) {
  let picked = makeResult("https://example.com/picked");
  picked.rowIndex = 2;
  let snapshot = UrlbarTelemetryUtils.collectSnapshot(
    { type: "keydown" },
    {
      result: picked,
      element: { dataset: { action: "pick_action" } },
      searchString: "foo",
      selType: "history",
      searchSource: "urlbar",
      windowMode: "classic",
    },
    { timeStamp: 0, interactionType: "typed", searchString: "foo" }
  );
  let visibleResults = [picked, makeResult("https://example.com/other")];
  let { internalDetails } = snapshot;
  let { interaction } = UrlbarTelemetryUtils.getInteractionType(
    snapshot.method,
    snapshot.startEventInfo,
    internalDetails.searchSource,
    snapshot.searchWords,
    null,
    null
  );
  let built = UrlbarTelemetryUtils.buildEventInfo({
    method: snapshot.method,
    action: snapshot.action,
    interaction,
    numChars: snapshot.numChars,
    numWords: snapshot.numWords,
    provider: internalDetails.provider,
    searchSource: internalDetails.searchSource,
    searchMode: null,
    selIndex: internalDetails.selIndex,
    visibleResults,
    viewIsOpen: true,
    selType: internalDetails.selType,
    pickedActionKey: internalDetails.pickedActionKey,
    windowMode: internalDetails.windowMode,
  });
  return { snapshot, built, internalDetails, visibleResults, exposures };
}

// The wire payload a `RecordEngagement` message carries.
function toWire({ built, internalDetails, visibleResults, exposures }) {
  return UrlbarTelemetryUtils.recordedEngagementToWire({
    built,
    method: "engagement",
    searchSource: internalDetails.searchSource,
    internalDetails,
    exposures,
    visibleResults,
  });
}

add_setup(async function () {
  Services.fog.initializeFOG();
  // The engagement recording reads the default engine's telemetry id.
  await SearchTestUtils.installSearchExtension(
    { name: "Test" },
    { setAsDefault: true }
  );
});

add_task(function test_bare_structuredClone_loses_results() {
  let { snapshot } = makeRecordedEngagement();
  let cloned = structuredClone(snapshot);
  Assert.equal(
    cloned.internalDetails.result.type,
    undefined,
    "A bare structuredClone of the picked result loses its private-field data"
  );
});

add_task(function test_recordedEngagement_roundtrip() {
  let engagement = makeRecordedEngagement();
  Assert.ok(
    engagement.internalDetails.event,
    "internalDetails carries the live event before serialization"
  );

  let restored = UrlbarTelemetryUtils.recordedEngagementFromWire(
    structuredClone(toWire(engagement))
  );

  // The DOM event and element can't cross and are dropped.
  Assert.equal(
    restored.internalDetails.event,
    null,
    "event dropped on the wire"
  );
  Assert.equal(
    restored.internalDetails.element,
    null,
    "element dropped on the wire"
  );

  // The built Glean event survives as primitives.
  Assert.equal(restored.built.metric, "engagement", "metric preserved");
  Assert.equal(restored.built.eventInfo.n_chars, "3", "n_chars preserved");
  Assert.equal(restored.built.eventInfo.n_results, "2", "n_results preserved");

  // The picked result is reconstructed as a UrlbarResult.
  let result = restored.internalDetails.result;
  Assert.ok(result instanceof UrlbarResult, "picked result reconstructed");
  Assert.equal(
    result.payload.url,
    "https://example.com/picked",
    "picked result payload preserved"
  );
  Assert.equal(result.rowIndex, 2, "picked result rowIndex preserved");

  // The visible results are reconstructed too, so the parent can notify
  // provider impression/abandonment hooks on the message path.
  Assert.equal(restored.visibleResults.length, 2, "visible results preserved");
  Assert.ok(
    restored.visibleResults.every(r => r instanceof UrlbarResult),
    "visible results reconstructed as UrlbarResults"
  );
});

add_task(function test_recordedEngagement_resolves_live_results() {
  let engagement = makeRecordedEngagement();
  // The parent's own results, whose ids the wire carries.
  let liveResults = engagement.visibleResults;
  liveResults.forEach((result, i) => (result.id = i + 1));
  let wire = structuredClone(toWire(engagement));
  // The parent's results never went through a view, so they have no rowIndex.
  liveResults.forEach(result => (result.rowIndex = undefined));

  let restored = UrlbarTelemetryUtils.recordedEngagementFromWire(
    wire,
    liveResults
  );

  Assert.strictEqual(
    restored.internalDetails.result,
    liveResults[0],
    "the picked result resolved to the parent's own result"
  );
  Assert.equal(
    restored.internalDetails.result.rowIndex,
    2,
    "the wire's rowIndex carried over to it"
  );
  Assert.ok(
    restored.visibleResults.every((result, i) => result === liveResults[i]),
    "the visible results resolved to the parent's own results"
  );
});

add_task(function test_recordFromChild_records_engagement() {
  Services.fog.testResetFOG();
  let controller = UrlbarTestUtils.mockChildController();

  // Hand the controller the payload exactly as the actor message would.
  controller.parentController.recordEngagement(
    structuredClone(toWire(makeRecordedEngagement()))
  );

  let events = Glean.urlbar.engagement.testGetValue();
  Assert.equal(events?.length, 1, "recorded one engagement over the wire");
  Assert.equal(events[0].extra.engagement_type, "enter", "engagement_type");
  Assert.equal(events[0].extra.sap, "urlbar", "sap");
  Assert.equal(events[0].extra.n_chars, "3", "n_chars");
  Assert.equal(events[0].extra.n_results, "2", "n_results from visibleResults");
});

add_task(function test_exposure_helpers() {
  let result = makeResult("https://example.com/exposed");
  let visible = [result, makeResult("https://example.com/other")];
  let { resultType } = UrlbarTelemetryUtils.exposureEntry(result, {
    isPrivate: false,
  });
  Assert.equal(typeof resultType, "string", "exposureEntry returns a type");
  Assert.ok(
    UrlbarTelemetryUtils.exposureTerminal(result, null, visible),
    "a visible result is terminal"
  );
  Assert.ok(
    !UrlbarTelemetryUtils.exposureTerminal(
      makeResult("https://example.com/gone"),
      null,
      visible
    ),
    "a result no longer visible is not terminal"
  );
});

add_task(function test_collectBounceSnapshot() {
  let result = makeResult("https://example.com/picked");
  result.rowIndex = 1;
  let visibleResults = [result, makeResult("https://example.com/other")];
  let snapshot = UrlbarTelemetryUtils.collectBounceSnapshot(
    { type: "keydown" },
    {
      result,
      searchString: "foo",
      selType: "history",
      searchSource: "urlbar",
      windowMode: "classic",
    },
    { timeStamp: 0, interactionType: "typed", searchString: "foo" },
    visibleResults
  );
  // The action is resolved content-side; the event is not retained.
  Assert.equal(snapshot.action, "enter", "action resolved from the event");
  Assert.ok(!("event" in snapshot), "the DOM event is not stored");
  Assert.equal(snapshot.numChars, "3", "numChars");
  Assert.equal(snapshot.selIndex, 1, "selIndex from the picked result");
  Assert.equal(
    snapshot.visibleResults,
    visibleResults,
    "visible results captured next to selIndex"
  );
  Assert.equal(snapshot.searchSource, "urlbar", "searchSource");
  Assert.equal(
    UrlbarTelemetryUtils.collectBounceSnapshot(null, {}, null),
    null,
    "no snapshot without a session"
  );
});

add_task(function test_recordFromChild_records_exposures() {
  Services.fog.testResetFOG();
  let controller = UrlbarTestUtils.mockChildController();

  // The child collector resolves exposures content-side and bundles the list
  // into the engagement payload.
  let engagement = makeRecordedEngagement({
    exposures: [
      { resultType: "history", keyword: null, terminal: true },
      { resultType: "search_suggest", keyword: null, terminal: false },
    ],
  });
  controller.parentController.recordEngagement(
    structuredClone(toWire(engagement))
  );

  let events = Glean.urlbar.exposure.testGetValue();
  Assert.equal(events?.length, 1, "recorded one exposure event over the wire");
  // Tuples are sorted by result type.
  Assert.equal(events[0].extra.results, "history,search_suggest", "results");
  Assert.equal(events[0].extra.terminal, "true,false", "terminal flags");
  Assert.equal(events[0].extra.sap, "urlbar", "sap");
});
