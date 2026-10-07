/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

ChromeUtils.defineESModuleGetters(this, {
  ContextualIdentityService:
    "moz-src:///toolkit/components/contextualidentity/ContextualIdentityService.sys.mjs",
});

add_task(async function setup() {
  Services.prefs.setBoolPref("privacy.userContext.enabled", true);
  do_get_profile();
});

add_task(async function test_containers_created_from_sitepolicies() {
  await setupPolicyEngineWithJson({
    policies: {
      SitePolicies: [
        {
          Match: ["*.example.com"],
          Policies: { Container: { id: "work" } },
        },
        {
          Match: ["*.example.org"],
          Policies: { Container: { id: "banking" } },
        },
      ],
    },
  });

  let policyContainers = ContextualIdentityService.getPolicyIdentities();
  equal(policyContainers.length, 2, "Two policy containers created");

  let work = policyContainers.find(c => c.policyId == "work");
  ok(work, "Work container exists");
  equal(work.policy, true, "Marked as policy-managed");
  equal(work.public, false, "Policy containers are not public");

  let banking = policyContainers.find(c => c.policyId == "banking");
  ok(banking, "Banking container exists");
});

add_task(async function test_containers_not_in_public_identities() {
  let publicIdentities = ContextualIdentityService.getPublicIdentities();
  ok(
    !publicIdentities.some(i => i.policy),
    "Policy containers do not appear in public identities"
  );
});

add_task(async function test_containers_have_no_icon_or_color() {
  let policyContainers = ContextualIdentityService.getPolicyIdentities();
  for (let container of policyContainers) {
    ok(!("icon" in container), `Container ${container.policyId} has no icon`);
    ok(!("color" in container), `Container ${container.policyId} has no color`);
  }
});

add_task(async function test_same_container_id_reused_across_entries() {
  await setupPolicyEngineWithJson({
    policies: {
      SitePolicies: [
        {
          Match: ["*.example.com"],
          Policies: { Container: { id: "shared" } },
        },
        {
          Match: ["*.example.org"],
          Policies: { Container: { id: "shared" } },
        },
      ],
    },
  });

  let policyContainers = ContextualIdentityService.getPolicyIdentities();
  let shared = policyContainers.filter(c => c.policyId == "shared");
  equal(shared.length, 1, "Only one container created for duplicate IDs");
});

add_task(async function test_containers_removed_when_policy_changes() {
  await setupPolicyEngineWithJson({
    policies: {
      SitePolicies: [
        {
          Match: ["*.example.com"],
          Policies: { Container: { id: "keep" } },
        },
      ],
    },
  });

  let policyContainers = ContextualIdentityService.getPolicyIdentities();
  ok(
    !policyContainers.some(c => c.policyId == "banking"),
    "Old container removed when no longer referenced"
  );
  ok(
    policyContainers.some(c => c.policyId == "keep"),
    "New container created"
  );
});

add_task(async function test_user_containers_untouched() {
  let userContainer = ContextualIdentityService.create(
    "My Personal",
    "fingerprint",
    "purple"
  );

  await setupPolicyEngineWithJson({
    policies: {
      SitePolicies: [
        {
          Match: ["*.example.com"],
          Policies: { Container: { id: "corp" } },
        },
      ],
    },
  });

  let userStillExists = ContextualIdentityService.getPublicIdentityFromId(
    userContainer.userContextId
  );
  ok(userStillExists, "User-created container still exists");
  equal(userStillExists.name, "My Personal");

  let policyContainers = ContextualIdentityService.getPolicyIdentities();
  equal(policyContainers.length, 1, "Only one policy container");
  equal(policyContainers[0].policyId, "corp");
});

