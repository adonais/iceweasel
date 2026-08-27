/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const PAGE_MANAGE_PERSONAL_INFO = "about:preferences#managePersonalInfo";

const TEST_PASSPORT = {
  "passport-name": "Jane Q Doe",
  "passport-country": "US",
  "passport-number": "X1234567",
  "passport-issue-date-month": "1",
  "passport-issue-date-day": "2",
  "passport-issue-date-year": "2020",
  "passport-expiry-date-month": "3",
  "passport-expiry-date-day": "4",
  "passport-expiry-date-year": "2030",
};

const TEST_PASSPORT_2 = {
  "passport-name": "John P Smith",
  "passport-country": "US",
  "passport-number": "Z7654321",
  "passport-issue-date-month": "5",
  "passport-issue-date-day": "6",
  "passport-issue-date-year": "2019",
  "passport-expiry-date-month": "7",
  "passport-expiry-date-day": "8",
  "passport-expiry-date-year": "2029",
};

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.settings-redesign.enabled", true],
      ["extensions.formautofill.passports.supported", "on"],
      // Passport is the sole "personal info" member type today. Enabling it
      // ticks the "Save and autofill personal info" checkbox and enables the
      // add-passport button.
      ["extensions.formautofill.passports.enabled", true],
    ],
  });
  await formAutofillStorage.initialize();
  await formAutofillStorage.passports.removeAll();
  registerCleanupFunction(() => formAutofillStorage.passports.removeAll());
});

// Resolve with the edit-passport sub-dialog's window once it opens inside the
// given preferences window.
function promiseEditPassportDialog(prefsWin) {
  return new Promise(resolve => {
    prefsWin.gSubDialog._dialogStack.addEventListener(
      "dialogopen",
      function onOpen(evt) {
        const dialogWin = evt.detail.dialog._frame.contentWindow;
        if (!dialogWin.location.href.includes("editPassport")) {
          return;
        }
        prefsWin.gSubDialog._dialogStack.removeEventListener(
          "dialogopen",
          onOpen
        );
        resolve(dialogWin);
      }
    );
  });
}

// Fill the (already open) edit-passport dialog from `record` and save it.
async function fillAndSavePassportDialog(dialogWin, record) {
  await TestUtils.waitForCondition(
    () =>
      dialogWin.document.getElementById("save") &&
      dialogWin.document.querySelector("#passport-issue-date-year")?.options
        .length > 1,
    "edit-passport dialog is ready"
  );

  const doc = dialogWin.document;
  for (const [id, value] of Object.entries(record)) {
    const field = doc.getElementById(id);
    field.value = value;
    field.dispatchEvent(new dialogWin.Event("input", { bubbles: true }));
    // The fields are moz-input-text/moz-select custom elements that render
    // their inner control asynchronously; wait for the update to land so the
    // inner control (and its validity state) reflects the new value before
    // submitting.
    await field.updateComplete;
  }
  doc.getElementById("save").click();
}

add_task(async function test_personalInfoCardVisible() {
  await BrowserTestUtils.withNewTab(
    { gBrowser, url: "about:preferences#passwordsAutofill" },
    async browser => {
      await SpecialPowers.spawn(browser, [], async () => {
        const checkbox = await ContentTaskUtils.waitForCondition(() =>
          content.document.getElementById(
            "setting-control-saveAndFillPersonalInfo"
          )
        );
        ok(
          checkbox,
          "Save and autofill personal info setting-control is present"
        );
      });
    }
  );
});

add_task(
  async function test_personalInfoCategoryHiddenWhenPassportsUnsupported() {
    // The personal info category is only available when a member data type is
    // available. Passport is the only member today, so turning off its
    // availability pref hides the whole "Personal info" section. When all of a
    // group's controls are hidden, `setting-group` marks itself with
    // `data-hidden-by-setting-group`.
    await SpecialPowers.pushPrefEnv({
      set: [["extensions.formautofill.passports.supported", "off"]],
    });

    await BrowserTestUtils.withNewTab(
      { gBrowser, url: "about:preferences#passwordsAutofill" },
      async browser => {
        await SpecialPowers.spawn(browser, [], async () => {
          // "Save logins" has no availability gate, so wait on it to confirm the
          // pane has finished rendering before asserting the states below.
          await ContentTaskUtils.waitForCondition(
            () =>
              content.document.getElementById("setting-control-savePasswords"),
            "passwordsAutofill pane rendered"
          );
          await ContentTaskUtils.waitForCondition(
            () =>
              content.document
                .querySelector('setting-group[groupid="personalInfo"]')
                ?.hasAttribute("data-hidden-by-setting-group"),
            "Personal info section is hidden when no member type is supported"
          );
        });
      }
    );

    await SpecialPowers.popPrefEnv();
  }
);

