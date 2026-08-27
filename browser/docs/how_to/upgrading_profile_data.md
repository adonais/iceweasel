# Upgrading profile data storage for existing profiles

## Overview

Firefox sometimes needs to change how it stores data in the profile
directory: renaming or flipping the meaning of a preference, moving data
between prefs, changing permissions, restructuring XULStore entries, or
removing files that are no longer used. Because these changes need to run
once for every profile that already exists (but not for brand new
profiles, which start out in the desired state already), they are handled
by `ProfileDataUpgrader`, which runs migrations keyed off an incrementing
profile data version number.

This is distinct from a Firefox release version: the profile data version
increases whenever a migration is added.

`ProfileDataUpgrader.upgrade()` is called from `BrowserGlue.sys.mjs`'s
`_migrateUI()` very early during startup, before most other browser
initialization. Each migration in `ProfileDataUpgrader.sys.mjs` is guarded
by `if (existingDataVersion < N)`, so a profile only runs the migrations
it hasn't already run, in order, the first time it starts up with a
newer Firefox.

## Prerequisites

A clear idea of the old and new state of the data you're migrating
(old pref name/value vs. new pref name/value, old permission type vs.
new one, etc).

## Steps

### 1. Bump the profile data version

**Files to modify:**

- `browser/components/BrowserGlue.sys.mjs`

**Code pattern:**

```js
_migrateUI() {
  const APP_DATA_VERSION = 42; // was 41
  ...
},
```

**Explanation:**

`APP_DATA_VERSION` in `_migrateUI` is the target version new migrations
run up to. Increment it by 1. New profiles are set to this version directly and
never run any migrations.

### 2. Add the migration to ProfileDataUpgrader

**Files to modify:**

- `browser/components/ProfileDataUpgrader.sys.mjs`

**Code pattern:**

```js
if (existingDataVersion < 42) {
  // Bug NNNNNNN: short description of why this migration exists.
  const oldPrefName = "some.old.pref";
  const newPrefName = "some.new.pref";
  if (Services.prefs.prefHasUserValue(oldPrefName)) {
    Services.prefs.setBoolPref(
      newPrefName,
      Services.prefs.getBoolPref(oldPrefName)
    );
    Services.prefs.clearUserPref(oldPrefName);
  }
}
```

Add the new `if` block at the end of `upgrade()`, using the same version
number from step 1.

**Explanation:**

This method runs very early in startup and migrates the pref value from one
pref name to another.

If the change affects database schemas or other external storage or components
that may not have initialized at this point in startup, prefer letting that
component's own startup code detect and perform the schema migration, and only
use `ProfileDataUpgrader` to flip a pref or flag that tells the component to
do so.

### Add a dedicated xpcshell test

Non-trivial migrations should get their own xpcshell test under
`browser/components/tests/unit/`. Import `ProfileDataUpgrader` directly
and call `upgrade()` with the old and new version numbers:

**Files to modify:**

- `browser/components/tests/unit/test_profileDataUpgrade_my_feature.js`
- `browser/components/tests/unit/xpcshell.toml`

**Code pattern:**

```js
/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { ProfileDataUpgrader } = ChromeUtils.importESModule(
  "moz-src:///browser/components/ProfileDataUpgrader.sys.mjs"
);

const NEW_APP_DATA_VERSION = 42;

add_task(async function test_my_migration() {
  Services.prefs.setBoolPref("some.old.pref", true);

  ProfileDataUpgrader.upgrade(NEW_APP_DATA_VERSION - 1, NEW_APP_DATA_VERSION);

  Assert.ok(
    Services.prefs.getBoolPref("some.new.pref"),
    "old pref value should have carried over to the new pref"
  );
  Assert.ok(
    !Services.prefs.prefHasUserValue("some.old.pref"),
    "old pref should have been cleared"
  );
});
```

**Explanation:**

`ProfileDataUpgrader.upgrade(existingDataVersion, newVersion)` runs
exactly the migrations gated on `existingDataVersion < N <= newVersion`,
so pick an `existingDataVersion` just below the version your migration
checks, and a `newVersion` one above it, rather than the real
`APP_DATA_VERSION`. This keeps the test targeted at your migration and
avoids it needing changes every time a later migration is added.

## Verification

Do a manual test. Run your build with a profile, decrement the
`browser.migration.version` pref to just below your new migration, set up any
other state you need, and then open the browser again. Verify that data is
migrated as needed and the version increments, and that there are no errors.

Run the automated test described above with:

```bash
./mach test path/to/your/new/test.js
```

Also check `test_browserGlue_migration_no_errors.js`: it calls
`ProfileDataUpgrader.upgrade()` across the full migration range to catch
typos and thrown exceptions. You don't need to update it yourself, but failures
would indicate your migration needs to be able to deal with some profile state
that it isn't yet.

```bash
./mach test browser/components/tests/unit/test_browserGlue_migration_no_errors.js
```

## Common Pitfalls

- **Forgetting to bump `APP_DATA_VERSION`**: if you only add the `if`
  block in `ProfileDataUpgrader.sys.mjs` but don't increment
  `APP_DATA_VERSION` in `BrowserGlue.sys.mjs`, your migration will never
  run, because `_migrateUI` never calls `upgrade()` with a `newVersion`
  that's high enough to reach it.
  - **Solution**: always change both files together.

- **Doing expensive work directly in the migration**: `_migrateUI` runs
  very early during startup, so slow migrations can noticeably regress
  startup performance for everyone upgrading.
  - **Solution**: set a pref flag and defer the real work to idle time or
    to the relevant component's own startup path.

- **Wanting to uplift your migration**: this usually doesn't work because
  the version increments are entirely linear, and so this could lead to
  other migrations not running, or migration versions doing different migrations
  between release, beta and nightly and subsequent additional migrations being
  skipped. The only case where this can work is if, at the
  time you land in nightly, the migration version is the same across all
  branches you need to uplift to.

- **Assuming a pref/permission is user-set**: unconditionally reading or
  writing a pref can create a user override where there wasn't one
  before, which then survives future default value changes. Note that if you
  are changing a preference default value, `prefHasUserValue` will return false
  in the "new" state if the user previously customized it to what is now
  the new default value. In these cases you may want to change the pref name
  if you find you have to change the default value, to be able to correctly
  detect previous user values for the "old" pref.

## See Also

- Relevant source code: {searchfox}`ProfileDataUpgrader.sys.mjs <browser/components/ProfileDataUpgrader.sys.mjs>`
- Relevant source code: {searchfox}`BrowserGlue.sys.mjs's _migrateUI <browser/components/BrowserGlue.sys.mjs>`
- Example migration test: {searchfox}`test_profileDataUpgrade_duplicateCookiePerms.js <browser/components/tests/unit/test_profileDataUpgrade_duplicateCookiePerms.js>`
