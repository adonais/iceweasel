/* Any copyright is dedicated to the Public Domain.
http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Verifies the optional mlData tokenizer features gated by
// extensions.formautofill.useml.features:
//   "select_option"    -> a "<first>...<last>" option-range token on <select>
//                          (blank leading/trailing options skipped)
//   "input_attributes" -> "**maxlen<N>" and "**inputmode<mode>" tokens
// Each feature must only emit its tokens when listed. This exercises the
// tokenizer directly (FormAutofillHeuristics.tokenizeElements) -- no model
// inference -- so it stays fast and deterministic.

const FIXTURE = `
  <form>
    <label>country: <select id="country" name="country">
      <option value=""></option>
      <option value="AF">Afghanistan</option>
      <option value="CY">Cyprus</option>
    </select></label>
    <label>area: <input id="tel-area" name="tel-area" type="text" maxlength="3"></label>
    <label>cvc: <input id="cvc" name="cvc" type="text" inputmode="numeric"></label>
  </form>`;

/**
 * Set the features pref, inject the fixture, and return the per-field mlData
 * token strings keyed by element id.
 */
async function tokenize(browser, featuresJSON) {
  await SpecialPowers.pushPrefEnv({
    set: [["extensions.formautofill.useml.features", featuresJSON]],
  });
  return SpecialPowers.spawn(browser, [FIXTURE], async html => {
    content.document.body.innerHTML = html;
    const { FormAutofillHeuristics } = ChromeUtils.importESModule(
      "resource://gre/modules/shared/FormAutofillHeuristics.sys.mjs"
    );
    const elements = Array.from(
      content.document.querySelectorAll("input, select")
    );
    const map = FormAutofillHeuristics.tokenizeElements(elements);
    const out = {};
    for (const el of elements) {
      // tokenizeElements returns null if ML isn't enabled/ready.
      out[el.id] = map ? map.get(el) : null;
    }
    return out;
  });
}

add_setup(async function () {
  // tokenizeElements only runs when ML is enabled AND has been used already.
  await SpecialPowers.pushPrefEnv({
    set: [
      ["extensions.formautofill.useml", true],
      ["extensions.formautofill.useml.nativeOnnxAvailable", true],
      ["extensions.formautofill.useml.successful", true],
    ],
  });
});

add_task(async function test_both_features() {
  await BrowserTestUtils.withNewTab(EMPTY_URL, async browser => {
    const tokens = await tokenize(
      browser,
      JSON.stringify(["select_option", "input_attributes"])
    );
    // Blank first <option> is skipped, so the range starts at Afghanistan.
    Assert.ok(
      tokens.country.includes("afghanistan...cyprus"),
      `country carries the option-range token: ${tokens.country}`
    );
    Assert.ok(
      tokens["tel-area"].split(/\s+/).includes("**maxlen3"),
      `maxlength=3 field carries **maxlen3: ${tokens["tel-area"]}`
    );
    Assert.ok(
      tokens.cvc.split(/\s+/).includes("**inputmodenumeric"),
      `inputmode=numeric field carries **inputmodenumeric: ${tokens.cvc}`
    );
  });
});

add_task(async function test_no_features() {
  await BrowserTestUtils.withNewTab(EMPTY_URL, async browser => {
    const tokens = await tokenize(browser, "[]");
    Assert.ok(
      !tokens.country.includes("..."),
      `no option-range token when disabled: ${tokens.country}`
    );
    Assert.ok(
      !tokens["tel-area"].includes("**maxlen"),
      `no maxlen token when disabled: ${tokens["tel-area"]}`
    );
    Assert.ok(
      !tokens.cvc.includes("**inputmode"),
      `no inputmode token when disabled: ${tokens.cvc}`
    );
  });
});

add_task(async function test_select_option_only() {
  await BrowserTestUtils.withNewTab(EMPTY_URL, async browser => {
    const tokens = await tokenize(browser, JSON.stringify(["select_option"]));
    Assert.ok(
      tokens.country.includes("afghanistan...cyprus"),
      `option-range present with select_option: ${tokens.country}`
    );
    Assert.ok(
      !tokens["tel-area"].includes("**maxlen"),
      `input_attributes stays off when not listed: ${tokens["tel-area"]}`
    );
  });
});
