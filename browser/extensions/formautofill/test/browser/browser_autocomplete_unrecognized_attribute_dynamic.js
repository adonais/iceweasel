/* Any copyright is dedicated to the Public Domain.
http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Bug 2078883: a site may change a field's `autocomplete` attribute to an
// unrecognized value *after* the field has already been classified (e.g. on
// focus, as Skims and ~30 other sites do). `inferFieldInfo` only evaluates
// `hasUnrecognizedAutocomplete()` once, at detection time, so these cases
// exercise the live re-check added to `FormAutofillChild.shouldSearchForAutoComplete`.
//
// Only the field's own dropdown is withheld. The field stays part of the
// section, so selecting a saved address from a sibling's dropdown still
// fills and previews it -- that's the whole point of autofill from a
// sibling, and this bug is only about not showing a second, competing
// dropdown directly on top of the site's own one.

const SUPPRESS_PREF =
  "extensions.formautofill.suppressUnrecognizedAutocomplete.enabled";

const DYNAMIC_ATTR_PROFILE = {
  "street-address": "32 Vassar Street",
  "address-level2": "Cambridge",
  "address-level1": "MA",
  "postal-code": "02139",
  country: "US",
};

add_setup(async () => {
  await setStorage(DYNAMIC_ATTR_PROFILE);
  registerCleanupFunction(async () => {
    await removeAllRecords();
  });
});

/**
 * Builds a form whose `street-address` field starts with a valid
 * `autocomplete` value and has its attribute swapped to `newValue` by
 * `triggerEvent` (default: "focus", once).
 *
 * @param {string} newValue
 * @param {string} triggerEvent
 */
function dynamicAttributeForm(newValue, triggerEvent = "focus") {
  return `
  <form>
    <input id="street-address" name="street-address" autocomplete="shipping address-line1">
    <input id="address-level2" name="address-level2" autocomplete="shipping address-level2">
    <input id="address-level1" name="address-level1" autocomplete="shipping address-level1">
    <input id="postal-code" name="postal-code" autocomplete="shipping postal-code">
    <input id="country" name="country" autocomplete="shipping country">
  </form>
  <script>
    const el = document.getElementById("street-address");
    el.addEventListener(
      "${triggerEvent}",
      () => el.setAttribute("autocomplete", "${newValue}"),
      { once: true }
    );
  </script>`;
}

function dynamicAttributeUrl(newValue, triggerEvent = "focus") {
  return (
    TOP_LEVEL_HOST +
    `/document-builder.sjs?html=${encodeURIComponent(
      dynamicAttributeForm(newValue, triggerEvent)
    )}`
  );
}

add_task(async function test_live_gate_suppresses_dropdown_changed_on_focus() {
  // The Skims repro: the attribute is swapped by the same focus event that
  // triggers field identification, so a detection-time check alone would
  // still classify the field with the stale "shipping address-line1" value.
  await SpecialPowers.pushPrefEnv({ set: [[SUPPRESS_PREF, true]] });
  await BrowserTestUtils.withNewTab(
    dynamicAttributeUrl("none"),
    async browser => {
      await focusAndWaitForFieldsIdentified(browser, "#street-address");
      await BrowserTestUtils.synthesizeKey("VK_DOWN", {}, browser);
      await ensureNoAutocompletePopup(browser);

      // Sanity check: the rest of the section is still live.
      await openPopupOn(browser, "#address-level2");
      await ensureNoDoorhanger().catch(() => {});
    }
  );
  await SpecialPowers.popPrefEnv();
});

add_task(
  async function test_live_gate_suppresses_dropdown_changed_after_identification() {
    // Identify the form via a different field first, so street-address is
    // classified with its original, valid value before the attribute change.
    await SpecialPowers.pushPrefEnv({ set: [[SUPPRESS_PREF, true]] });
    await BrowserTestUtils.withNewTab(
      dynamicAttributeUrl("none", "click"),
      async browser => {
        await focusAndWaitForFieldsIdentified(browser, "#address-level2");

        await SpecialPowers.spawn(browser, [], () => {
          content.document
            .getElementById("street-address")
            .setAttribute("autocomplete", "none");
        });

        await BrowserTestUtils.synthesizeMouseAtCenter(
          "#street-address",
          {},
          browser
        );
        await BrowserTestUtils.synthesizeKey("VK_DOWN", {}, browser);
        await ensureNoAutocompletePopup(browser);
      }
    );
    await SpecialPowers.popPrefEnv();
  }
);

