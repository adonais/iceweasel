/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * head.js for the rust/ suite: the address browser tests with the Rust store
 * serving every address read and write.
 *
 * The harness auto-loads one head per directory, so this chains to the shared
 * test/browser/head.js before adding its own check.
 */

/* import-globals-from ../head.js */

"use strict";

Services.scriptloader.loadSubScript(
  gTestPath.replace(/\/rust\/[^/]+$/, "/head.js"),
  this
);

// The pref alone does not activate Rust -- the migration has to complete first,
// and otherwise FormAutofillStorage silently keeps serving from JSON, which
// would let every test below pass without exercising Rust at all.
add_task(async function rust_is_the_active_address_store() {
  const { formAutofillStorage } = ChromeUtils.importESModule(
    "resource://autofill/FormAutofillStorage.sys.mjs"
  );
  await formAutofillStorage.initialize();
  Assert.ok(
    Services.prefs.getBoolPref(
      "extensions.formautofill.addresses.storage.rust.active",
      false
    ),
    "the Rust store is serving addresses, so this suite is exercising it"
  );
});
