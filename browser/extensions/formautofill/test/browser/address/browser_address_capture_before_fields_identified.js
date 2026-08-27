/* Any copyright is dedicated to the Public Domain.
http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const TWO_FORMS_URL =
  "https://example.org/browser/browser/extensions/formautofill/test/fixtures/two_address_forms.html";

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["extensions.formautofill.addresses.capture.enabled", true],
      ["extensions.formautofill.addresses.supported", "on"],
      ["extensions.formautofill.addresses.capture.requiredFields", ""],
    ],
  });
  await removeAllRecords();
});

// A form can be submitted while the child is still waiting for the parent to
// send back the identified fields of that form. The child must bail out of the
// submission handling instead of throwing while accessing `fieldDetails`.
add_task(async function test_submission_before_fields_are_identified() {
  await BrowserTestUtils.withNewTab(
    { gBrowser, url: TWO_FORMS_URL },
    async function (browser) {
      // Give the second form a way to be submitted. This happens before any
      // field detection, so it cannot be seen as a dynamic form change.
      await SpecialPowers.spawn(browser, [], function () {
        const submit = content.document.createElement("input");
        submit.type = "submit";
        content.document.querySelector("#form-not-filled").appendChild(submit);
      });

      // Identifying the first form makes the child register its interest in
      // form submissions, which is what lets the submission of the second form
      // reach the child before that form has been identified.
      await focusAndWaitForFieldsIdentified(
        browser,
        "#form-filled #organization"
      );

      const errors = [];
      const consoleListener = {
        QueryInterface: ChromeUtils.generateQI(["nsIConsoleListener"]),
        observe(message) {
          if (message.message?.includes("setIdentifiedFieldDetails")) {
            errors.push(message.message);
          }
        },
      };
      Services.console.registerListener(consoleListener);

      const actor =
        browser.browsingContext.currentWindowGlobal.getActor("FormAutofill");
      const originalReceiveMessage = actor.receiveMessage;

      let onFieldsDetected;
      const fieldsDetected = new Promise(
        resolve => (onFieldsDetected = resolve)
      );
      let releaseReply;
      const replyGate = new Promise(resolve => (releaseReply = resolve));

      // Hold back the reply so that the child still has an uninitialized
      // `fieldDetails` for the second form when it is submitted.
      actor.receiveMessage = function (message) {
        if (message.name == "FormAutofill:OnFieldsDetected") {
          onFieldsDetected();
          return replyGate.then(() =>
            originalReceiveMessage.call(this, message)
          );
        }
        return originalReceiveMessage.call(this, message);
      };

      await SpecialPowers.spawn(browser, [], function () {
        content.document.querySelector("#form-not-filled #email").focus();
      });

      await fieldsDetected;

      await SpecialPowers.spawn(browser, [], function () {
        content.document
          .querySelector("#form-not-filled input[type=submit]")
          .click();
      });

      releaseReply();
      actor.receiveMessage = originalReceiveMessage;

      await ensureNoAddressSaved();

      Services.console.unregisterListener(consoleListener);
      is(errors.length, 0, "Submission was handled without throwing");
    }
  );
});
