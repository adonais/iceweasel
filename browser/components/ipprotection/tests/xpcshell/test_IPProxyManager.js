/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { IPPProxyManager } = ChromeUtils.importESModule(
  "resource:///modules/ipprotection/IPPProxyManager.sys.mjs"
);
const { IPProtectionServerlist } = ChromeUtils.importESModule(
  "resource:///modules/ipprotection/IPProtectionServerlist.sys.mjs"
);
const { GuardianClient } = ChromeUtils.importESModule(
  "resource:///modules/ipprotection/GuardianClient.sys.mjs"
);

add_setup(async function () {
  await putServerInRemoteSettings();
});

/**
 * Tests that the proxy manager gets proxy pass and connection on starting
 * and removes the connection after after stop.
 */
add_task(async function test_IPPProxyManager_start_stop_reset() {
  let sandbox = sinon.createSandbox();
  let guardian = new GuardianClient();
  sandbox.stub(guardian, "fetchProxyPass").returns({
    status: 200,
    error: undefined,
    pass: {
      isValid: () => true,
      asBearerToken: () => "Bearer hello world",
    },
  });

  await IPProtectionServerlist.maybeFetchList();

  let proxyManager = new IPPProxyManager(guardian);

  await proxyManager.start();

  Assert.ok(proxyManager.active, "Should be active after starting");

  Assert.ok(
    proxyManager.isolationKey,
    "Should have an isolationKey after starting"
  );

  Assert.ok(
    proxyManager.hasValidProxyPass,
    "Should have a valid proxy pass after starting"
  );

  await proxyManager.stop();

  Assert.ok(!proxyManager.active, "Should not be active after starting");

  Assert.ok(
    !proxyManager.isolationKey,
    "Should not have an isolationKey after stopping"
  );

  sandbox.restore();
});

/**
 * Tests that the proxy manager gets proxy pass and connection on starting
 * and removes them after stop / reset.
 */
add_task(async function test_IPPProxyManager_reset() {
  let sandbox = sinon.createSandbox();
  let guardian = new GuardianClient();
  sandbox.stub(guardian, "fetchProxyPass").returns({
    status: 200,
    error: undefined,
    pass: {
      isValid: () => true,
      asBearerToken: () => "Bearer hello world",
    },
  });

  let proxyManager = new IPPProxyManager(guardian);

  await proxyManager.start();

  Assert.ok(proxyManager.active, "Should be active after starting");

  Assert.ok(
    proxyManager.isolationKey,
    "Should have an isolationKey after starting"
  );

  Assert.ok(
    proxyManager.hasValidProxyPass,
    "Should have a valid proxy pass after starting"
  );

  await proxyManager.reset();

  Assert.ok(!proxyManager.active, "Should not be active after starting");

  Assert.ok(
    !proxyManager.isolationKey,
    "Should not have an isolationKey after stopping"
  );

  Assert.ok(
    !proxyManager.hasValidProxyPass,
    "Should not have a proxy pass after stopping"
  );

  sandbox.restore();
});
