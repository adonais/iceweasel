/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at <http://mozilla.org/MPL/2.0/>. */

import { prefs } from "../../utils/prefs";
import { getSourceActorsForSource } from "../../selectors/index";

const telemetryPingsPerSource = new Map();

export function updateStyleSheetContent(sourceActor, text) {
  return async ({ client }) => {
    // This tries to ensure only one ping per sourceActor is sent to Glean,
    // even if the user edits the same source multiple times.
    if (!telemetryPingsPerSource.has(sourceActor.id)) {
      Glean.devtoolsDebuggerStylesheets.stylesheetsEditedCount.add(1);
      telemetryPingsPerSource.set(sourceActor.id, true);
    }
    await client.updateStyleSheetContent(
      sourceActor,
      text,
      prefs.styleSheetTransitions
    );
  };
}

// Note: For pretty printed sources, though the selected location for the sourceActor
// refers to the original/pretty printed source, the source related to the sourceActor
// i.e sourceActor.sourceObject is the minimized source.
export function toggleStylesheetVisibility(sourceActor) {
  return async ({ client, dispatch, getState }) => {
    const source = sourceActor.sourceObject;

    const actors = getSourceActorsForSource(getState(), source.id);
    const response = await Promise.all(
      actors.map(actor => client.toggleStylesheetVisibility(actor))
    );
    dispatch({
      type: "SET_STYLESHEET_VISIBILITY",
      isDisabled: !!response[0],
      sourceId: source.id,
    });
  };
}

export function setStyleSheetAtRules(actorId, atRules) {
  return async ({ dispatch }) => {
    dispatch({
      type: "SET_STYLESHEET_AT_RULES",
      id: actorId,
      atRules,
    });
  };
}
