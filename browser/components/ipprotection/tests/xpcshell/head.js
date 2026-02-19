/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

"use strict";

const { IPProtectionService, IPProtectionStates } = ChromeUtils.importESModule(
  "moz-src:///browser/components/ipprotection/IPProtectionService.sys.mjs"
);
const { IPPProxyManager, IPPProxyStates } = ChromeUtils.importESModule(
  "moz-src:///browser/components/ipprotection/IPPProxyManager.sys.mjs"
);
const { IPPSignInWatcher } = ChromeUtils.importESModule(
  "moz-src:///browser/components/ipprotection/IPPSignInWatcher.sys.mjs"
);
const { ProxyPass } = ChromeUtils.importESModule(
  "moz-src:///browser/components/ipprotection/GuardianClient.sys.mjs"
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
    pass: new ProxyPass(
      options.validProxyPass
        ? createProxyPassToken()
        : createExpiredProxyPassToken()
    ),
  });
}

/**
 * Creates a Token that can be fed as a Network Response from Guardian
 * to simulate a Proxy Pass.
 *
 * @param {Temporal.Instant} from
 * @param {Temporal.Instant} until
 * @returns {string} JWT Token
 */
function createProxyPassToken(
  from = Temporal.Now.instant(),
  until = from.add({ hours: 24 })
) {
  const header = {
    alg: "HS256",
    typ: "JWT",
  };
  const body = {
    iat: Math.floor(from.add({ seconds: 1 }).epochMilliseconds / 1000),
    nbf: Math.floor(from.epochMilliseconds / 1000),
    exp: Math.floor(until.epochMilliseconds / 1000),
    sub: "proxy-pass-user-42",
    aud: "guardian-proxy",
    iss: "vpn.mozilla.org",
  };
  const encode = obj => btoa(JSON.stringify(obj));
  return [encode(header), encode(body), "signature"].join(".");
}
/* exported createExpiredProxyPassToken */
function createExpiredProxyPassToken() {
  return createProxyPassToken(
    Temporal.Now.instant().subtract({ hours: 2 }),
    Temporal.Now.instant().subtract({ hours: 1 })
  );
}
/* exported createExpiredProxyPassToken */
