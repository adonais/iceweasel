/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { FormAutofillParent } = ChromeUtils.importESModule(
  "resource://autofill/FormAutofillParent.sys.mjs"
);
const { MLPerfTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/MLPerfTestUtils.sys.mjs"
);

/** The address form used for each performance scenario. */
const ADDRESS_FORM_URL =
  "https://example.org/browser/browser/extensions/formautofill/test/fixtures/without_autocomplete_address_basic.html";

/**
 * Observes when Form Autofill finishes identifying fields in this window.
 *
 * @returns {{promise: Promise<number>, cleanup: () => void}} The observation.
 */
function observeFieldsIdentified() {
  const { promise, resolve } = Promise.withResolvers();
  const observer = {
    fieldsIdentified(_data, chromeWindow) {
      if (chromeWindow === window) {
        resolve(performance.now());
      }
    },
  };

  FormAutofillParent.addMessageObserver(observer);

  return {
    promise,
    cleanup() {
      FormAutofillParent.removeMessageObserver(observer);
    },
  };
}

/**
 * Runs one production Form Autofill interaction.
 *
 * @returns {Promise<Record<string, number>>} The feature measurements.
 */
async function runAutofillScenario() {
  const tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    ADDRESS_FORM_URL
  );
  const browser = tab.linkedBrowser;
  const fieldsIdentified = observeFieldsIdentified();

  try {
    const start = performance.now();

    await SpecialPowers.spawn(browser, [], () => {
      content.document.querySelector("#given-name").focus();
    });

    const end = await fieldsIdentified.promise;
    const actor =
      browser.browsingContext.currentWindowGlobal.getActor("FormAutofill");
    const sections = Array.from(actor.sectionsByRootId.values()).flat();
    const fields = sections.flatMap(section => section.fieldDetails);

    Assert.ok(sections.length, "Form Autofill produced a section");
    Assert.ok(
      fields.some(field => field.reason === "ml"),
      "Form Autofill applied an ML classification"
    );

    return { "focus-to-identification-time": end - start };
  } finally {
    fieldsIdentified.cleanup();
    BrowserTestUtils.removeTab(tab);
  }
}
