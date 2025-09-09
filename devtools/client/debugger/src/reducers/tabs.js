/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at <http://mozilla.org/MPL/2.0/>. */

/**
 * Tabs reducer
 * @module reducers/tabs
 */

import { isSimilarTab } from "../utils/tabs";

export function initialTabState() {
  return { tabs: [] };
}

function update(state = initialTabState(), action) {
  switch (action.type) {
    case "ADD_TAB":
      return updateTabList(state, action.source, action.sourceActor);

    case "MOVE_TAB":
      return moveTabInList(state, action);

    case "MOVE_TAB_BY_SOURCE_ID":
      return moveTabInListBySourceId(state, action);

    case "CLOSE_TABS":
      return removeSourcesFromTabList(state, action);

    case "ADD_ORIGINAL_SOURCES":
      return addVisibleTabsForOriginalSources(
        state,
        action.originalSources,
        action.generatedSourceActor
      );

    case "INSERT_SOURCE_ACTORS":
      return addVisibleTabsForSourceActors(state, action.sourceActors);

    case "REMOVE_SOURCES": {
      return resetTabsForRemovedSources(state, action);
    }

    default:
      return state;
  }
}

function matchesSource(tab, source) {
  return (
    tab.source?.id === source.id ||
    (source.url &&
      tab.url === source.url &&
      tab.isOriginal == source.isOriginal) ||
    // When toggling pretty printing on, the tab for the minimized source will be updated
    // to refer to this new pretty printed, original source.
    (source.isPrettyPrinted && tab.source == source.generatedSource) ||
    // When reloading a new, we will associate background tab with the minimized source
    // and later, once selected, this will trigger the creation of the pretty printed source
    (tab.isPrettyPrinted && tab.url == `${source.url}:formatted`)
  );
}

function addVisibleTabsForSourceActors(state, sourceActors) {
  let changed = false;
  // Lookups for tabs matching any source actor's URL
  // and reference their source and sourceActor attribute
  // so that the tab becomes visible.
  const tabs = state.tabs.map(tab => {
    const sourceActor = sourceActors.find(actor =>
      matchesSource(tab, actor.sourceObject)
    );
    if (!sourceActor) {
      return tab;
    }
    changed = true;
    return {
      ...tab,
      source: sourceActor.sourceObject,
      sourceActor,
    };
  });

  return changed ? { tabs } : state;
}

function addVisibleTabsForOriginalSources(
  state,
  sources,
  generatedSourceActor
) {
  let changed = false;

  // Lookups for tabs matching any source's URL
  // and reference their source and sourceActor attribute
  // so that the tab becomes visible.
  const tabs = state.tabs.map(tab => {
    const source = sources.find(s => matchesSource(tab, s));
    if (!source) {
      return tab;
    }
    changed = true;
    return {
      ...tab,

      // When we match a pretty printed source, we also need to update the url to show the :formatted suffix,
      // as well as toggling the isOriginal flag to true
      url: source.url,
      isOriginal: source.isPrettyPrinted ? true : tab.isOriginal,
      isPrettyPrinted: source.isPrettyPrinted || tab.isPrettyPrinted,

      source,
      // All currently reported original sources are related to a single source actor
      sourceActor: generatedSourceActor,
    };
  });
  return changed ? { tabs } : state;
}

function removeSourcesFromTabList(state, { sources }) {
  const newTabs = sources.reduce(
    (tabList, source) => tabList.filter(tab => !matchesSource(tab, source)),
    state.tabs
  );
  if (newTabs.length == state.tabs.length) {
    return state;
  }
  return { tabs: newTabs };
}

function resetTabsForRemovedSources(state, { sources }) {
  let changed = false;
  // Nullify source and sourceActor attributes of all tabs
  // related to any of the removed sources.
  //
  // They may later be restored if a source matches their URL again.
  // This is similar to persistTabs, but specific to a list of sources.
  const tabs = state.tabs.map(tab => {
    if (!sources.includes(tab.source)) {
      return tab;
    }
    changed = true;
    // When we are removing the pretty printed source,
    // don't remove the tab, but instead replace it with the minimized source
    if (tab.source.isPrettyPrinted) {
      return {
        ...tab,
        isOriginal: false,
        isPrettyPrinted: false,
        source: tab.source.generatedSource,
        // Also update the url to show the :formatted prefix
        url: tab.source.generatedSource.url,
      };
    }
    return {
      ...tab,
      source: null,
      sourceActor: null,
    };
  });

  return changed ? { tabs } : state;
}

/**
 * Adds the new source to the tab list if it is not already there.
 */
function updateTabList(state, source, sourceActor) {
  // When we register a pretty printed source, we don't add a new tab
  // and instead, only toggle the pretty boolean on the existing tab
  // for the minimized version of the pretty printed source.
  if (source.isPrettyPrinted) {
    const { generatedSource } = source;
    const idx = state.tabs.findIndex(tab => tab.source == generatedSource);
    if (idx == -1) {
      const newTab = {
        url: source.url,
        source,
        isOriginal: true,
        isPrettyPrinted: true,
        sourceActor,
      };

      // New tabs are added first in the list
      let newTabs = Array.from(state.tabs);
      newTabs = [newTab, ...state.tabs];
      return { ...state, tabs: newTabs };
    }

    const newTabs = Array.from(state.tabs);
    newTabs[idx] = {
      ...newTabs[idx],
      isOriginal: true,
      isPrettyPrinted: true,
      source,
      sourceActor,
      // Also update the url to show the :formatted prefix
      url: source.url,
    };
    return { ...state, tabs: newTabs };
  }

  const { url, isOriginal } = source;

  let { tabs } = state;
  // Set currentIndex to -1 for URL-less tabs so that they aren't
  // filtered by isSimilarTab
  const currentIndex = url
    ? tabs.findIndex(tab => isSimilarTab(tab, url, isOriginal))
    : -1;

  // Prevent adding a tab, if a tab already exists for this source
  if (currentIndex !== -1) {
    return state;
  }

  const newTab = {
    url,
    source,
    isOriginal,
    isPrettyPrinted: false,
    sourceActor,
  };

  // New tabs are added first in the list
  tabs = [newTab, ...tabs];

  return { ...state, tabs };
}

function moveTabInList(state, { url, tabIndex: newIndex }) {
  const currentIndex = state.tabs.findIndex(tab => tab.url == url);
  return moveTab(state, currentIndex, newIndex);
}

function moveTabInListBySourceId(state, { sourceId, tabIndex: newIndex }) {
  const currentIndex = state.tabs.findIndex(tab => tab.source?.id == sourceId);
  return moveTab(state, currentIndex, newIndex);
}

function moveTab(state, currentIndex, newIndex) {
  const { tabs } = state;
  const item = tabs[currentIndex];
  // Avoid any state change if we are on the same position or the new is invalid
  if (currentIndex == newIndex || isNaN(newIndex)) {
    return state;
  }

  const newTabs = Array.from(tabs);
  // Remove the item from its current location
  newTabs.splice(currentIndex, 1);
  // And add it to the new one
  newTabs.splice(newIndex, 0, item);

  return { tabs: newTabs };
}

export default update;
