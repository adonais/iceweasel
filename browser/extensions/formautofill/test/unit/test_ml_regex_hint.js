/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

/**
 * Tests the "regex_hint" mlData feature:
 * FormAutofillHeuristics prepends each field's regex-heuristic recommendation as
 * a "**hint<class>" token so the ML model can confirm/override it. A regex
 * prediction is only surfaced when its field type is in
 * `extensions.formautofill.useml.hint.fields` (the version-locked hintable set);
 * otherwise (or when the regex is silent) it becomes "**hintnone".
 *
 * These cover the directly-callable, ML-runtime-independent pieces:
 *   _regexHintFieldName / _regexHintToken / tokenizeAttributes (prepend).
 * End-to-end mlData emission (tokenizeElements/getFormInfo) additionally
 * requires the ONNX runtime to be available (useMLInference && isMLUsedAlready),
 * so it is exercised by the ml_driver integration path.
 */

"use strict";

const { FormAutofill } = ChromeUtils.importESModule(
  "resource://autofill/FormAutofill.sys.mjs"
);

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  FormAutofillML: "resource://gre/modules/shared/FormAutofillML.sys.mjs",
});

const FEATURES_PREF = "extensions.formautofill.useml.features";
const HINT_FIELDS_PREF = "extensions.formautofill.useml.hint.fields";

// A form whose field id/name/labels the regex heuristic can classify:
//  - a postcode field     -> regex "postal-code"    (hintable in the default set)
//  - a city field         -> regex "address-level2" (hintable; hyphen-strip check)
//  - a credit-card number -> regex "cc-number"      (NOT hintable, handled by fathom -> "**hintnone")
//  - a nonsense field     -> regex silent           (-> "**hintnone")
//  - address-level1 field -> regex "address-level1" (NOT hintable because hidden -> "**hintnone")
//  - tel field            -> regex "tel" (NOT hintable because hidden -> "**hintnone")
const TEST_FORM1 = `
  <form>
    <label for="zip">Postal code</label>
    <input id="zip" name="postal-code" type="text" expectedfieldname="postal-code" reason="regex-heuristic"
           expected="**hintpostalcode zip postal code postal code"
           expectednext="**hintaddresslevel2 city city city"
           combined="**hintpostalcode zip postal code postal code aa**hintaddresslevel2 aacity aacity aacity">
    <label for="city">City</label>
    <input id="city" name="city" type="text" expectedfieldname="address-level2" reason="regex-heuristic"
           expected="**hintaddresslevel2 city city city"
           expectedprevious="**hintpostalcode zip postal code postal code"
           expectednext="**hintnone card number card number"
           combined="**hintaddresslevel2 city city city bb**hintpostalcode bbzip bbpostal bbcode bbpostal bbcode aa**hintnone aacard aanumber aacard aanumber">
    <label for="cc">Card number</label>
    <input id="cc" name="cardNumber" type="text"
           expectedfieldname="cc-number" reason="fathom">
    <input id="mystery" name="xyzzy_field_9000" type="text"
           expected="**hintnone mystery xyzzy field 9000"
           expectedprevious="**hintnone card number card number"
           expectednext="**hintnone province hidden province"
           combined="**hintnone mystery xyzzy field 9000 bb**hintnone bbcard bbnumber bbcard bbnumber aa**hintnone aaprovince aahidden aaprovince">
    <input id="province" name="hidden_province" hidden expectedfieldname="address-level2" reason="regex-heuristic"
    <label for="phone">Telephone Number</label>
    <input id="phone" name="phone" expectedfieldname="tel" reason="regex-heuristic"
           expected="**hinttel phone phone telephone number"
           expectedprevious="**hintnone province hidden province"
           combined="**hinttel phone phone telephone number bb**hintnone bbprovince bbhidden bbprovince">
  </form>`;

// A form whose field id/name/labels the regex heuristic can classify:
//  - a first name field   -> regex "given-name"          (hintable in the default set)
//  - a last name field    -> autocomplete "family-name"  (NOT hintable, as autocomplete)
//  - a country field      -> regex "family-name"         (hintable in the default set)
//  - a street-address field   -> autocomplete "street-address"  (NOT hintable, as autocomplete and not in default set)
//  - an additional-name field -> regex "family-name"     (NOT hintable, not in the default set)
const TEST_FORM2 = `
  <form>
    <label for="firstname">First Name</label>
    <input id="firstname" expectedfieldname="given-name" reason="regex-heuristic"
           expected="**hintgivenname firstname first name"
           expectednext="**hintfamilyname lst"
           combined="**hintgivenname firstname first name aa**hintfamilyname aalst">
    <input id="lst" autocomplete="family-name" expectedfieldname="family-name" reason="autocomplete">
    <label for="country">Country</label>
    <input id="country" expectedfieldname="country" reason="regex-heuristic"
           expected="**hintcountry country country"
           expectedprevious="**hintfamilyname lst"
           expectednext="**hintnone street address"
           combined="**hintcountry country country bb**hintfamilyname bblst aa**hintnone aastreet aaaddress">
    <input id="street-address" autocomplete="street-address" expectedfieldname="street-address" reason="autocomplete">
    <input id="additional-name" expectedfieldname="additional-name" reason="regex-heuristic"
           expected="**hintnone additional name"
           expectedprevious="**hintnone street address"
           combined="**hintnone additional name bb**hintnone bbstreet bbaddress">
  </form>`;

