/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/* import-globals-from head_smartformfill_autocomplete.js */
Services.scriptloader.loadSubScript(
  getRootDirectory(gTestPath) + "head_smartformfill_autocomplete.js",
  this
);

/**
 * Responds to the pending value-generation request with test values.
 *
 * @param {MockEngineManager} mockEngineManager Mock model manager.
 */
async function respondWithGeneratedValues(mockEngineManager) {
  const { request, respond } = await mockEngineManager.captureRequest({
    purpose: SMART_FORM_FILL_MODEL_PURPOSE,
  });
  const schemaName = getModelRequestSchema(request);

  Assert.equal(
    schemaName,
    FORM_VALUES_SCHEMA,
    "The autofill action should request generated form values"
  );

  const requestData = getModelRequestData(request);
  respond(
    JSON.stringify({
      fields: requestData.fields.map(field => ({
        id: field.id,
        action: "generate",
        value:
          field.inputType === "email" ? "email@email.com" : "generated value",
        confidence: "high",
      })),
      memories_used: [],
    })
  );
}

/**
 * Rejects the next pending request for a metadata schema.
 *
 * @param {MockEngineManager} mockEngineManager Mock model manager.
 * @param {string} schemaName Schema whose request should be rejected.
 * @param {Error} error Error used to reject the request.
 *
 * @returns {boolean} Whether a matching request was rejected.
 */
function rejectPendingMetadataRequest(mockEngineManager, schemaName, error) {
  const engine = mockEngineManager.engines.get(SMART_FORM_FILL_MODEL_PURPOSE);
  if (!engine) {
    return false;
  }

  for (const [requestId, { request, reject }] of engine.runRequests) {
    if (getModelRequestSchema(request) !== schemaName) {
      continue;
    }

    engine.runRequests.delete(requestId);
    reject(error);
    return true;
  }

  return false;
}

/**
 * Fails field classification and waits for the Smart Form Fill row to hide.
 *
 * @param {Window} win AI Window containing the form.
 * @param {string} selector Selector for the field to focus.
 * @param {MockEngineManager} mockEngineManager Mock model manager.
 *
 * @returns {Promise<{
 *   browser: MozBrowser,
 *   popup: XULPopupElement,
 *   item: Element | null
 * }>} Autocomplete elements after classification fails.
 */
async function failFieldClassification(win, selector, mockEngineManager) {
  const { browser, popup } = await openLoadingAutocomplete(win, selector);
  const handledSchemas = new Set();

  await TestUtils.waitForCondition(() => {
    settlePendingMetadataRequests(mockEngineManager, handledSchemas, null, [
      FIELD_CLASSIFICATION_SCHEMA,
    ]);
    return [FIELD_CLASSIFICATION_SCHEMA, RELEVANT_TABS_SCHEMA].every(schema =>
      handledSchemas.has(schema)
    );
  }, "Waiting for Smart Form Fill metadata requests to settle");

  let item = popup.querySelector('[originaltype="smartFormFill"]');
  if (item && !item.collapsed) {
    await BrowserTestUtils.waitForMutationCondition(
      popup,
      { attributes: true, childList: true, subtree: true },
      () => {
        item = popup.querySelector('[originaltype="smartFormFill"]');
        return !item || item.collapsed;
      }
    );
  }

  return { browser, popup, item };
}

