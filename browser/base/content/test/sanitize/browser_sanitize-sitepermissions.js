// Bug 380852 - Delete permission manager entries in Clear Recent History

function countPermissions() {
  return Services.perms.all.length;
}

add_task(async function test() {
  // sanitize before we start so we have a good baseline.
  await Sanitizer.sanitize(["siteSettings"], { ignoreTimespan: false });

  // Count how many permissions we start with - some are defaults that
  // will not be sanitized.
  let numAtStart = countPermissions();

  // Add a permission entry
  PermissionTestUtils.add(
    "https://example.com",
    "testing",
    Services.perms.ALLOW_ACTION
  );

  // Sanity check
  ok(
    !!Services.perms.all.length,
    "Permission manager should have elements, since we just added one"
  );

  // Clear it
  await Sanitizer.sanitize(["siteSettings"], { ignoreTimespan: false });

  // Make sure it's gone
  is(
    numAtStart,
    countPermissions(),
    "Permission manager should have the same count it started with"
  );
});

// Bug 1767271: a manual "Clear Now → Site Settings" must wipe
// persist-data-on-shutdown exceptions too (user has explicitly asked to
// clear everything). The shutdown-clearing path keeps them.
add_task(async function siteSettingsManualClearRemovesShutdownException() {
  let origin = "https://example.com";
  let principal =
    Services.scriptSecurityManager.createContentPrincipalFromOrigin(origin);

  PermissionTestUtils.add(
    origin,
    "persist-data-on-shutdown",
    Services.perms.ALLOW_ACTION
  );
  is(
    Services.perms.testPermissionFromPrincipal(
      principal,
      "persist-data-on-shutdown"
    ),
    Services.perms.ALLOW_ACTION,
    "persist-data-on-shutdown set before manual clear"
  );

  // Default `Sanitizer.sanitize` call ⇒ clearHonoringExceptions is falsy ⇒
  // siteSettings cleaner uses CLEAR_PERMISSIONS and wipes the exception.
  await Sanitizer.sanitize(["siteSettings"], { ignoreTimespan: false });

  is(
    Services.perms.testPermissionFromPrincipal(
      principal,
      "persist-data-on-shutdown"
    ),
    Services.perms.UNKNOWN_ACTION,
    "Manual Clear Now → Site Settings wipes persist-data-on-shutdown"
  );
});

// Conversely: a shutdown-context clear (clearHonoringExceptions=true) must
// preserve the persist-data-on-shutdown exception — that's literally what
// the exception is for.
add_task(async function siteSettingsShutdownClearKeepsShutdownException() {
  let origin = "https://example.com";
  let principal =
    Services.scriptSecurityManager.createContentPrincipalFromOrigin(origin);

  PermissionTestUtils.add(
    origin,
    "persist-data-on-shutdown",
    Services.perms.ALLOW_ACTION
  );

  await Sanitizer.sanitize(["siteSettings"], {
    ignoreTimespan: false,
    progress: { clearHonoringExceptions: true },
  });

  is(
    Services.perms.testPermissionFromPrincipal(
      principal,
      "persist-data-on-shutdown"
    ),
    Services.perms.ALLOW_ACTION,
    "Shutdown-context Site Settings clear preserves persist-data-on-shutdown"
  );

  PermissionTestUtils.remove(origin, "persist-data-on-shutdown");
});
