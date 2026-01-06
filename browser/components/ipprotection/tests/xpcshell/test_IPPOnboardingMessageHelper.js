/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { IPPOnboardingMessage } = ChromeUtils.importESModule(
  "resource:///modules/ipprotection/IPPOnboardingMessageHelper.sys.mjs"
);
const { ONBOARDING_PREF_FLAGS } = ChromeUtils.importESModule(
  "chrome://browser/content/ipprotection/ipprotection-constants.mjs"
);
const AUTOSTART_PREF = "browser.ipProtection.autoStartEnabled";
const MODE_PREF = "browser.ipProtection.exceptionsMode";

add_setup(async function () {
  await putServerInRemoteSettings();
});

/**
 * Tests that onboarding message flags are set for VPN start, autostart, and site exceptions
 */
add_task(async function test_IPPOnboardingMessage() {
  let sandbox = sinon.createSandbox();
  setupStubs(sandbox);

  IPProtectionService.init();

  await waitForEvent(
    IPProtectionService,
    "IPProtectionService:StateChanged",
    () => IPProtectionService.state === IPProtectionStates.READY
  );

  Assert.ok(
    !IPPProxyManager.activatedAt,
    "IP Protection service should not be active initially"
  );

  let startedEventPromise = waitForEvent(
    IPPProxyManager,
    "IPPProxyManager:StateChanged",
    () => IPPProxyManager.state === IPPProxyStates.ACTIVE
  );

  IPPProxyManager.start();

  Assert.equal(
    IPPProxyManager.state,
    IPPProxyStates.ACTIVATING,
    "Proxy activation"
  );

  await startedEventPromise;
  info("after startedEventPromise");
  Assert.equal(
    IPPProxyManager.state,
    IPPProxyStates.ACTIVE,
    "IP Protection service should be active after starting"
  );

  // Check for ever turned on VPN flag
  Assert.notStrictEqual(
    IPPOnboardingMessage.readPrefMask() &
      ONBOARDING_PREF_FLAGS.EVER_TURNED_ON_VPN,
    0,
    "Ever turned on VPN flag should be set"
  );

  // Turn on autostart
  Services.prefs.setBoolPref(AUTOSTART_PREF, true);
  // Check for ever turned on autostart flag
  Assert.notStrictEqual(
    IPPOnboardingMessage.readPrefMask() &
      ONBOARDING_PREF_FLAGS.EVER_TURNED_ON_AUTOSTART,
    0,
    "Ever turned on autostart flag should be set"
  );

  // Turn on site exceptions
  Services.prefs.setStringPref(MODE_PREF, "select");
  // Check for ever turned on site exceptions flag
  Assert.notStrictEqual(
    IPPOnboardingMessage.readPrefMask() &
      ONBOARDING_PREF_FLAGS.EVER_USED_SITE_EXCEPTIONS,
    0,
    "Ever used site exceptions flag should be set"
  );

  IPProtectionService.uninit();
  sandbox.restore();
});
