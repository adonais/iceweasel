/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

const pm = Services.perms;
const { ALLOW_ACTION, DENY_ACTION, UNKNOWN_ACTION, EXPIRE_POLICY } =
  Ci.nsIPermissionManager;

const principal =
  Services.scriptSecurityManager.createContentPrincipalFromOrigin(
    "https://policy.example.com"
  );

function checkPolicyPermission(message) {
  let perm = pm.getPermissionObject(principal, "cookie", true);
  Assert.equal(perm?.capability, ALLOW_ACTION, message);
  Assert.equal(perm?.expireType, EXPIRE_POLICY, message);
}

add_task(function test_policy_permission_removal() {
  pm.addFromPrincipal(principal, "cookie", ALLOW_ACTION, EXPIRE_POLICY);

  pm.removeFromPrincipal(principal, "cookie");
  checkPolicyPermission("removeFromPrincipal is silently dropped");

  pm.addFromPrincipal(principal, "cookie", DENY_ACTION, EXPIRE_POLICY);
  checkPolicyPermission("Changing with EXPIRE_POLICY is silently dropped");

  pm.addFromPrincipal(principal, "cookie", UNKNOWN_ACTION, EXPIRE_POLICY);
  Assert.equal(
    pm.getPermissionObject(principal, "cookie", true),
    null,
    "Removing with EXPIRE_POLICY is allowed"
  );
});
