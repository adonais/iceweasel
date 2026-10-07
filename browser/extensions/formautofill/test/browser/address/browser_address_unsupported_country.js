/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/**
 * Filling a form from a record whose country code has no bundled address
 * metadata.
 *
 * The code is stored but not reported: AddressesBase._recordReadProcessor
 * drops it from every read the JSON store answers, and
 * RustAutofillAddressesAdapter._recordFromRust drops it from every read the
 * Rust store answers. The two have to agree, so that what reaches the page
 * does not depend on which store a profile is on (bug 2071827).
 *
 * Comparing the two stores record by record cannot see this, since both hide
 * the same field from the comparison. Only filling a form and reading the DOM
 * back shows what the difference was ever visible in.
 */

const { FormAutofill } = ChromeUtils.importESModule(
  "resource://autofill/FormAutofill.sys.mjs"
);

// A region ICU can name, so AddressRecord.normalizeFields keeps it on write,
// but one with no bundled address metadata, so it is absent from
// FormAutofill.countries.
const UNSUPPORTED_COUNTRY = "XK";

const TEST_ADDRESS = {
  name: "Arben Krasniqi",
  organization: "Mozilla",
  "street-address": "Rruga B 12",
  "address-level2": "Pristina",
  "postal-code": "10000",
  country: UNSUPPORTED_COUNTRY,
  email: "arben@example.com",
};

// The country control offers the record's own code, so a store that reported
// the code would fill this field rather than leave it on the empty option.
const TEST_FORM = `<form id="form">
  <input id="name" autocomplete="name">
  <input id="organization" autocomplete="organization">
  <input id="street-address" autocomplete="street-address">
  <input id="address-level2" autocomplete="address-level2">
  <input id="postal-code" autocomplete="postal-code">
  <input id="email" autocomplete="email">
  <select id="country" autocomplete="country">
    <option value="">Choose a country</option>
    <option value="XK">Kosovo</option>
    <option value="US">United States</option>
  </select>
  <input type="submit"/>
</form>`;

const EXPECTED_FILL = (({ country: _country, ...rest }) => rest)(TEST_ADDRESS);

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [
      // "detect" would have FormAutofillParent.getRecords drop the record for
      // its region before any of this is reached, on the channels that default
      // to it, and the fill path is what is under test here.
      ["extensions.formautofill.addresses.supported", "on"],
    ],
  });
  Assert.ok(
    !FormAutofill.countries.has(UNSUPPORTED_COUNTRY),
    `${UNSUPPORTED_COUNTRY} has no bundled address metadata`
  );
  registerCleanupFunction(removeAllRecords);
});

add_task(async function test_the_country_field_is_left_alone() {
  await setStorage(TEST_ADDRESS);

  const [saved] = await getAddresses();
  Assert.ok(!("country" in saved), "the stored code is not reported on read");

  const url =
    "https://example.org/document-builder.sjs?html=" +
    encodeURIComponent(TEST_FORM);

  await BrowserTestUtils.withNewTab(url, async browser => {
    await openPopupOn(browser, "#street-address");
    await BrowserTestUtils.synthesizeKey("VK_DOWN", {}, browser);
    await BrowserTestUtils.synthesizeKey("VK_RETURN", {}, browser);
    await waitForAutofill(
      browser,
      "#street-address",
      TEST_ADDRESS["street-address"]
    );

    await SpecialPowers.spawn(browser, [EXPECTED_FILL], expected => {
      for (const [id, value] of Object.entries(expected)) {
        Assert.equal(
          content.document.getElementById(id).value,
          value,
          `${id} is filled`
        );
      }
      Assert.equal(
        content.document.getElementById("country").value,
        "",
        "the country field is left alone, its code being one no store reports"
      );
    });
  });

  await removeAllRecords();
});
