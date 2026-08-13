/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import { useCallback, useRef, useState } from "react";

// Append-to-end drop slot for the has-pins case. Dragging a frecent (a new pin,
// not an existing one) opens one reserved, net-zero placeholder right after the
// last pin, hidden until the cursor is over it — the same mechanic as
// useZeroPinDrop, just at the end of an existing group. It layers on top of
// useTopSitesDnD's insert-anywhere reflow: over a pin you get the reflow, over
// this slot you append.
//
// Placeholders aren't native drop targets in grouped mode (_allowDrop gates on
// isPinned), so the drop is caught at the list via geometry. The preview and the
// commit reuse useTopSitesDnD's onDragEvent: a no-index dragover clears the
// reflow while this slot owns the interaction, and the drop replays at
// appendIndex so the existing reorder/telemetry path commits it.
export function useAppendPinDrop({
  baseSites,
  draggedSite,
  isMovable,
  onDragEvent, // shared with useTopSitesDnD
  previewActive, // a reflow preview is showing (cursor is over a pin)
}) {
  const [over, setOver] = useState(false);
  const placeholderElRef = useRef(null);

  const setRef = useCallback(el => {
    placeholderElRef.current = el;
  }, []);

  const enabled = !!draggedSite && isMovable(draggedSite);

  // First free slot after the contiguous pinned block.
  const lastPinIndex = baseSites.reduce(
    (last, site, i) => (site?.isPinned ? i : last),
    -1
  );
  const appendIndex = lastPinIndex + 1;

  const isOver = useCallback(event => {
    const rect = placeholderElRef.current?.getBoundingClientRect();
    return (
      !!rect &&
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom
    );
  }, []);

  const onDragOver = useCallback(
    event => {
      if (!enabled) {
        return;
      }
      const nowOver = isOver(event);
      if (nowOver) {
        event.preventDefault();
        // This slot owns the preview now; drop the insert-anywhere reflow.
        onDragEvent(event);
      }
      if (over !== nowOver) {
        setOver(nowOver);
      }
    },
    [enabled, isOver, over, onDragEvent]
  );

  const onDrop = useCallback(
    event => {
      if (!enabled || !isOver(event)) {
        return;
      }
      event.preventDefault();
      // Commit through the reorder hook's drop at the append slot.
      onDragEvent(event, appendIndex);
    },
    [enabled, isOver, onDragEvent, appendIndex]
  );

  const onDragLeave = useCallback(
    event => {
      if (event.currentTarget.contains(event.relatedTarget)) {
        return;
      }
      if (over) {
        setOver(false);
      }
    },
    [over]
  );

  // Collapse the dragged source out of flow so the reserved slot nets zero cells.
  const sites = enabled
    ? baseSites.map(site =>
        site && site.url === draggedSite.url
          ? { ...site, isCollapsed: true }
          : site
      )
    : baseSites;

  return {
    sites,
    listProps: { onDragOver, onDrop, onDragLeave },
    decorations: {
      // Hide the reserved slot while the reflow drives (cursor over a pin), so we
      // don't add a cell on top of the reflow's own growth.
      zeroPinSlot: enabled && !previewActive ? appendIndex : -1,
      overZeroPin: over,
      setZeroPinRef: setRef,
    },
  };
}
