/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/* import-globals-from head_smartformfill_autocomplete.js */
Services.scriptloader.loadSubScript(
  getRootDirectory(gTestPath) + "head_smartformfill_autocomplete.js",
  this
);

const INITIAL_FORM_URL =
  "https://example.com/browser/browser/components/aiwindow/ui/test/browser/test_smartformfill.html";
const FORMLESS_FIELDS_URL =
  "https://example.com/browser/browser/components/aiwindow/ui/test/browser/test_smartformfill_formless_fields.html";
const MULTIPLE_FORMS_URL =
  "https://example.com/browser/browser/components/aiwindow/ui/test/browser/test_smartformfill_multiple_forms.html";
const POPULATED_FIELDS_URL =
  "https://example.com/browser/browser/components/aiwindow/ui/test/browser/test_smartformfill_populated_fields.html";
const SUPPORTED_FIELDS_URL =
  "https://example.com/browser/browser/components/aiwindow/ui/test/browser/test_smartformfill_supported_fields.html";

async function prepareSmartFormFillActor(browser) {
  const actor = getSmartFormFillActor(browser);
  await actor.sendQuery("SmartFormFill:GetFocusedForm");
}

async function captureClassificationRequest(win, selector, mockEngineManager) {
  const { browser, popup } = await openLoadingAutocomplete(win, selector);

  try {
    const { requestDataBySchema } = await waitForMetadataAndUpdatedRow(
      popup,
      mockEngineManager,
      [FIELD_CLASSIFICATION_SCHEMA, RELEVANT_TABS_SCHEMA],
      null,
      []
    );
    return requestDataBySchema.get(FIELD_CLASSIFICATION_SCHEMA);
  } finally {
    await closeAutocomplete(browser);
  }
}

