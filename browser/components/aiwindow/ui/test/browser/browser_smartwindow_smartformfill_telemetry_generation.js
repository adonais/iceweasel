/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/* import-globals-from head_smartformfill_telemetry.js */
Services.scriptloader.loadSubScript(
  getRootDirectory(gTestPath) + "head_smartformfill_telemetry.js",
  this
);

add_task(async function test_generation_records_a_decision_per_field() {
  await withFormPage({}, async ({ win, browser, actor }) => {
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
      "medium",
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
      request.memories,
      "0",
      "Expected a round with nothing stored to report no memory sent as context"
    );
    for (const key of ["min", "max", "avg"]) {
      Assert.strictEqual(
        request[`memories_similarity_${key}`],
        undefined,
        `Expected no memories_similarity_${key}, the round sent no memory`
      );
    }

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

    await fillFormReview(win, browser);

    // The page reports what it filled after the reviewed values are approved.
    // Recorded in the order the fields were sent, which is the order they
    // appear in the form.
    const [email, phone] = await waitForEvents("formFillField", CONTACT_FIELDS);
    Assert.equal(
      recordedExtras("formFillField").length,
      CONTACT_FIELDS,
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

      for (const key of ["min", "max", "avg"]) {
        Assert.strictEqual(
          response[`memories_used_similarity_${key}`],
          undefined,
          `Expected no memories_used_similarity_${key}, the round sent no memory to summarise`
        );
      }
    }
  );
});

add_task(async function test_a_field_reports_both_classifications() {
  await withFormPage(
    {
      classifyFields: classifyAs(
        new Map([
          ["email", "email"],
          ["phone", "phone-number"],
          ["reason", "other"],
        ])
      ),
    },
    async ({ win, browser, actor }) => {
      await runRoundOnForm(browser, actor);
      await fillFormReview(win, browser);

      const [email, phone] = await waitForEvents("formFillField", 2);

      Assert.equal(
        email.pre_llm_field_kind,
        "email",
        "Expected the email field to report the heuristics' guess alongside the model's"
      );
      Assert.equal(
        email.field_kind,
        "email",
        "Expected the email field to report the type the model answered with"
      );
      Assert.equal(
        email.pre_llm_source,
        "regex-heuristic",
        "Expected a heuristic guess to name the heuristic that made it"
      );

      Assert.equal(
        phone.pre_llm_field_kind,
        "tel",
        "Expected the phone field to report the heuristics' guess alongside the model's"
      );
      Assert.equal(
        phone.field_kind,
        "phone-number",
        "Expected the phone field to report the type the model answered with"
      );
    }
  );
});

add_task(async function test_a_field_the_heuristics_missed_reports_no_guess() {
  await withFormPage({}, async ({ win, browser, actor }) => {
    await runRoundOnForm(browser, actor, "#reason");
    await fillFormReview(win, browser);

    const [reason] = await waitForEvents("formFillField", 1);

    Assert.strictEqual(
      reason.pre_llm_field_kind,
      undefined,
      "Expected no pre_llm_field_kind for a field the heuristics cannot classify"
    );
    Assert.strictEqual(
      reason.pre_llm_source,
      undefined,
      "Expected no pre_llm_source where there is no heuristic guess to attribute"
    );
  });
});

add_task(async function test_a_value_below_the_threshold_is_not_filled() {
  await withFormPage(
    {
      generateFormValues: async (request, { onDispatch }) => {
        onDispatch?.(TEST_MODEL_INFO);

        const confidences = ["low", "sideways"];

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

      Assert.equal(
        recordedExtras("formFillField").length,
        0,
        "No per-field fill events are recorded without a fill attempt"
      );
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
        const confidences = ["medium", "low"];

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
    async ({ win, browser, actor }) => {
      await runRoundOnForm(browser, actor);

      const [response] = recordedExtras("formFillGenerateResponse");
      Assert.equal(
        response.fields_filled,
        "1",
        "The value that cleared the threshold was filled, the other was not"
      );

      await fillFormReview(win, browser);

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
