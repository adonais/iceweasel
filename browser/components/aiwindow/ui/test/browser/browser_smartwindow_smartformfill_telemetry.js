/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { SmartFormFillModel } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/SmartFormFillModel.sys.mjs"
);

const TEST_PAGE = `${getRootDirectory(gTestPath).replace(
  "chrome://mochitests/content",
  "https://example.com"
)}test_smartformfill_telemetry.html`;

// The page has two forms: one with email + tel, one with a textarea.
const EXPECTED_FORMS = 2;

// What the fakes report as the model and prompt a request was built with.
const TEST_MODEL_INFO = { model: "test-model", promptVersion: "42" };

/**
 * Classifies every field of the request, so the recorded field_kind has a
 * value.
 *
 * The model calls are awaited or chained with then(), so every fake has to be
 * async the way the real ones are. Every fake also has to report its model
 * info, which is what makes the real model layer record the request event.
 *
 * @param {object} request
 * @param {object} [param1={}]
 * @param {Function} [param1.onDispatch]
 * @returns {Promise<object>}
 */
async function classifyEveryField(request, { onDispatch } = {}) {
  onDispatch?.(TEST_MODEL_INFO);

  return {
    fields: request.fields.map(({ id }) => ({
      id,
      type: "email",
      confidence: "high",
    })),
  };
}

/**
 * Finds no tab relevant, which is what the assertions that are not about tab
 * selection expect.
 *
 * @param {object} request
 * @param {object} [param1={}]
 * @param {Function} [param1.onDispatch]
 * @returns {Promise<object>}
 */
async function selectNoTabs(request, { onDispatch } = {}) {
  onDispatch?.(TEST_MODEL_INFO);

  return { selectedTabs: [] };
}

/**
 * Answers every field of the request with a generated value.
 *
 * @param {object} request
 * @param {object} [param1={}]
 * @param {Function} [param1.onDispatch]
 * @returns {Promise<object>}
 */
async function generateEveryValue(request, { onDispatch } = {}) {
  onDispatch?.(TEST_MODEL_INFO);

  return {
    memories_used: [],
    tabs_used: [],
    fields: request.fields.map(({ id }) => ({
      id,
      action: "generate",
      value: "generated value",
      confidence: "high",
    })),
    batches: { total: 1, failed: 0 },
  };
}

/**
 * Adds a field to the first form, which the document's observer reports as a
 * form update.
 *
 * @param {MozBrowser} browser
 * @returns {Promise<void>}
 */
function addFieldToForm(browser) {
  return SpecialPowers.spawn(browser, [], () => {
    const input = content.document.createElement("input");
    input.type = "text";
    input.name = "city";
    content.document.getElementById("contact").append(input);
  });
}

/**
 * @param {string} name Glean metric name on smartWindow.
 * @returns {Array<object>} The extras of every recorded event.
 */
function recordedExtras(name) {
  return (Glean.smartWindow[name].testGetValue() ?? []).map(
    event => event.extra
  );
}

/**
 * @param {string} name Glean metric name on smartWindow.
 * @param {number} count Number of events to wait for.
 * @returns {Promise<Array<object>>} The extras, once count events landed.
 */
async function waitForEvents(name, count) {
  await TestUtils.waitForCondition(
    () => Glean.smartWindow[name].testGetValue()?.length >= count,
    `${name} should have recorded ${count} events`
  );

  return recordedExtras(name);
}

/**
 * Opens a Smart Window on the test form with the model calls stubbed. Nothing
 * is requested until a form is asked about, so a test that asserts on requests
 * starts a round itself.
 *
 * The model is stubbed so the assertions describe the telemetry rather than
 * whatever the model layer currently answers.
 *
 * @param {object} overrides Fakes for the stubbed model calls.
 * @param {Function} callback Receives { win, browser, actor }.
 * @returns {Promise<void>}
 */
