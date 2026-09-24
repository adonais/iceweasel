/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import { getVisibleItemCount } from "content-src/components/DiscoveryStreamComponents/TopicNavigation/useOverflowSplit";

// Three 100px items with 10px gaps occupy 320px in total.
const METRICS = { widths: [100, 100, 100], gap: 10, controlWidth: 50 };

describe("getVisibleItemCount", () => {
  it("returns every item when they all fit", () => {
    expect(getVisibleItemCount(400, METRICS)).toBe(3);
  });

  it("counts the row as fitting when it exactly fills the container", () => {
    expect(getVisibleItemCount(320, METRICS)).toBe(3);
  });

  it("ignores the More button's width when every item fits", () => {
    // The button isn't rendered in this case, so reserving room for it would
    // drop an item that fits and make the count depend on the last result.
    expect(getVisibleItemCount(320, { ...METRICS, controlWidth: 1000 })).toBe(
      3
    );
  });

  it("reserves the More button and a gap once an item overflows", () => {
    // 319 available leaves 259 for items, which fits two and their gap.
    expect(getVisibleItemCount(319, METRICS)).toBe(2);
  });

  it("returns no items when not even the first one fits", () => {
    expect(getVisibleItemCount(100, METRICS)).toBe(0);
  });

  it("returns the same count for the same width", () => {
    const widths = [320, 319, 200, 319, 320];
    expect(widths.map(width => getVisibleItemCount(width, METRICS))).toEqual([
      3, 2, 1, 2, 3,
    ]);
  });

  it("handles a single item", () => {
    const single = { ...METRICS, widths: [100] };
    expect(getVisibleItemCount(100, single)).toBe(1);
    expect(getVisibleItemCount(99, single)).toBe(0);
  });
});
