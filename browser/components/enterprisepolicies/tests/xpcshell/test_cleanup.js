/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

async function checkMessages(expectedResult) {
  let onBeforeAddons = false;
  let onProfileAfterChange = false;
  let onBeforeUIStartup = false;
  let onAllWindowsRestored = false;

  let cleanupObserver = (subject, topic, data) => {
    switch (data) {
      case "onBeforeAddons":
        onBeforeAddons = true;
        break;
      case "onProfileAfterChange":
        onProfileAfterChange = true;
        break;
      case "onBeforeUIStartup":
        onBeforeUIStartup = true;
        break;
      case "onAllWindowsRestored":
        onAllWindowsRestored = true;
        break;
    }
  };

  Services.obs.addObserver(cleanupObserver, "EnterprisePolicies:Cleanup");

  await setupPolicyEngineWithJson({
    policies: {},
  });

  Services.obs.removeObserver(cleanupObserver, "EnterprisePolicies:Cleanup");

  equal(
    onBeforeAddons,
    expectedResult,
    "onBeforeAddons should be " + expectedResult
  );
  equal(
    onProfileAfterChange,
    expectedResult,
    "onProfileAfterChange should be" + expectedResult
  );
  equal(
    onBeforeUIStartup,
    expectedResult,
    "onBeforeUIStartup should be" + expectedResult
  );
  equal(
    onAllWindowsRestored,
    expectedResult,
    "onAllWindowsRestored should be" + expectedResult
  );
}

/* If there is no existing policy, cleanup should not run. */
add_task(async function test_cleanup_no_policy() {
  await checkMessages(false);
});

add_task(async function setup_policy() {
  await setupPolicyEngineWithJson({
    policies: {
      BlockAboutConfig: true,
    },
  });
});

/* Since there was a policy, cleanup should run. */
add_task(async function test_cleanup_with_policy() {
  await checkMessages(true);
});

/* Since cleanup was already done, cleanup should not run again. */
add_task(async function test_cleanup_after_policy() {
  await checkMessages(false);
});