async function withFormPage(overrides, callback) {
  Services.fog.testResetFOG();

  const sandbox = sinon.createSandbox();
  sandbox
    .stub(SmartFormFillModel, "findRelevantTabs")
    .callsFake(overrides.findRelevantTabs ?? selectNoTabs);
  sandbox
    .stub(SmartFormFillModel, "classifyFields")
    .callsFake(overrides.classifyFields ?? classifyEveryField);
  sandbox
    .stub(SmartFormFillModel, "generateFormValues")
    .callsFake(overrides.generateFormValues ?? generateEveryValue);

  const win = await openAIWindow();
  const tab = await BrowserTestUtils.openNewForegroundTab(
    win.gBrowser,
    TEST_PAGE
  );
  const browser = tab.linkedBrowser;
  const actor =
    browser.browsingContext.currentWindowGlobal.getActor("SmartFormFill");

  // An autocomplete popup left open by an earlier file holds the focus, and the
  // events that end a fill depend on the content document having it.
  const popup = browser.autoCompletePopup;
  if (popup?.popupOpen) {
    const hidden = BrowserTestUtils.waitForPopupEvent(popup, "hidden");
    popup.hidePopup();
    await hidden;
  }

  try {
    await callback({ win, browser, actor });
  } finally {
    BrowserTestUtils.removeTab(tab);
    await BrowserTestUtils.closeWindow(win);
    sandbox.restore();
  }
}

/**
 * Focuses a field in the content document.
 *
 * Focused from content rather than with a synthesized click:
 * BrowserTestUtils.synthesizeMouse reaches content through its own sendQuery,
 * which calls this.waitForCondition, a method BrowserTestUtils does not have,
 * so a click that races the content process throws instead of waiting. The
 * autocomplete tests focus fields this way too.
 *
 * @param {MozBrowser} browser
 * @param {string} selector Field to focus
 * @returns {Promise<void>}
 */
function focusField(browser, selector) {
  return SpecialPowers.spawn(browser, [selector], fieldSelector =>
    content.document.querySelector(fieldSelector).focus()
  );
}

/**
 * Runs a whole round on the form a field belongs to: relevant tabs,
 * classification and generation. Nothing is requested until a form is asked
 * about, so every assertion about requests starts from here.
 *
 * @param {MozBrowser} browser
 * @param {object} actor The SmartFormFill parent actor
 * @param {string} [selector] Field to run the round for
 * @returns {Promise<void>}
 */
async function runRoundOnForm(browser, actor, selector = "#email") {
  await SimpleTest.promiseFocus(browser);
  await focusField(browser, selector);

  await actor.triggerAutofill();
}

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.smartwindow.smartformfill.enabled", true]],
  });
});

add_task(async function test_one_classification_flow_per_form() {
  await withFormPage({}, async ({ browser, actor }) => {
    await runRoundOnForm(browser, actor, "#email");
    await runRoundOnForm(browser, actor, "#reason");

    const [contact, details] = recordedExtras("formFillClassifyRequest");

    Assert.equal(
      recordedExtras("formFillClassifyRequest").length,
      EXPECTED_FORMS,
      "One classification request per form"
    );
    Assert.ok(contact.flow_id, "The first form's request carries a flow id");
    Assert.ok(details.flow_id, "The second form's request carries a flow id");
    Assert.notEqual(
      contact.flow_id,
      details.flow_id,
      "Each form gets its own flow id"
    );
    Assert.equal(
      Number(contact.fields_total),
      2,
      "fields_total counts the email and tel fields"
    );
    Assert.equal(
      Number(details.fields_total),
      1,
      "fields_total counts the textarea"
    );

    for (const request of [contact, details]) {
      Assert.equal(
        request.model,
        TEST_MODEL_INFO.model,
        "The request reports the model it was dispatched with"
      );
      Assert.equal(
        request.prompt_version,
        TEST_MODEL_INFO.promptVersion,
        "The request reports the prompt version it was dispatched with"
      );
    }

    const responses = await waitForEvents(
      "formFillClassifyResponse",
      EXPECTED_FORMS
    );

    // Responses land in whatever order the requests complete, so each one is
    // looked up by the flow of its request.
    for (const request of [contact, details]) {
      const response = responses.find(
        candidate => candidate.flow_id === request.flow_id
      );

      Assert.ok(response, `Flow ${request.flow_id} recorded its response`);
      Assert.equal(
        response.error,
        "false",
        "A successful classification records no error"
      );
      Assert.strictEqual(
        response.error_message,
        undefined,
        "A success carries no error code"
      );
    }
  });
});