add_task(async function test_live_gate_still_fills_from_sibling_dropdown() {
  // The live gate only withholds the field's own dropdown. It is still part
  // of the section (detection ran before the attribute changed), so a fill
  // or preview triggered from a sibling's dropdown must still reach it.
  await SpecialPowers.pushPrefEnv({ set: [[SUPPRESS_PREF, true]] });
  await BrowserTestUtils.withNewTab(
    dynamicAttributeUrl("none", "click"),
    async browser => {
      await focusAndWaitForFieldsIdentified(browser, "#address-level2");
      await SpecialPowers.spawn(browser, [], () => {
        content.document
          .getElementById("street-address")
          .setAttribute("autocomplete", "none");
      });

      await openPopupOn(browser, "#address-level2");

      // Highlight the (only) entry to trigger a preview across the section.
      await BrowserTestUtils.synthesizeKey("VK_DOWN", {}, browser);
      await SpecialPowers.spawn(browser, [], async () => {
        const street = content.document.getElementById("street-address");
        await ContentTaskUtils.waitForCondition(
          () => street.previewValue === "32 Vassar Street",
          "Waiting for street-address preview"
        );
        Assert.equal(
          street.previewValue,
          "32 Vassar Street",
          "street-address is still previewed from the sibling dropdown"
        );
      });

      await BrowserTestUtils.synthesizeKey("VK_RETURN", {}, browser);
      await waitForAutofill(browser, "#street-address", "32 Vassar Street");

      await SpecialPowers.spawn(browser, [], () => {
        const street = content.document.getElementById("street-address");
        Assert.equal(
          street.value,
          "32 Vassar Street",
          "street-address is still filled from the sibling dropdown"
        );
        Assert.equal(
          street.autofillState,
          "autofill",
          "street-address is marked autofilled"
        );
      });
    }
  );
  await SpecialPowers.popPrefEnv();
});

add_task(
  async function test_live_gate_does_not_suppress_on_recognized_off_value() {
    // Guard against a 2078893-style false positive: "off" (and a malformed
    // multi-token value containing it) is a recognized, just-ignored value
    // (Bug 1754879), never an opt-out, so the dropdown must still appear.
    for (const value of ["off", "off something"]) {
      await SpecialPowers.pushPrefEnv({ set: [[SUPPRESS_PREF, true]] });
      await BrowserTestUtils.withNewTab(
        dynamicAttributeUrl(value),
        async browser => {
          await openPopupOn(browser, "#street-address");
        }
      );
      await SpecialPowers.popPrefEnv();
    }
  }
);

add_task(
  async function test_live_gate_does_not_suppress_on_valid_to_valid_change() {
    // A recognized value replaced by a different recognized value is
    // unrelated to this bug; the dropdown must still appear.
    await SpecialPowers.pushPrefEnv({ set: [[SUPPRESS_PREF, true]] });
    await BrowserTestUtils.withNewTab(
      dynamicAttributeUrl("shipping street-address"),
      async browser => {
        await openPopupOn(browser, "#street-address");
      }
    );
    await SpecialPowers.popPrefEnv();
  }
);

add_task(async function test_live_gate_is_pref_gated() {
  // With the feature pref off, the live gate must not run either.
  await SpecialPowers.pushPrefEnv({ set: [[SUPPRESS_PREF, false]] });
  await BrowserTestUtils.withNewTab(
    dynamicAttributeUrl("none"),
    async browser => {
      await openPopupOn(browser, "#street-address");
    }
  );
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_live_gate_survives_repeated_focus_cycles() {
  // A site may toggle the attribute in lockstep with its own custom dropdown
  // (unrecognized while open, restored to a valid value on blur). The live
  // gate must re-evaluate correctly on every focus, not just the first one.
  const url =
    TOP_LEVEL_HOST +
    `/document-builder.sjs?html=${encodeURIComponent(`
    <form>
      <input id="street-address" name="street-address" autocomplete="shipping address-line1">
      <input id="address-level2" name="address-level2" autocomplete="shipping address-level2">
    </form>
    <script>
      const el = document.getElementById("street-address");
      el.addEventListener("focus", () => el.setAttribute("autocomplete", "none"));
      el.addEventListener("blur", () => el.setAttribute("autocomplete", "shipping address-line1"));
    </script>`)}`;

  await SpecialPowers.pushPrefEnv({ set: [[SUPPRESS_PREF, true]] });
  await BrowserTestUtils.withNewTab(url, async browser => {
    for (let i = 0; i < 3; i++) {
      info(`focus cycle ${i}`);
      await focusAndWaitForFieldsIdentified(browser, "#street-address");
      await BrowserTestUtils.synthesizeKey("VK_DOWN", {}, browser);
      await ensureNoAutocompletePopup(browser);

      await SpecialPowers.spawn(browser, [], () => {
        content.document.getElementById("address-level2").focus();
      });
    }
  });
  await SpecialPowers.popPrefEnv();
});
