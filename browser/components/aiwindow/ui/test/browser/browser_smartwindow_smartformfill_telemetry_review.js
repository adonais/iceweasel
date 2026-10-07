/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/* import-globals-from head_smartformfill_telemetry.js */
Services.scriptloader.loadSubScript(
  getRootDirectory(gTestPath) + "head_smartformfill_telemetry.js",
  this
);

// A third field, so the review has one value to keep, one to edit and one to
// clear.
const REVIEWED_FIELDS = CONTACT_FIELDS + 1;

add_task(async function test_the_review_records_what_became_of_each_value() {
  const REVIEWED_VALUE = "reviewed";

  await withFormPage({}, async ({ win, browser, actor }) => {
    await addFieldToForm(browser);
    await runRoundOnForm(browser, actor);

    const { reviewBrowser } = await getFormReview(win, browser);
    await editFormReviewInput(reviewBrowser, 1, REVIEWED_VALUE);
    await editFormReviewInput(reviewBrowser, 2, "");
    await fillReviewedForm(reviewBrowser);

    const reviews = await waitForEvents(
      "formFillFieldReviewOutcome",
      REVIEWED_FIELDS
    );
    const [kept, edited, cleared] = [0, 1, 2].map(seq =>
      reviews.find(review => review.field_seq === String(seq))
    );
    const [request] = recordedExtras("formFillGenerateRequest");

    Assert.equal(
      reviews.length,
      REVIEWED_FIELDS,
      `Expected one review outcome per value, ${REVIEWED_FIELDS} values were submitted`
    );
    Assert.equal(
      kept.flow_id,
      request.flow_id,
      "Expected the review outcome to carry its round's flow id"
    );

    Assert.equal(
      kept.outcome,
      "kept",
      "Expected a review outcome of kept for the value left untouched in the dialog"
    );
    Assert.equal(
      edited.outcome,
      "edited",
      "Expected a review outcome of edited for the value retyped in the dialog"
    );
    Assert.equal(
      cleared.outcome,
      "cleared",
      "Expected a review outcome of cleared for the value emptied in the dialog"
    );

    Assert.equal(
      edited.generated_length,
      String(GENERATED_VALUE.length),
      "Expected generated_length to be the length the model generated"
    );
    Assert.equal(
      edited.reviewed_length,
      String(REVIEWED_VALUE.length),
      "Expected reviewed_length to be the length the review edit left"
    );

    for (const review of [kept, cleared]) {
      Assert.strictEqual(
        review.generated_length,
        undefined,
        `Expected no generated_length on a ${review.outcome} review outcome`
      );
      Assert.strictEqual(
        review.reviewed_length,
        undefined,
        `Expected no reviewed_length on a ${review.outcome} review outcome`
      );
    }

    const fields = await waitForEvents("formFillField", REVIEWED_FIELDS);
    Assert.deepEqual(
      fields.map(({ field_seq, filled }) => ({ field_seq, filled })),
      [
        { field_seq: "0", filled: "true" },
        { field_seq: "1", filled: "true" },
        { field_seq: "2", filled: "false" },
      ],
      "Expected the value cleared during review not to be reported as filled"
    );
    const city = '#contact input[name="city"]';
    Assert.deepEqual(
      await Promise.all(
        ["#email", "#phone", city].map(selector =>
          getFormFieldValue(browser, selector)
        )
      ),
      [GENERATED_VALUE, REVIEWED_VALUE, ""],
      "Expected the page to hold each value as the review approved it"
    );
    await closeFormReview(win, browser);
    await SimpleTest.promiseFocus(browser);

    const finalValue = "edited on page";
    await replaceFieldValue(browser, "#phone", finalValue);
    await blurField(browser, "#phone");

    await TestUtils.waitForCondition(
      () =>
        recordedExtras("formFillFieldOutcome").some(
          outcome => outcome.field_seq === "1"
        ),
      "Waiting for the phone page-edit outcome"
    );
    const phone = recordedExtras("formFillFieldOutcome").find(
      outcome => outcome.field_seq === "1"
    );
    const { flow_id, outcome, filled_length, final_length } = phone;
    Assert.deepEqual(
      { flow_id, outcome, filled_length, final_length },
      {
        flow_id: edited.flow_id,
        outcome: "edited",
        filled_length: String(REVIEWED_VALUE.length),
        final_length: String(finalValue.length),
      },
      "Expected a page edit to keep the review flow and be measured against the approved value"
    );
    await focusField(browser, "#email");
    await blurField(browser, "#email");
    await focusField(browser, city);
    await blurField(browser, city);
    Assert.deepEqual(
      recordedExtras("formFillFieldOutcome")
        .map(field => field.field_seq)
        .sort(),
      ["0", "1"],
      "Expected a page outcome only for the two fields that were filled"
    );
  });
});

add_task(async function test_a_cancelled_review_records_no_outcome() {
  await withFormPage({}, async ({ win, browser, actor }) => {
    await runRoundOnForm(browser, actor);
    await waitForEvents("formFillGenerateResponse", 1);
    await cancelFormReview(win, browser);

    Assert.equal(
      recordedExtras("formFillFieldReviewOutcome").length,
      0,
      "Expected a cancelled review to record no outcome for any value"
    );
  });
});
