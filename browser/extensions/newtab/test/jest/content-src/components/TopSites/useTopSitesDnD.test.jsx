/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at https://mozilla.org/MPL/2.0/. */

import { act, renderHook } from "@testing-library/react";
import { useTopSitesDnD } from "content-src/components/TopSites/useTopSitesDnD.jsx";
import { buildTopSitesList } from "content-src/components/TopSites/TopSiteListContainer";
import { isSponsored } from "content-src/components/TopSites/TopSitesConstants";

const PER_ROW = 8;
// Same movability rules the container injects.
const isMovable = site =>
  !site.isPinned && !isSponsored(site) && !site.isAddButton;
const isShiftable = site => !!site.isPinned;
const dragged = site => ({ ...site, isPinned: true, isDragged: true });

function setup({
  rows = [],
  onDragStart = jest.fn(),
  onReorder = jest.fn(),
} = {}) {
  const { result, rerender } = renderHook(
    props =>
      useTopSitesDnD({
        baseSites: buildTopSitesList(props.rows, 1, PER_ROW),
        rows: props.rows,
        isMovable,
        isShiftable,
        onDragStart,
        onReorder,
      }),
    { initialProps: { rows } }
  );
  return { result, rerender, onDragStart, onReorder };
}

describe("useTopSitesDnD", () => {
  it("tracks the dragged site on dragstart and fires onDragStart", () => {
    const site = { url: "https://foo.com" };
    const { result, onDragStart } = setup({ rows: [site] });
    act(() =>
      result.current.onDragEvent({ type: "dragstart" }, 0, site, "foo")
    );
    expect(result.current.draggedSite).toBe(site);
    expect(onDragStart).toHaveBeenCalledWith(0);
  });

  it("clears the drag on dragend when there was no drop", () => {
    const site = { url: "https://foo.com" };
    const { result } = setup({ rows: [site] });
    act(() =>
      result.current.onDragEvent({ type: "dragstart" }, 0, site, "foo")
    );
    act(() => result.current.onDragEvent({ type: "dragend" }));
    expect(result.current.draggedSite).toBe(null);
    expect(result.current.previewSites).toBe(null);
  });

  it("previews a reflow: movable tiles fill the holes, dragged lands at the index", () => {
    const site1 = { url: "https://foo.com" };
    const site2 = { url: "https://bar.com" };
    const site3 = { url: "https://baz.com" };
    const addButton = { isAddButton: true };
    const { result } = setup({ rows: [site1, site2, site3] });
    act(() =>
      result.current.onDragEvent({ type: "dragstart" }, 0, site1, "foo")
    );
    act(() => result.current.onDragEvent({ type: "dragenter" }, 2));
    expect(result.current.previewSites).toEqual([
      site2,
      site3,
      dragged(site1),
      addButton,
      null,
      null,
      null,
      null,
    ]);
  });

  it("shifts a pinned anchor toward the hole to make room", () => {
    const site1 = { url: "https://foo.com" };
    const site2 = { url: "https://bar.com", isPinned: true };
    const site3 = { url: "https://baz.com" };
    const addButton = { isAddButton: true };
    const { result } = setup({ rows: [site1, site2, site3] });
    act(() =>
      result.current.onDragEvent({ type: "dragstart" }, 0, site1, "foo")
    );
    act(() => result.current.onDragEvent({ type: "dragenter" }, 2));
    expect(result.current.previewSites).toEqual([
      site3,
      site2,
      dragged(site1),
      addButton,
      null,
      null,
      null,
      null,
    ]);
  });

  it("never shifts a sponsored anchor", () => {
    const site1 = { url: "https://foo.com" };
    const site2 = { url: "https://bar.com", sponsored_position: 2 };
    const site3 = { url: "https://baz.com" };
    const addButton = { isAddButton: true };
    const { result } = setup({ rows: [site1, site2, site3] });
    act(() =>
      result.current.onDragEvent({ type: "dragstart" }, 2, site3, "baz")
    );
    act(() => result.current.onDragEvent({ type: "dragenter" }, 0));
    expect(result.current.previewSites).toEqual([
      dragged(site3),
      site2,
      site1,
      addButton,
      null,
      null,
      null,
      null,
    ]);
  });

  it("fires onReorder on a committing drop and keeps the drag through the trailing dragend", () => {
    const site1 = { url: "https://foo.com", customScreenshotURL: "shot" };
    const { result, onReorder } = setup({ rows: [site1] });
    act(() =>
      result.current.onDragEvent({ type: "dragstart" }, 0, site1, "foo")
    );
    act(() => result.current.onDragEvent({ type: "drop" }, 3));
    expect(onReorder).toHaveBeenCalledWith({
      site: site1,
      title: "foo",
      fromIndex: 0,
      toIndex: 3,
    });
    // dropped -> the trailing dragend must not reset; the committed rows do.
    act(() => result.current.onDragEvent({ type: "dragend" }));
    expect(result.current.draggedSite).toBe(site1);
  });

  it("clears the drag once the committed order arrives", () => {
    const site1 = { url: "https://foo.com" };
    const site2 = { url: "https://bar.com" };
    const { result, rerender } = setup({ rows: [site1, site2] });
    act(() =>
      result.current.onDragEvent({ type: "dragstart" }, 0, site1, "foo")
    );
    act(() => rerender({ rows: [site2, site1] }));
    expect(result.current.draggedSite).toBe(null);
  });
});
