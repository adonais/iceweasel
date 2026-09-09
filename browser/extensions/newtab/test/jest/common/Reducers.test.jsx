/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { INITIAL_STATE, reducers } from "common/Reducers.sys.mjs";
import { actionTypes as at } from "common/Actions.mjs";

const { PrivacyWidget, RecentSearches } = reducers;

describe("PrivacyWidget reducer", () => {
  it("defaults to an uninitialized state", () => {
    expect(INITIAL_STATE.PrivacyWidget.initialized).toBe(false);
  });

  it("stores the counts and flips initialized on WIDGETS_PRIVACY_UPDATE", () => {
    const next = PrivacyWidget(INITIAL_STATE.PrivacyWidget, {
      type: at.WIDGETS_PRIVACY_UPDATE,
      data: { trackersToday: 42, sitesToday: 7, lastUpdated: 123 },
    });
    expect(next.initialized).toBe(true);
    expect(next.trackersToday).toBe(42);
    expect(next.sitesToday).toBe(7);
    expect(next.lastUpdated).toBe(123);
  });

  it("returns the prior state for unrelated actions", () => {
    const prev = INITIAL_STATE.PrivacyWidget;
    expect(PrivacyWidget(prev, { type: "SOME_OTHER_ACTION" })).toBe(prev);
  });
});

describe("RecentSearches reducer", () => {
  it("defaults to an uninitialized state with no searches", () => {
    expect(INITIAL_STATE.RecentSearches.initialized).toBe(false);
    expect(INITIAL_STATE.RecentSearches.searches).toEqual([]);
  });

  it("stores the searches and flips initialized on WIDGETS_RECENT_SEARCHES_UPDATE", () => {
    const next = RecentSearches(INITIAL_STATE.RecentSearches, {
      type: at.WIDGETS_RECENT_SEARCHES_UPDATE,
      data: { searches: ["alpha", "beta"] },
    });
    expect(next.initialized).toBe(true);
    expect(next.searches).toEqual(["alpha", "beta"]);
  });

  it("returns the prior state for unrelated actions", () => {
    const prev = INITIAL_STATE.RecentSearches;
    expect(RecentSearches(prev, { type: "SOME_OTHER_ACTION" })).toBe(prev);
  });
});