add_task(
  async function test_personalInfoCategoryVisibleWhenPassportsSupported() {
    // With a member type available, the "Personal info" section is shown.
    await SpecialPowers.pushPrefEnv({
      set: [["extensions.formautofill.passports.supported", "on"]],
    });

    await BrowserTestUtils.withNewTab(
      { gBrowser, url: "about:preferences#passwordsAutofill" },
      async browser => {
        await SpecialPowers.spawn(browser, [], async () => {
          // Wait for the section's checkbox to render and be visible so the
          // group's visibility has settled before asserting.
          await ContentTaskUtils.waitForCondition(() => {
            const checkbox = content.document.getElementById(
              "setting-control-saveAndFillPersonalInfo"
            );
            return checkbox && !checkbox.hidden;
          }, "Personal info checkbox is visible when passports are supported");
          ok(
            !content.document
              .querySelector('setting-group[groupid="personalInfo"]')
              .hasAttribute("data-hidden-by-setting-group"),
            "Personal info section is visible when a member type is supported"
          );
        });
      }
    );

    await SpecialPowers.popPrefEnv();
  }
);

add_task(async function test_personalInfoCheckboxReflectsMemberPrefs() {
  // The checkbox has no dedicated pref. It is checked whenever any member type's
  // `.enabled` pref is true (passport is the only member today).
  await SpecialPowers.pushPrefEnv({
    set: [["extensions.formautofill.passports.enabled", false]],
  });

  await BrowserTestUtils.withNewTab(
    { gBrowser, url: "about:preferences#passwordsAutofill" },
    async browser => {
      const prefsWin = browser.contentWindow;
      const control = await TestUtils.waitForCondition(() =>
        prefsWin.document.getElementById(
          "setting-control-saveAndFillPersonalInfo"
        )
      );
      await control.updateComplete;
      is(
        control.controlEl.checked,
        false,
        "checkbox is unchecked when no member type is enabled"
      );

      // Enabling a member type externally ticks the checkbox.
      await SpecialPowers.pushPrefEnv({
        set: [["extensions.formautofill.passports.enabled", true]],
      });
      await TestUtils.waitForCondition(
        () => control.controlEl.checked,
        "checkbox becomes checked when a member type is enabled"
      );
      await SpecialPowers.popPrefEnv();
    }
  );

  await SpecialPowers.popPrefEnv();
});

add_task(async function test_personalInfoCheckboxWritesMemberPrefs() {
  // Toggling the checkbox writes the `.enabled` pref of every member type.
  await SpecialPowers.pushPrefEnv({
    set: [["extensions.formautofill.passports.enabled", false]],
  });

  await BrowserTestUtils.withNewTab(
    { gBrowser, url: "about:preferences#passwordsAutofill" },
    async browser => {
      const prefsWin = browser.contentWindow;
      const control = await TestUtils.waitForCondition(() =>
        prefsWin.document.getElementById(
          "setting-control-saveAndFillPersonalInfo"
        )
      );
      await control.updateComplete;
      const checkbox = control.controlEl;
      is(checkbox.checked, false, "checkbox starts unchecked");

      checkbox.inputEl.scrollIntoView({ block: "center" });
      EventUtils.synthesizeMouseAtCenter(checkbox.inputEl, {}, prefsWin);
      await TestUtils.waitForCondition(
        () =>
          Services.prefs.getBoolPref(
            "extensions.formautofill.passports.enabled",
            false
          ),
        "checking the box enables the member type's autofill"
      );

      EventUtils.synthesizeMouseAtCenter(checkbox.inputEl, {}, prefsWin);
      await TestUtils.waitForCondition(
        () =>
          !Services.prefs.getBoolPref(
            "extensions.formautofill.passports.enabled",
            true
          ),
        "unchecking the box disables the member type's autofill"
      );
    }
  );

  await SpecialPowers.popPrefEnv();
});

