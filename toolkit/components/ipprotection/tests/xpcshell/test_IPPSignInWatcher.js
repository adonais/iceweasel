/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { IPPSignInWatcher } = ChromeUtils.importESModule(
  "moz-src:///toolkit/components/ipprotection/fxa/IPPSignInWatcher.sys.mjs"
);
const { getFxAccountsSingleton } = ChromeUtils.importESModule(
  "resource://gre/modules/FxAccounts.sys.mjs"
);

// Profile must be registered before we resolve the FxAccounts singleton
do_get_profile();
const fxAccounts = getFxAccountsSingleton();

function resetWatcher() {
  IPPSignInWatcher.uninit();
  IPPSignInWatcher.isSignedIn = false;
}

registerCleanupFunction(() => {
  Services.prefs.clearUserPref("services.sync.username");
  resetWatcher();
});

/**
 * Bug 2022545: A user signed in to FxA but not enrolled in Sync must still be
 * reported as signed in. The previous implementation read
 * `services.sync.username`, which is only set when Sync is configured.
 */
add_task(async function test_signedIn_for_verified_fxa_user_without_sync() {
  Services.prefs.clearUserPref("services.sync.username");
  resetWatcher();

  const sandbox = sinon.createSandbox();
  sandbox.stub(fxAccounts, "getSignedInUser").resolves({
    uid: "test-uid",
    email: "user@example.com",
    verified: true,
  });

  const stateChanged = waitForEvent(
    IPPSignInWatcher,
    "IPPSignInWatcher:StateChanged",
    () => IPPSignInWatcher.isSignedIn === true
  );

  IPPSignInWatcher.init();
  await stateChanged;

  Assert.ok(
    IPPSignInWatcher.isSignedIn,
    "isSignedIn should be true for a verified FxA user without Sync"
  );

  sandbox.restore();
  resetWatcher();
});

add_task(async function test_not_signedIn_when_no_fxa_user() {
  // Pre-seed to true so #setSignedIn transitions and fires the event we await.
  IPPSignInWatcher.isSignedIn = true;

  const sandbox = sinon.createSandbox();
  sandbox.stub(fxAccounts, "getSignedInUser").resolves(null);

  const stateChanged = waitForEvent(
    IPPSignInWatcher,
    "IPPSignInWatcher:StateChanged",
    () => IPPSignInWatcher.isSignedIn === false
  );

  IPPSignInWatcher.init();
  await stateChanged;

  Assert.ok(
    !IPPSignInWatcher.isSignedIn,
    "isSignedIn should be false when FxA reports no signed-in user"
  );

  sandbox.restore();
  resetWatcher();
});

add_task(async function test_not_signedIn_when_fxa_user_unverified() {
  IPPSignInWatcher.isSignedIn = true;

  const sandbox = sinon.createSandbox();
  sandbox.stub(fxAccounts, "getSignedInUser").resolves({
    uid: "test-uid",
    email: "user@example.com",
    verified: false,
  });

  const stateChanged = waitForEvent(
    IPPSignInWatcher,
    "IPPSignInWatcher:StateChanged",
    () => IPPSignInWatcher.isSignedIn === false
  );

  IPPSignInWatcher.init();
  await stateChanged;

  Assert.ok(
    !IPPSignInWatcher.isSignedIn,
    "isSignedIn should be false when the FxA user is not verified"
  );

  sandbox.restore();
  resetWatcher();
});

add_task(async function test_not_signedIn_when_fxa_throws() {
  IPPSignInWatcher.isSignedIn = true;

  const sandbox = sinon.createSandbox();
  sandbox.stub(fxAccounts, "getSignedInUser").rejects(new Error("boom"));

  const stateChanged = waitForEvent(
    IPPSignInWatcher,
    "IPPSignInWatcher:StateChanged",
    () => IPPSignInWatcher.isSignedIn === false
  );

  IPPSignInWatcher.init();
  await stateChanged;

  Assert.ok(
    !IPPSignInWatcher.isSignedIn,
    "isSignedIn should be false when getSignedInUser throws"
  );

  sandbox.restore();
  resetWatcher();
});

/**
 * Regression guard for Bug 2022545: even if `services.sync.username` is set
 * (which the buggy implementation treated as proof of sign-in), the watcher
 * must defer to FxA and report not-signed-in when FxA has no user.
 */
add_task(async function test_ignores_stale_sync_username_pref() {
  Services.prefs.setStringPref("services.sync.username", "stale@example.com");
  IPPSignInWatcher.isSignedIn = true;

  const sandbox = sinon.createSandbox();
  sandbox.stub(fxAccounts, "getSignedInUser").resolves(null);

  const stateChanged = waitForEvent(
    IPPSignInWatcher,
    "IPPSignInWatcher:StateChanged",
    () => IPPSignInWatcher.isSignedIn === false
  );

  IPPSignInWatcher.init();
  await stateChanged;

  Assert.ok(
    !IPPSignInWatcher.isSignedIn,
    "isSignedIn should follow FxA, not services.sync.username"
  );

  Services.prefs.clearUserPref("services.sync.username");
  sandbox.restore();
  resetWatcher();
});
