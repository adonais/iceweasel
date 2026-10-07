/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/* import-globals-from head_smartformfill_telemetry.js */
Services.scriptloader.loadSubScript(
  getRootDirectory(gTestPath) + "head_smartformfill_telemetry.js",
  this
);

// Somewhere to navigate to, to make the form's page go away.
const NAVIGATION_PAGE = "https://example.com/";

add_task(async function test_an_edited_value_is_reported_as_edited() {
  await withFormPage({}, async ({ win, browser, actor }) => {
    await fillContactForm(win, browser, actor);

    await typeInFormField(browser, "#email", "typed");
    await blurField(browser, "#email");

    const [outcome] = await waitForEvents("formFillFieldOutcome", 1);

    Assert.equal(
      recordedExtras("formFillFieldOutcome").length,
      1,
      "A blur ends the fill of the blurred field only"
    );
    Assert.equal(
      Number(outcome.field_seq),
      0,
      "The outcome is the email field's"
    );
    Assert.equal(
      outcome.outcome,
      "edited",
      "A field the user typed into is reported as edited"
    );
  });
});

add_task(async function test_a_cleared_value_is_reported_as_cleared() {
  await withFormPage({}, async ({ win, browser, actor }) => {
    await fillContactForm(win, browser, actor);

    await replaceFieldValue(browser, "#email", "");
    await blurField(browser, "#email");

    const [email] = await waitForEvents("formFillFieldOutcome", 1);
    Assert.equal(
      email.outcome,
      "cleared",
      "A field the user emptied is reported as cleared"
    );

    // Whitespace is not a value the user kept either.
    await replaceFieldValue(browser, "#phone", "  ");
    await blurField(browser, "#phone");

    const [, phone] = await waitForEvents("formFillFieldOutcome", 2);
    Assert.equal(
      Number(phone.field_seq),
      1,
      "The second outcome is the phone field's"
    );
    Assert.equal(
      phone.outcome,
      "cleared",
      "A field left with only whitespace is reported as cleared"
    );
  });
});

add_task(
  async function test_the_length_an_edit_left_the_value_at_is_recorded() {
    await withFormPage({}, async ({ win, browser, actor }) => {
      await addFieldToForm(browser);
      await fillContactForm(win, browser, actor, CONTACT_FIELDS + 1);

      await focusField(browser, "#email");
      await blurField(browser, "#email");

      // One character on top of what was filled, so the value ends one longer
      // wherever the caret happened to be.
      await typeInFormField(browser, "#phone", "!");
      await blurField(browser, "#phone");

      const city = '#contact input[name="city"]';
      await replaceFieldValue(browser, city, "");
      await blurField(browser, city);

      const outcomes = await waitForEvents(
        "formFillFieldOutcome",
        CONTACT_FIELDS + 1
      );
      const [kept, edited, cleared] = [0, 1, 2].map(seq =>
        outcomes.find(outcome => outcome.field_seq === String(seq))
      );

      Assert.equal(
        kept.outcome,
        "kept",
        "Expected a page outcome of kept for the value focused but not changed"
      );
      Assert.equal(
        edited.outcome,
        "edited",
        "Expected a page outcome of edited for the value typed into"
      );
      Assert.equal(
        cleared.outcome,
        "cleared",
        "Expected a page outcome of cleared for the value emptied"
      );

      Assert.equal(
        edited.final_length,
        String(GENERATED_VALUE.length + 1),
        "Expected final_length to be the filled length plus the one typed character"
      );
      Assert.equal(
        edited.filled_length,
        String(GENERATED_VALUE.length),
        "Expected filled_length to be the length the edit is measured against"
      );

      for (const outcome of [kept, cleared]) {
        Assert.strictEqual(
          outcome.final_length,
          undefined,
          `Expected no final_length on a ${outcome.outcome} page outcome`
        );
        Assert.strictEqual(
          outcome.filled_length,
          undefined,
          `Expected no filled_length on a ${outcome.outcome} page outcome`
        );
      }
    });
  }
);

