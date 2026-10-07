/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at <http://mozilla.org/MPL/2.0/>. */

import { createSelector } from "devtools/client/shared/vendor/reselect";

import { getPrettySourceURL, isNotPrettyPrintable } from "../utils/source";

import { isFulfilled } from "../utils/async-value";

import { prefs } from "../utils/prefs";
import { UNDEFINED_LOCATION, NO_LOCATION } from "../reducers/sources";

import {
  hasSourceActor,
  getSourceActor,
  getBreakableLinesForSourceActors,
  isSourceActorWithSourceMap,
} from "./source-actors";
import {
  getSourceTextContentForLocation,
  getSourceTextContentForSource,
} from "./sources-content";

export function hasSource(state, id) {
  return state.sources.mutableSources.has(id);
}

export function getSource(state, id) {
  return state.sources.mutableSources.get(id);
}

export function getSourceFromId(state, id) {
  const source = getSource(state, id);
  if (!source) {
    console.warn(`source ${id} does not exist`);
    dump(`>> ${new Error().stack}\n`);
  }
  return source;
}

export function getSourceByActorId(state, actorId) {
  if (!hasSourceActor(state, actorId)) {
    return null;
  }

  return getSourceActor(state, actorId).sourceObject;
}

function getSourcesByURL(state, url) {
  return state.sources.mutableSourcesPerUrl.get(url) || [];
}

export function getSourceByURL(state, url) {
  const foundSources = getSourcesByURL(state, url);
  return foundSources[0];
}

// This is used by tabs selectors
export function getSpecificSourceByURL(state, url, isOriginal) {
  const foundSources = getSourcesByURL(state, url);
  return foundSources.find(source => source.isOriginal == isOriginal);
}

function getOriginalSourceByURL(state, url) {
  return getSpecificSourceByURL(state, url, true);
}

export function getGeneratedSourceByURL(state, url) {
  return getSpecificSourceByURL(state, url, false);
}

export function getPendingSelectedLocation(state) {
  return state.sources.pendingSelectedLocation;
}

export function getPrettySource(state, id) {
  if (!id) {
    return null;
  }

  const source = getSource(state, id);
  if (!source) {
    return null;
  }

  return getOriginalSourceByURL(state, getPrettySourceURL(source.url));
}

// This is only used by Project Search and tests.
export function getSourceList(state) {
  return [...state.sources.mutableSources.values()];
}

// This is only used by tests and create.js
export function getSourceCount(state) {
  return state.sources.mutableSources.size;
}

export function getSelectedLocation(state) {
  return state.sources.selectedLocation;
}

/**
 * Return the "mapped" location for the currently selected location:
 * - When selecting a location in an original source, returns
 *   the related location in the bundle source.
 *
 * - When selecting a location in a bundle source, returns
 *   the related location in the original source. This may return undefined
 *   while we are still computing this information. (we need to query the asynchronous SourceMap service)
 *
 * - Otherwise, when selecting a location in a source unrelated to source map
 *   or a pretty printed source, returns null.
 */
export function getSelectedMappedSource(state) {
  const selectedLocation = getSelectedLocation(state);
  if (!selectedLocation) {
    return null;
  }

  // Don't map pretty printed to its related compressed source
  if (selectedLocation.source.isPrettyPrinted) {
    return null;
  }

  // If we are on a bundle with a functional source-map,
  // the `selectLocation` action should compute the `selectedOriginalLocation` field.
  if (
    !selectedLocation.source.isOriginal &&
    isSourceActorWithSourceMap(state, selectedLocation.sourceActor.id)
  ) {
    const { selectedOriginalLocation } = state.sources;
    // Return undefined if we are still loading the source map.
    // `selectedOriginalLocation` will be set to undefined instead of null
    if (
      selectedOriginalLocation &&
      selectedOriginalLocation != UNDEFINED_LOCATION &&
      selectedOriginalLocation != NO_LOCATION
    ) {
      return selectedOriginalLocation.source;
    }
    return null;
  }

  // For non original source, which don't have selectedOriginalLocation provided,
  // don't try to map to anything.
  if (!selectedLocation.source.isOriginal) {
    return null;
  }

  // Otherwise, for original source, simply map to their related generated source
  return selectedLocation.source.generatedSource;
}

