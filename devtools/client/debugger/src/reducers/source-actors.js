/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at <http://mozilla.org/MPL/2.0/>. */

/**
 * This reducer stores the list of all source actors as well their breakable lines.
 *
 * There is a one-one relationship with Source Actors from the server codebase,
 * as well as SOURCE Resources distributed by the ResourceCommand API.
 *
 */
function initialSourceActorsState() {
  return {
    // Map(Source Actor ID: string => SourceActor: object)
    // See create.js: `createScriptSourceActor` for the shape of the source actor objects.
    mutableSourceActors: new Map(),

    // Map(Source Actor ID: string => Breakable lines: Promise or Array<Number>)
    // The array is the list of all lines where breakpoints can be set.
    // The value can be a promise to indicate the lines are being loaded.
    mutableBreakableLines: new Map(),

    // List of all breakpoint positions for precise source instance.
    //
    // Map of source key (string) to dictionary object whose keys are line numbers
    // and values of array of positions.
    // A position is an object made with two attributes:
    //  - 'location'
    //  - 'generatedLocation'.
    // Both refering to breakpoint positions in original and generated sources.
    // In case of generated source, the two locations will identical.
    //
    // The Source key will typically be a unique source actor ID.
    // But for HTML sources, which relates to many source actors, this will be a
    // concatenation of all its source actor IDs.
    // And for original source, it will be prefixed by the original source id
    // and then follows the bundle's source actor ID.
    //
    // Map(Source key: string => Dictionary(int => array<object{ location, generatedLocation }))
    mutableBreakpointPositions: new Map(),

    // Set(Source Actor ID: string)
    // List of all IDs of source actor which have a valid related source map / original source.
    // The SourceActor object may have a sourceMapURL attribute set,
    // but this may be invalid. The source map URL or source map file content may be invalid.
    // In these scenarios we will remove the source actor from this set.
    mutableSourceActorsWithSourceMap: new Set(),

    // Map(Source Actor ID: string => string)
    // Store the exception message when processing the sourceMapURL field of the source actor.
    mutableSourceMapErrors: new Map(),

    // Map(Source Actor ID: string => string)
    // When a bundle has a functional sourcemap, reports the resolved source map URL.
    mutableResolvedSourceMapURL: new Map(),
  };
}

export const initial = initialSourceActorsState();

export default function update(state = initialSourceActorsState(), action) {
  switch (action.type) {
    case "INSERT_SOURCE_ACTORS": {
      for (const sourceActor of action.sourceActors) {
        state.mutableSourceActors.set(sourceActor.id, sourceActor);

        // If the sourceMapURL attribute is set, consider that it is valid.
        // But this may be revised later and removed from this Set.
        if (sourceActor.sourceMapURL) {
          state.mutableSourceActorsWithSourceMap.add(sourceActor.id);
        }
      }
      return {
        ...state,
      };
    }

    case "REMOVE_SOURCES": {
      if (!action.actors.length && !action.keys.length) {
        return state;
      }
      for (const { id } of action.actors) {
        state.mutableSourceActors.delete(id);
        state.mutableBreakableLines.delete(id);
        state.mutableSourceActorsWithSourceMap.delete(id);
      }
      for (const key of action.keys) {
        state.mutableBreakpointPositions.delete(key);
      }
      return {
        ...state,
      };
    }

    case "SET_SOURCE_ACTOR_BREAKABLE_LINES":
      state.mutableBreakableLines.set(
        action.sourceActor.id,
        action.promise || action.breakableLines
      );

      return {
        ...state,
      };

    case "ADD_BREAKPOINT_POSITIONS": {
      return addBreakpointPositions(state, action.sourceKey, action.positions);
    }

    case "CLEAR_BREAKPOINT_POSITIONS": {
      return clearBreakpointPositions(state, action.sourceKey);
    }

    case "CLEAR_BREAKPOINT_POSITIONS_ORIGINAL_LOCATION": {
      return clearBreakpointPositionOriginalLocation(state, action.sourceKey);
    }

    case "CLEAR_SOURCE_ACTOR_MAP_URL":
      if (
        state.mutableSourceActorsWithSourceMap.delete(action.sourceActor.id)
      ) {
        return {
          ...state,
        };
      }
      return state;

    case "SOURCE_MAP_ERROR": {
      state.mutableSourceMapErrors.set(
        action.sourceActor.id,
        action.errorMessage
      );
      return { ...state };
    }

    case "RESOLVED_SOURCEMAP_URL": {
      state.mutableResolvedSourceMapURL.set(
        action.sourceActor.id,
        action.resolvedSourceMapURL
      );
      return { ...state };
    }
  }

  return state;
}

function addBreakpointPositions(state, sourceKey, newPositions) {
  // Merge existing and new reported positions if some where already stored
  let positions = state.mutableBreakpointPositions.get(sourceKey);
  if (positions) {
    positions = { ...positions, ...newPositions };
  } else {
    positions = newPositions;
  }

  state.mutableBreakpointPositions.set(sourceKey, positions);

  return {
    ...state,
  };
}

function clearBreakpointPositions(state, sourceKey) {
  if (!state.mutableBreakpointPositions.has(sourceKey)) {
    return state;
  }

  state.mutableBreakpointPositions.delete(sourceKey);

  return {
    ...state,
  };
}

/**
 * Clear the original location in all column breakpoint location for a given source.
 * This will fallback to the generated/bundle location.
 *
 * This is typically used when disabling pretty printing for a source.
 * The minimized source column breakpoint positions (via `location` attribute)
 * will be mapped to the prettyfied/original source.
 */
function clearBreakpointPositionOriginalLocation(state, sourceKey) {
  const positions = state.mutableBreakpointPositions.get(sourceKey);
  if (!positions) {
    return state;
  }

  for (const line in positions) {
    const linePositions = positions[line];
    for (const columnPositions of linePositions) {
      columnPositions.location = columnPositions.generatedLocation;
    }
  }

  return {
    ...state,
  };
}
