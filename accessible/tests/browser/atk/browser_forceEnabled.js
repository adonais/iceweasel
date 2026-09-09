/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const PREF_ACCESSIBILITY_FORCE_DISABLED = "accessibility.force_disabled";

const { CommonUtils } = ChromeUtils.importESModule(
  "chrome://mochitests/content/browser/accessible/tests/browser/Common.sys.mjs"
);

function initAccService() {
  return [
    CommonUtils.addAccServiceInitializedObserver(),
    CommonUtils.observeAccServiceInitialized(),
  ];
}

function shutdownAccService() {
  return [
    CommonUtils.addAccServiceShutdownObserver(),
    CommonUtils.observeAccServiceShutdown(),
  ];
}

add_setup(async function () {
  // Load an in-process chrome document, so that when we query via the
  // platform API below, the embedded document is available synchronously,
  // rather than needing to wait for a remote (content process) document to
  // be embedded.
  BrowserTestUtils.startLoadingURIString(
    gBrowser.selectedBrowser,
    "about:mozilla"
  );
  await BrowserTestUtils.browserLoaded(gBrowser.selectedBrowser);
});

add_task(async function testAutoStartsOnPlatformQuery() {
  // This directory force enables accessibility by default, and common.js
  // eagerly instantiated the service via XPCOM as soon as this test file's
  // head.js loaded. Force disable to guarantee a real shutdown regardless of
  // that or any other outstanding consumer, then go back to auto (0), so we
  // have a clean starting point to test that case.
  info("Shutting down accessibility");
  let [a11yShutdownObserver, a11yShutdown] = shutdownAccService();
  await a11yShutdownObserver;
  await SpecialPowers.pushPrefEnv({
    set: [[PREF_ACCESSIBILITY_FORCE_DISABLED, 1]],
  });
  await a11yShutdown;
  await SpecialPowers.pushPrefEnv({
    set: [[PREF_ACCESSIBILITY_FORCE_DISABLED, 0]],
  });
  ok(
    !Services.appinfo.accessibilityEnabled,
    "Accessibility is not running with force_disabled=0 and no platform query"
  );

  // Unlike other platforms, there's nothing here that Gecko responds to
  // directly by being queried: AT-SPI has no equivalent of Windows'
  // WM_GETOBJECT or macOS' AX attribute queries. Instead, Gecko watches the
  // "IsEnabled" property on the session bus and starts accessibility when
  // that becomes true, which is how a real assistive technology announces
  // itself on startup. Simulate that announcement here. This is a
  // session-wide setting rather than something scoped to Firefox, so restore
  // whatever it was before once we're done with it.
  function setAtSpiIsEnabled(enabled) {
    return runPython(`
      atSpiStatusProxy.call_sync(
        "org.freedesktop.DBus.Properties.Set",
        GLib.Variant(
          "(ssv)",
          ("org.a11y.Status", "IsEnabled", GLib.Variant("b", ${enabled ? "True" : "False"})),
        ),
        Gio.DBusCallFlags.NONE, -1, None,
      )
    `);
  }

  info("Setting IsEnabled DBUS property to true");
  let [a11yInitObserver, a11yInit] = initAccService();
  await a11yInitObserver;
  const wasAtSpiEnabled = await runPython(`
    global atSpiStatusProxy, Gio, GLib
    from gi.repository import Gio, GLib
    atSpiStatusProxy = Gio.DBusProxy.new_for_bus_sync(
      Gio.BusType.SESSION, Gio.DBusProxyFlags.NONE, None,
      "org.a11y.Bus", "/org/a11y/bus", "org.a11y.Status", None,
    )
    previous = atSpiStatusProxy.get_cached_property("IsEnabled")
    previous = previous.unpack() if previous is not None else False
    return previous
  `);
  // IsEnabled might already be true, e.g. left over from a previous test run
  // that didn't get a chance to restore it. Setting it to true in that case
  // wouldn't be a real change, so Gecko's property-changed listener wouldn't
  // fire. Force a genuine false-to-true transition instead.
  await setAtSpiIsEnabled(false);
  await setAtSpiIsEnabled(true);
  registerCleanupFunction(() => setAtSpiIsEnabled(wasAtSpiEnabled));
  await a11yInit;
  ok(
    Services.appinfo.accessibilityEnabled,
    "Accessibility started when an assistive technology announced itself"
  );

  const role = await runPython(`
    global doc
    doc = getDoc()
    return doc.getRole()
  `);
  is(typeof role, "number", "Got a role for the document via AT-SPI");
});

add_task(async function testForceDisabledBlocksPlatformQuery() {
  let [a11yShutdownObserver, a11yShutdown] = shutdownAccService();
  await a11yShutdownObserver;
  await SpecialPowers.pushPrefEnv({
    set: [[PREF_ACCESSIBILITY_FORCE_DISABLED, 1]],
  });
  await a11yShutdown;
  ok(
    !Services.appinfo.accessibilityEnabled,
    "Accessibility is disabled by force_disabled=1"
  );

  info("Executing platform API query");
  let failed = false;
  try {
    await runPython(`getDoc()`);
  } catch (e) {
    failed = true;
  }
  ok(failed, "The platform API can't reach the document while force disabled");
  ok(
    !Services.appinfo.accessibilityEnabled,
    "Accessibility is still disabled after the failed platform query"
  );
});

add_task(async function testForceEnabledStartsAtRuntime() {
  let [a11yInitObserver, a11yInit] = initAccService();
  await a11yInitObserver;
  await SpecialPowers.pushPrefEnv({
    set: [[PREF_ACCESSIBILITY_FORCE_DISABLED, -1]],
  });
  await a11yInit;
  ok(
    Services.appinfo.accessibilityEnabled,
    "Accessibility was force enabled at runtime"
  );

  info("Executing platform API query");
  const role = await runPython(`
    global doc
    doc = getDoc()
    return doc.getRole()
  `);
  Assert.strictEqual(
    typeof role,
    "number",
    "Could still query the document via AT-SPI"
  );
});
