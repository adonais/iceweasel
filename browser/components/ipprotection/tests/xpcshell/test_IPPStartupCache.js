/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { IPPStartupCacheSingleton } = ChromeUtils.importESModule(
  "resource:///modules/ipprotection/IPPStartupCache.sys.mjs"
);

const { IPProtectionStates } = ChromeUtils.importESModule(
  "resource:///modules/ipprotection/IPProtectionService.sys.mjs"
);

/**
 * Test the disabled cache
 */
add_task(async function test_IPPStartupCache_disabled() {
  // By default the cache is not active.
  Services.prefs.setBoolPref("browser.ipProtection.cacheDisabled", true);
  const cache = new IPPStartupCacheSingleton();
  cache.init();

  Assert.ok(
    cache.isStartupCompleted,
    "In XPCShell mode the cache is not active"
  );
});

/**
 * Test the enabled cache
 */
add_task(async function test_IPPStartupCache_enabled() {
  // By default the cache is not active.
  Services.prefs.setBoolPref("browser.ipProtection.cacheDisabled", false);

  // Default state is UNINITIALIZED
  {
    const cache = new IPPStartupCacheSingleton();
    cache.init();

    Assert.ok(
      !cache.isStartupCompleted,
      "In XPCShell mode the cache is active"
    );
    Assert.equal(
      cache.state,
      IPProtectionStates.UNINITIALIZED,
      "The state is unitialized"
    );
  }

  // Fetch the cached state
  {
    Services.prefs.setCharPref(
      "browser.ipProtection.stateCache",
      IPProtectionStates.READY
    );

    const cache = new IPPStartupCacheSingleton();
    cache.init();

    Assert.ok(
      !cache.isStartupCompleted,
      "In XPCShell mode the cache is active"
    );
    Assert.equal(cache.state, IPProtectionStates.READY, "The state is READY");
  }

  // Invalid cache means UNINITIALIZED
  {
    Services.prefs.setCharPref(
      "browser.ipProtection.stateCache",
      "Hello World!"
    );

    const cache = new IPPStartupCacheSingleton();
    cache.init();

    Assert.ok(
      !cache.isStartupCompleted,
      "In XPCShell mode the cache is active"
    );
    Assert.equal(
      cache.state,
      IPProtectionStates.UNINITIALIZED,
      "The state is unitialized"
    );
  }

  // ACTIVE to READY
  {
    Services.prefs.setCharPref(
      "browser.ipProtection.stateCache",
      IPProtectionStates.ACTIVE
    );

    const cache = new IPPStartupCacheSingleton();
    cache.init();

    Assert.ok(
      !cache.isStartupCompleted,
      "In XPCShell mode the cache is active"
    );
    Assert.equal(cache.state, IPProtectionStates.READY, "The state is READY");
  }
});

/**
 * Cache the entitlement
 */
add_task(async function test_IPPStartupCache_enabled() {
  // By default the cache is not active.
  Services.prefs.setBoolPref("browser.ipProtection.cacheDisabled", false);

  // Default entitlement is null
  {
    const cache = new IPPStartupCacheSingleton();
    cache.init();

    Assert.ok(
      !cache.isStartupCompleted,
      "In XPCShell mode the cache is active"
    );
    Assert.equal(cache.entitlement, null, "Null entitlement");
  }

  // A JSON object for entitlement
  {
    Services.prefs.setCharPref(
      "browser.ipProtection.entitlementCache",
      '{"a": 42}'
    );

    const cache = new IPPStartupCacheSingleton();
    cache.init();

    Assert.ok(
      !cache.isStartupCompleted,
      "In XPCShell mode the cache is active"
    );
    Assert.deepEqual(
      cache.entitlement,
      { a: 42 },
      "A valid entitlement object"
    );
  }

  // Invalid JSON
  {
    Services.prefs.setCharPref(
      "browser.ipProtection.entitlementCache",
      '{"a": 42}}}}'
    );

    const cache = new IPPStartupCacheSingleton();
    cache.init();

    Assert.ok(
      !cache.isStartupCompleted,
      "In XPCShell mode the cache is active"
    );
    Assert.equal(cache.entitlement, null, "Null entitlement");
  }

  // Setter
  {
    const cache = new IPPStartupCacheSingleton();
    cache.init();

    Assert.ok(
      !cache.isStartupCompleted,
      "In XPCShell mode the cache is active"
    );
    Assert.equal(cache.entitlement, null, "Null entitlement");

    cache.storeEntitlement(42);
    Assert.equal(
      Services.prefs.getCharPref("browser.ipProtection.entitlementCache", ""),
      "42",
      "The cache is correctly stored (number)"
    );

    cache.storeEntitlement(null);
    Assert.equal(
      Services.prefs.getCharPref("browser.ipProtection.entitlementCache", ""),
      "null",
      "The cache is correctly stored (null)"
    );

    cache.storeEntitlement({ a: 42 });
    Assert.equal(
      Services.prefs.getCharPref("browser.ipProtection.entitlementCache", ""),
      '{"a":42}',
      "The cache is correctly stored (obj)"
    );
  }
});
