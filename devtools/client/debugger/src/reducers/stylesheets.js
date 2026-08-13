/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at <http://mozilla.org/MPL/2.0/>. */

/**
 * Style sheet reducer
 *
 * @module reducers/stylesheets
 */

export const initialStyleSheetsState = () => ({
  mutableAtRules: new Map(),
});

export default function update(state = initialStyleSheetsState(), action) {
  switch (action.type) {
    case "SET_STYLESHEET_AT_RULES":
      state.mutableAtRules.set(action.id, [...action.atRules]);
      return { ...state };
    default:
      return state;
  }
}
