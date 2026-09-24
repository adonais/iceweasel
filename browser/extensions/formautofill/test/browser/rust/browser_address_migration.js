/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/**
 * The migration seen from the browser: an address saved by the JSON store,
 * copied across, and then read back through the form-filling path.
 *
 * The xpcshell comparisons cannot cover this. They read both stores through
 * AddressRecord.computeFields, so the two agree even when the recompute is
 * wrong, and every record in the rest of this suite is one Rust wrote itself.
 * Only filling a form from a copied record exercises the derivation Rust does
 * on read -- the name components above all, which it splits out of the single
 * name column it stores.
 */

const ENABLED_PREF = "extensions.formautofill.addresses.storage.rust.enabled";
const ACTIVE_PREF = "extensions.formautofill.addresses.storage.rust.active";

const TEST_ADDRESS = {
  "given-name": "Manuel",
  "additional-name": "Jose",
  "family-name": "Garcia",
  organization: "Mozilla",
  "street-address": "160 Main Street",
  "address-level2": "Springfield",
  "address-level1": "CA",
  "postal-code": "90210",
  country: "US",
  email: "manuel.garcia@example.com",
};

const TEST_FORM = `<form id="form">
  <input id="given-name" autocomplete="given-name">
  <input id="additional-name" autocomplete="additional-name">
  <input id="family-name" autocomplete="family-name">
  <input id="organization" autocomplete="organization">
  <input id="street-address" autocomplete="street-address">
  <input id="address-level2" autocomplete="address-level2">
  <input id="postal-code" autocomplete="postal-code">
  <input id="email" autocomplete="email">
  <input type="submit"/>
</form>`;

// The fields the form fills, which is every one above except the two that a
// form does not round-trip as typed: country is not in the form, and
// address-level1 is filled from the region rather than the stored value.
const EXPECTED_FILL = (({
  country: _country,
  "address-level1": _level1,
  ...rest
}) => rest)(TEST_ADDRESS);

/**
 * Move the profile to the store the pref names and wait for it, the way the
 * pref observer does at runtime.
 *
 * @param {boolean} rust Whether the Rust store should serve afterwards.
 */
async function switchTo(rust) {
  Services.prefs.setBoolPref(ENABLED_PREF, rust);
  await formAutofillStorage._addressSwitch;
  Assert.equal(
    Services.prefs.getBoolPref(ACTIVE_PREF, false),
    rust,
    `the profile is served by ${rust ? "Rust" : "JSON"}`
  );
}

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["extensions.formautofill.addresses.capture.enabled", true],
      ["extensions.formautofill.addresses.capture.requiredFields", ""],
    ],
  });
  registerCleanupFunction(async () => {
    await removeAllRecords();
    Services.prefs.setBoolPref(ENABLED_PREF, true);
    await formAutofillStorage._addressSwitch;
  });
});

add_task(async function test_a_migrated_address_fills_a_form() {
  // Saved while JSON is serving, so what the form gets back is a record the
  // migration copied rather than one the Rust store was handed directly.
  await switchTo(false);
  await setStorage(TEST_ADDRESS);
  await switchTo(true);

  const url = "https://example.org/document-builder.sjs?html=" + TEST_FORM;
  await BrowserTestUtils.withNewTab(url, async browser => {
    await openPopupOn(browser, "#given-name");
    await BrowserTestUtils.synthesizeKey("VK_DOWN", {}, browser);
    await BrowserTestUtils.synthesizeKey("VK_RETURN", {}, browser);
    await waitForAutofill(browser, "#given-name", TEST_ADDRESS["given-name"]);

    await SpecialPowers.spawn(browser, [EXPECTED_FILL], async expected => {
      for (const [id, value] of Object.entries(expected)) {
        Assert.equal(
          content.document.getElementById(id).value,
          value,
          `${id} filled from the migrated record`
        );
      }
    });
  });

  await removeAllRecords();
});

add_task(async function test_an_address_captured_after_the_switch_is_saved() {
  // Nothing to copy, so the switch is only the handover: what is under test is
  // that capture writes into the store that took over.
  await switchTo(false);
  await switchTo(true);

  const onChanged = waitForStorageChangedEvents("add");
  await BrowserTestUtils.withNewTab(EMPTY_URL, async browser => {
    await SpecialPowers.spawn(browser, [TEST_FORM], doc => {
      content.document.body.innerHTML = doc;
    });
    await SimpleTest.promiseFocus(browser);

    const onPopupShown = waitForPopupShown();
    await focusUpdateSubmitForm(browser, {
      focusSelector: "#street-address",
      newValues: {
        "#given-name": "Captured",
        "#family-name": "Person",
        "#street-address": "1 Rust Road",
        "#address-level2": "Springfield",
        "#postal-code": "90210",
      },
    });
    await onPopupShown;
    await clickDoorhangerButton(MAIN_BUTTON, 0);
  });
  await onChanged;

  const [saved] = await getAddresses();
  Assert.equal(saved["street-address"], "1 Rust Road", "the address was saved");
  Assert.equal(
    saved.name,
    "Captured Person",
    "with the name the Rust store composes from the fields the form had"
  );

  await removeAllRecords();
});