add_task(async function test_managePersonalInfoEmptyState() {
  await BrowserTestUtils.withNewTab(
    { gBrowser, url: PAGE_MANAGE_PERSONAL_INFO },
    async browser => {
      await SpecialPowers.spawn(browser, [], async () => {
        const page = await ContentTaskUtils.waitForCondition(
          () =>
            content.document.querySelector(
              '[data-category="paneManagePersonalInfo"]'
            ),
          "Manage personal info pane exists"
        );
        await ContentTaskUtils.waitForCondition(
          () => page && !page.hidden,
          "Manage personal info pane is visible"
        );
        // With no stored passports the list renders its empty state.
        await ContentTaskUtils.waitForCondition(
          () => content.document.querySelector("#no-passports-stored"),
          "Empty-state 'No passports added' item rendered"
        );
        ok(
          !content.document.querySelector("#passport-item"),
          "No passport list items are shown in the empty state"
        );
      });
    }
  );
});

add_task(async function test_addPassportThroughUI() {
  await BrowserTestUtils.withNewTab(
    { gBrowser, url: PAGE_MANAGE_PERSONAL_INFO },
    async browser => {
      const prefsWin = browser.contentWindow;
      const addButton = await TestUtils.waitForCondition(
        () => prefsWin.document.getElementById("add-passport-button"),
        "Add-passport button present"
      );

      await withStorageChange("add", async () => {
        const dialogShown = promiseEditPassportDialog(prefsWin);
        addButton.click();
        const dialogWin = await dialogShown;
        await fillAndSavePassportDialog(dialogWin, TEST_PASSPORT);
      });

      const all = await formAutofillStorage.passports.getAll();
      Assert.equal(all.length, 1, "one passport stored after UI add");
      Assert.equal(
        all[0]["passport-name"],
        TEST_PASSPORT["passport-name"],
        "name persisted to the Rust store"
      );
      Assert.equal(
        all[0]["passport-number"],
        TEST_PASSPORT["passport-number"],
        "number persisted to the Rust store"
      );

      await TestUtils.waitForCondition(
        () => prefsWin.document.querySelector("#passport-item"),
        "new passport appears in the list"
      );

      await formAutofillStorage.passports.removeAll();
    }
  );
});

add_task(async function test_listReflectsStoredPassport() {
  await formAutofillStorage.passports.add(TEST_PASSPORT);

  await BrowserTestUtils.withNewTab(
    { gBrowser, url: PAGE_MANAGE_PERSONAL_INFO },
    async browser => {
      const prefsWin = browser.contentWindow;
      const item = await TestUtils.waitForCondition(
        () => prefsWin.document.querySelector("#passport-item"),
        "stored passport rendered in the list"
      );
      is(
        item.getAttribute("label"),
        "Jane Q Doe",
        "list item label shows the passport name"
      );
      is(
        item.getAttribute("description"),
        "****4567, 03/04/2030",
        "list item description shows masked number and expiry"
      );
      is(
        prefsWin.document.querySelectorAll("#passport-item").length,
        1,
        "exactly one list item for one stored passport"
      );
    }
  );

  await formAutofillStorage.passports.removeAll();
});

add_task(async function test_editPassportThroughUI() {
  const guid = await formAutofillStorage.passports.add(TEST_PASSPORT);

  await BrowserTestUtils.withNewTab(
    { gBrowser, url: PAGE_MANAGE_PERSONAL_INFO },
    async browser => {
      const prefsWin = browser.contentWindow;
      const editButton = await TestUtils.waitForCondition(
        () =>
          prefsWin.document.querySelector(
            `moz-button[action="edit"][guid="${guid}"]`
          ),
        "edit button for the stored passport"
      );

      await withStorageChange("update", async () => {
        const dialogShown = promiseEditPassportDialog(prefsWin);
        editButton.click();
        const dialogWin = await dialogShown;
        await fillAndSavePassportDialog(dialogWin, {
          ...TEST_PASSPORT,
          "passport-number": "Y7654321",
        });
      });

      const record = await formAutofillStorage.passports.get(guid);
      Assert.equal(
        record["passport-number"],
        "Y7654321",
        "edited number persisted to the Rust store"
      );
    }
  );

  await formAutofillStorage.passports.removeAll();
});

