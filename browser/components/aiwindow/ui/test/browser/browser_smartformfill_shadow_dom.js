/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/* import-globals-from head_smartformfill_autocomplete.js */
Services.scriptloader.loadSubScript(
  getRootDirectory(gTestPath) + "head_smartformfill_autocomplete.js",
  this
);

const SHADOW_DOM_TEST_URL =
  "https://example.com/browser/browser/components/aiwindow/ui/test/browser/test_smartformfill_shadow_dom.html";

async function waitForFocusedShadowForm(browser, selector, check, message) {
  await SpecialPowers.spawn(browser, [selector], async fieldSelector => {
    const input = content.document
      .querySelector("#form-host")
      .shadowRoot.querySelector(fieldSelector);
    const autocompleteActor =
      input.documentGlobal.windowGlobalChild.getActor("AutoComplete");

    await ContentTaskUtils.waitForCondition(
      () =>
        [...autocompleteActor.providersByInput(input)].some(
          provider => provider.actorName === "SmartFormFill"
        ),
      "Waiting for Smart Form Fill to register for the shadow-root field"
    );

    input.focus();
  });

  const actor = getSmartFormFillActor(browser);
  let formData;
  await TestUtils.waitForCondition(async () => {
    formData = await actor.sendQuery("SmartFormFill:GetFocusedForm");
    return formData && check(formData);
  }, message);

  return formData;
}

describe("Smart Form Fill shadow DOM integration", () => {
  let browser;
  let initialFields;
  let initialFormId;
  let testContext;

  beforeEach(async () => {
    testContext = await setupSmartFormFillAutocompleteTest();
    browser = testContext.win.gBrowser.selectedBrowser;

    await promiseNavigateAndLoad(browser, SHADOW_DOM_TEST_URL);

    const initialFormData = await waitForFocusedShadowForm(
      browser,
      "#shadow-email",
      data => getFieldsByName(data).has("shadowEmail"),
      "Smart Form Fill should detect the initial shadow-root form"
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

  it("detects fields in an open shadow root", () => {
    Assert.equal(
      initialFields.size,
      1,
      "The shadow-root field should be detected"
    );
    Assert.equal(
      initialFields.get("shadowEmail").label,
      "Shadow email",
      "The shadow-root field label should be detected"
    );
    Assert.equal(
      initialFields.get("shadowEmail").inputType,
      "email",
      "The shadow-root field type should be serialized"
    );
  });

  it("detects a field added inside the shadow root", async () => {
    await SpecialPowers.spawn(browser, [], () => {
      const form = content.document
        .querySelector("#form-host")
        .shadowRoot.querySelector("form");
      const label = content.document.createElement("label");
      label.htmlFor = "shadow-phone";
      label.textContent = "Shadow phone";

      const input = content.document.createElement("input");
      input.id = "shadow-phone";
      input.name = "shadowPhone";
      input.type = "tel";
      input.autocomplete = "tel";

      form.append(label, input);
    });

    const formData = await waitForFocusedShadowForm(
      browser,
      "#shadow-phone",
      data => getFieldsByName(data).has("shadowPhone"),
      "Smart Form Fill should detect a field added inside a shadow root"
    );
    const fields = getFieldsByName(formData);

    Assert.equal(
      formData.id,
      initialFormId,
      "The added shadow-root field should join the existing form"
    );
    Assert.equal(
      fields.get("shadowEmail").id,
      initialFields.get("shadowEmail").id,
      "The original shadow-root field ID should remain stable"
    );
    Assert.equal(
      fields.get("shadowPhone").inputType,
      "tel",
      "The added shadow-root field should be serialized"
    );
  });

  describe("when an open shadow root is added dynamically", () => {
    let dynamicFields;
    let dynamicFormId;

    beforeEach(async () => {
      await SpecialPowers.spawn(browser, [], () => {
        content.document.querySelector("#form-host").remove();

        const host = content.document.createElement("div");
        host.id = "form-host";

        const shadowRoot = host.attachShadow({ mode: "open" });
        const form = content.document.createElement("form");
        const label = content.document.createElement("label");
        label.htmlFor = "dynamic-email";
        label.textContent = "Dynamic email";

        const input = content.document.createElement("input");
        input.id = "dynamic-email";
        input.name = "dynamicEmail";
        input.type = "email";
        input.autocomplete = "email";

        label.append(input);
        form.append(label);
        shadowRoot.append(form);
        content.document.body.append(host);
      });

      const dynamicFormData = await waitForFocusedShadowForm(
        browser,
        "#dynamic-email",
        data => getFieldsByName(data).has("dynamicEmail"),
        "Smart Form Fill should detect a dynamically added shadow root"
      );

      dynamicFormId = dynamicFormData.id;
      dynamicFields = getFieldsByName(dynamicFormData);
    });

    it("detects its existing fields", () => {
      Assert.notEqual(
        dynamicFormId,
        initialFormId,
        "The dynamically added shadow form should receive a distinct form ID"
      );
      Assert.equal(
        dynamicFields.size,
        1,
        "The dynamically added shadow form should contain one field"
      );
      Assert.equal(
        dynamicFields.get("dynamicEmail").label,
        "Dynamic email",
        "The dynamically added shadow field should be serialized"
      );
    });

    it("observes fields added inside it", async () => {
      await SpecialPowers.spawn(browser, [], () => {
        const form = content.document
          .querySelector("#form-host")
          .shadowRoot.querySelector("form");
        const label = content.document.createElement("label");
        label.htmlFor = "dynamic-phone";
        label.textContent = "Dynamic phone";

        const input = content.document.createElement("input");
        input.id = "dynamic-phone";
        input.name = "dynamicPhone";
        input.type = "tel";
        input.autocomplete = "tel";

        label.append(input);
        form.append(label);
      });

      const updatedFormData = await waitForFocusedShadowForm(
        browser,
        "#dynamic-phone",
        data => getFieldsByName(data).has("dynamicPhone"),
        "Smart Form Fill should observe the dynamically added shadow root"
      );
      const updatedFields = getFieldsByName(updatedFormData);

      Assert.equal(
        updatedFormData.id,
        dynamicFormId,
        "The shadow form ID should remain stable after its contents change"
      );
      Assert.equal(
        updatedFields.get("dynamicEmail").id,
        dynamicFields.get("dynamicEmail").id,
        "The original dynamic shadow field ID should remain stable"
      );
      Assert.equal(
        updatedFields.get("dynamicPhone").inputType,
        "tel",
        "The later shadow-root field should be serialized"
      );
    });
  });
});
