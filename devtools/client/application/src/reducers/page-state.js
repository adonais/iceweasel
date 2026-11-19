/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const {
  UPDATE_DOMAIN,
  UPDATE_PREFETCH_STATUS,
} = require("resource://devtools/client/application/src/constants.js");

function PageState() {
  return {
    // Domain
    domain: null,
    activatedFromNavigationalPrefetch: null,
  };
}

function getDomainFromUrl(url) {
  return new URL(url).hostname;
}

function pageReducer(state = PageState(), action) {
  switch (action.type) {
    case UPDATE_DOMAIN: {
      const { url } = action;
      return {
        ...state,
        domain: getDomainFromUrl(url),
      };
    }

    case UPDATE_PREFETCH_STATUS:
      return {
        ...state,
        activatedFromNavigationalPrefetch:
          action.activatedFromNavigationalPrefetch ?? null,
      };

    default:
      return state;
  }
}

module.exports = {
  PageState,
  pageReducer,
};