add_task(async function test_removePassportThroughUI() {
  await formAutofillStorage.passports.add(TEST_PASSPORT);
  const [{ guid }] = await formAutofillStorage.passports.getAll();

  await BrowserTestUtils.withNewTab(
    { gBrowser, url: PAGE_MANAGE_PERSONAL_INFO },
    async browser => {
      const prefsWin = browser.contentWindow;
      const removeButton = await TestUtils.waitForCondition(
        () =>
          prefsWin.document.querySelector(
            `moz-button[action="remove"][guid="${guid}"]`
          ),
        "remove button for the stored passport"
      );

      const confirmed = BrowserTestUtils.promiseAlertDialog("accept");

      await withStorageChange("remove", async () => {
        removeButton.click();
        await confirmed;
      });

      Assert.ok(
        await formAutofillStorage.passports.isEmpty(),
        "passport removed from the Rust store"
      );

      await TestUtils.waitForCondition(
        () => prefsWin.document.querySelector("#no-passports-stored"),
        "empty state shown after removal"
      );
    }
  );
});

add_task(async function test_listReflectsMultipleStoredPassports() {
  await formAutofillStorage.passports.add(TEST_PASSPORT);
  await formAutofillStorage.passports.add(TEST_PASSPORT_2);

  await BrowserTestUtils.withNewTab(
    { gBrowser, url: PAGE_MANAGE_PERSONAL_INFO },
    async browser => {
      const prefsWin = browser.contentWindow;
      await TestUtils.waitForCondition(
        () => prefsWin.document.querySelectorAll("#passport-item").length == 2,
        "both stored passports rendered in the list"
      );

      // Match by label so the assertions don't depend on list ordering.
      const byLabel = new Map(
        [...prefsWin.document.querySelectorAll("#passport-item")].map(item => [
          item.getAttribute("label"),
          item.getAttribute("description"),
        ])
      );

      is(
        byLabel.get("Jane Q Doe"),
        "****4567, 03/04/2030",
        "first passport shows masked number and expiry"
      );
      is(
        byLabel.get("John P Smith"),
        "****4321, 07/08/2029",
        "second passport shows masked number and expiry"
      );
    }
  );

  await formAutofillStorage.passports.removeAll();
});

add_task(async function test_listReflectsExternalStorageChange() {
  await BrowserTestUtils.withNewTab(
    { gBrowser, url: PAGE_MANAGE_PERSONAL_INFO },
    async browser => {
      const prefsWin = browser.contentWindow;

      // The subpage opens in its empty state.
      await TestUtils.waitForCondition(
        () => prefsWin.document.querySelector("#no-passports-stored"),
        "empty state shown before any passport is stored"
      );

      // A passport written directly to storage (not through the UI) should
      // appear in the already-open subpage via formautofill-storage-changed.
      await withStorageChange("add", () =>
        formAutofillStorage.passports.add(TEST_PASSPORT)
      );
      await TestUtils.waitForCondition(
        () => prefsWin.document.querySelector("#passport-item"),
        "externally added passport appears without reloading the subpage"
      );
      is(
        prefsWin.document.querySelectorAll("#passport-item").length,
        1,
        "one list item after external add"
      );

      // Clearing storage externally returns the list to its empty state.
      await withStorageChange("removeAll", () =>
        formAutofillStorage.passports.removeAll()
      );
      await TestUtils.waitForCondition(
        () => prefsWin.document.querySelector("#no-passports-stored"),
        "empty state restored after external removal"
      );
      ok(
        !prefsWin.document.querySelector("#passport-item"),
        "no list items remain after external removal"
      );
    }
  );
});
