/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { ClientEnvironmentBase } from "resource://gre/modules/components-utils/ClientEnvironment.sys.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  NormandyApi: "resource://normandy/lib/NormandyApi.sys.mjs",
});

// Cached API request for client attributes that are determined by the Normandy
// service.
let _classifyRequest = null;

export class ClientEnvironment extends ClientEnvironmentBase {
  /**
   * Fetches information about the client that is calculated on the server,
   * like geolocation and the current time.
   *
   * The server request is made lazily and is cached for the entire browser
   * session.
   */
  static async getClientClassification() {
    if (!_classifyRequest) {
      _classifyRequest = lazy.NormandyApi.classifyClient();
    }
    return _classifyRequest;
  }

  static clearClassifyCache() {
    _classifyRequest = null;
  }

  /**
   * Test wrapper that mocks the server request for classifying the client.
   *
   * @param  {object}   data          Fake server data to use
   * @param  {Function} testFunction  Test function to execute while mock data is in effect.
   */
  static withMockClassify(data, testFunction) {
    return async function inner() {
      const oldRequest = _classifyRequest;
      _classifyRequest = Promise.resolve(data);
      await testFunction();
      _classifyRequest = oldRequest;
    };
  }

  static get userId() {
    return ClientEnvironment.randomizationId;
  }

  static get country() {
    return (async () => {
      const { country } = await ClientEnvironment.getClientClassification();
      return country;
    })();
  }

  static get request_time() {
    return (async () => {
      const { request_time } =
        await ClientEnvironment.getClientClassification();
      return request_time;
    })();
  }

  static get isFirstRun() {
    return Services.prefs.getBoolPref("app.normandy.first_run", true);
  }
}
