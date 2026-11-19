/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const {
  ADD_SPECULATION,
  UPDATE_SPECULATION,
  RESET_SPECULATIONS,
} = require("resource://devtools/client/application/src/constants.js");

function SpeculativeLoadsState() {
  return { requests: {} };
}

function speculativeLoadsReducer(state = SpeculativeLoadsState(), action) {
  switch (action.type) {
    case ADD_SPECULATION:
    case UPDATE_SPECULATION: {
      const { speculation } = action;
      if (
        action.type === UPDATE_SPECULATION &&
        !state.requests[speculation.resourceId]
      ) {
        return state;
      }
      return {
        ...state,
        requests: {
          ...state.requests,
          [speculation.resourceId]: speculation,
        },
      };
    }
    case RESET_SPECULATIONS:
      return SpeculativeLoadsState();
    default:
      return state;
  }
}

module.exports = { SpeculativeLoadsState, speculativeLoadsReducer };
