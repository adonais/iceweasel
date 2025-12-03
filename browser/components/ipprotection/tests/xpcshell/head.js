/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

"use strict";

const { ProxyPass } = ChromeUtils.importESModule(
  "resource:///modules/ipprotection/GuardianClient.sys.mjs"
);
const { RemoteSettings } = ChromeUtils.importESModule(
  "resource://services-settings/remote-settings.sys.mjs"
);

const { sinon } = ChromeUtils.importESModule(
  "resource://testing-common/Sinon.sys.mjs"
);

function waitForEvent(target, eventName, callback = () => true) {
  return new Promise(resolve => {
    let listener = event => {
      if (callback()) {
        target.removeEventListener(eventName, listener);
        resolve(event);
      }
    };
    target.addEventListener(eventName, listener);
  });
}

async function putServerInRemoteSettings(
  server = {
    hostname: "test1.example.com",
    port: 443,
    quarantined: false,
  }
) {
  const TEST_US_CITY = {
    name: "Test City",
    code: "TC",
    servers: [server],
  };
  const US = {
    name: "United States",
    code: "US",
    cities: [TEST_US_CITY],
  };
  do_get_profile();
  const client = RemoteSettings("vpn-serverlist");
  await client.db.clear();
  await client.db.create(US);
  await client.db.importChanges({}, Date.now());
}
/* exported putServerInRemoteSettings */
