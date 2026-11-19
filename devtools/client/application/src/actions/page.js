/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const {
  UPDATE_DOMAIN,
  UPDATE_PREFETCH_STATUS,
} = require("resource://devtools/client/application/src/constants.js");

function updateDomain(url) {
  return {
    type: UPDATE_DOMAIN,
    url,
  };
}

function updatePrefetchStatus(activatedFromNavigationalPrefetch) {
  return {
    type: UPDATE_PREFETCH_STATUS,
    activatedFromNavigationalPrefetch,
  };
}

module.exports = {
  updateDomain,
  updatePrefetchStatus,
};
