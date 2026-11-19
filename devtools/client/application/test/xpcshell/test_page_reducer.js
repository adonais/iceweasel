/* Any copyright is dedicated to the Public Domain.
http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const {
  updateDomain,
  updatePrefetchStatus,
} = require("resource://devtools/client/application/src/actions/page.js");

const {
  pageReducer,
  PageState,
} = require("resource://devtools/client/application/src/reducers/page-state.js");

add_task(async function () {
  info("Test page reducer: UPDATE_DOMAIN action");
  const state = PageState();
  const action = updateDomain("https://example.com/foo/#bar");

  const newState = pageReducer(state, action);
  equal(newState.domain, "example.com");
});

add_task(function test_prefetch_status() {
  let state = PageState();
  equal(state.activatedFromNavigationalPrefetch, null);
  state = pageReducer(state, updateDomain("https://example.com/source"));
  const sourceState = state;

  for (const value of [true, false, null, undefined]) {
    const previousState = state;
    const previousStatus = state.activatedFromNavigationalPrefetch;
    state = pageReducer(state, updatePrefetchStatus(value));
    equal(state.activatedFromNavigationalPrefetch, value ?? null);
    equal(state.domain, "example.com");
    equal(previousState.activatedFromNavigationalPrefetch, previousStatus);
  }
  equal(sourceState.activatedFromNavigationalPrefetch, null);
});

add_task(function test_domain_update_preserves_prefetch_status() {
  const state = pageReducer(PageState(), updatePrefetchStatus(true));
  const nextState = pageReducer(
    state,
    updateDomain("https://example.org/target")
  );
  equal(nextState.domain, "example.org");
  equal(nextState.activatedFromNavigationalPrefetch, true);
  equal(state.domain, null);
});
