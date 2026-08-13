/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import React, { useCallback, useMemo } from "react";
import { useDispatch } from "react-redux";
import { actionCreators as ac, actionTypes as at } from "common/Actions.mjs";
import {
  TOP_SITES_MAX_ROWS,
  TOP_SITES_MAX_SITES_PER_ROW,
} from "common/Reducers.sys.mjs";
import { TopSiteList } from "./TopSite";
import { isSponsored, TOP_SITES_SOURCE } from "./TopSitesConstants";
import { useTopSitesDnD } from "./useTopSitesDnD.jsx";

// Build the displayed list: truncate/extend to the grid and place the Add button.
export function buildTopSitesList(rows, topSitesRows, maxSitesPerRow) {
  let topSites = rows.slice();
  topSites.length =
    (topSitesRows ?? 0) * (maxSitesPerRow ?? TOP_SITES_MAX_SITES_PER_ROW);
  const addButtonIndex = topSites.findIndex(site => site?.isAddButton);

  // Add button goes right after the last shortcut (front if there are none).
  let targetPosition = 0;
  for (let i = topSites.length - 1; i >= 0; i--) {
    if (topSites[i] && !topSites[i].isAddButton) {
      targetPosition = i + 1;
      break;
    }
  }

  if (addButtonIndex === -1) {
    // Show the add button when there's a free slot, or when the grid is full
    // but can still grow a row. Hidden once the grid is full at the max rows.
    if (targetPosition < topSites.length || topSitesRows < TOP_SITES_MAX_ROWS) {
      topSites[targetPosition] = { isAddButton: true };
    }
  } else if (addButtonIndex !== targetPosition) {
    const [button] = topSites.splice(addButtonIndex, 1);
    const adjustedTarget =
      addButtonIndex < targetPosition ? targetPosition - 1 : targetPosition;
    topSites[adjustedTarget] = button;
  }

  return topSites;
}

// Movability rules the DnD hook is told about (so it stays domain-free).
const isMovable = site =>
  !site.isPinned && !isSponsored(site) && !site.isAddButton;
const isShiftable = site => !!site.isPinned;

// Owns the DnD concern and feeds it to the presentational TopSiteList. Later this
// is the one spot a pref swaps classic vs. grouped DnD.
export function TopSiteListContainer(props) {
  const dispatch = useDispatch();

  const baseSites = useMemo(
    () =>
      buildTopSitesList(
        props.TopSites.rows,
        props.TopSitesRows,
        props.topSitesMaxSitesPerRow
      ),
    [props.TopSites.rows, props.TopSitesRows, props.topSitesMaxSitesPerRow]
  );

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

  const { previewSites, onDragEvent, draggedSite } = useTopSitesDnD({
    baseSites,
    rows: props.TopSites.rows,
    isMovable,
    isShiftable,
    onDragStart,
    onReorder,
  });

  return (
    <TopSiteList
      TopSitesRows={props.TopSitesRows}
      topSitesMaxSitesPerRow={props.topSitesMaxSitesPerRow}
      dispatch={props.dispatch}
      topSiteIconType={props.topSiteIconType}
      colors={props.colors}
      visibleTopSites={props.visibleTopSites}
      sites={previewSites || baseSites}
      onDragEvent={onDragEvent}
      draggedSite={draggedSite}
    />
  );
}
