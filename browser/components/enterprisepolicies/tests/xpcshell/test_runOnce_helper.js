/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

let {
  runOnce,
  runOncePerModification,
  clearRunOnceModification,
  isRunOnceModificationApplied,
} = ChromeUtils.importESModule(
  "resource://gre/modules/PoliciesHelpers.sys.mjs"
);

let runCount = 0;
function callback() {
  runCount++;
}

add_task(async function test_runonce_helper() {
  runOnce("test_action", callback);
  equal(runCount, 1, "Callback ran for the first time.");

  runOnce("test_action", callback);
  equal(runCount, 1, "Callback didn't run again.");
});

add_task(async function test_runOncePerModification_helper() {
  const marker = "browser.policies.runOncePerModification.test_modification";
  runCount = 0;

  await runOncePerModification("test_modification", "one", callback);
  equal(runCount, 1, "Callback ran for a new value.");
  equal(
    Services.prefs.getStringPref(marker),
    "one",
    "The applied value is recorded."
  );

  await runOncePerModification("test_modification", "one", callback);
  equal(runCount, 1, "Callback didn't run again for the same value.");

  await runOncePerModification("test_modification", "two", callback);
  equal(runCount, 2, "Callback ran again for a changed value.");

  // DisplayMenuBar passes a boolean, so the value has to be stored in the
  // form the next run's comparison sees, or its callback runs every startup.
  await runOncePerModification("test_modification", false, callback);
  equal(runCount, 3, "Callback ran for a non-string value.");
  equal(
    Services.prefs.getStringPref(marker),
    "false",
    "The recorded value is the string form."
  );
  await runOncePerModification("test_modification", false, callback);
  equal(runCount, 3, "The same non-string value did not run it again.");

  clearRunOnceModification("test_modification");
  ok(
    !Services.prefs.prefHasUserValue(marker),
    "Clearing removes the recorded value."
  );
  await runOncePerModification("test_modification", "false", callback);
  equal(runCount, 4, "Callback ran again after the record was cleared.");

  clearRunOnceModification("test_modification");
});

add_task(async function test_isRunOnceModificationApplied_helper() {
  ok(
    !isRunOnceModificationApplied("test_applied", "one"),
    "Nothing is applied before the first run."
  );

  await runOncePerModification("test_applied", "one", callback);
  ok(
    isRunOnceModificationApplied("test_applied", "one"),
    "The value that was just applied is reported as applied."
  );
  ok(
    !isRunOnceModificationApplied("test_applied", "two"),
    "A different value is not."
  );

  clearRunOnceModification("test_applied");
  ok(
    !isRunOnceModificationApplied("test_applied", "one"),
    "Nothing is applied after the record was cleared."
  );
});
