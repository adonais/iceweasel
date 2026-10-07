/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/* import-globals-from head_smartformfill_autocomplete.js */
Services.scriptloader.loadSubScript(
  getRootDirectory(gTestPath) + "head_smartformfill_autocomplete.js",
  this
);

const MUTATION_TEST_URL =
  "https://example.com/browser/browser/components/aiwindow/ui/test/browser/test_smartformfill.html";

describe("Smart Form Fill mutations", () => {
  let browser;
  let initialFields;
  let initialFormId;
  let testContext;

  beforeEach(async () => {
    testContext = await setupSmartFormFillAutocompleteTest();
    browser = testContext.win.gBrowser.selectedBrowser;

    await promiseNavigateAndLoad(browser, MUTATION_TEST_URL);

    const initialFormData = await waitForFocusedForm(
      browser,
      "#first-name",
      data => data.fields.length === 2,
      "Smart Form Fill should detect the initial form"
    );

    initialFormId = initialFormData.id;
    initialFields = getFieldsByName(initialFormData);
  });

  afterEach(async () => {
    if (testContext) {
      await cleanupSmartFormFillAutocompleteTest(testContext);
      testContext = null;
    }
  });

  it("detects a field added to an existing form", async () => {
    await SpecialPowers.spawn(browser, [], () => {
      const form = content.document.querySelector("#profile-form");
      const label = content.document.createElement("label");
      label.htmlFor = "company";
      label.textContent = "Company";

      const input = content.document.createElement("input");
      input.id = "company";
      input.name = "company";
      input.autocomplete = "organization";

      form.append(label, input);
    });

    const formData = await waitForFocusedForm(
      browser,
      "#company",
      data => getFieldsByName(data).has("company"),
      "Smart Form Fill should detect a field added to an existing form"
    );
    const fields = getFieldsByName(formData);

    Assert.equal(
      formData.id,
      initialFormId,
      "The added field should join the existing form"
    );
    Assert.equal(
      fields.get("firstName").id,
      initialFields.get("firstName").id,
      "The first-name field ID should remain stable"
    );
    Assert.equal(
      fields.get("email").id,
      initialFields.get("email").id,
      "The email field ID should remain stable"
    );
    Assert.equal(
      fields.get("company").autocomplete,
      "organization",
      "The added field should be serialized"
    );
  });

  it("detects a field removed from an existing form", async () => {
    await SpecialPowers.spawn(browser, [], () => {
      content.document.querySelector('label[for="first-name"]').remove();
      content.document.querySelector("#first-name").remove();
    });

    const formData = await waitForFocusedForm(
      browser,
      "#email",
      data => !getFieldsByName(data).has("firstName"),
      "Smart Form Fill should detect a removed field"
    );
    const fields = getFieldsByName(formData);

    Assert.equal(
      formData.id,
      initialFormId,
      "The existing form ID should remain stable"
    );
    Assert.equal(fields.size, 1, "The form should contain one field");
    Assert.equal(
      fields.get("email").id,
      initialFields.get("email").id,
      "The remaining email field ID should stay stable"
    );
  });

  it("removes an empty form before registering new fields", async () => {
    const actor = getSmartFormFillActor(browser);
    const receiveMessageSpy = sinon.spy(actor, "receiveMessage");

    try {
      await SpecialPowers.spawn(browser, [], () => {
        content.document.querySelector("#profile-form").replaceChildren();
      });

      await TestUtils.waitForCondition(
        () =>
          receiveMessageSpy.getCalls().some(({ args: [{ data, name }] }) => {
            return (
              name === "SmartFormFill:FormUpdate" &&
              Array.isArray(data) &&
              data.every(formData => formData.id !== initialFormId)
            );
          }),
        "Smart Form Fill should report that the emptied form was removed"
      );
    } finally {
      receiveMessageSpy.restore();
    }

    await SpecialPowers.spawn(browser, [], () => {
      const form = content.document.querySelector("#profile-form");
      const label = content.document.createElement("label");
      label.htmlFor = "replacement";
      label.textContent = "Replacement";

      const input = content.document.createElement("input");
      input.id = "replacement";
      input.name = "replacement";

      form.append(label, input);
    });

    const formData = await waitForFocusedForm(
      browser,
      "#replacement",
      data => getFieldsByName(data).has("replacement"),
      "Smart Form Fill should register a field added to an emptied form"
    );
    const fields = getFieldsByName(formData);

    Assert.notEqual(
      formData.id,
      initialFormId,
      "The replacement field should belong to a newly registered form"
    );
    Assert.equal(
      fields.size,
      1,
      "The newly registered form should contain one field"
    );
    Assert.equal(
      fields.get("replacement").inputType,
      "text",
      "The replacement field should be serialized"
    );
  });

  it("detects a newly added form", async () => {
    await SpecialPowers.spawn(browser, [], () => {
      const form = content.document.createElement("form");
      form.id = "phone-form";

      const label = content.document.createElement("label");
      label.htmlFor = "phone";
      label.textContent = "Phone";

      const input = content.document.createElement("input");
      input.id = "phone";
      input.name = "phone";
      input.type = "tel";
      input.autocomplete = "tel";

      form.append(label, input);
      content.document.body.append(form);
    });

    const formData = await waitForFocusedForm(
      browser,
      "#phone",
      data => getFieldsByName(data).has("phone"),
      "Smart Form Fill should detect a dynamically added form"
    );
    const fields = getFieldsByName(formData);

    Assert.notEqual(
      formData.id,
      initialFormId,
      "The newly added form should receive a distinct form ID"
    );
    Assert.equal(fields.size, 1, "The new form should contain one field");
    Assert.equal(
      fields.get("phone").inputType,
      "tel",
      "The new form's field should be serialized"
    );
  });

  describe("when the form meets the minimum field requirement", () => {
    beforeEach(async () => {
      const actor = getSmartFormFillActor(browser);

      // Raise the minimum past what the form has, so it starts out unoffered.
      await SpecialPowers.pushPrefEnv({ set: [[MIN_FORM_FIELDS_PREF, 3]] });

      Assert.equal(
        await actor.sendQuery("SmartFormFill:GetFocusedForm"),
        null,
        "A form with fewer fields than the minimum should not be offered"
      );

      await SpecialPowers.spawn(browser, [], () => {
        const input = content.document.createElement("input");
        input.id = "company";
        input.name = "company";

        content.document.querySelector("#profile-form").append(input);
      });
    });

    afterEach(async () => {
      await SpecialPowers.popPrefEnv();
    });

    it("offers a form", async () => {
      const formData = await waitForFocusedForm(
        browser,
        "#company",
        data => getFieldsByName(data).has("company"),
        "Smart Form Fill should offer the form once it has enough fields"
      );

      Assert.equal(
        formData.id,
        initialFormId,
        "Reaching the minimum should not change the form ID"
      );
    });
  });

  describe("when too few of the form's fields are visible", () => {
    let actor;

    beforeEach(async () => {
      actor = getSmartFormFillActor(browser);

      // The form has exactly the minimum, so hiding one field takes it below.
      await SpecialPowers.pushPrefEnv({ set: [[MIN_FORM_FIELDS_PREF, 2]] });

      Assert.equal(
        (await actor.sendQuery("SmartFormFill:GetFocusedForm"))?.id,
        initialFormId,
        "The form should be offered while both of its fields are visible"
      );

      await SpecialPowers.spawn(browser, [], () => {
        content.document.querySelector("#email").style.display = "none";
      });
    });

    afterEach(async () => {
      await SpecialPowers.popPrefEnv();
    });

    it("stops offering the form", async () => {
      // Hiding a field with CSS reports no mutation, so this answer cannot be
      // one cached when the form was registered.
      Assert.equal(
        await actor.sendQuery("SmartFormFill:GetFocusedForm"),
        null,
        "Hiding a field should stop the form being offered"
      );
    });
  });

  it("detects fields after the document element is replaced", async () => {
    // Frameworks that hydrate the whole document, such as Remix, replace
    // documentElement when hydration mismatches, which detaches every field
    // the initial detection found.
    await SpecialPowers.spawn(browser, [], () => {
      const doc = content.document;
      doc.replaceChild(
        doc.documentElement.cloneNode(true),
        doc.documentElement
      );
    });

    const formData = await waitForFocusedForm(
      browser,
      "#first-name",
      data => getFieldsByName(data).has("firstName"),
      "Smart Form Fill should detect fields in a replaced document element"
    );
    const fields = getFieldsByName(formData);

    Assert.notEqual(
      formData.id,
      initialFormId,
      "The replacement fields should belong to a newly registered form"
    );
    Assert.deepEqual(
      [...fields.keys()],
      ["firstName", "email"],
      "Both replacement fields should be serialized"
    );
  });

  it("detects rapidly added fields", async () => {
    const addedFieldNames = ["rapidFirst", "rapidSecond", "rapidThird"];

    await SpecialPowers.spawn(browser, [addedFieldNames], async names => {
      const form = content.document.querySelector("#profile-form");

      for (const name of names) {
        const label = content.document.createElement("label");
        label.htmlFor = name;
        label.textContent = name;

        const input = content.document.createElement("input");
        input.id = name;
        input.name = name;

        form.append(label, input);

        await new Promise(resolve => content.setTimeout(resolve, 5));
      }
    });

    const formData = await waitForFocusedForm(
      browser,
      "#rapidThird",
      data => {
        const fields = getFieldsByName(data);
        return addedFieldNames.every(name => fields.has(name));
      },
      "Smart Form Fill should detect all rapidly added fields"
    );
    const fields = getFieldsByName(formData);

    Assert.equal(
      formData.id,
      initialFormId,
      "The rapidly added fields should join the existing form"
    );
    Assert.ok(
      addedFieldNames.every(name => fields.has(name)),
      "Every rapidly added field should be serialized"
    );
  });
});