add_task(async function test_submitting_reports_every_filled_field() {
  await withFormPage(
    {
      // Classified apart so the field kind tells the two decisions apart: with
      // both fields classified the same, an outcome carrying the other field's
      // decision would still look right.
      classifyFields: async (request, { onDispatch }) => {
        onDispatch?.(TEST_MODEL_INFO);

        const types = ["email", "phone"];

        return {
          fields: request.fields.map(({ id }, index) => ({
            id,
            type: types[index],
            confidence: "high",
          })),
        };
      },
    },
    async ({ win, browser, actor }) => {
      await fillContactForm(win, browser, actor);

      // A blur only ends the fill of the field it happened on, so the field the
      // user never focused is only reported once the form is submitted.
      await submitForm(browser, "#contact");

      const outcomes = await waitForEvents(
        "formFillFieldOutcome",
        CONTACT_FIELDS
      );
      const decisions = recordedExtras("formFillField");

      Assert.equal(
        outcomes.length,
        CONTACT_FIELDS,
        "Submitting reports every field the round filled"
      );
      Assert.notEqual(
        decisions[0].field_kind,
        decisions[1].field_kind,
        "The two decisions differ, so the join below can tell them apart"
      );

      for (const decision of decisions) {
        const outcome = outcomes.find(
          candidate => candidate.field_seq === decision.field_seq
        );

        Assert.ok(outcome, `Field ${decision.field_seq} reported an outcome`);
        Assert.equal(
          outcome.outcome,
          "kept",
          "A value the user left alone is reported as kept"
        );

        // The outcome carries no field id, so what it is worth is what it can
        // be joined with: each of these has to be the decision of the field it
        // is reported for rather than of whichever field was resolved first.
        Assert.equal(
          outcome.flow_id,
          decision.flow_id,
          "The outcome shares the flow of the round that filled the field"
        );
        Assert.equal(
          outcome.field_kind,
          decision.field_kind,
          "The outcome reports the field kind its decision was made against"
        );
        Assert.equal(
          outcome.source,
          decision.source,
          "The outcome reports what the model decided filled the field"
        );
        Assert.equal(
          outcome.confidence,
          decision.confidence,
          "The outcome reports the confidence the value was filled at"
        );
      }
    }
  );
});

add_task(async function test_a_filled_field_reports_its_outcome_once() {
  await withFormPage(
    {
      // Only the email clears the threshold, so the phone is left for the user
      // to fill and the page never tracks it.
      generateFormValues: async (request, { onDispatch }) => {
        onDispatch?.(TEST_MODEL_INFO);

        const confidences = ["high", "low"];

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
      await fillContactForm(win, browser, actor);

      await focusField(browser, "#phone");
      await blurField(browser, "#phone");

      await focusField(browser, "#email");
      await blurField(browser, "#email");

      const [outcome] = await waitForEvents("formFillFieldOutcome", 1);
      Assert.equal(
        recordedExtras("formFillFieldOutcome").length,
        1,
        "A field that was never filled has no outcome to report"
      );
      Assert.equal(
        Number(outcome.field_seq),
        0,
        "The outcome is the filled field's"
      );

      await focusField(browser, "#email");
      await blurField(browser, "#email");

      Assert.equal(
        recordedExtras("formFillFieldOutcome").length,
        1,
        "A field reports its outcome once, however often its fill ends again"
      );
    }
  );
});

add_task(async function test_navigating_reports_the_outcomes_left() {
  await withFormPage({}, async ({ win, browser, actor }) => {
    await fillContactForm(win, browser, actor);

    const loaded = BrowserTestUtils.browserLoaded(
      browser,
      false,
      NAVIGATION_PAGE
    );
    BrowserTestUtils.startLoadingURIString(browser, NAVIGATION_PAGE);
    await loaded;

    const outcomes = await waitForEvents(
      "formFillFieldOutcome",
      CONTACT_FIELDS
    );

    Assert.equal(
      outcomes.length,
      CONTACT_FIELDS,
      "The page going away reports every field whose fill had not ended"
    );
    Assert.deepEqual(
      outcomes.map(outcome => Number(outcome.field_seq)).sort(),
      [0, 1],
      "Each filled field is reported once"
    );

    for (const outcome of outcomes) {
      Assert.equal(
        outcome.outcome,
        "kept",
        "A value the page navigated away from untouched is reported as kept"
      );
    }
  });
});