describe("Smart Form Fill metadata lifecycle", () => {
  let context;
  let win;
  let mockEngineManager;

  beforeEach(async () => {
    context = await setupSmartFormFillAutocompleteTest();
    ({ win, mockEngineManager } = context);
    await promiseNavigateAndLoad(win.gBrowser.selectedBrowser, FORM_URL);
  });

  afterEach(async () => {
    await cleanupSmartFormFillAutocompleteTest(context);
    context = null;
    win = null;
    mockEngineManager = null;
  });

  it("does not request model metadata before field focus", async () => {
    const browser = win.gBrowser.selectedBrowser;
    await getAichatBrowser(win.document.getElementById("ai-window-browser"));
    await waitForSmartFormFillProvider(browser, "#email");

    const engine = mockEngineManager.engines.get(SMART_FORM_FILL_MODEL_PURPOSE);
    Assert.ok(
      !engine?.runRequests.size,
      "Preparing the form should not start Smart Form Fill model requests"
    );
  });

  it("hides the autocomplete entry when field classification fails", async () => {
    const { item } = await failFieldClassification(
      win,
      "#email",
      mockEngineManager
    );

    Assert.ok(
      !item || item.collapsed,
      "A classification failure should hide the Smart Form Fill entry"
    );
  });

  it("keeps the autocomplete entry hidden for other fields in the form", async () => {
    const { browser } = await failFieldClassification(
      win,
      "#email",
      mockEngineManager
    );
    await closeAutocomplete(browser);

    const popup = browser.autoCompletePopup;
    const focusedField = await waitForSmartFormFillProvider(browser, "#name", {
      focus: true,
    });
    Assert.equal(
      focusedField,
      "name",
      "The second form field should be focused"
    );

    if (!popup.popupOpen) {
      await BrowserTestUtils.synthesizeKey("VK_DOWN", {}, browser);
    }
    await TestUtils.waitForCondition(
      () => popup.popupOpen,
      "Waiting for the datalist popup to open"
    );

    const item = popup.querySelector('[originaltype="smartFormFill"]');
    Assert.ok(
      !item || item.collapsed,
      "The classification failure should hide SFF for the entire form"
    );

    const engine = mockEngineManager.engines.get(SMART_FORM_FILL_MODEL_PURPOSE);
    Assert.equal(
      engine.runRequests.size,
      0,
      "Focusing another field should not repeat the failed classification"
    );
  });

  it("retries classification after the form structure changes", async () => {
    const { browser } = await failFieldClassification(
      win,
      "#email",
      mockEngineManager
    );
    await closeAutocomplete(browser);

    await SpecialPowers.spawn(browser, [], () => {
      const label = content.document.createElement("label");
      label.textContent = "Phone";

      const input = content.document.createElement("input");
      input.id = "phone";
      input.name = "phone";
      input.type = "tel";
      label.append(input);

      content.document.querySelector("form").append(label);
    });

    const { handledSchemas } = await openAutocomplete(
      win,
      "#phone",
      mockEngineManager
    );
    Assert.ok(
      handledSchemas.has(FIELD_CLASSIFICATION_SCHEMA),
      "The form structure change should trigger a new classification request"
    );
  });

  it("reclassifies a form after a field is removed", async () => {
    const { browser } = await failFieldClassification(
      win,
      "#email",
      mockEngineManager
    );
    await closeAutocomplete(browser);

    await SpecialPowers.spawn(browser, [], () => {
      content.document.querySelector("#email").closest("label").remove();
    });

    await waitForSmartFormFillProvider(browser, "#name", { focus: true });

    const actor =
      browser.browsingContext.currentWindowGlobal.getActor("SmartFormFill");
    await TestUtils.waitForCondition(async () => {
      const formData = await actor.sendQuery("SmartFormFill:GetFocusedForm");
      return (
        formData?.fields.length === 1 && formData.fields[0].name === "name"
      );
    }, "Waiting for Smart Form Fill to process the field removal");
    await TestUtils.waitForTick();

    const { browser: autocompleteBrowser, popup } =
      await openLoadingAutocomplete(win, "#name");
    let row;
    const rowUpdated = BrowserTestUtils.waitForMutationCondition(
      popup.richlistbox,
      { attributes: true, childList: true, subtree: true },
      () => {
        row = popup
          .querySelector('[originaltype="smartFormFill"]')
          ?.querySelector("autocomplete-row-item");
        return row && !row.loading;
      }
    );

    const requests = await captureMetadataRequests(mockEngineManager);
    await rowUpdated;
    await row.updateComplete;

    const classificationRequest = requests.get(FIELD_CLASSIFICATION_SCHEMA);
    Assert.deepEqual(
      classificationRequest.fields.map(field => field.name),
      ["name"],
      "The replacement classification should only contain the remaining field"
    );

    await closeAutocomplete(autocompleteBrowser);
  });

  it("retries relevant tabs independently", async () => {
    const { popup } = await openLoadingAutocomplete(win, "#email");
    const retryableError = new Error("429 status code");
    retryableError.status = 429;

    await TestUtils.waitForCondition(
      () =>
        rejectPendingMetadataRequest(
          mockEngineManager,
          RELEVANT_TABS_SCHEMA,
          retryableError
        ),
      "Waiting to reject the initial relevant-tabs request"
    );

    const handledSchemas = new Set();
    await TestUtils.waitForCondition(() => {
      settlePendingMetadataRequests(
        mockEngineManager,
        handledSchemas,
        null,
        [],
        [FIELD_CLASSIFICATION_SCHEMA]
      );
      return handledSchemas.has(FIELD_CLASSIFICATION_SCHEMA);
    }, "Waiting for field classification to complete");

    const metadata = await waitForMetadataAndUpdatedRow(
      popup,
      mockEngineManager,
      [RELEVANT_TABS_SCHEMA],
      null,
      []
    );
    Assert.ok(
      metadata.handledSchemas.has(RELEVANT_TABS_SCHEMA),
      "Relevant tabs should run again after the retryable failure"
    );
  });

  it("retries classification independently", async () => {
    const { popup } = await openLoadingAutocomplete(win, "#email");
    const retryableError = new Error("429 status code");
    retryableError.status = 429;

    await TestUtils.waitForCondition(
      () =>
        rejectPendingMetadataRequest(
          mockEngineManager,
          FIELD_CLASSIFICATION_SCHEMA,
          retryableError
        ),
      "Waiting to reject the initial classification request"
    );

    const handledSchemas = new Set();
    let row;
    await TestUtils.waitForCondition(() => {
      settlePendingMetadataRequests(
        mockEngineManager,
        handledSchemas,
        null,
        [],
        [RELEVANT_TABS_SCHEMA]
      );
      row = popup
        .querySelector('[originaltype="smartFormFill"]')
        ?.querySelector("autocomplete-row-item");
      return handledSchemas.has(RELEVANT_TABS_SCHEMA) && row && !row.loading;
    }, "Waiting for relevant tabs while classification retries");

    const metadata = await waitForMetadataAndUpdatedRow(
      popup,
      mockEngineManager,
      [FIELD_CLASSIFICATION_SCHEMA],
      null,
      []
    );
    Assert.ok(
      metadata.handledSchemas.has(FIELD_CLASSIFICATION_SCHEMA),
      "Classification should run again after the retryable failure"
    );
  });

  it("waits for classification before generating values", async () => {
    const formTab = win.gBrowser.selectedTab;
    await BrowserTestUtils.openNewForegroundTab(win.gBrowser, SOURCE_URL);
    await BrowserTestUtils.switchTab(win.gBrowser, formTab);

    const { popup, item } = await openLoadingAutocomplete(win, "#email");
    const handledSchemas = new Set();
    let row;

    await TestUtils.waitForCondition(() => {
      settlePendingMetadataRequests(
        mockEngineManager,
        handledSchemas,
        SOURCE_URL,
        [],
        [RELEVANT_TABS_SCHEMA]
      );
      row = popup
        .querySelector('[originaltype="smartFormFill"]')
        ?.querySelector("autocomplete-row-item");
      return handledSchemas.has(RELEVANT_TABS_SCHEMA) && row && !row.loading;
    }, "Waiting for relevant tabs without resolving classification");
    await row.updateComplete;

    EventUtils.synthesizeMouseAtCenter(item, {}, win);

    const engine = mockEngineManager.engines.get(SMART_FORM_FILL_MODEL_PURPOSE);
    const pendingSchemas = [...engine.runRequests.values()].map(({ request }) =>
      getModelRequestSchema(request)
    );
    Assert.deepEqual(
      pendingSchemas,
      [FIELD_CLASSIFICATION_SCHEMA],
      "Value generation should wait for the pending classification"
    );

    await TestUtils.waitForCondition(() => {
      settlePendingMetadataRequests(
        mockEngineManager,
        handledSchemas,
        null,
        [],
        [FIELD_CLASSIFICATION_SCHEMA]
      );
      return handledSchemas.has(FIELD_CLASSIFICATION_SCHEMA);
    }, "Waiting for field classification to resolve");

    await respondWithGeneratedValues(mockEngineManager);
  });
});
