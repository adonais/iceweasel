/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const MIGRATION_VERSION = 179;

const { ProfileDataUpgrader } = ChromeUtils.importESModule(
  "moz-src:///browser/components/ProfileDataUpgrader.sys.mjs"
);
const { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);

const cps2 = Cc["@mozilla.org/content-pref/service;1"].getService(
  Ci.nsIContentPrefService2
);

const DOMAINS = ["example.com", "example.org"];

// The removed CookieBannerDomainPrefService stored both its normal and its
// private browsing exceptions with a null load context, so both are rows in the
// normal browsing store and must be set with a non-private load context here.
const COOKIE_BANNER_NAMES = ["cookiebanner", "cookiebannerprivate"];

// The service stored the mode as a uint8.
const MODE = 2;

const UNRELATED_CPS_NAME = "browser.download.lastDir";

const COOKIE_BANNER_PREFS = [
  ["cookiebanners.service.mode", 2],
  ["cookiebanners.service.mode.privateBrowsing", 2],
  ["cookiebanners.service.detectOnly", true],
  ["cookiebanners.listService.logLevel", "Debug"],
  ["browser.promo.cookiebanners.enabled", true],
];

// One pref just outside each cleared branch, to catch a branch widened past its
// trailing dot. Neither has a default value, so setting them always leaves a
// user value behind for us to assert on.
const UNRELATED_PREFS = [
  "cookiebannersfoo.enabled",
  "browser.promo.cookiebannersfoo.enabled",
];

function setPref(name, value) {
  if (typeof value == "boolean") {
    Services.prefs.setBoolPref(name, value);
  } else if (typeof value == "number") {
    Services.prefs.setIntPref(name, value);
  } else {
    Services.prefs.setStringPref(name, value);
  }
}

function setContentPref(domain, name, value) {
  return new Promise((resolve, reject) => {
    cps2.set(domain, name, value, Cu.createLoadContext(), {
      handleCompletion(reason) {
        if (reason === cps2.COMPLETE_ERROR) {
          reject(new Error(`Failed to set content pref ${name}`));
        } else {
          resolve();
        }
      },
    });
  });
}

function getContentPref(domain, name) {
  return new Promise((resolve, reject) => {
    let result;
    cps2.getByDomainAndName(domain, name, Cu.createLoadContext(), {
      handleResult({ value }) {
        result = value;
      },
      handleCompletion(reason) {
        if (reason === cps2.COMPLETE_ERROR) {
          reject(new Error(`Failed to get content pref ${name}`));
        } else {
          resolve(result);
        }
      },
    });
  });
}

function removeContentPrefsByName(name) {
  return new Promise((resolve, reject) => {
    cps2.removeByName(name, null, {
      handleCompletion(reason) {
        if (reason === cps2.COMPLETE_ERROR) {
          reject(new Error(`Failed to remove content prefs ${name}`));
        } else {
          resolve();
        }
      },
    });
  });
}

async function setUpProfileData() {
  for (let domain of DOMAINS) {
    for (let name of COOKIE_BANNER_NAMES) {
      await setContentPref(domain, name, MODE);
    }
  }
  await setContentPref(DOMAINS[0], UNRELATED_CPS_NAME, "/tmp");

  for (let [name, value] of COOKIE_BANNER_PREFS) {
    setPref(name, value);
  }
  for (let name of UNRELATED_PREFS) {
    Services.prefs.setBoolPref(name, true);
  }

  for (let domain of DOMAINS) {
    for (let name of COOKIE_BANNER_NAMES) {
      Assert.equal(
        await getContentPref(domain, name),
        MODE,
        `${name} content pref set for ${domain}`
      );
    }
  }
}

async function assertUnrelatedDataSurvives() {
  Assert.equal(
    await getContentPref(DOMAINS[0], UNRELATED_CPS_NAME),
    "/tmp",
    "Content prefs with an unrelated setting name should survive"
  );
  for (let name of UNRELATED_PREFS) {
    Assert.ok(
      Services.prefs.prefHasUserValue(name),
      `${name} should survive, it is outside the cleared branches`
    );
  }
}

add_setup(() => {
  registerCleanupFunction(async () => {
    Services.prefs.clearUserPref("browser.migration.version");
    for (let [name] of COOKIE_BANNER_PREFS) {
      Services.prefs.clearUserPref(name);
    }
    for (let name of UNRELATED_PREFS) {
      Services.prefs.clearUserPref(name);
    }
    for (let name of [...COOKIE_BANNER_NAMES, UNRELATED_CPS_NAME]) {
      await removeContentPrefsByName(name);
    }
  });
});

add_task(async function test_removeCookieBannerData() {
  await setUpProfileData();

  ProfileDataUpgrader.upgrade(MIGRATION_VERSION - 1, MIGRATION_VERSION);

  // The migration does not wait for removeByName to complete, so the rows may
  // still be present when upgrade() returns.
  await TestUtils.waitForCondition(async () => {
    for (let domain of DOMAINS) {
      for (let name of COOKIE_BANNER_NAMES) {
        if ((await getContentPref(domain, name)) !== undefined) {
          return false;
        }
      }
    }
    return true;
  }, "Cookie banner content prefs should be removed for all domains");

  for (let [name] of COOKIE_BANNER_PREFS) {
    Assert.ok(
      !Services.prefs.prefHasUserValue(name),
      `${name} should have been cleared`
    );
  }

  await assertUnrelatedDataSurvives();
});

// The migration itself is idempotent, but this checks that its condition uses
// the right version, i.e. that it does not also run for profiles which have
// already been migrated. The pref assertions are the load-bearing ones: the
// content pref reads race the migration's async removal, so on a regression
// they can pass even though the rows are on their way out.
add_task(async function test_alreadyMigrated() {
  await setUpProfileData();

  ProfileDataUpgrader.upgrade(MIGRATION_VERSION, MIGRATION_VERSION + 1);

  for (let domain of DOMAINS) {
    for (let name of COOKIE_BANNER_NAMES) {
      Assert.equal(
        await getContentPref(domain, name),
        MODE,
        `${name} content pref for ${domain} should not have been removed`
      );
    }
  }

  for (let [name] of COOKIE_BANNER_PREFS) {
    Assert.ok(
      Services.prefs.prefHasUserValue(name),
      `${name} should not have been cleared`
    );
  }
});
