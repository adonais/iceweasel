/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

"use strict";

const { IPProtectionService, IPProtectionStates } = ChromeUtils.importESModule(
  "resource:///modules/ipprotection/IPProtectionService.sys.mjs"
);
const { IPPProxyManager, IPPProxyStates } = ChromeUtils.importESModule(
  "resource:///modules/ipprotection/IPPProxyManager.sys.mjs"
);
const { IPPSignInWatcher } = ChromeUtils.importESModule(
  "resource:///modules/ipprotection/IPPSignInWatcher.sys.mjs"
);
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

function setupStubs(
  sandbox,
  options = {
    signedIn: true,
    isLinkedToGuardian: true,
    validProxyPass: true,
    entitlement: {
      subscribed: false,
      uid: 42,
      created_at: "2023-01-01T12:00:00.000Z",
    },
  }
) {
  sandbox.stub(IPPSignInWatcher, "isSignedIn").get(() => options.signedIn);
  sandbox
    .stub(IPProtectionService.guardian, "isLinkedToGuardian")
    .resolves(options.isLinkedToGuardian);
  sandbox.stub(IPProtectionService.guardian, "fetchUserInfo").resolves({
    status: 200,
    error: null,
    entitlement: options.entitlement,
  });
  sandbox.stub(IPProtectionService.guardian, "enroll").resolves({
    status: 200,
    error: null,
  });
  sandbox.stub(IPProtectionService.guardian, "fetchProxyPass").resolves({
    status: 200,
    error: undefined,
    pass: {
      isValid: () => options.validProxyPass,
      asBearerToken: () => "Bearer helloworld",
    },
  });
}
