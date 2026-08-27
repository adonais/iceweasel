/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

// Tests UrlbarResult.toWire()/fromWire() and the UrlbarQueryContext prototype
// restoration that the Urlbar actor pair relies on to carry results across the
// process boundary. Actor messages structured-clone their payload, which only
// copies own enumerable data properties: UrlbarResult keeps its data in
// private fields behind getters, so a bare structuredClone loses all of it.

"use strict";

function makeUrlResult({ heuristic = false } = {}) {
  return new UrlbarResult({
    type: UrlbarShared.RESULT_TYPE.URL,
    source: UrlbarShared.RESULT_SOURCE.HISTORY,
    heuristic,
    payload: {
      url: "https://example.com/page",
      title: "Example page",
    },
  });
}

function makeSearchResult() {
  return new UrlbarResult(
    {
      type: UrlbarShared.RESULT_TYPE.SEARCH,
      source: UrlbarShared.RESULT_SOURCE.SEARCH,
      payload: {
        engine: "Test",
        suggestion: "foo bar",
        query: "foo",
        lowerCaseSuggestion: "foo bar",
      },
    },
    { suggestion: [[0, 3]] }
  );
}

// Sending a result through the structured-clone algorithm the way an actor
// message would: the wire form survives, the bare instance does not.
function roundTrip(result) {
  return UrlbarResult.fromWire(structuredClone(result.toWire()));
}

add_task(function test_bare_structuredClone_loses_data() {
  let result = makeUrlResult();
  let cloned = structuredClone(result);
  Assert.equal(
    cloned.type,
    undefined,
    "A bare structuredClone of a UrlbarResult loses the private-field data"
  );
  Assert.equal(cloned.payload, undefined, "payload is lost too");
});

add_task(function test_url_result_roundtrip() {
  let result = makeUrlResult({ heuristic: true });
  result.rowIndex = 3;

  let restored = roundTrip(result);

  Assert.ok(restored instanceof UrlbarResult, "Reconstructed a UrlbarResult");
  Assert.equal(restored.type, result.type, "type preserved");
  Assert.equal(restored.source, result.source, "source preserved");
  Assert.equal(restored.heuristic, true, "heuristic preserved");
  Assert.deepEqual(restored.payload, result.payload, "payload preserved");
  Assert.equal(restored.rowIndex, 3, "ad-hoc public rowIndex preserved");
  // Derived getter works, which means the prototype is intact.
  Assert.equal(restored.icon, result.icon, "derived icon getter works");
});

add_task(function test_search_result_with_highlights_roundtrip() {
  let result = makeSearchResult();
  let restored = roundTrip(result);

  Assert.deepEqual(
    restored.testHighlights,
    result.testHighlights,
    "highlights preserved"
  );
  // A method that reads the payload + highlights still works.
  let { value } = restored.getDisplayableValueAndHighlights("suggestion");
  Assert.equal(value, "foo bar", "getDisplayableValueAndHighlights works");
});

add_task(function test_providerType_roundtrip() {
  let result = makeSearchResult();
  // providerType is set on the result after construction (by the providers
  // manager), via a setter rather than a constructor parameter.
  result.providerType = UrlbarShared.PROVIDER_TYPE.PROFILE;

  let restored = roundTrip(result);

  Assert.equal(
    restored.providerType,
    UrlbarShared.PROVIDER_TYPE.PROFILE,
    "set-only providerType preserved"
  );
});

add_task(function test_fromWire_skips_payload_validation() {
  let result = makeUrlResult();

  // Simulate an internal field added to the payload after the result was
  // validated at creation time (e.g. QuickSuggest's suggestionObject, kept on
  // the payload for dismissal). Such a field isn't in the payload schema, so
  // re-validating the payload would reject it.
  let wire = result.toWire();
  wire.payload = { ...wire.payload, internalField: { some: "object" } };

  // A validating construction rejects the unknown field...
  Assert.throws(
    () => new UrlbarResult(wire),
    /./,
    "constructing with validation rejects the internal payload field"
  );

  // ...but fromWire() carries it through, since the wire payload was already
  // validated before serialization.
  let restored = UrlbarResult.fromWire(structuredClone(wire));
  Assert.deepEqual(
    restored.payload.internalField,
    { some: "object" },
    "fromWire preserves the internal payload field without re-validating"
  );
});

add_task(function test_queryContext_roundtrip() {
  let context = createContext("foo bar", { providers: ["test"] });
  let heuristic = makeUrlResult({ heuristic: true });
  context.results = [heuristic, makeSearchResult()];
  context.heuristicResult = heuristic;

  // Simulate crossing the actor boundary: structured-clone the context's data
  // (with results in wire form), then restore the class on the far side.
  let wire = structuredClone({
    ...context,
    results: context.results.map(r => r.toWire()),
    heuristicResult: context.heuristicResult.toWire(),
  });
  Object.setPrototypeOf(wire, UrlbarQueryContext.prototype);
  wire.results = wire.results.map(UrlbarResult.fromWire);
  wire.heuristicResult = UrlbarResult.fromWire(wire.heuristicResult);

  Assert.equal(wire.searchString, "foo bar", "searchString preserved");
  Assert.deepEqual(wire.tokens, context.tokens, "tokens preserved");
  Assert.ok(
    wire.results.every(r => r instanceof UrlbarResult),
    "nested results reconstructed as UrlbarResult instances"
  );
  // heuristicResult starts out as the same instance as results[0], but
  // serializing each result on its own doesn't preserve that shared identity
  // (the actor wiring will need to dedup, e.g. by index), so we compare data
  // rather than identity. deepEqual on the instances wouldn't work: a result's
  // data lives in private fields, which deepEqual can't see, so we compare the
  // toWire() forms, where that data is exposed as plain properties.
  Assert.deepEqual(
    wire.heuristicResult.toWire(),
    wire.results[0].toWire(),
    "heuristicResult round-trips to the same data as the first result"
  );
  // A context method works after prototype restoration.
  Assert.equal(
    typeof wire.allowRemoteResults,
    "function",
    "allowRemoteResults is callable after prototype restoration"
  );
  Assert.equal(
    typeof wire.allowRemoteResults(),
    "boolean",
    "allowRemoteResults returns a result"
  );
});
