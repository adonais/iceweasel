/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import React, { useCallback, useMemo } from "react";
import { useDispatch } from "react-redux";
import { actionCreators as ac, actionTypes as at } from "common/Actions.mjs";
import { TopSiteList } from "./TopSite";
import { buildTopSitesList } from "./TopSiteListContainer";
import { isSponsored, TOP_SITES_SOURCE } from "./TopSitesConstants";
import { useTopSitesDnD } from "./useTopSitesDnD.jsx";
import { useAppendPinDrop } from "./useAppendPinDrop.jsx";
import { useZeroPinDrop } from "./useZeroPinDrop.jsx";

// Grouped reorder uses the classic DnD hook: `isShiftable = isPinned` already
// slides the pinned block, and the constant-cell preview already grows the block
// when a frecent joins — natively, no geometry. Grouping itself (contiguity, the
// drop-zone box) lives in the feed and PinnedAreaOverlay, not here.
const isMovable = site =>
  !site.isPinned && !isSponsored(site) && !site.isAddButton;
const isShiftable = site => !!site.isPinned;

// The TOP_SITES_INSERT + telemetry dispatch both grouped variants commit on a
// drop. Identical shape to the classic container's, kept domain-side here.
function useGroupedInsert() {
  const dispatch = useDispatch();

  const onDragStart = useCallback(
    index =>
      dispatch(
        ac.UserEvent({
          event: "DRAG",
          source: TOP_SITES_SOURCE,
          action_position: index,
        })
      ),
    [dispatch]
  );

  const onReorder = useCallback(
    ({ site, title, fromIndex, toIndex }) => {
      dispatch(
        ac.AlsoToMain({
          type: at.TOP_SITES_INSERT,
          data: {
            site: {
              url: site.url,
              label: title,
              customScreenshotURL: site.customScreenshotURL,
              ...(site.searchTopSite && { searchTopSite: true }),
            },
            index: toIndex,
            draggedFromIndex: fromIndex,
          },
        })
      );
      dispatch(
        ac.UserEvent({
          event: "DROP",
          source: TOP_SITES_SOURCE,
          action_position: toIndex,
        })
      );
    },
    [dispatch]
  );

  return { onDragStart, onReorder };
}

function useBaseSites(props) {
  return useMemo(
    () =>
      buildTopSitesList(
        props.TopSites.rows,
        props.TopSitesRows,
        props.topSitesMaxSitesPerRow
      ),
    [props.TopSites.rows, props.TopSitesRows, props.topSitesMaxSitesPerRow]
  );
}

// Picks the grouped DnD variant by whether any pin exists: zero pins is a
// simpler "drag one tile onto one target" interaction with its own hook, while
// with pins present it's slot reordering, plus an append slot (useAppendPinDrop)
// layered on the reorder hook for dropping a frecent at the group's end. The
// hooks all run every render (rules of hooks) and we consume only the active
// path — that's deliberate: rendering a single TopSiteList across the
// zero-pin<->has-pin flip keeps the subtree mounted, so sponsored tiles don't
// remount on the first pin / last unpin and re-fire their ad impressions. While
// a drag is in flight the hook that owns it (its `draggedSite` is set) stays
// active regardless of `hasPins`, so a mid-drag pinned-set change can't swap
// hooks and strand the gesture.
export function GroupedTopSiteListContainer(props) {
  const baseSites = useBaseSites(props);
  const { onDragStart, onReorder } = useGroupedInsert();
  const hasPins = props.TopSites.rows.some(site => site?.isPinned);

  const reorder = useTopSitesDnD({
    baseSites,
    rows: props.TopSites.rows,
    isMovable,
    isShiftable,
    onDragStart,
    onReorder,
    pinInPlace: true,
  });

  // With pins present, dragging a frecent (a new pin) opens a reserved append
  // slot after the last pin; existing-pin drags just reflow. Layered on the
  // reorder hook: over a pin its reflow drives, over the slot append takes over.
  const append = useAppendPinDrop({
    baseSites,
    draggedSite: reorder.draggedSite,
    isMovable,
    onDragEvent: reorder.onDragEvent,
    previewActive: !!reorder.previewSites,
  });

  const zeroPin = useZeroPinDrop({
    baseSites,
    isSponsored,
    onDragStart,
    onReorder,
  });

  // A live drag's owner (draggedSite set) wins; only when idle do we pick by
  // hasPins. Keeps one hook authoritative for the whole gesture across a flip.
  let active;
  if (reorder.draggedSite) {
    active = reorder;
  } else if (zeroPin.draggedSite) {
    active = zeroPin;
  } else {
    active = hasPins ? reorder : zeroPin;
  }
  const isZeroPin = active === zeroPin;

  return (
    <TopSiteList
      {...props}
      sites={isZeroPin ? zeroPin.sites : reorder.previewSites || append.sites}
      onDragEvent={active.onDragEvent}
      draggedSite={active.draggedSite}
      groupedPinsEnabled={true}
      listProps={isZeroPin ? zeroPin.listProps : append.listProps}
      decorations={isZeroPin ? zeroPin.decorations : append.decorations}
    />
  );
}