function setHintable(list) {
  Services.prefs.setStringPref(HINT_FIELDS_PREF, JSON.stringify(list));
}

add_setup(async function () {
  Services.prefs.setBoolPref("extensions.formautofill.useml", true);
  Services.prefs.setBoolPref(
    "extensions.formautofill.useml.nativeOnnxAvailable",
    true
  );

  // Default hintable set for these tests: high-precision classes, NOT cc-number.
  setHintable([
    "postal-code",
    "address-level1",
    "address-level2",
    "country",
    "email",
    "given-name",
    "family-name",
    "name",
    "tel",
  ]);
  registerCleanupFunction(() => {
    Services.prefs.clearUserPref("extensions.formautofill.useml");
    Services.prefs.clearUserPref(
      "extensions.formautofill.useml.nativeOnnxAvailable"
    );
    Services.prefs.clearUserPref(HINT_FIELDS_PREF);
    Services.prefs.clearUserPref(FEATURES_PREF);
  });
});

add_task(async function test_hint_for_all_fields() {
  Services.prefs.setStringPref(FEATURES_PREF, JSON.stringify(["regex_hint"]));

  for (let form of [TEST_FORM1, TEST_FORM2]) {
    const doc = MockDocument.createTestDocument("http://example.test/", form);

    let fieldDetails = FormAutofillHeuristics.getFormInfo(doc.forms[0], true);
    Assert.equal(fieldDetails.length, 5, "matched correct number of elements");

    for (let f = 0; f < fieldDetails.length; f++) {
      let field = fieldDetails[f];
      Assert.equal(
        field.mlData?.[0] || "",
        field.element.getAttribute("expected") || "",
        "hints added to field " + f
      );
      Assert.equal(
        field.mlData?.[1] || "",
        field.element.getAttribute("expectedprevious") || "",
        "hints added to previous field " + f
      );
      Assert.equal(
        field.mlData?.[2] || "",
        field.element.getAttribute("expectednext") || "",
        "hints added to next field " + f
      );
    }

    let ML = new lazy.FormAutofillML();
    ML.combineAdjacentTokens(fieldDetails);

    for (let f = 0; f < fieldDetails.length; f++) {
      let field = fieldDetails[f];
      Assert.equal(
        field.mlDataCombined,
        field.element.getAttribute("combined"),
        "combined data " + f + " after calling combineAdjacentTokens"
      );
    }
  }
});

add_task(async function test_hint_token_for_hintable_class() {
  Assert.equal(
    FormAutofillHeuristics.getHintToken({
      fieldName: "postal-code",
      reason: "regex-heuristic",
      mlData: "test",
    }),
    "**hintpostalcode",
    "hintable class -> **hint<class> with hyphens stripped"
  );
});

add_task(async function test_hint_token_hyphen_stripping() {
  // address-level2 must become "**hintaddresslevel2" (survives WORD_RE).
  Assert.equal(
    FormAutofillHeuristics.getHintToken({
      fieldName: "address-level2",
      reason: "regex-heuristic",
      mlData: "test",
    }),
    "**hintaddresslevel2",
    "multi-hyphen class is stripped to a single token"
  );
});

add_task(async function test_hint_none_for_non_hintable_class() {
  // cc-number is a real regex match but NOT in the hintable set -> suppressed.
  Assert.equal(
    FormAutofillHeuristics.getHintToken({
      fieldName: "cc-number",
      reason: "regex-heuristic",
      mlData: "test",
    }),
    "**hintnone",
    "cc-number, a non-hintable class, is emitted as **hintnone"
  );

  Assert.equal(
    FormAutofillHeuristics.getHintToken({
      fieldName: "cc-name",
      reason: "regex-heuristic",
      mlData: "test",
    }),
    "**hintnone",
    "cc-name, a non-hintable class, is emitted as **hintnone"
  );
});

add_task(async function test_hint_none_when_regex_silent() {
  Assert.equal(
    FormAutofillHeuristics.getHintToken({
      fieldName: "mystery",
      reason: "regex-heuristic",
      mlData: "test",
    }),
    "**hintnone",
    "silent regex -> **hintnone"
  );
});

add_task(async function test_hintable_set_is_pref_driven() {
  // The hintable set is version-locked to the model via the pref: dropping
  // postal-code from it must suppress the postcode hint (and vice-versa).
  setHintable(["email"]);
  Assert.equal(
    FormAutofillHeuristics.getHintToken({
      fieldName: "postal-code",
      reason: "regex-heuristic",
      mlData: "test",
    }),
    "**hintnone",
    "postal-code no longer hintable -> **hintnone"
  );
  setHintable(["postal-code"]);
  Assert.equal(
    FormAutofillHeuristics.getHintToken({
      fieldName: "postal-code",
      reason: "regex-heuristic",
      mlData: "test",
    }),
    "**hintpostalcode",
    "re-adding postal-code restores the hint"
  );
});

add_task(async function test_feature_flag_gates_hint_map() {
  // getFormInfo only builds hints when "regex_hint" is in useml.features.
  Services.prefs.setStringPref(FEATURES_PREF, "[]");
  Assert.ok(
    !FormAutofill.mlFeatures.has("regex_hint"),
    "regex_hint off by default"
  );
  Services.prefs.setStringPref(FEATURES_PREF, JSON.stringify(["regex_hint"]));
  Assert.ok(
    FormAutofill.mlFeatures.has("regex_hint"),
    "regex_hint enabled via useml.features"
  );
});
