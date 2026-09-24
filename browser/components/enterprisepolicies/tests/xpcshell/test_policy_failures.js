/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */
"use strict";

const { AddonTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/AddonTestUtils.sys.mjs"
);
const { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);
const { Policies } = ChromeUtils.importESModule(
  "resource:///modules/policies/Policies.sys.mjs"
);
const { PolicyFailures } = ChromeUtils.importESModule(
  "resource://gre/modules/PoliciesHelpers.sys.mjs"
);

AddonTestUtils.init(this);
AddonTestUtils.overrideCertDB();
AddonTestUtils.appInfo = getAppInfo();

add_setup(async function setup() {
  await AddonTestUtils.promiseStartupManager();
});

function getFailures(policyName) {
  return PolicyFailures.getAll()[policyName] ?? [];
}

add_task(async function test_preference_failure_is_contained() {
  // browser.startup.page is an integer preference, so setting it to a string
  // fails. The failure must not discard the preferences after it.
  await setupPolicyEngineWithJson({
    policies: {
      Preferences: {
        "browser.startup.page": "1",
        "browser.altClickSave": true,
      },
    },
  });

  checkLockedPref("browser.altClickSave", true);

  ok(
    "Preferences" in Services.policies.getActivePolicies(),
    "The policy is still reported as active"
  );

  let failures = getFailures("Preferences");
  equal(failures.length, 1, "One failure was recorded for the policy");
  ok(
    failures[0].includes("browser.startup.page"),
    `The failure names the preference that failed: ${failures[0]}`
  );
  ok(
    failures[0].includes("it takes a number, but the policy provided a string"),
    `The failure says what to correct: ${failures[0]}`
  );
});

add_task(async function test_non_integer_preference_is_reported() {
  await setupPolicyEngineWithJson({
    policies: {
      Preferences: {
        "browser.startup.page": 1.5,
      },
    },
  });

  let failures = getFailures("Preferences");
  equal(failures.length, 1, "One failure was recorded for the policy");
  ok(
    failures[0].includes("it takes a whole number"),
    `The failure says what to correct: ${failures[0]}`
  );
});

add_task(async function test_disallowed_preference_is_reported() {
  await setupPolicyEngineWithJson({
    policies: {
      Preferences: {
        "app.update.channel": "beta",
      },
    },
  });

  let failures = getFailures("Preferences");
  equal(failures.length, 1, "One failure was recorded for the policy");
  ok(
    failures[0].includes("app.update.channel"),
    `The failure names the preference that was not allowed: ${failures[0]}`
  );
});

add_task(async function test_callback_exception_is_reported() {
  let original = Policies.PrintingEnabled.onBeforeUIStartup;
  Policies.PrintingEnabled.onBeforeUIStartup = () => {
    throw new Error("kaboom");
  };

  try {
    await setupPolicyEngineWithJson({
      policies: {
        PrintingEnabled: false,
      },
    });

    let failures = getFailures("PrintingEnabled");
    equal(failures.length, 1, "One failure was recorded for the policy");
    ok(
      failures[0].includes("kaboom"),
      `The failure includes the exception: ${failures[0]}`
    );
  } finally {
    Policies.PrintingEnabled.onBeforeUIStartup = original;
  }
});

add_task(async function test_callback_rejection_is_reported() {
  let original = Policies.PrintingEnabled.onBeforeUIStartup;
  Policies.PrintingEnabled.onBeforeUIStartup = async () => {
    throw new Error("kaboom later");
  };

  try {
    await setupPolicyEngineWithJson({
      policies: {
        PrintingEnabled: false,
      },
    });

    await TestUtils.waitForCondition(
      () => getFailures("PrintingEnabled").length,
      "Waiting for the rejection to be reported"
    );
    ok(
      getFailures("PrintingEnabled")[0].includes("kaboom later"),
      "The failure of an async callback was recorded"
    );
  } finally {
    Policies.PrintingEnabled.onBeforeUIStartup = original;
  }
});

add_task(async function test_no_failures_when_a_policy_applies_cleanly() {
  await setupPolicyEngineWithJson({
    policies: {
      PrintingEnabled: false,
    },
  });

  deepEqual(
    PolicyFailures.getAll(),
    {},
    "No failure is reported for a policy that applied cleanly"
  );

  Services.prefs.unlockPref("print.enabled");
  Services.prefs.getDefaultBranch("").setBoolPref("print.enabled", true);
});

add_task(async function test_addon_install_failure_is_reported() {
  await setupPolicyEngineWithJson({
    policies: {
      ExtensionSettings: {
        "my-broken-extension@example.com": {
          installation_mode: "force_installed",
          install_url: "http://",
        },
      },
    },
  });

  await TestUtils.waitForCondition(
    () => getFailures("ExtensionSettings").length,
    "Waiting for the add-on installation failure to be reported"
  );

  ok(
    "ExtensionSettings" in Services.policies.getActivePolicies(),
    "The policy is still reported as active"
  );
  ok(
    getFailures("ExtensionSettings")[0].includes("http://"),
    `The failure names the install URL: ${getFailures("ExtensionSettings")[0]}`
  );
});

add_task(async function test_handler_failure_is_reported() {
  // Every Handlers failure is caught and logged rather than thrown, so the
  // engine's generic handler never sees it and the policy has to report for
  // itself.
  await setupPolicyEngineWithJson({
    policies: {
      Handlers: {
        schemes: {
          "": { action: "saveToDisk" },
          testscheme: {
            action: "useHelperApp",
            handlers: [{ name: "Name", uriTemplate: "not a url" }],
          },
        },
      },
    },
  });

  ok(
    "Handlers" in Services.policies.getActivePolicies(),
    "The policy is still reported as active"
  );

  // Three: the empty scheme, the unusable web handler, and the entry left
  // with no handler once that one was skipped.
  let failures = getFailures("Handlers");
  equal(failures.length, 3, `Every failure was recorded: ${failures}`);
  ok(
    failures.some(message => message.includes("Invalid scheme (empty)")),
    "The unusable scheme was reported"
  );
  ok(
    failures.some(message => message.includes("not a url")),
    "The unusable web handler was reported"
  );
  ok(
    failures.some(message => message.includes("useHelperApp requires")),
    "The entry left without a handler was reported"
  );
});
