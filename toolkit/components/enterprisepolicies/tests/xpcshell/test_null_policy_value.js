/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

add_task(async function test_null_policy_value() {
  await setupPolicyEngineWithJson({
    policies: {
      DisableAppUpdate: null,
      DisableSystemAddonUpdate: true,
    },
  });

  equal(
    Services.policies.status,
    Ci.nsIEnterprisePolicies.ACTIVE,
    "Engine is active"
  );

  let activePolicies = Services.policies.getActivePolicies();
  ok(
    "DisableSystemAddonUpdate" in activePolicies,
    "The policy next to the null-valued one was still applied"
  );
  ok(
    !("DisableAppUpdate" in activePolicies),
    "The null-valued policy was not applied"
  );
});
