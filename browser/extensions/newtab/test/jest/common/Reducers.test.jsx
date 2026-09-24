/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { INITIAL_STATE, reducers } from "common/Reducers.sys.mjs";
import { actionTypes as at } from "common/Actions.mjs";

const { PrivacyWidget, RecentSearches, Wallpapers } = reducers;

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

  it("leaves initialized alone for a trending-only update", () => {
    const next = RecentSearches(INITIAL_STATE.RecentSearches, {
      type: at.WIDGETS_RECENT_SEARCHES_UPDATE,
      data: { trending: [] },
    });
    expect(next.initialized).toBe(false);
    expect(next.trending).toEqual([]);
  });

  it("returns the prior state for unrelated actions", () => {
    const prev = INITIAL_STATE.RecentSearches;
    expect(RecentSearches(prev, { type: "SOME_OTHER_ACTION" })).toBe(prev);
  });
});

describe("Wallpapers reducer", () => {
  it("starts with an empty library", () => {
    expect(INITIAL_STATE.Wallpapers.customWallpapers).toEqual([]);
    expect(INITIAL_STATE.Wallpapers.uploadResult).toBeNull();
  });

  it("stores the library on WALLPAPERS_CUSTOM_LIBRARY_SET", () => {
    const data = [
      { filename: "v1-custom-dark-center-1-abc", position: "center" },
      { filename: "v1-builtin-light-top-1-def", position: "top" },
    ];
    const next = Wallpapers(INITIAL_STATE.Wallpapers, {
      type: at.WALLPAPERS_CUSTOM_LIBRARY_SET,
      data,
    });
    expect(next.customWallpapers).toEqual(data);
  });

  it("empties the library when the last image is removed", () => {
    const prev = {
      ...INITIAL_STATE.Wallpapers,
      customWallpapers: [{ filename: "v1-custom-dark-center-1-abc" }],
    };
    const next = Wallpapers(prev, {
      type: at.WALLPAPERS_CUSTOM_LIBRARY_SET,
      data: [],
    });
    expect(next.customWallpapers).toEqual([]);
  });

  it("stores an upload result", () => {
    const data = { requestId: "request-1", filename: "saved-image" };
    const next = Wallpapers(INITIAL_STATE.Wallpapers, {
      type: at.WALLPAPER_UPLOAD_RESULT,
      data,
    });
    expect(next.uploadResult).toEqual(data);
  });

  it("leaves the library alone when only the applied wallpaper changes", () => {
    const customWallpapers = [{ filename: "v1-custom-dark-center-1-abc" }];
    const next = Wallpapers(
      { ...INITIAL_STATE.Wallpapers, customWallpapers },
      { type: at.WALLPAPERS_CUSTOM_SET, data: null }
    );
    expect(next.customWallpapers).toBe(customWallpapers);
    expect(next.uploadedWallpaper).toBe(null);
  });

  it("returns the prior wallpaper state for unrelated actions", () => {
    const prev = INITIAL_STATE.Wallpapers;
    expect(Wallpapers(prev, { type: "SOME_OTHER_ACTION" })).toBe(prev);
  });
});
