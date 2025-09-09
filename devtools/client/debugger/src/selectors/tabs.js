/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at <http://mozilla.org/MPL/2.0/>. */

import { createSelector } from "devtools/client/shared/vendor/reselect";

import { getSpecificSourceByURL } from "./sources";
import { isSimilarTab } from "../utils/tabs";

export const getTabs = state => state.tabs.tabs;

// Return the list of tabs which relates to an active source
export const getSourceTabs = createSelector(getTabs, tabs =>
  tabs.filter(tab => tab.source)
);

export const getSourcesForTabs = createSelector(getSourceTabs, sourceTabs => {
  return sourceTabs.map(tab => tab.source);
});

export function tabExists(state, source) {
  // Minimized(=generatedSource) and its related pretty printed source will both share the same tab,
  // so we should consider that the tab is already opened if the tab relates to the passed minimized source.
  return getSourceTabs(state).some(
    tab =>
      tab.source.id == source.id ||
      (tab.source.generatedSource?.id == source.id &&
        tab.source.isPrettyPrinted)
  );
}

/**
 * For a given non-original source, returns true only if this source has been pretty printed
 * and has a tab currently opened with pretty printing enabled.
 *
 * @return {Boolean}
 */
export function hasPrettyTab(state, source) {
  return getTabs(state).some(tab => {
    // We either match a tab with the pretty printed source (when the source is actually already pretty printed),
    // or when the tab is a background tab, registered against the generated source (the source hasn't been pretty printed yet).
    return (
      (tab.source?.generatedSource == source && tab.source.isPrettyPrinted) ||
      (tab.isPrettyPrinted && tab.source == source)
    );
  });
}

/**
 * Gets the next tab to select when a tab closes. Heuristics:
 * 1. if the selected tab is available, it remains selected
 * 2. if it is gone, the next available tab to the left should be active
 * 3. if the first tab is active and closed, select the second tab
 */
export function getNewSelectedSource(state, tabList) {
  const { selectedLocation } = state.sources;
  const availableTabs = getTabs(state);
  if (!selectedLocation) {
    return null;
  }

  const selectedSource = selectedLocation.source;
  if (!selectedSource) {
    return null;
  }

  const matchingTab = availableTabs.find(tab =>
    isSimilarTab(tab, selectedSource.url, selectedSource.isOriginal)
  );

  if (matchingTab) {
    const specificSelectedSource = getSpecificSourceByURL(
      state,
      selectedSource.url,
      selectedSource.isOriginal
    );

    if (specificSelectedSource) {
      return specificSelectedSource;
    }

    return null;
  }

  const tabUrls = tabList.map(tab => tab.url);
  const leftNeighborIndex = Math.max(
    tabUrls.indexOf(selectedSource.url) - 1,
    0
  );
  const lastAvailbleTabIndex = availableTabs.length - 1;
  const newSelectedTabIndex = Math.min(leftNeighborIndex, lastAvailbleTabIndex);
  const availableTab = availableTabs[newSelectedTabIndex];

  if (availableTab) {
    const tabSource = getSpecificSourceByURL(
      state,
      availableTab.url,
      availableTab.isOriginal
    );

    if (tabSource) {
      return tabSource;
    }
  }

  return null;
}
