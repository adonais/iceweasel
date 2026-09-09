/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/**
 * This test case covers recreating both the inference process and translations
 * engine after repeated idle timeouts.
 */
add_task(async function test_intersections_after_process_idle_timeouts() {
  await FullPageTranslationsTestUtils.assertIntersectionsAfterEngineIdleTimeouts(
    { keepProcessAlive: false }
  );
});

/**
 * This test case covers recreating translations engines inside an inference
 * process kept alive by another engine actor.
 */
add_task(async function test_intersections_after_engine_idle_timeouts() {
  await FullPageTranslationsTestUtils.assertIntersectionsAfterEngineIdleTimeouts(
    { keepProcessAlive: true }
  );
});