add_task(async function test_container_for_uri() {
  await setupPolicyEngineWithJson({
    policies: {
      SitePolicies: [
        {
          Match: ["*.example.com"],
          Policies: { Container: { id: "work" } },
        },
      ],
    },
  });

  let policyContainers = ContextualIdentityService.getPolicyIdentities();
  let work = policyContainers.find(c => c.policyId == "work");
  ok(work, "Work container exists");

  let matchUri = Services.io.newURI("https://www.example.com/page");
  equal(
    Services.policies.getContainerForURI(matchUri),
    work.userContextId,
    "Matched URL returns the container"
  );

  let noMatchUri = Services.io.newURI("https://www.other.com/page");
  equal(
    Services.policies.getContainerForURI(noMatchUri),
    0,
    "Non-matching URL returns 0"
  );
});

add_task(async function test_container_exceptions() {
  await setupPolicyEngineWithJson({
    policies: {
      SitePolicies: [
        {
          Match: ["*.example.com", "*.example.org"],
          Exceptions: ["*.example.org"],
          Policies: { Container: { id: "restricted" } },
        },
      ],
    },
  });

  let policyContainers = ContextualIdentityService.getPolicyIdentities();
  let restricted = policyContainers.find(c => c.policyId == "restricted");

  let matchUri = Services.io.newURI("https://www.example.com/page");
  equal(
    Services.policies.getContainerForURI(matchUri),
    restricted.userContextId,
    "Matched URL returns the container"
  );

  let exceptedUri = Services.io.newURI("https://www.example.org/page");
  equal(
    Services.policies.getContainerForURI(exceptedUri),
    0,
    "Excepted URL returns 0"
  );
});

add_task(async function test_container_for_navigation() {
  await setupPolicyEngineWithJson({
    policies: {
      SitePolicies: [
        {
          Match: ["*.example.org"],
          Policies: { Container: { id: "nav" } },
        },
      ],
    },
  });

  let policyContainers = ContextualIdentityService.getPolicyIdentities();
  let nav = policyContainers.find(c => c.policyId == "nav");

  let uri = Services.io.newURI("https://www.example.org/path");
  let svc = Cc["@mozilla.org/site-container-service;1"].getService(
    Ci.nsISiteContainerService
  );
  equal(
    svc.containerForNavigation(uri, 0),
    nav.userContextId,
    "containerForNavigation returns the policy container"
  );

  let otherUri = Services.io.newURI("https://other.org/");
  equal(
    svc.containerForNavigation(otherUri, 0),
    0,
    "containerForNavigation returns baseline for non-matching URL"
  );
});

add_task(async function test_switch_pref_enabled() {
  await setupPolicyEngineWithJson({
    policies: {
      SitePolicies: [
        {
          Match: ["*.example.com"],
          Policies: { Container: { id: "test" } },
        },
      ],
    },
  });

  ok(
    Services.prefs.getBoolPref(
      "privacy.containers.switchDuringNavigation.enabled"
    ),
    "switchDuringNavigation pref is enabled"
  );
});

add_task(async function test_ephemeral_container_created() {
  await setupPolicyEngineWithJson({
    policies: {
      SitePolicies: [
        {
          Match: ["*.example.com"],
          Policies: { Container: { id: "ephemeral-work", ephemeral: true } },
        },
        {
          Match: ["*.example.org"],
          Policies: { Container: { id: "persistent-banking" } },
        },
      ],
    },
  });

  let policyContainers = ContextualIdentityService.getPolicyIdentities();
  let ephemeral = policyContainers.find(c => c.policyId == "ephemeral-work");
  ok(ephemeral, "Ephemeral container exists");

  let persistent = policyContainers.find(
    c => c.policyId == "persistent-banking"
  );
  ok(persistent, "Persistent container exists");
});

add_task(async function test_precedence() {
  await setupPolicyEngineWithJson({
    policies: {
      SitePolicies: [
        {
          Match: ["*.example.com"],
          Policies: { Container: { id: "first" } },
        },
        {
          Match: ["*.example.com"],
          Policies: { Container: { id: "second" } },
        },
      ],
    },
  });

  let policyContainers = ContextualIdentityService.getPolicyIdentities();
  let first = policyContainers.find(c => c.policyId == "first");

  let uri = Services.io.newURI("https://www.example.com/");
  equal(
    Services.policies.getContainerForURI(uri),
    first.userContextId,
    "Earlier SitePolicies entry wins"
  );
});
