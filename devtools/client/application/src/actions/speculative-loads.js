/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const {
  ADD_SPECULATION,
  UPDATE_SPECULATION,
  RESET_SPECULATIONS,
} = require("resource://devtools/client/application/src/constants.js");

function getSpeculation(resource) {
  const { resourceId, url, status, blockedReason, responseEndAvailable } =
    resource;
  let loadStatus = "pending";
  if (blockedReason) {
    loadStatus = "failure";
  } else if (responseEndAvailable) {
    loadStatus = status >= 200 && status < 400 ? "success" : "failure";
  }

  return { resourceId, url, action: "prefetch", status: loadStatus };
}

function addSpeculation(resource) {
  return { type: ADD_SPECULATION, speculation: getSpeculation(resource) };
}

function updateSpeculation(resource) {
  return { type: UPDATE_SPECULATION, speculation: getSpeculation(resource) };
}

function resetSpeculations() {
  return { type: RESET_SPECULATIONS };
}

module.exports = { addSpeculation, updateSpeculation, resetSpeculations };