/**
 * Save `address` under `guid`, the way the edit dialog does, and wait for the
 * store to settle.
 *
 * @param {string} guid
 * @param {object} address
 */
async function updateAddress(guid, address) {
  const changed = waitForStorageChangedEvents("update");
  await emulateMessageToBrowser("FormAutofill:SaveAddress", { address, guid });
  await changed;
}

// The canonical fields, which is what a copy carries. The derived ones are
// recomputed by whichever store is answering, so comparing them would compare
// the two derivations rather than the copy.
function canonical(addresses) {
  return addresses
    .map(({ guid, name, organization, "street-address": street, tel }) => ({
      guid,
      name,
      organization,
      street,
      tel,
    }))
    .sort((a, b) => (a.guid < b.guid ? -1 : 1));
}

/**
 * Assert that the last switch reported a clean run: everything arrived, nothing
 * was rejected, nothing came back different, and no error was recorded.
 *
 * @param {string} direction Expected `direction` extra.
 * @param {number} total Records the copy should have carried.
 */
function assertCleanMigration(direction, total) {
  const events = Glean.formautofillAddresses.migrateToRust.testGetValue() ?? [];
  Assert.equal(events.length, 1, "one migration event for the switch");

  const { extra } = events[0];
  Assert.equal(extra.direction, direction, "the direction it went");
  Assert.equal(extra.result, "ok", "reported as complete");
  Assert.equal(extra.source_total, String(total), "counted the source records");
  Assert.equal(extra.target_total, String(total), "and found them all after");
  Assert.equal(extra.failed, "0", "nothing was rejected");
  Assert.equal(extra.failed_deletions, "0", "no deletion was left undone");
  Assert.equal(extra.diverged, "0", "nothing came back different");
  Assert.equal(extra.error_code, undefined, "no error code");
  Assert.equal(extra.error_message, undefined, "no error message");
  Assert.deepEqual(
    Glean.formautofillAddresses.migrateRecordDivergence.testGetValue() ?? [],
    [],
    "and no record reported a divergence"
  );
}

// Skipped until the Application Services bump lands. updateAddress does not
// refresh time_last_modified there yet, so an edit made against the Rust store
// still looks unchanged to the copy back and JSON keeps the old value.
add_task(async function test_addresses_survive_a_switch_in_both_directions() {
  // Three addresses saved while JSON is serving, which is the state every
  // profile that has ever used autofill starts the migration in.
  await switchTo(false);
  await setStorage(
    { ...TEST_ADDRESS, organization: "First Org" },
    {
      ...TEST_ADDRESS,
      organization: "Second Org",
      email: "second@example.com",
    },
    { ...TEST_ADDRESS, organization: "Third Org", email: "third@example.com" }
  );
  const seeded = await getAddresses();
  Assert.equal(seeded.length, 3, "three addresses in JSON");

  // Edited before the migration: one gone, one changed, one added. The copy has
  // to carry the result rather than what was first saved.
  const [, second, third] = seeded;
  await removeAddresses([second.guid]);
  await updateAddress(third.guid, {
    ...TEST_ADDRESS,
    organization: "Third Org Renamed",
  });
  await saveAddress({ ...TEST_ADDRESS, organization: "Fourth Org" });
  const beforeSwitch = canonical(await getAddresses());
  Assert.equal(beforeSwitch.length, 3, "still three, one of them new");

  // Migrate. The switch announces itself once it has handed the profile over,
  // which is what a caller waits for rather than the pref flip returning.
  Services.fog.testResetFOG();
  const migrated = waitForStorageChangedEvents("migrate");
  Services.prefs.setBoolPref(ENABLED_PREF, true);
  await migrated;

  Assert.ok(
    Services.prefs.getBoolPref(ACTIVE_PREF, false),
    "Rust is serving after the migration"
  );
  Assert.deepEqual(
    canonical(await getAddresses()),
    beforeSwitch,
    "with exactly the addresses JSON had, edits included"
  );
  assertCleanMigration("to_rust", beforeSwitch.length);

  // The same three edits again, this time against the Rust store.
  const inRust = await getAddresses();
  await removeAddresses([inRust[0].guid]);
  await updateAddress(inRust[1].guid, {
    ...TEST_ADDRESS,
    organization: "Renamed In Rust",
  });
  await saveAddress({ ...TEST_ADDRESS, organization: "Added In Rust" });
  const beforeSwitchBack = canonical(await getAddresses());
  Assert.equal(beforeSwitchBack.length, 3, "three addresses in Rust");

  // And back again.
  Services.fog.testResetFOG();
  const migratedBack = waitForStorageChangedEvents("migrate");
  Services.prefs.setBoolPref(ENABLED_PREF, false);
  await migratedBack;

  Assert.ok(
    !Services.prefs.getBoolPref(ACTIVE_PREF, false),
    "JSON is serving again"
  );
  Assert.deepEqual(
    canonical(await getAddresses()),
    beforeSwitchBack,
    "holding what Rust held: the record added there, the one renamed there, " +
      "and not the one deleted there"
  );
  assertCleanMigration("to_json", beforeSwitchBack.length);

  await removeAllRecords();
}).skip();