add_task(async function test_a_structure_change_starts_a_new_flow() {
  await withFormPage({}, async ({ browser, actor }) => {
    await runRoundOnForm(browser, actor);

    // That a changed form is asked about again is covered by
    // browser_smartwindow_smartformfill_metadata_lifecycle.js. What only shows
    // here is that the second round stops sharing a flow with the first, so the
    // two attempts are not merged into one in the data.
    await addFieldToForm(browser);
    await runRoundOnForm(browser, actor);

    const [first, second] = recordedExtras("formFillClassifyRequest");

    Assert.ok(first.flow_id, "The first round carries a flow id");
    Assert.ok(second.flow_id, "The second round carries a flow id");
    Assert.notEqual(
      first.flow_id,
      second.flow_id,
      "A form whose fields changed starts a new flow"
    );
  });
});

add_task(async function test_failed_classification_records_the_error() {
  const failure = new Error("Error");
  failure.clientReason = "connectionFailure";

  await withFormPage(
    {
      classifyFields: async (request, { onDispatch }) => {
        onDispatch?.(TEST_MODEL_INFO);

        throw failure;
      },
    },
    async ({ browser, actor }) => {
      await runRoundOnForm(browser, actor);

      const responses = await waitForEvents("formFillClassifyResponse", 1);

      for (const response of responses) {
        Assert.equal(
          response.error,
          "true",
          `Flow ${response.flow_id} is reported as failed`
        );
        Assert.equal(
          response.error_message,
          "connectionFailure",
          `Flow ${response.flow_id} reports what the failure was attributed to`
        );
      }
    }
  );
});

add_task(async function test_generation_records_a_decision_per_field() {
  await withFormPage({}, async ({ browser, actor }) => {
    await runRoundOnForm(browser, actor);

    const generateRequests = recordedExtras("formFillGenerateRequest");
    const generateResponses = recordedExtras("formFillGenerateResponse");
    Assert.equal(
      generateRequests.length,
      1,
      "One generation request, for the focused form"
    );
    Assert.equal(generateResponses.length, 1, "One generation response");

    const [request] = generateRequests;
    const [response] = generateResponses;
    Assert.equal(
      request.threshold,
      "high",
      "The recorded threshold is the confidence a value must clear"
    );
    Assert.equal(
      request.model,
      TEST_MODEL_INFO.model,
      "The generation request reports the model it was dispatched with"
    );
    Assert.equal(
      request.prompt_version,
      TEST_MODEL_INFO.promptVersion,
      "The generation request reports the prompt version it was dispatched with"
    );
    Assert.equal(
      response.batches_failed,
      "0",
      "A round where every batch answered reports no failed batch"
    );
    Assert.equal(
      response.flow_id,
      request.flow_id,
      "The response is correlated with the request by flow id"
    );

    // The page reports what it filled on its own message, so the decisions land
    // after the autofill call has already returned.
    //
    // Recorded in the order the fields were sent, which is the order they
    // appear in the form.
    const [email, phone] = await waitForEvents("formFillField", 2);
    Assert.equal(
      recordedExtras("formFillField").length,
      2,
      "One decision per field sent, which is the focused form's two fields"
    );

    for (const [field, expectedSeq] of [
      [email, 0],
      [phone, 1],
    ]) {
      Assert.equal(
        field.flow_id,
        request.flow_id,
        "The decision shares the flow of its generation round"
      );
      Assert.equal(
        Number(field.field_seq),
        expectedSeq,
        "field_seq is the index within the form"
      );
      Assert.equal(
        field.source,
        "generated",
        "The model's decision is reported as the source"
      );
      // Nothing was seeded in Form History, so no field was offered a token.
      Assert.equal(
        field.token_available,
        "false",
        "No stored value means no token was offered"
      );
      Assert.equal(
        field.token_kind,
        undefined,
        "A field with no token reports no token kind"
      );
    }

    Assert.equal(
      email.filled,
      "true",
      "The page reported the empty field as filled"
    );
    Assert.equal(
      phone.filled,
      "true",
      "The page reported the empty field as filled"
    );
  });
});

