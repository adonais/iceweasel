/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

add_setup(async function () {
  registerCleanupFunction(() => resetState());
});

add_task(async function test_url_pattern_matches() {
  await checkNotification(
    { type: "url", pattern: `^https://${TEST_DOMAIN}/` },
    true
  );
});

add_task(async function test_url_pattern_no_match() {
  await checkNotification(
    { type: "url", pattern: "^https://no-such-host\\.invalid/" },
    false
  );
});

add_task(async function test_url_invalid_pattern() {
  await checkNotification({ type: "url", pattern: "[" }, false);
});
