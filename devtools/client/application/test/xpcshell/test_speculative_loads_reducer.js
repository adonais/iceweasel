/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const {
  addSpeculation,
  updateSpeculation,
  resetSpeculations,
} = require("resource://devtools/client/application/src/actions/speculative-loads.js");
const {
  SpeculativeLoadsState,
  speculativeLoadsReducer,
} = require("resource://devtools/client/application/src/reducers/speculative-loads-state.js");

function request(overrides = {}) {
  return {
    resourceId: 1,
    url: "https://example.com/target",
    ...overrides,
  };
}

add_task(function test_request_lifecycle() {
  const resource = request();
  let state = speculativeLoadsReducer(undefined, addSpeculation(resource));
  equal(state.requests[1].status, "pending");
  equal(state.requests[1].action, "prefetch");

  resource.status = 200;
  const responseState = speculativeLoadsReducer(
    state,
    updateSpeculation(resource)
  );
  equal(
    responseState.requests[1].status,
    "pending",
    "Headers are not completion"
  );
  notEqual(responseState.requests[1], state.requests[1]);

  resource.responseEndAvailable = true;
  state = speculativeLoadsReducer(responseState, updateSpeculation(resource));
  equal(state.requests[1].status, "success");
  equal(
    responseState.requests[1].status,
    "pending",
    "Earlier state is unchanged"
  );
  equal(
    Object.keys(state.requests).length,
    1,
    "Updates do not add another row"
  );
});

add_task(function test_existing_completed_resource() {
  const resource = Object.freeze(
    request({ status: "200", responseEndAvailable: true })
  );
  const state = speculativeLoadsReducer(undefined, addSpeculation(resource));
  equal(state.requests[1].status, "success");
  equal(state.requests[1].url, resource.url);
});

add_task(function test_failed_requests() {
  for (const result of [
    { status: 404, responseEndAvailable: true },
    { status: 500, responseEndAvailable: true },
    { responseEndAvailable: true },
    { blockedReason: "NS_BINDING_ABORTED" },
    { blockedReason: 1001 },
  ]) {
    const state = speculativeLoadsReducer(
      undefined,
      addSpeculation(request(result))
    );
    equal(state.requests[1].status, "failure", JSON.stringify(result));
  }

  let state = speculativeLoadsReducer(undefined, addSpeculation(request()));
  state = speculativeLoadsReducer(
    state,
    updateSpeculation(
      request({ status: 200, blockedReason: "NS_ERROR_NET_RESET" })
    )
  );
  equal(state.requests[1].status, "failure", "A failed body is not a success");
});

add_task(function test_independent_requests_to_same_url() {
  let state = speculativeLoadsReducer(undefined, addSpeculation(request()));
  state = speculativeLoadsReducer(
    state,
    addSpeculation(request({ resourceId: 2 }))
  );
  equal(Object.keys(state.requests).length, 2);
  state = speculativeLoadsReducer(
    state,
    updateSpeculation(
      request({ resourceId: 2, status: 200, responseEndAvailable: true })
    )
  );
  equal(state.requests[1].status, "pending");
  equal(state.requests[2].status, "success");
});

add_task(function test_reset_and_late_updates() {
  let state = speculativeLoadsReducer(undefined, addSpeculation(request()));
  state = speculativeLoadsReducer(state, resetSpeculations());
  deepEqual(state, SpeculativeLoadsState());
  const updated = speculativeLoadsReducer(
    state,
    updateSpeculation(request({ status: 200, responseEndAvailable: true }))
  );
  equal(updated, state, "An old document's late update cannot restore its row");
});