add_task(async function test_a_round_records_its_relevant_tabs_request() {
  await withFormPage({}, async ({ browser, actor }) => {
    await runRoundOnForm(browser, actor);
    const requests = await waitForEvents("formRelevantTabsRequest", 1);

    Assert.equal(requests.length, 1, "The round records one request");

    const responses = await waitForEvents("formRelevantTabsResponse", 1);

    for (const request of requests) {
      Assert.equal(
        request.model,
        TEST_MODEL_INFO.model,
        "The request reports the model it was dispatched with"
      );
      Assert.equal(
        request.prompt_version,
        TEST_MODEL_INFO.promptVersion,
        "The request reports the prompt version it was dispatched with"
      );
      Assert.greater(
        Number(request.tabs_sent),
        0,
        "The request reports the tabs the model got to choose from"
      );

      const response = responses.find(
        candidate => candidate.flow_id === request.flow_id
      );
      Assert.ok(response, `Flow ${request.flow_id} recorded its response`);
      Assert.equal(
        response.error,
        "false",
        "A successful round records no error"
      );
    }
  });
});

add_task(async function test_failed_relevant_tabs_records_the_error() {
  // Carries no client reason, so it has to be reported as the catch-all rather
  // than as anything the error itself holds.
  const failure = new Error("Error");
  failure.name = "TabFailure";
  failure.error = "a backend message that must not be recorded";

  await withFormPage(
    {
      findRelevantTabs: async (request, { onDispatch }) => {
        onDispatch?.(TEST_MODEL_INFO);

        throw failure;
      },
    },
    async ({ browser, actor }) => {
      await runRoundOnForm(browser, actor);

      const responses = await waitForEvents("formRelevantTabsResponse", 1);

      for (const response of responses) {
        Assert.equal(
          response.error,
          "true",
          `Flow ${response.flow_id} is reported as failed`
        );
        Assert.equal(
          response.error_message,
          "genericError",
          `Flow ${response.flow_id} reports a failure it cannot attribute as the catch-all`
        );
        Assert.strictEqual(
          response.tabs_selected,
          undefined,
          "No answer came back, so no selected tab count is reported"
        );
        Assert.strictEqual(
          response.tabs_used,
          undefined,
          "No answer came back, so no used tab count is reported"
        );
      }

      // Losing the tab selection is not fatal: the round goes on without tabs
      // as context, so the only thing to check is that the failure was
      // reported rather than the round looking like a success.
      Assert.equal(
        recordedExtras("formRelevantTabsResponse").filter(
          response => response.error === "false"
        ).length,
        0,
        "No round reports success once its tab selection failed"
      );
    }
  );
});

add_task(async function test_tabs_never_offered_are_selected_but_not_used() {
  await withFormPage(
    {
      // The response schema does not constrain the ids to the ones that were
      // offered, so the model can answer with one that was never in the list.
      findRelevantTabs: async (request, { onDispatch }) => {
        onDispatch?.(TEST_MODEL_INFO);

        return {
          selectedTabs: [
            { id: "made-up-1", relevance: "high" },
            { id: "made-up-2", relevance: "medium" },
          ],
        };
      },
    },
    async ({ browser, actor }) => {
      await runRoundOnForm(browser, actor);

      const [response] = await waitForEvents("formRelevantTabsResponse", 1);

      Assert.equal(
        response.tabs_selected,
        "2",
        "tabs_selected is what the model returned"
      );
      Assert.equal(
        response.tabs_used,
        "0",
        "tabs_used counts only the tabs that survived validation"
      );
    }
  );
});

add_task(async function test_the_context_the_model_says_it_used_is_recorded() {
  await withFormPage(
    {
      generateFormValues: async (request, options) => {
        const values = await generateEveryValue(request, options);

        return {
          ...values,
          memories_used: ["m1", "m2"],
          tabs_used: ["https://example.com/one"],
        };
      },
    },
    async ({ browser, actor }) => {
      await runRoundOnForm(browser, actor);

      const [response] = recordedExtras("formFillGenerateResponse");
      Assert.equal(
        response.memories_used,
        "2",
        "The response reports how many memories the model says it used"
      );
      Assert.equal(
        response.tabs_used,
        "1",
        "The response reports how many tabs the model says it used"
      );
    }
  );
});

