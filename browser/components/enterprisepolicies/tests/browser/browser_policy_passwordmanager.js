/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

add_task(async function test_pwmanager_blocked() {
  await setupPolicyEngineWithJson({
    policies: {
      PasswordManagerEnabled: false,
    },
  });

  await BrowserTestUtils.withNewTab(
    "about:preferences#passwordsAutofill",
    async browser => {
      ok(
        BrowserTestUtils.isHidden(
          browser.contentDocument.getElementById("manageSavedPasswords")
        ),
        "Link to about:logins should be hidden."
      );
    }
  );

  await testPageBlockedByPolicy("about:logins");
});
