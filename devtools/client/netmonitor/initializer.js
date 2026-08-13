/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
/* exported initialize */

"use strict";

/**
 * This script is the entry point of Network monitor panel.
 */
const { BrowserLoader } = ChromeUtils.importESModule(
  "resource://devtools/shared/loader/browser-loader.sys.mjs"
);

const require = (window.windowRequire = BrowserLoader({
  baseURI: "resource://devtools/client/netmonitor/",
  window,
}).require);

const {
  NetMonitorApp,
} = require("resource://devtools/client/netmonitor/src/app.js");
const EventEmitter = require("resource://devtools/shared/event-emitter.js");

// Inject EventEmitter into global window.
EventEmitter.decorate(window);

/**
 * This is the initialization point for the Network monitor.
 *
 * @param {object} api Allows reusing existing API object.
 */
function initialize(api) {
  const app = new NetMonitorApp(api);

  // Inject to global window for testing
  window.Netmonitor = app;
  window.api = api;
  window.store = app.api.store;
  window.connector = app.api.connector;
  window.actions = app.api.actions;

  return app;
}