describe("Smart Form Fill initialization", () => {
  describe("outside a Smart Window", () => {
    let normalTab;

    beforeEach(async () => {
      await SpecialPowers.pushPrefEnv({
        set: [[SMART_FORM_FILL_PREF, true]],
      });
      normalTab = await BrowserTestUtils.openNewForegroundTab(
        gBrowser,
        INITIAL_FORM_URL
      );
    });

    afterEach(async () => {
      await BrowserTestUtils.removeTab(normalTab);
      normalTab = null;
      await SpecialPowers.popPrefEnv();
    });

    it("does not register fields", async () => {
      const normalBrowser = normalTab.linkedBrowser;

      await prepareSmartFormFillActor(normalBrowser);

      Assert.ok(
        !(await hasSmartFormFillProvider(normalBrowser, "#first-name")),
        "A normal browser field should not register Smart Form Fill"
      );
    });
  });

  describe("inside a Smart Window", () => {
    let browser;
    let context;
    let mockEngineManager;
    let win;

    beforeEach(async () => {
      context = await setupSmartFormFillAutocompleteTest();
      ({ mockEngineManager, win } = context);
      browser = win.gBrowser.selectedBrowser;
    });

    afterEach(async () => {
      await cleanupSmartFormFillAutocompleteTest(context);
      browser = null;
      context = null;
      mockEngineManager = null;
      win = null;
    });

    describe("in a disallowed region", () => {
      let originalRegion;

      beforeEach(async () => {
        originalRegion = Region.home;
        Region._setHomeRegion("ZZ", false);
        await SpecialPowers.pushPrefEnv({
          set: [["browser.smartwindow.smartformfill.disallowedRegions", "ZZ"]],
        });
        await promiseNavigateAndLoad(browser, INITIAL_FORM_URL);
      });

      afterEach(async () => {
        await SpecialPowers.popPrefEnv();
        Region._setHomeRegion(originalRegion, false);
      });

      it("does not register fields", async () => {
        await prepareSmartFormFillActor(browser);

        Assert.ok(
          !(await hasSmartFormFillProvider(browser, "#first-name")),
          "A field in a disallowed region should not register Smart Form Fill"
        );
      });
    });

    describe("in an allowed region", () => {
      it("classifies the forms present in the loaded document", async () => {
        await promiseNavigateAndLoad(browser, INITIAL_FORM_URL);

        const request = await captureClassificationRequest(
          win,
          "#first-name",
          mockEngineManager
        );
        const fields = new Map(
          request.fields.map(field => [field.name, field])
        );

        Assert.deepEqual(
          [...fields.keys()],
          ["firstName", "email"],
          "The loaded form should provide both fields for classification"
        );
        Assert.equal(
          fields.get("firstName").label,
          "First name",
          "The first-name label should be serialized"
        );
        Assert.equal(
          fields.get("firstName").inputType,
          "text",
          "The text input type should be serialized"
        );
        Assert.equal(
          fields.get("email").label,
          "Email address",
          "The email label should be serialized"
        );
        Assert.equal(
          fields.get("email").placeholder,
          "name@example.com",
          "The email placeholder should be serialized"
        );
      });

      it("only registers and classifies supported fields", async () => {
        await promiseNavigateAndLoad(browser, SUPPORTED_FIELDS_URL);
        await waitForSmartFormFillProvider(browser, "#search");

        for (const selector of ["#search", "#number", "#month", "#notes"]) {
          Assert.ok(
            await hasSmartFormFillProvider(browser, selector),
            `${selector} should register Smart Form Fill`
          );
        }

        for (const selector of ["#password", "#checkbox", "#date"]) {
          Assert.ok(
            !(await hasSmartFormFillProvider(browser, selector)),
            `${selector} should not register Smart Form Fill`
          );
        }

        const request = await captureClassificationRequest(
          win,
          "#search",
          mockEngineManager
        );

        Assert.deepEqual(
          request.fields.map(field => field.name),
          ["search", "number", "month", "notes"],
          "Only supported fields should be classified"
        );
      });

      it("does not expose populated field values", async () => {
        await promiseNavigateAndLoad(browser, POPULATED_FIELDS_URL);

        const request = await captureClassificationRequest(
          win,
          "#empty-email",
          mockEngineManager
        );
        const populatedField = request.fields.find(
          field => field.name === "populatedName"
        );

        Assert.ok(populatedField, "The populated field should be classified");
        Assert.ok(
          !Object.hasOwn(populatedField, "value"),
          "The populated value should not be serialized"
        );
        Assert.ok(
          !JSON.stringify(request).includes("Sensitive Existing Value"),
          "The classification request should not contain the populated value"
        );
      });

      it("classifies separate forms independently", async () => {
        await promiseNavigateAndLoad(browser, MULTIPLE_FORMS_URL);

        const contactRequest = await captureClassificationRequest(
          win,
          "#full-name",
          mockEngineManager
        );
        const addressRequest = await captureClassificationRequest(
          win,
          "#address",
          mockEngineManager
        );

        Assert.deepEqual(
          contactRequest.fields.map(field => field.name),
          ["fullName"],
          "The contact form should be classified independently"
        );
        Assert.deepEqual(
          addressRequest.fields.map(field => field.name),
          ["address"],
          "The address form should be classified independently"
        );
        Assert.notEqual(
          contactRequest.fields[0].id,
          addressRequest.fields[0].id,
          "Fields from separate forms should have distinct IDs"
        );
      });

      it("classifies fields without a wrapping form", async () => {
        await promiseNavigateAndLoad(browser, FORMLESS_FIELDS_URL);

        const request = await captureClassificationRequest(
          win,
          "#unowned-email",
          mockEngineManager
        );
        const fields = new Map(
          request.fields.map(field => [field.name, field])
        );

        Assert.deepEqual(
          [...fields.keys()],
          ["unownedEmail", "unownedNotes"],
          "Formless fields should be classified together"
        );
        Assert.equal(
          fields.get("unownedEmail").label,
          "Email address",
          "The form-less email label should be serialized"
        );
        Assert.equal(
          fields.get("unownedNotes").label,
          "Notes",
          "The form-less textarea label should be serialized"
        );
      });
    });
  });
});