/**
 * Helps knowing if we are still computing the mapped location for the currently selected source.
 */
export function isSelectedMappedSourceLoading(state) {
  const { selectedOriginalLocation } = state.sources;
  // This `selectedOriginalLocation` attribute is set to UNDEFINED_LOCATION when selecting a new source attribute
  // and later on, when the source map is processed, it will switch to either a valid location object, or NO_LOCATION if no valid one if found.
  return selectedOriginalLocation === UNDEFINED_LOCATION;
}

export const getSelectedSource = createSelector(
  getSelectedLocation,
  selectedLocation => {
    if (!selectedLocation) {
      return undefined;
    }

    return selectedLocation.source;
  }
);

// This is used by tests and pause reducers
export function getSelectedSourceId(state) {
  const source = getSelectedSource(state);
  return source?.id;
}

export function getShouldSelectOriginalLocation(state) {
  return state.sources.shouldSelectOriginalLocation;
}

export function getShouldHighlightSelectedLocation(state) {
  return state.sources.shouldHighlightSelectedLocation;
}

export function getShouldScrollToSelectedLocation(state) {
  return state.sources.shouldScrollToSelectedLocation;
}

/**
 * Gets the first source actor for the source and/or thread
 * provided.
 *
 * @param {object} state
 * @param {string} sourceId
 *         The source used
 * @param {string} [threadId]
 *         The thread to check, this is optional.
 * @param {object} sourceActor
 */
export function getFirstSourceActorForGeneratedSource(
  state,
  sourceId,
  threadId
) {
  let source = getSource(state, sourceId);
  // The source may have been removed if we are being called by async code
  if (!source) {
    return null;
  }
  if (source.isOriginal) {
    source = source.generatedSource;
  }
  const actors = getSourceActorsForSource(state, source.id);
  if (threadId) {
    return actors.find(actorInfo => actorInfo.thread == threadId) || null;
  }
  return actors[0] || null;
}

/**
 * Return the list of source actors we should get data from (for breakable lines/columns,...)
 * for a given location. Except for HTML pages, this is a single source actor.
 *
 * @param {object} state
 * @param {object} location
 * @return {Array<object>}
 *         List of source actors
 */
export function getRelevantSourceActorsForLocation(state, location) {
  if (!location) {
    return [];
  }
  // For original source, query the bundle's source. Otherwise use the location's source as-is.
  const generatedSource = location.source.isOriginal
    ? location.source.generatedSource
    : location.source;

  let sourceActors;
  if (generatedSource.isHTML) {
    // The location may either be on the original pretty printed HTML,
    // or be non-original and be on a HTML page.
    //
    // For HTML file may have many inline <script>'s and need to consider all their source actors.
    sourceActors = getSourceActorsForSource(state, generatedSource.id);
  } else {
    // Otherwise for all other case, use the explicit source actor set on the location object (perfect),
    // or, fallback to the first actor matching the selected source (best effort).
    //
    // We may have many matching source actors if the source, or its bundle is
    // evaluated many times within the same thread (many script tags/evals like with hotreload addons),
    // or evaluated many times in distinct threads (many iframes/workers).
    // Picking the first is brittle as the user may expect to see a precise one.
    sourceActors = [
      location.sourceActor ||
        getFirstSourceActorForGeneratedSource(state, generatedSource.id),
    ];
  }

  return sourceActors;
}

/**
 * Get the source actor of the source
 *
 * @param {object} state
 * @param {string} id
 *        The source id
 * @return {Array<object>}
 *         List of source actors
 */
export function getSourceActorsForSource(state, id) {
  return state.sources.mutableSourceActors.get(id) || [];
}

export function isSourceWithMap(state, id) {
  const actors = getSourceActorsForSource(state, id);
  return actors.some(actor => isSourceActorWithSourceMap(state, actor.id));
}

export function canPrettyPrintSource(state, source, sourceActor) {
  if (
    !source ||
    source.isPrettyPrinted ||
    source.isOriginal ||
    (prefs.clientSourceMapsEnabled && isSourceWithMap(state, source.id))
  ) {
    return false;
  }

  const content = getSourceTextContentForSource(state, source, sourceActor);
  const sourceContent = content && isFulfilled(content) ? content.value : null;

  if (!sourceContent || isNotPrettyPrintable(source, sourceContent)) {
    return false;
  }

  return true;
}

