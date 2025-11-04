/* Any copyright is dedicated to the Public Domain.
https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { IPPExceptionsManager } = ChromeUtils.importESModule(
  "resource:///modules/ipprotection/IPPExceptionsManager.sys.mjs"
);

const EXCLUSIONS_PREF = "browser.ipProtection.domainExclusions";

/**
 * Tests manager initialization when there are no exclusions.
 */
add_task(async function test_IPPExceptionsManager_init_with_no_exclusions() {
  const stringPref = "";

  Services.prefs.setStringPref(EXCLUSIONS_PREF, stringPref);

  IPPExceptionsManager.init();

  Assert.ok(IPPExceptionsManager.exclusions, "exclusions set found");
  Assert.ok(
    !IPPExceptionsManager.exclusions.size,
    "exclusions set should be empty"
  );

  let newStringPref = Services.prefs.getStringPref(EXCLUSIONS_PREF);

  Assert.ok(!newStringPref, "String pref should be empty");

  Services.prefs.clearUserPref(EXCLUSIONS_PREF);

  IPPExceptionsManager.uninit();
});

/**
 * Tests the manager initialization with registered exclusions.
 */
add_task(async function test_IPPExceptionsManager_init_with_exclusions() {
  const site1 = "https://www.example.com";
  const site2 = "https://www.example.org";
  const site3 = "https://www.another.example.ca";
  const stringPref = `${site1},${site2},${site3}`;

  Services.prefs.setStringPref(EXCLUSIONS_PREF, stringPref);

  IPPExceptionsManager.init();

  Assert.ok(IPPExceptionsManager.exclusions, "exclusions set found");
  Assert.equal(
    IPPExceptionsManager.exclusions.size,
    3,
    "exclusions set should have 3 domains"
  );

  Assert.ok(
    IPPExceptionsManager.exclusions.has(site1),
    `exclusions set should include ${site1}`
  );
  Assert.ok(
    IPPExceptionsManager.exclusions.has(site2),
    `exclusions set should include ${site2}`
  );
  Assert.ok(
    IPPExceptionsManager.exclusions.has(site3),
    `exclusions set should include ${site3}`
  );

  let newStringPref = Services.prefs.getStringPref(EXCLUSIONS_PREF);

  Assert.ok(newStringPref.includes(site1), `String pref includes ${site1}`);
  Assert.ok(newStringPref.includes(site2), `String pref includes ${site2}`);
  Assert.ok(newStringPref.includes(site3), `String pref includes ${site3}`);

  Services.prefs.clearUserPref(EXCLUSIONS_PREF);
  IPPExceptionsManager.uninit();
});

/**
 * Tests the manager initialization with an invalid pref string for exclusions.
 */
add_task(
  async function test_IPPExceptionsManager_init_with_invalid_exclusions() {
    const invalidStringPref = "noturl";

    Services.prefs.setStringPref(EXCLUSIONS_PREF, invalidStringPref);

    IPPExceptionsManager.init();

    Assert.ok(IPPExceptionsManager.exclusions, "exclusions set found");
    Assert.ok(
      !IPPExceptionsManager.exclusions.size,
      "exclusions set should have 0 valid domains"
    );

    Services.prefs.clearUserPref(EXCLUSIONS_PREF);
    IPPExceptionsManager.uninit();
  }
);

/**
 * Tests that we can add valid domains to the exclusions set.
 */
add_task(async function test_IPPExceptionsManager_add_exclusions() {
  const site1 = "https://www.example.com";

  Services.prefs.setStringPref(EXCLUSIONS_PREF, site1);

  IPPExceptionsManager.init();

  Assert.ok(IPPExceptionsManager.exclusions, "exclusions set found");

  const validSite = "https://www.another.example.com";
  const dupeSite = site1;
  const invalidSite = "noturl";

  IPPExceptionsManager.addException(validSite);
  IPPExceptionsManager.addException(dupeSite);
  IPPExceptionsManager.addException(invalidSite);
  IPPExceptionsManager.addException(null);
  IPPExceptionsManager.addException(undefined);

  Assert.equal(
    IPPExceptionsManager.exclusions.size,
    2,
    "exclusions set should only have 2 domains"
  );

  Assert.ok(
    IPPExceptionsManager.exclusions.has(site1),
    `exclusions set should include ${site1}`
  );
  Assert.ok(
    IPPExceptionsManager.exclusions.has(validSite),
    `exclusions set should include ${validSite}`
  );

  let newStringPref = Services.prefs.getStringPref(EXCLUSIONS_PREF);

  Assert.ok(newStringPref.includes(site1), `String pref includes ${site1}`);
  Assert.ok(
    newStringPref.includes(validSite),
    `String pref includes ${validSite}`
  );

  Services.prefs.clearUserPref(EXCLUSIONS_PREF);
  IPPExceptionsManager.uninit();
});

/**
 * Tests that we can remove domains from the exclusions set.
 */
add_task(async function test_IPPExceptionsManager_remove_exclusions() {
  const site1 = "https://www.example.com";

  Services.prefs.setStringPref(EXCLUSIONS_PREF, site1);

  IPPExceptionsManager.init();

  Assert.ok(IPPExceptionsManager.exclusions, "exclusions set found");

  const invalidSite = "urlDoesntExist";

  IPPExceptionsManager.removeException(site1);
  IPPExceptionsManager.removeException(invalidSite);

  Assert.ok(
    !IPPExceptionsManager.exclusions.size,
    "exclusions set should be empty"
  );

  let newStringPref = Services.prefs.getStringPref(EXCLUSIONS_PREF);

  Assert.ok(!newStringPref, "String pref should be empty");

  Services.prefs.clearUserPref(EXCLUSIONS_PREF);
  IPPExceptionsManager.uninit();
});
