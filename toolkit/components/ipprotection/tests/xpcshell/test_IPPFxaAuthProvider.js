/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { IPPFxaAuthProviderSingleton } = ChromeUtils.importESModule(
  "moz-src:///toolkit/components/ipprotection/fxa/IPPFxaAuthProvider.sys.mjs"
);

function makeProvider(sandbox) {
  const provider = new IPPFxaAuthProviderSingleton();
  const removeToken = sandbox.spy();
  sandbox.stub(provider, "getToken").resolves({
    token: "fake-token",
    [Symbol.dispose]: removeToken,
  });
  return { provider, removeToken };
}

// Bug 2036792
for (const method of ["fetchProxyPass", "fetchProxyUsage"]) {
  add_task(async function test_removes_token_after_guardian_resolves() {
    const sandbox = sinon.createSandbox();
    const { provider, removeToken } = makeProvider(sandbox);

    let resolveGuardian;
    sandbox
      .stub(provider.guardian, method)
      .returns(new Promise(r => (resolveGuardian = r)));

    const fetchPromise = provider[method]();
    await Promise.resolve();
    await Promise.resolve();

    Assert.ok(
      !removeToken.called,
      `${method}: token not removed while guardian is pending`
    );

    resolveGuardian({ status: 200 });
    await fetchPromise;

    Assert.ok(
      removeToken.calledOnce,
      `${method}: token removed after guardian resolves`
    );

    sandbox.restore();
  });
}
