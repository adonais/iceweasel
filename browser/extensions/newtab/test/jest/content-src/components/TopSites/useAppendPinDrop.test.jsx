/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at https://mozilla.org/MPL/2.0/. */

import { act, renderHook } from "@testing-library/react";
import { useAppendPinDrop } from "content-src/components/TopSites/useAppendPinDrop.jsx";

// A placeholder ref whose rect contains (50, 50) but not (500, 500).
const placeholderAt = () => ({
  getBoundingClientRect: () => ({ left: 0, right: 100, top: 0, bottom: 100 }),
});
const inside = { clientX: 50, clientY: 50, preventDefault: jest.fn() };
const outside = { clientX: 500, clientY: 500, preventDefault: jest.fn() };

const pinned = url => ({ url, isPinned: true });
const frecent = url => ({ url });

function setup(props = {}) {
  const onDragEvent = jest.fn();
  const { result, rerender } = renderHook(
    args =>
      useAppendPinDrop({
        baseSites: [],
        draggedSite: null,
        isMovable: () => true,
        onDragEvent,
        previewActive: false,
        ...args,
      }),
    { initialProps: props }
  );
  return { result, rerender, onDragEvent };
}

describe("useAppendPinDrop", () => {
  it("reserves the slot just after the contiguous pinned block", () => {
    const dragged = frecent("https://new.com");
    const { result } = setup({
      baseSites: [
        pinned("https://a.com"),
        pinned("https://b.com"),
        frecent("https://c.com"),
      ],
      draggedSite: dragged,
    });

    // lastPinIndex is 1, so the append slot is 2.
    expect(result.current.decorations.zeroPinSlot).toBe(2);
  });

  it("opens the slot at 0 when there are no pins", () => {
    const dragged = frecent("https://new.com");
    const { result } = setup({
      baseSites: [frecent("https://a.com")],
      draggedSite: dragged,
    });

    expect(result.current.decorations.zeroPinSlot).toBe(0);
  });

  it("keeps the slot closed when nothing is being dragged", () => {
    const { result } = setup({
      baseSites: [pinned("https://a.com")],
      draggedSite: null,
    });

    expect(result.current.decorations.zeroPinSlot).toBe(-1);
  });

  it("keeps the slot closed when the dragged site is not movable", () => {
    const dragged = frecent("https://new.com");
    const { result } = setup({
      baseSites: [pinned("https://a.com")],
      draggedSite: dragged,
      isMovable: () => false,
    });

    expect(result.current.decorations.zeroPinSlot).toBe(-1);
  });

  it("hides the reserved slot while the reflow preview drives", () => {
    const dragged = frecent("https://new.com");
    const { result } = setup({
      baseSites: [pinned("https://a.com")],
      draggedSite: dragged,
      previewActive: true,
    });

    expect(result.current.decorations.zeroPinSlot).toBe(-1);
  });

  it("collapses the dragged source out of the grid", () => {
    const siteA = pinned("https://a.com");
    const dragged = frecent("https://b.com");
    const { result } = setup({
      baseSites: [siteA, dragged],
      draggedSite: dragged,
    });

    expect(result.current.sites[0]).toBe(siteA);
    expect(result.current.sites[1]).toEqual({ ...dragged, isCollapsed: true });
  });

  it("returns baseSites untouched when disabled", () => {
    const baseSites = [pinned("https://a.com"), frecent("https://b.com")];
    const { result } = setup({ baseSites, draggedSite: null });

    expect(result.current.sites).toBe(baseSites);
  });

  it("commits at the append slot when dropped on the placeholder", () => {
    const dragged = frecent("https://new.com");
    const { result, onDragEvent } = setup({
      baseSites: [pinned("https://a.com"), frecent("https://b.com")],
      draggedSite: dragged,
    });

    result.current.decorations.setZeroPinRef(placeholderAt());
    act(() => result.current.listProps.onDrop(inside));

    // appendIndex is lastPinIndex(0) + 1 = 1.
    expect(onDragEvent).toHaveBeenCalledWith(inside, 1);
  });

  it("does not commit when the drop lands outside the placeholder", () => {
    const dragged = frecent("https://new.com");
    const { result, onDragEvent } = setup({
      baseSites: [pinned("https://a.com")],
      draggedSite: dragged,
    });

    result.current.decorations.setZeroPinRef(placeholderAt());
    act(() => result.current.listProps.onDrop(outside));

    expect(onDragEvent).not.toHaveBeenCalled();
  });

  it("clears the reflow and marks over when dragging onto the slot", () => {
    const dragged = frecent("https://new.com");
    const { result, onDragEvent } = setup({
      baseSites: [pinned("https://a.com")],
      draggedSite: dragged,
    });

    result.current.decorations.setZeroPinRef(placeholderAt());
    act(() => result.current.listProps.onDragOver(inside));

    // A no-index dragover clears useTopSitesDnD's insert-anywhere reflow.
    expect(onDragEvent).toHaveBeenCalledWith(inside);
    expect(result.current.decorations.overZeroPin).toBe(true);
  });

  it("does not claim a dragover that misses the slot", () => {
    const dragged = frecent("https://new.com");
    const { result, onDragEvent } = setup({
      baseSites: [pinned("https://a.com")],
      draggedSite: dragged,
    });

    result.current.decorations.setZeroPinRef(placeholderAt());
    act(() => result.current.listProps.onDragOver(outside));

    expect(onDragEvent).not.toHaveBeenCalled();
    expect(result.current.decorations.overZeroPin).toBe(false);
  });
});
