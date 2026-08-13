/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

function check_enumerator(prefix, permissions) {
  let pm = Services.perms;

  // getAllWithTypePrefix returns permissions in hash-table order, which is not
  // guaranteed, so sort both sides by a stable key before comparing.
  let sortKey = (principal, type) => `${principal.origin}|${type}`;

  let array = pm
    .getAllWithTypePrefix(prefix)
    .sort((a, b) =>
      sortKey(a.principal, a.type).localeCompare(sortKey(b.principal, b.type))
    );
  let expected = [...permissions].sort(([aP, aT], [bP, bT]) =>
    sortKey(aP, aT).localeCompare(sortKey(bP, bT))
  );

  Assert.equal(array.length, expected.length);
  for (let [principal, type, capability] of expected) {
    let perm = array.shift();
    Assert.notEqual(perm, null);
    Assert.ok(perm.principal.equals(principal));
    Assert.equal(perm.type, type);
    Assert.equal(perm.capability, capability);
    Assert.equal(perm.expireType, pm.EXPIRE_NEVER);
  }
  Assert.equal(array.length, 0);
}

function run_test() {
  let pm = Services.perms;

  let principal =
    Services.scriptSecurityManager.createContentPrincipalFromOrigin(
      "http://example.com"
    );
  let subPrincipal =
    Services.scriptSecurityManager.createContentPrincipalFromOrigin(
      "http://sub.example.com"
    );

  check_enumerator("test/", []);

  pm.addFromPrincipal(principal, "test/getallwithtypeprefix", pm.ALLOW_ACTION);
  pm.addFromPrincipal(
    subPrincipal,
    "other-test/getallwithtypeprefix",
    pm.PROMPT_ACTION
  );
  check_enumerator("test/", [
    [principal, "test/getallwithtypeprefix", pm.ALLOW_ACTION],
  ]);

  pm.addFromPrincipal(
    subPrincipal,
    "test/getallwithtypeprefix",
    pm.PROMPT_ACTION
  );
  check_enumerator("test/", [
    [subPrincipal, "test/getallwithtypeprefix", pm.PROMPT_ACTION],
    [principal, "test/getallwithtypeprefix", pm.ALLOW_ACTION],
  ]);

  check_enumerator("test/getallwithtypeprefix", [
    [subPrincipal, "test/getallwithtypeprefix", pm.PROMPT_ACTION],
    [principal, "test/getallwithtypeprefix", pm.ALLOW_ACTION],
  ]);

  // check that UNKNOWN_ACTION permissions are ignored
  pm.addFromPrincipal(
    principal,
    "test/getallwithtypeprefix2",
    pm.UNKNOWN_ACTION
  );
  check_enumerator("test/", [
    [subPrincipal, "test/getallwithtypeprefix", pm.PROMPT_ACTION],
    [principal, "test/getallwithtypeprefix", pm.ALLOW_ACTION],
  ]);

  // check that permission updates are reflected
  pm.addFromPrincipal(principal, "test/getallwithtypeprefix", pm.PROMPT_ACTION);
  check_enumerator("test/", [
    [subPrincipal, "test/getallwithtypeprefix", pm.PROMPT_ACTION],
    [principal, "test/getallwithtypeprefix", pm.PROMPT_ACTION],
  ]);

  // check that permission removals are reflected
  pm.removeFromPrincipal(principal, "test/getallwithtypeprefix");
  check_enumerator("test/", [
    [subPrincipal, "test/getallwithtypeprefix", pm.PROMPT_ACTION],
  ]);

  pm.removeAll();
  check_enumerator("test/", []);
}
