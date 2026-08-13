/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import { useCallback, useLayoutEffect, useRef, useState } from "react";

// Drag-and-drop for the zero-pin case: with no pins there's nothing to reorder,
// so this is just "drag one tile onto one target." A single placeholder marks
// the first pinnable slot; dropping on it pins the tile there. No slots, no
// geometry, no reorder preview — once there's a group, reordering is the classic
// useTopSitesDnD hook. Domain bits are injected, as elsewhere.
export function useZeroPinDrop({
  baseSites,
  isSponsored, // leading anchors the pin sits behind
  onDragStart,
  onReorder, // ({ site, title, fromIndex, toIndex }) — caller persists it
}) {
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [draggedSite, setDraggedSite] = useState(null);
  const [draggedTitle, setDraggedTitle] = useState(null);
  const [over, setOver] = useState(false);
  // Set on drop so the trailing dragend doesn't un-collapse the source before
  // the pin commits (which swaps this container out entirely).
  const droppedRef = useRef(false);
  const placeholderElRef = useRef(null);

  const setZeroPinRef = useCallback(el => {
    placeholderElRef.current = el;
  }, []);

  // First pinnable slot (after any leading sponsored); the backend lands it at
  // group position 0.
  const slot = baseSites.findIndex(site => site && !isSponsored(site));
  const insertIndex = slot === -1 ? 0 : slot;

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

  const resetDrag = useCallback(() => {
    setDraggedIndex(null);
    setDraggedSite(null);
    setDraggedTitle(null);
    setOver(false);
  }, []);

  const onDragEvent = useCallback(
    (event, index, link, title) => {
      switch (event.type) {
        case "dragstart":
          droppedRef.current = false;
          setDraggedIndex(index);
          setDraggedSite(link);
          setDraggedTitle(title);
          onDragStart?.(index);
          break;
        case "dragend":
          if (!droppedRef.current) {
            resetDrag();
          } else {
            // Keep the source collapsed until the pin commits and this unmounts.
            setOver(false);
          }
          break;
      }
    },
    [onDragStart, resetDrag]
  );

  const onDragOver = useCallback(
    event => {
      if (!draggedSite) {
        return;
      }
      const nowOver = isOver(event);
      if (nowOver) {
        event.preventDefault();
      }
      if (over !== nowOver) {
        setOver(nowOver);
      }
    },
    [draggedSite, isOver, over]
  );

  const onDrop = useCallback(
    event => {
      if (!draggedSite || !isOver(event)) {
        return;
      }
      event.preventDefault();
      droppedRef.current = true;
      onReorder?.({
        site: draggedSite,
        title: draggedTitle,
        fromIndex: draggedIndex,
        toIndex: insertIndex,
      });
    },
    [draggedSite, draggedTitle, draggedIndex, isOver, onReorder, insertIndex]
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

  // The container no longer unmounts on the first pin, so clear our own drag
  // state once the drop commits (new baseSites arrive after the refresh). Layout
  // effect so the source doesn't un-collapse for a frame before the pin lands.
  const prevBaseRef = useRef(baseSites);
  useLayoutEffect(() => {
    if (droppedRef.current && prevBaseRef.current !== baseSites) {
      droppedRef.current = false;
      resetDrag();
    }
    prevBaseRef.current = baseSites;
  }, [baseSites, resetDrag]);

  // Collapse the dragged source out of flow; the placeholder stands in for it
  // (net-zero cells, so a full row won't overflow).
  const sites = draggedSite
    ? baseSites.map(site =>
        site && site.url === draggedSite.url
          ? { ...site, isCollapsed: true }
          : site
      )
    : baseSites;

  return {
    sites,
    draggedSite,
    onDragEvent,
    listProps: { onDragOver, onDrop, onDragLeave },
    decorations: {
      // Only open the drop placeholder while actually dragging; otherwise it
      // would sit in the grid as an invisible (visibility:hidden) blank slot.
      zeroPinSlot: draggedSite ? insertIndex : -1,
      overZeroPin: over,
      setZeroPinRef,
    },
  };
}
