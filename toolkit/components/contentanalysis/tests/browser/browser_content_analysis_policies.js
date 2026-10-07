/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Check that CA is active if and only if:
// 1. browser.contentanalysis.enabled is true and
// 2. Either browser.contentanalysis.enabled was set by an enteprise
//    policy or the "-allow-content-analysis" command line arg was present
// We can't really test command line arguments so we instead use a test-only
// method to set the value the command-line is supposed to update.

"use strict";

const { EnterprisePolicyTesting, PoliciesPrefTracker } =
  ChromeUtils.importESModule(
    "resource://testing-common/EnterprisePolicyTesting.sys.mjs"
  );

const kIndividualPrefs = new Map([
  ["Enabled", "enabled"],
  ["PipeName", "pipe_path_name"],
  ["Timeout", "agent_timeout"],
  ["AllowUrl", "allow_url_regex_list"],
  ["DenyUrl", "deny_url_regex_list"],
  ["AgentName", "agent_name"],
  ["ClientSignature", "client_signature"],
  ["PerUser", "is_per_user"],
  ["MaxConnectionsCount", "max_connections"],
  ["ShowBlocked", "show_blocked_result"],
  ["DefaultResult", "default_result"],
  ["TimeoutResult", "timeout_result"],
  ["BypassForSameTab", "bypass_for_same_tab_operations"],
]);
function getIndividualPrefName(name) {
  is(
    kIndividualPrefs.has(name),
    true,
    `"${name}" passed to getIndividualPrefName() is valid`
  );
  return `browser.contentanalysis.${kIndividualPrefs.get(name)}`;
}
const kInterceptionPoints = [
  "clipboard",
  "clipboard_copy",
  "download",
  "drag_and_drop",
  "file_upload",
  "print",
];
// Everything is on by default except download and clipboard_copy.
const kInterceptionPointsOffByDefault = ["clipboard_copy", "download"];
const kInterceptionPointsOnByDefault = kInterceptionPoints.filter(
  point => !kInterceptionPointsOffByDefault.includes(point)
);
const kInterceptionPointsPlainTextOnly = [
  "clipboard",
  "clipboard_copy",
  "drag_and_drop",
];

const ca = Cc["@mozilla.org/contentanalysis;1"].getService(
  Ci.nsIContentAnalysis
);

add_task(async function test_ca_active() {
  PoliciesPrefTracker.start();
  ok(!ca.isActive, "CA is inactive when pref and cmd line arg are missing");

  // Set the pref without enterprise policy.  CA should not be active.
  Services.prefs.setBoolPref(getIndividualPrefName("Enabled"), true);
  ok(
    !ca.isActive,
    "CA is inactive when pref is set but cmd line arg is missing"
  );

  // Set the pref without enterprise policy but also set command line arg
  // property.  CA should be active.
  ca.testOnlySetCACmdLineArg(true);
  ok(ca.isActive, "CA is active when pref is set and cmd line arg is present");

  // Undo test-only value before later tests.
  ca.testOnlySetCACmdLineArg(false);
  ok(!ca.isActive, "properly unset cmd line arg value");

  // Disabled the pref with enterprise policy.  CA should not be active.
  await EnterprisePolicyTesting.setupPolicyEngineWithJson({
    policies: {
      ContentAnalysis: { Enabled: false },
    },
  });
  ok(!ca.isActive, "CA is inactive when disabled by enterprise policy pref");

  // Enabled the pref with enterprise policy.  CA should be active.
  await EnterprisePolicyTesting.setupPolicyEngineWithJson({
    policies: {
      ContentAnalysis: { Enabled: true },
    },
  });
  ok(ca.isActive, "CA is active when enabled by enterprise policy pref");
  for (let interceptionPoint of kInterceptionPoints) {
    const shouldBeEnabledByDefault =
      !kInterceptionPointsOffByDefault.includes(interceptionPoint);
    is(
      Services.prefs.getBoolPref(
        `browser.contentanalysis.interception_point.${interceptionPoint}.enabled`
      ),
      shouldBeEnabledByDefault,
      `${interceptionPoint} ${shouldBeEnabledByDefault ? "enabled" : "disabled"} by default`
    );
  }
  for (let interceptionPoint of kInterceptionPointsPlainTextOnly) {
    is(
      Services.prefs.getBoolPref(
        `browser.contentanalysis.interception_point.${interceptionPoint}.plain_text_only`
      ),
      true,
      `${interceptionPoint} plain_text_only on by default`
    );
  }

  Services.prefs.setBoolPref(getIndividualPrefName("Enabled"), false);
  PoliciesPrefTracker.stop();
});

