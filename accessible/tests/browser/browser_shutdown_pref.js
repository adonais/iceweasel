/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const PREF_ACCESSIBILITY_FORCE_DISABLED = "accessibility.force_disabled";

add_task(async function testForceDisable() {
  ok(
    !Services.appinfo.accessibilityEnabled,
    "Accessibility is disabled by default"
  );

  info("Reset force disabled preference");
  Services.prefs.clearUserPref(PREF_ACCESSIBILITY_FORCE_DISABLED);

  info("Enable accessibility service via XPCOM");
  let [a11yInitObserver, a11yInit] = initAccService();
  await a11yInitObserver;

  let accService = Cc["@mozilla.org/accessibilityService;1"].getService(
    Ci.nsIAccessibilityService
  );
  await a11yInit;
  ok(Services.appinfo.accessibilityEnabled, "Accessibility is enabled");

  info("Force disable a11y service via preference");
  let [a11yShutdownObserver, a11yShutdown] = shutdownAccService();
  await a11yShutdownObserver;

  Services.prefs.setIntPref(PREF_ACCESSIBILITY_FORCE_DISABLED, 1);
  await a11yShutdown;
  ok(!Services.appinfo.accessibilityEnabled, "Accessibility is disabled");

  info("Attempt to get an instance of a11y service and call its method.");
  accService = Cc["@mozilla.org/accessibilityService;1"].getService(
    Ci.nsIAccessibilityService
  );
  try {
    accService.getAccesssibleFor(document);
    ok(false, "getAccesssibleFor should've triggered an exception.");
  } catch (e) {
    ok(
      true,
      "getAccesssibleFor triggers an exception as a11y service is shutdown."
    );
  }
  ok(!Services.appinfo.accessibilityEnabled, "Accessibility is disabled");

  info("Reset force disabled preference");
  Services.prefs.clearUserPref(PREF_ACCESSIBILITY_FORCE_DISABLED);

  info("Create a11y service again");
  [a11yInitObserver, a11yInit] = initAccService();
  await a11yInitObserver;

  accService = Cc["@mozilla.org/accessibilityService;1"].getService(
    Ci.nsIAccessibilityService
  );
  await a11yInit;
  ok(Services.appinfo.accessibilityEnabled, "Accessibility is enabled");

  info("Remove all references to a11y service");
  [a11yShutdownObserver, a11yShutdown] = shutdownAccService();
  await a11yShutdownObserver;

  accService = null;
  forceGC();
  await a11yShutdown;
  ok(!Services.appinfo.accessibilityEnabled, "Accessibility is disabled");
});

add_task(async function testForceEnable() {
  ok(
    !Services.appinfo.accessibilityEnabled,
    "Accessibility is disabled by default"
  );

  info("Force enable a11y service via preference while it is off");
  let [a11yInitObserver, a11yInit] = initAccService();
  await a11yInitObserver;
  Services.prefs.setIntPref(PREF_ACCESSIBILITY_FORCE_DISABLED, -1);
  await a11yInit;
  ok(Services.appinfo.accessibilityEnabled, "Accessibility is enabled");

  let accService = Cc["@mozilla.org/accessibilityService;1"].getService(
    Ci.nsIAccessibilityService
  );
  ok(
    JSON.parse(accService.getConsumers()).PlatformAPI,
    "Accessibility was started for the PlatformAPI consumer"
  );

  info("Force disable a11y service via preference");
  let [a11yShutdownObserver, a11yShutdown] = shutdownAccService();
  await a11yShutdownObserver;
  Services.prefs.setIntPref(PREF_ACCESSIBILITY_FORCE_DISABLED, 1);
  await a11yShutdown;
  ok(!Services.appinfo.accessibilityEnabled, "Accessibility is disabled");

  info(
    "Force enable a11y service via preference again after a forced shutdown"
  );
  [a11yInitObserver, a11yInit] = initAccService();
  await a11yInitObserver;
  Services.prefs.setIntPref(PREF_ACCESSIBILITY_FORCE_DISABLED, -1);
  await a11yInit;
  ok(Services.appinfo.accessibilityEnabled, "Accessibility is enabled again");

  info(
    "Force disable a11y service via preference again to leave a11y off for later tests"
  );
  [a11yShutdownObserver, a11yShutdown] = shutdownAccService();
  await a11yShutdownObserver;
  Services.prefs.setIntPref(PREF_ACCESSIBILITY_FORCE_DISABLED, 1);
  await a11yShutdown;
  Services.prefs.clearUserPref(PREF_ACCESSIBILITY_FORCE_DISABLED);
  ok(!Services.appinfo.accessibilityEnabled, "Accessibility is disabled");
});
