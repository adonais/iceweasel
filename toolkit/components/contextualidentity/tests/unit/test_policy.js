"use strict";

const profileDir = do_get_profile();

const { ContextualIdentityService } = ChromeUtils.importESModule(
  "moz-src:///toolkit/components/contextualidentity/ContextualIdentityService.sys.mjs"
);

let gCounter = 0;
function freshService() {
  let path = PathUtils.join(profileDir.path, `test-policy-${gCounter++}.json`);
  return {
    cis: ContextualIdentityService.createNewInstanceForTesting(path),
    path,
  };
}

// createForPolicy creates non-public containers with policy and policyId fields.
add_task(function policyContainers() {
  let { cis } = freshService();

  let identity = cis.createForPolicy("corp");
  ok(identity.policy, "Identity is marked as policy-managed");
  equal(identity.policyId, "corp", "Identity has the correct policyId");
  equal(identity.name, "corp");
  ok(!identity.public, "Policy container is not public");

  cis.create("Personal", "fingerprint", "purple");

  let policyIdentities = cis.getPolicyIdentities();
  equal(policyIdentities.length, 1, "Only the policy container is returned");
  equal(policyIdentities[0].policyId, "corp");

  let allPublic = cis.getPublicIdentities();
  ok(
    !allPublic.some(i => i.policy),
    "Policy containers do not appear in public identities"
  );
});

// createForPolicy containers persist and survive reload.
add_task(async function policyContainerPersistence() {
  let { cis, path } = freshService();

  cis.createForPolicy("work");
  await cis._saver.finalize();

  let reloaded = ContextualIdentityService.createNewInstanceForTesting(path);
  let policyIdentities = reloaded.getPolicyIdentities();
  equal(policyIdentities.length, 1, "Policy container persisted");
  equal(policyIdentities[0].policyId, "work");
  equal(policyIdentities[0].policy, true);
  equal(policyIdentities[0].name, "work");
});