add_task(async function test_ca_enterprise_config_with_default_prefs() {
  PoliciesPrefTracker.start();
  await EnterprisePolicyTesting.setupPolicyEngineWithJson({
    policies: {
      ContentAnalysis: {
        Enabled: true,
      },
    },
  });

  for (let individualPref of kIndividualPrefs.values()) {
    is(
      Services.prefs.prefIsLocked("browser.contentanalysis." + individualPref),
      true,
      `${individualPref} should be locked`
    );
  }

  for (let interceptionPoint of kInterceptionPoints) {
    is(
      Services.prefs.prefIsLocked(
        `browser.contentanalysis.interception_point.${interceptionPoint}.enabled`
      ),
      true,
      `${interceptionPoint} enabled should be locked`
    );
  }
  for (let interceptionPointPlainText of kInterceptionPointsPlainTextOnly) {
    is(
      Services.prefs.prefIsLocked(
        `browser.contentanalysis.interception_point.${interceptionPointPlainText}.plain_text_only`
      ),
      true,
      `${interceptionPointPlainText} plain_text_only should be locked`
    );
  }
  PoliciesPrefTracker.stop();
});

add_task(
  async function test_ca_enterprise_config_with_default_prefs_telemetry() {
    PoliciesPrefTracker.start();
    Services.fog.testResetFOG();
    await EnterprisePolicyTesting.setupPolicyEngineWithJson({
      policies: {
        ContentAnalysis: {
          Enabled: true,
        },
      },
    });
    // Trigger the content analysis service to ensure telemetry is recorded.
    let contentAnalysisService = Cc[
      "@mozilla.org/contentanalysis;1"
    ].getService(Ci.nsIContentAnalysis);
    is(
      contentAnalysisService.isActive,
      true,
      "Content Analysis service is active"
    );
    contentAnalysisService.forceRecreateClientForTest();

    is(
      Glean.contentAnalysis.agentName.testGetValue(),
      "A DLP agent",
      "agentName default"
    );
    Assert.deepEqual(
      Glean.contentAnalysis.interceptionPointsTurnedOff.testGetValue(),
      kInterceptionPointsOffByDefault.map(
        point => `browser.contentanalysis.interception_point.${point}.enabled`
      ),
      "interceptionPointsTurnedOff default"
    );
    ok(
      Glean.contentAnalysis.showBlockedResult.testGetValue(),
      "showBlockedResult default"
    );
    is(
      Glean.contentAnalysis.defaultResult.testGetValue(),
      0,
      "defaultResult default"
    );
    is(
      Glean.contentAnalysis.timeoutResult.testGetValue(),
      0,
      "timeoutResult default"
    );
    is(
      Glean.contentAnalysis.clientSignature.testGetValue(),
      null,
      "clientSignature default"
    );
    ok(
      !Glean.contentAnalysis.bypassForSameTabOperations.testGetValue(),
      "bypassForSameTabOperations default"
    );
    ok(
      !Glean.contentAnalysis.allowUrlRegexListSet.testGetValue(),
      "allowUrlRegexListSet default"
    );
    ok(
      !Glean.contentAnalysis.denyUrlRegexListSet.testGetValue(),
      "denyUrlRegexListSet default"
    );

    PoliciesPrefTracker.stop();
  }
);