export function getPrettyPrintMessage(state, location) {
  const source = location.source;
  if (!source) {
    return L10N.getStr("sourceTabs.prettyPrint");
  }

  if (source.isPrettyPrinted) {
    return L10N.getStr("sourceTabs.removePrettyPrint");
  }

  if (source.isOriginal) {
    return L10N.getStr("sourceFooter.prettyPrint.isOriginalMessage");
  }

  if (prefs.clientSourceMapsEnabled && isSourceWithMap(state, source.id)) {
    return L10N.getStr("sourceFooter.prettyPrint.hasSourceMapMessage");
  }

  const content = getSourceTextContentForLocation(state, location);

  const sourceContent = content && isFulfilled(content) ? content.value : null;
  if (!sourceContent) {
    return L10N.getStr("sourceFooter.prettyPrint.noContentMessage");
  }

  if (isNotPrettyPrintable(source, sourceContent)) {
    return L10N.getStr(
      "sourceFooter.prettyPrint.isNotPrettyPrintableSourceMessage"
    );
  }

  return L10N.getStr("sourceTabs.prettyPrint");
}

export function getBreakableLines(state, selectedLocation) {
  if (selectedLocation.source.isOriginal) {
    return state.sources.mutableOriginalBreakableLines.get(
      selectedLocation.source.id
    );
  }
  const sourceActors = getRelevantSourceActorsForLocation(
    state,
    selectedLocation
  );
  if (!sourceActors.length) {
    return null;
  }

  // We pull generated file breakable lines directly from the source actors
  // so that breakable lines can be added as new source actors on HTML loads.
  return getBreakableLinesForSourceActors(
    state,
    sourceActors,
    selectedLocation.source.isHTML
  );
}

export const getSelectedBreakableLines = createSelector(
  state => {
    const selectedLocation = getSelectedLocation(state);
    if (!selectedLocation) {
      return null;
    }
    const breakableLines = getBreakableLines(state, selectedLocation);
    // Ignore the breakable lines if they are still being fetched from the server
    if (!breakableLines || breakableLines instanceof Promise) {
      return null;
    }
    return breakableLines;
  },
  breakableLines => new Set(breakableLines || [])
);

export function isSourceOverridden(toolboxState, source) {
  if (!source || !source.url) {
    return false;
  }
  return !!toolboxState.networkOverrides.mutableOverrides[source.url];
}

/**
 * Compute the list of source actors and source objects to be removed
 * when removing a given target/thread.
 *
 * @param {string} threadActorID
 *        The thread to be removed.
 * @return {object}
 *         An object with two arrays:
 *         - actors: list of source actor objects to remove
 *         - sources: list of source objects to remove
 */
export function getSourcesToRemoveForThread(state, threadActorID) {
  const sourcesToRemove = [];
  const actorsToRemove = [];

  for (const [
    sourceId,
    actorsForSource,
  ] of state.sources.mutableSourceActors.entries()) {
    let removedActorsCount = 0;
    // Find all actors for the current source which belongs to the given thread actor
    for (const actor of actorsForSource) {
      if (actor.thread == threadActorID) {
        actorsToRemove.push(actor);
        removedActorsCount++;
      }
    }

    // If we are about to remove all source actors for the current source,
    // or if for some unexpected reason we have a source with no actors,
    // notify the caller to also remove this source.
    if (
      removedActorsCount == actorsForSource.length ||
      !actorsForSource.length
    ) {
      sourcesToRemove.push(state.sources.mutableSources.get(sourceId));

      // Also remove any original sources related to this generated source
      const originalSourceIds =
        state.sources.mutableOriginalSources.get(sourceId);
      if (originalSourceIds?.length > 0) {
        for (const originalSourceId of originalSourceIds) {
          sourcesToRemove.push(
            state.sources.mutableSources.get(originalSourceId)
          );
        }
      }
    }
  }

  return {
    actors: actorsToRemove,
    sources: sourcesToRemove,
  };
}

export function isStyleSheetDisabled(state, source) {
  // Pretty printed source are disabling their unique related minimized source.
  if (source.isPrettyPrinted) {
    source = source.generatedSource;
  }
  return state.sources.mutableDisabledStylesheetsIDs.has(source.id);
}
