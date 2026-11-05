/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

// Ties a link opened from the newtab to the DISCOVERY_STREAM_USER_EVENT
// dispatched with it, so the main process can tell which story a dwell
// measurement belongs to. Shared by every way of opening a story, so no two
// share an id. Only ever compared against ids created by the same document,
// and never leaves the parent process.
let gDwellId = 0;

/**
 * @returns {number} an id no other link opened from this document has had
 */
export function nextDwellId() {
  return ++gDwellId;
}
