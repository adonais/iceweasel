/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

async function test_with_key_logging(enabled) {
  if (enabled) {
    Services.env.set("SSLKEYLOGFILE", "nonexistentfile");
  } else {
    Services.env.set("SSLKEYLOGFILE", "");
  }

  await BrowserTestUtils.withNewTab("about:preferences", async browser => {
    Assert.equal(
      !browser.contentDocument.getElementById(
        "tls-key-logging-container-content"
      ).hidden,
      enabled,
      `The TLS key logging notice was ${enabled ? "visible" : "hidden"} in about:preferences`
    );
  });
}

registerCleanupFunction(() => {
  Services.env.set("SSLKEYLOGFILE", "");
});

add_task(async function run_test() {
  await test_with_key_logging(true);
  await test_with_key_logging(false);
});
