/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import React, { useLayoutEffect, useRef, useState } from "react";

// Sort pinned tiles by absolute slot index and group them into rows by top edge,
// so multi-row pinned groups (wrapping at a breakpoint) work.
function tilesToRows(tiles) {
  const entries = tiles
    .map(el => ({
      index: parseInt(el.dataset.index, 10),
      rect: el.getBoundingClientRect(),
    }))
    .sort((a, b) => a.index - b.index);

  const rows = [];
  for (const entry of entries) {
    const row = rows.find(
      r => Math.abs(r[0].rect.top - entry.rect.top) < entry.rect.height / 2
    );
    if (row) {
      row.push(entry);
    } else {
      rows.push([entry]);
    }
  }
  return rows;
}

// Min/max edges of a row of tile entries.
function rowBounds(row) {
  return {
    top: Math.min(...row.map(e => e.rect.top)),
    bottom: Math.max(...row.map(e => e.rect.bottom)),
    left: Math.min(...row.map(e => e.rect.left)),
    right: Math.max(...row.map(e => e.rect.right)),
  };
}

/**
 * Per-row bounding boxes for the pinned group, relative to `containerEl`, for the
 * drag-time drop overlay. Pinned tiles can wrap, so it's a set of row rects; each
 * carries `startAbsIdx` (first slot index on that row).
 */
function computePinnedRowRects(tiles, containerEl) {
  if (!tiles.length || !containerEl) {
    return [];
  }
  const containerRect = containerEl.getBoundingClientRect();
  return tilesToRows(tiles).map(row => {
    const { top: rowTop, bottom, left, right } = rowBounds(row);
    return {
      startAbsIdx: row[0].index,
      top: rowTop - containerRect.top,
      left: left - containerRect.left,
      width: right - left,
      height: bottom - rowTop,
    };
  });
}

// The "Pinned Area" drop-zone box drawn around the pinned region during a drag.
// Self-measuring: it reads the currently rendered `.pinned-cell` tiles from its
// parent list, so it tracks the live reorder preview (growing/shrinking as the
// dragged tile joins or leaves the group) without the drag hook owning any
// geometry. `revision` changes whenever the previewed order does, to re-measure.
export function PinnedAreaOverlay({ active, revision }) {
  const rootRef = useRef(null);
  const [rowRects, setRowRects] = useState([]);

  useLayoutEffect(() => {
    const list = rootRef.current?.parentElement;
    if (!list) {
      return;
    }
    const cells = [
      ...list.querySelectorAll(".top-site-outer.pinned-cell:not(.drag-ghost)"),
    ];
    setRowRects(computePinnedRowRects(cells, list));
  }, [active, revision]);

  if (!active) {
    return null;
  }

  return (
    <div className="pinned-drag-overlay" ref={rootRef}>
      {rowRects.map((row, rowIdx) => (
        <div
          key={row.startAbsIdx}
          className="pinned-drop-box"
          style={{
            top: `${row.top}px`,
            left: `${row.left}px`,
            width: `${row.width}px`,
            height: `${row.height}px`,
          }}
        >
          {rowIdx === 0 && (
            <div className="pinned-area-label">
              <span className="icon icon-pin-small" />
              <span data-l10n-id="newtab-shortcuts-pinned-area" />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
