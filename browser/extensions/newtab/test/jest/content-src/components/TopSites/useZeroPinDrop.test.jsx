/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at https://mozilla.org/MPL/2.0/. */

import { act, renderHook } from "@testing-library/react";
import { useZeroPinDrop } from "content-src/components/TopSites/useZeroPinDrop.jsx";
import { isSponsored } from "content-src/components/TopSites/TopSitesConstants";

// A placeholder ref whose rect contains (50, 50) but not (500, 500).
const placeholderAt = () => ({
  getBoundingClientRect: () => ({ left: 0, right: 100, top: 0, bottom: 100 }),
});
const inside = { clientX: 50, clientY: 50, preventDefault: jest.fn() };
const outside = { clientX: 500, clientY: 500, preventDefault: jest.fn() };

function setup({ baseSites = [], onReorder = jest.fn() } = {}) {
  const { result } = renderHook(() =>
    useZeroPinDrop({
      baseSites,
      isSponsored,
      onDragStart: jest.fn(),
      onReorder,
    })
  );
  return { result, onReorder };
}

describe("useZeroPinDrop", () => {
  it("opens the placeholder at the first non-sponsored slot, only while dragging", () => {
    const sponsored = { url: "https://ad.com", sponsored_position: 1 };
    const site = { url: "https://a.com" };
    const { result } = setup({ baseSites: [sponsored, site] });

    expect(result.current.decorations.zeroPinSlot).toBe(-1);
    act(() => result.current.onDragEvent({ type: "dragstart" }, 1, site, "A"));
    expect(result.current.decorations.zeroPinSlot).toBe(1);
  });

  it("collapses the dragged source out of the grid", () => {
    const siteA = { url: "https://a.com" };
    const siteB = { url: "https://b.com" };
    const { result } = setup({ baseSites: [siteA, siteB] });

    act(() => result.current.onDragEvent({ type: "dragstart" }, 1, siteB, "B"));
    expect(result.current.sites[0]).toBe(siteA);
    expect(result.current.sites[1]).toEqual({ ...siteB, isCollapsed: true });
  });

  it("pins the dragged tile at the first pinnable slot when dropped on the placeholder", () => {
    const siteA = { url: "https://a.com" };
    const siteB = { url: "https://b.com" };
    const { result, onReorder } = setup({ baseSites: [siteA, siteB] });

    act(() => result.current.onDragEvent({ type: "dragstart" }, 1, siteB, "B"));
    result.current.decorations.setZeroPinRef(placeholderAt());
    act(() => result.current.listProps.onDrop(inside));

    expect(onReorder).toHaveBeenCalledWith({
      site: siteB,
      title: "B",
      fromIndex: 1,
      toIndex: 0,
    });
  });

  it("does not pin when the drop lands outside the placeholder", () => {
    const site = { url: "https://a.com" };
    const { result, onReorder } = setup({ baseSites: [site] });

    act(() => result.current.onDragEvent({ type: "dragstart" }, 0, site, "A"));
    result.current.decorations.setZeroPinRef(placeholderAt());
    act(() => result.current.listProps.onDrop(outside));

    expect(onReorder).not.toHaveBeenCalled();
  });
});
