/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const HISTORY = "privacy.clearOnShutdown_v2.browsingHistoryAndDownloads";
const COOKIES = "privacy.clearOnShutdown_v2.cookiesAndStorage";
const CACHE = "privacy.clearOnShutdown_v2.cache";
const FORMDATA = "privacy.clearOnShutdown_v2.formdata";
const SITE_SETTINGS = "privacy.clearOnShutdown_v2.siteSettings";
const ENABLED = "privacy.sanitize.sanitizeOnShutdown";

function checkNotManaged(pref) {
  equal(
    Services.prefs.prefIsLocked(pref),
    false,
    `${pref} is left to the user by a policy that doesn't name it`
  );
}

// SITE_SETTINGS goes unnamed until the last case, so until then it stands in
// for an unmanaged category.
add_task(async function test_named_categories_are_enforced() {
  await setupPolicyEngineWithJson({
    policies: {
      ClearOnShutdown: {
        Cache: true,
        FormData: false,
      },
    },
  });

  checkLockedPref(ENABLED, true);
  checkLockedPref(CACHE, true);
  checkLockedPref(FORMDATA, false);
  checkNotManaged(HISTORY);
  checkNotManaged(COOKIES);
  checkNotManaged(SITE_SETTINGS);
});

add_task(async function test_exceptions() {
  await setupPolicyEngineWithJson({
    policies: {
      ClearOnShutdown: {
        CookiesAndStorage: true,
        Exceptions: ["https://persist.example.com"],
      },
    },
  });

  equal(
    PermissionTestUtils.testPermission(
      Services.io.newURI("https://persist.example.com"),
      "persist-data-on-shutdown"
    ),
    Ci.nsIPermissionManager.ALLOW_ACTION,
    "Exceptions sets persist-data-on-shutdown"
  );
});

add_task(async function test_takes_precedence_over_sanitize_on_shutdown() {
  await setupPolicyEngineWithJson({
    policies: {
      ClearOnShutdown: {
        Cache: false,
      },
      SanitizeOnShutdown: true,
    },
  });

  checkLockedPref(CACHE, false);
  checkNotManaged(SITE_SETTINGS);
});

add_task(async function test_false_enforces_no_clearing() {
  await setupPolicyEngineWithJson({
    policies: { ClearOnShutdown: false },
  });

  checkLockedPref(ENABLED, false);
  for (const pref of [HISTORY, COOKIES, CACHE, FORMDATA, SITE_SETTINGS]) {
    checkLockedPref(pref, false);
  }
});