add_task(async function test_ca_enterprise_config() {
  PoliciesPrefTracker.start();
  const string1 = "this is a string";
  const string2 = "this is another string";
  const string3 = "an agent name";
  const string4 = "a client signature";

  await EnterprisePolicyTesting.setupPolicyEngineWithJson({
    policies: {
      ContentAnalysis: {
        PipePathName: "abc",
        AgentTimeout: 99,
        AllowUrlRegexList: string1,
        DenyUrlRegexList: string2,
        AgentName: string3,
        ClientSignature: string4,
        IsPerUser: true,
        MaxConnectionsCount: 3,
        ShowBlockedResult: false,
        DefaultResult: 1,
        TimeoutResult: 2,
        BypassForSameTabOperations: true,
        InterceptionPoints: {
          Clipboard: {
            Enabled: false,
            PlainTextOnly: false,
          },
          ClipboardCopy: {
            Enabled: true,
            PlainTextOnly: false,
          },
          Download: {
            Enabled: true,
          },
          DragAndDrop: {
            Enabled: false,
            PlainTextOnly: false,
          },
          FileUpload: {
            Enabled: false,
          },
          Print: {
            Enabled: false,
          },
        },
      },
    },
  });

  is(
    Services.prefs.getStringPref(getIndividualPrefName("PipeName")),
    "abc",
    "pipe name match"
  );
  is(
    Services.prefs.getIntPref(getIndividualPrefName("Timeout")),
    99,
    "timeout match"
  );
  is(
    Services.prefs.getStringPref(getIndividualPrefName("AllowUrl")),
    string1,
    "allow urls match"
  );
  is(
    Services.prefs.getStringPref(getIndividualPrefName("DenyUrl")),
    string2,
    "deny urls match"
  );
  is(
    Services.prefs.getStringPref(getIndividualPrefName("AgentName")),
    string3,
    "agent names match"
  );
  is(
    Services.prefs.getStringPref(getIndividualPrefName("ClientSignature")),
    string4,
    "client signatures match"
  );
  is(
    Services.prefs.getIntPref(getIndividualPrefName("MaxConnectionsCount")),
    3,
    "connections count match"
  );
  is(
    Services.prefs.getBoolPref(getIndividualPrefName("PerUser")),
    true,
    "per user match"
  );
  is(
    Services.prefs.getBoolPref(getIndividualPrefName("ShowBlocked")),
    false,
    "show blocked match"
  );
  is(
    Services.prefs.getIntPref(getIndividualPrefName("DefaultResult")),
    1,
    "default result match"
  );
  is(
    Services.prefs.getIntPref(getIndividualPrefName("TimeoutResult")),
    2,
    "timeout result match"
  );
  is(
    Services.prefs.getBoolPref(getIndividualPrefName("BypassForSameTab")),
    true,
    "bypass for same tab operations match"
  );
  for (let interceptionPoint of kInterceptionPoints) {
    is(
      Services.prefs.getBoolPref(
        `browser.contentanalysis.interception_point.${interceptionPoint}.enabled`
      ),
      interceptionPoint === "download" ||
        interceptionPoint === "clipboard_copy",
      `${interceptionPoint} interception point match`
    );
  }
  for (let interceptionPoint of kInterceptionPointsPlainTextOnly) {
    is(
      Services.prefs.getBoolPref(
        `browser.contentanalysis.interception_point.${interceptionPoint}.plain_text_only`
      ),
      false,
      `${interceptionPoint} interception point plain_text_only match`
    );
  }

  PoliciesPrefTracker.stop();
});

// An interception point omitted from InterceptionPoints falls back to a
// per-entry default. That default is `true` for the interception points that
// predate per-entry defaults, but must be `false` for ones that are off by
// default, so policy files written before they existed don't silently opt in.
const kInterceptionPointsOmittedFallsBackToOff = ["clipboard_copy"];

add_task(async function test_ca_enterprise_config_omitted_interception_point() {
  PoliciesPrefTracker.start();

  // This is a little awkward, because setting a policy with just empty objects
  // in it is considered to be empty, and nothing will take effect (see
  // PoliciesProvider.hasPolicies()). So add a non-empty key (here "PipePathName")
  // just so that doesn't happen for testing purposes.
  await EnterprisePolicyTesting.setupPolicyEngineWithJson({
    policies: {
      ContentAnalysis: {
        InterceptionPoints: {},
        PipePathName: "abc",
      },
    },
  });

  for (let interceptionPoint of kInterceptionPoints) {
    is(
      Services.prefs.getBoolPref(
        `browser.contentanalysis.interception_point.${interceptionPoint}.enabled`
      ),
      !kInterceptionPointsOmittedFallsBackToOff.includes(interceptionPoint),
      `${interceptionPoint} enabled falls back to its default`
    );
  }
  for (let interceptionPoint of kInterceptionPointsPlainTextOnly) {
    is(
      Services.prefs.getBoolPref(
        `browser.contentanalysis.interception_point.${interceptionPoint}.plain_text_only`
      ),
      true,
      `${interceptionPoint} plain_text_only falls back to its default`
    );
  }

  PoliciesPrefTracker.stop();
});

add_task(
  async function test_ca_enterprise_config_only_download_interception_point() {
    PoliciesPrefTracker.start();

    await EnterprisePolicyTesting.setupPolicyEngineWithJson({
      policies: {
        ContentAnalysis: {
          InterceptionPoints: {
            Download: {
              Enabled: false,
            },
          },
        },
      },
    });

    for (let interceptionPoint of kInterceptionPoints) {
      // Don't test Download, because we explicitly set it
      if (interceptionPoint !== "download") {
        is(
          Services.prefs.getBoolPref(
            `browser.contentanalysis.interception_point.${interceptionPoint}.enabled`
          ),
          !kInterceptionPointsOmittedFallsBackToOff.includes(interceptionPoint),
          `${interceptionPoint} enabled falls back to its default`
        );
      }
    }
    // Note that we're glossing over a bug here; if InterceptionPoints is not specified, then
    // downloads default to not enabled (as intended), but if InterceptionPoints is specified
    // but "Download" is not part of that key, then downloads get set to enabled. This is wrong
    // but we don't want to change any defaults now.
    is(
      Services.prefs.getBoolPref(
        `browser.contentanalysis.interception_point.download.enabled`
      ),
      false,
      `download explicitly set to false`
    );

    for (let interceptionPoint of kInterceptionPointsPlainTextOnly) {
      is(
        Services.prefs.getBoolPref(
          `browser.contentanalysis.interception_point.${interceptionPoint}.plain_text_only`
        ),
        true,
        `${interceptionPoint} plain_text_only falls back to its default`
      );
    }

    PoliciesPrefTracker.stop();
  }
);