add_task(async function test_a_value_below_the_threshold_is_not_filled() {
  await withFormPage(
    {
      generateFormValues: async (request, { onDispatch }) => {
        onDispatch?.(TEST_MODEL_INFO);

        const confidences = ["medium", "sideways"];

        return {
          memories_used: [],
          fields: request.fields.map(({ id }, index) => ({
            id,
            action: "generate",
            value: "generated value",
            confidence: confidences[index],
          })),
          batches: { total: 1, failed: 0 },
        };
      },
    },
    async ({ browser, actor }) => {
      await runRoundOnForm(browser, actor);

      const [response] = recordedExtras("formFillGenerateResponse");
      Assert.equal(
        response.fields_filled,
        "0",
        "A value that does not reach the threshold is not filled"
      );

      for (const field of await waitForEvents("formFillField", 2)) {
        Assert.equal(
          field.filled,
          "false",
          `A ${field.confidence} value is reported as not filled`
        );
      }
    }
  );
});

add_task(async function test_a_rejected_value_does_not_cost_the_round() {
  await withFormPage(
    {
      generateFormValues: async (request, { onDispatch }) => {
        onDispatch?.(TEST_MODEL_INFO);

        // One value clears the threshold and one does not, so the round proves
        // the threshold filters per field rather than failing as a whole.
        const confidences = ["high", "medium"];

        return {
          memories_used: [],
          tabs_used: [],
          fields: request.fields.map(({ id }, index) => ({
            id,
            action: "generate",
            value: "generated value",
            confidence: confidences[index],
          })),
          batches: { total: 1, failed: 0 },
        };
      },
    },
    async ({ browser, actor }) => {
      await runRoundOnForm(browser, actor);

      const [response] = recordedExtras("formFillGenerateResponse");
      Assert.equal(
        response.fields_filled,
        "1",
        "The value that cleared the threshold was filled, the other was not"
      );

      const [email, phone] = await waitForEvents("formFillField", 2);
      Assert.equal(
        email.filled,
        "true",
        "A high confidence value is filled even next to a rejected one"
      );
      Assert.equal(
        phone.filled,
        "false",
        "The rejected value is still reported, as not filled"
      );
    }
  );
});

add_task(async function test_a_batched_generation_records_one_request() {
  await withFormPage(
    {
      // Every batch that sends reports its model info, so a form split across
      // batches reports more than once.
      generateFormValues: async (request, { onDispatch }) => {
        onDispatch?.(TEST_MODEL_INFO);
        onDispatch?.(TEST_MODEL_INFO);

        return generateEveryValue(request);
      },
    },
    async ({ browser, actor }) => {
      await runRoundOnForm(browser, actor);

      Assert.equal(
        recordedExtras("formFillGenerateRequest").length,
        1,
        "A form reports one request however many batches it was split across"
      );
    }
  );
});

add_task(async function test_a_partly_failed_generation_is_still_a_response() {
  await withFormPage(
    {
      generateFormValues: async (request, options) => {
        const values = await generateEveryValue(request, options);

        return { ...values, batches: { total: 3, failed: 1 } };
      },
    },
    async ({ browser, actor }) => {
      await runRoundOnForm(browser, actor);

      const [response] = recordedExtras("formFillGenerateResponse");
      Assert.equal(
        response.batches_total,
        "3",
        "The response reports how many requests the fields were split across"
      );
      Assert.equal(
        response.batches_failed,
        "1",
        "The response reports how many of those requests failed"
      );
      Assert.equal(
        response.error,
        "false",
        "A round that lost only some batches is not reported as a failure"
      );
    }
  );
});

add_task(async function test_a_failure_before_dispatch_records_no_events() {
  await withFormPage(
    {
      // Fails the way resolving the model or the prompt does: no request ever
      // left, so the round has nothing to report.
      generateFormValues: async () => {
        throw new Error("Error");
      },
    },
    async ({ browser, actor }) => {
      await runRoundOnForm(browser, actor);

      Assert.equal(
        recordedExtras("formFillGenerateRequest").length,
        0,
        "A request that was never dispatched is not recorded"
      );
      Assert.equal(
        recordedExtras("formFillGenerateResponse").length,
        0,
        "A request that was never dispatched records no response either"
      );
    }
  );
});