add_task(async function test_ca_enterprise_config_telemetry() {
  PoliciesPrefTracker.start();
  const string1 = "this is a string";
  const string2 = "this is another string";
  const string3 = "an agent name";
  const string4 = "a client signature";

  Services.fog.testResetFOG();

  await EnterprisePolicyTesting.setupPolicyEngineWithJson({
    policies: {
      ContentAnalysis: {
        Enabled: true,
        PipePathName: "abc",
        AgentTimeout: 99,
        AllowUrlRegexList: string1,
        DenyUrlRegexList: string2,
        AgentName: string3,
        ClientSignature: string4,
        IsPerUser: true,
        MaxConnectionsCount: 3,
        ShowBlockedResult: false,
        DefaultResult: 1,
        TimeoutResult: 2,
        BypassForSameTabOperations: true,
        InterceptionPoints: {
          Clipboard: {
            Enabled: false,
            PlainTextOnly: false,
          },
          ClipboardCopy: {
            Enabled: true,
            PlainTextOnly: false,
          },
          Download: {
            Enabled: true,
          },
          DragAndDrop: {
            Enabled: false,
            PlainTextOnly: false,
          },
          FileUpload: {
            Enabled: false,
          },
          Print: {
            Enabled: false,
          },
        },
      },
    },
  });

  // Trigger the content analysis service to ensure telemetry is recorded.
  let contentAnalysisService = Cc["@mozilla.org/contentanalysis;1"].getService(
    Ci.nsIContentAnalysis
  );
  contentAnalysisService.forceRecreateClientForTest();
  is(
    contentAnalysisService.isActive,
    true,
    "Content Analysis service is active"
  );

  is(Glean.contentAnalysis.agentName.testGetValue(), string3, "agentName");
  const interceptionPointsTurnedOff =
    Glean.contentAnalysis.interceptionPointsTurnedOff.testGetValue();
  is(
    interceptionPointsTurnedOff.length,
    4,
    "interceptionPointsTurnedOff length"
  );
  for (let i = 0; i < interceptionPointsTurnedOff.length; i++) {
    is(
      interceptionPointsTurnedOff[i],
      `browser.contentanalysis.interception_point.${kInterceptionPointsOnByDefault[i]}.enabled`,
      `interceptionPointsTurnedOff ${kInterceptionPointsOnByDefault[i]}`
    );
  }
  ok(
    !Glean.contentAnalysis.showBlockedResult.testGetValue(),
    "showBlockedResult"
  );
  is(Glean.contentAnalysis.defaultResult.testGetValue(), 1, "defaultResult");
  is(Glean.contentAnalysis.timeoutResult.testGetValue(), 2, "timeoutResult");
  is(
    Glean.contentAnalysis.clientSignature.testGetValue(),
    string4,
    "clientSignature"
  );
  ok(
    Glean.contentAnalysis.bypassForSameTabOperations.testGetValue(),
    "bypassForSameTabOperations"
  );
  ok(
    Glean.contentAnalysis.allowUrlRegexListSet.testGetValue(),
    "allowUrlRegexListSet"
  );
  ok(
    Glean.contentAnalysis.denyUrlRegexListSet.testGetValue(),
    "denyUrlRegexListSet"
  );

  PoliciesPrefTracker.stop();
});

add_task(async function test_cleanup() {
  ca.testOnlySetCACmdLineArg(false);
  await EnterprisePolicyTesting.setupPolicyEngineWithJson({
    policies: {},
  });
  // These may have gotten set when ContentAnalysis was enabled through
  // the policy and do not get cleared if there is no ContentAnalysis
  // element - reset them manually here.
  ca.isSetByEnterprisePolicy = false;
  Services.prefs.unlockPref(getIndividualPrefName("Enabled"));
  Services.prefs.clearUserPref(getIndividualPrefName("Enabled"));
  for (let interceptionPoint of kInterceptionPoints) {
    const prefName = `browser.contentanalysis.interception_point.${interceptionPoint}.enabled`;
    Services.prefs.unlockPref(prefName);
    Services.prefs.clearUserPref(prefName);
  }
  for (let interceptionPoint of kInterceptionPointsPlainTextOnly) {
    const prefName = `browser.contentanalysis.interception_point.${interceptionPoint}.plain_text_only`;
    Services.prefs.unlockPref(prefName);
    Services.prefs.clearUserPref(prefName);
  }
});
