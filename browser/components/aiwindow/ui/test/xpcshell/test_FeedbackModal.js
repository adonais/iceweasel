/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

const { OnboardingMessageProvider } = ChromeUtils.importESModule(
  "resource:///modules/asrouter/OnboardingMessageProvider.sys.mjs"
);

async function getFeedbackMessage(type) {
  const messages = await OnboardingMessageProvider.getUntranslatedMessages();
  const id =
    type === "thumbs-up"
      ? "SMARTWINDOW_FEEDBACK_MODAL_POSITIVE"
      : "SMARTWINDOW_FEEDBACK_MODAL_NEGATIVE";
  return messages.find(m => m.id === id);
}

add_task(async function test_thumbs_up_has_no_multiselect() {
  const message = await getFeedbackMessage("thumbs-up");
  const tiles = message.content.screens[0].content.tiles;
  const hasMultiselect = tiles.some(t => t.type === "multiselect");
  Assert.ok(!hasMultiselect, "thumbs-up modal should not include multiselect");
});

add_task(async function test_thumbs_down_has_multiselect() {
  const message = await getFeedbackMessage("thumbs-down");
  const tiles = message.content.screens[0].content.tiles;
  const multiselect = tiles.find(t => t.type === "multiselect");
  Assert.ok(multiselect, "thumbs-down modal should include multiselect");
});

add_task(async function test_thumbs_down_reasons_use_string_ids() {
  const message = await getFeedbackMessage("thumbs-down");
  const tiles = message.content.screens[0].content.tiles;
  const multiselect = tiles.find(t => t.type === "multiselect");
  Assert.ok(
    multiselect.data.every(r => r.label?.string_id),
    "all reason labels should use string_id for localization"
  );
});

add_task(async function test_both_variants_have_textarea() {
  for (const type of ["thumbs-up", "thumbs-down"]) {
    const message = await getFeedbackMessage(type);
    const tiles = message.content.screens[0].content.tiles;
    Assert.ok(
      tiles.some(t => t.type === "textarea"),
      `${type} modal should include a textarea`
    );
  }
});

add_task(async function test_learn_more_action_defined() {
  for (const type of ["thumbs-up", "thumbs-down"]) {
    const message = await getFeedbackMessage(type);
    Assert.ok(
      message.content.screens[0].content["learn-more"]?.action,
      `${type} modal should define a learn_more action`
    );
  }
});

add_task(async function test_write_in_microsurvey_enabled() {
  for (const type of ["thumbs-up", "thumbs-down"]) {
    const message = await getFeedbackMessage(type);
    Assert.ok(
      message.content.write_in_microsurvey,
      `${type} modal should have write_in_microsurvey set`
    );
  }
});

add_task(async function test_positive_negative_have_distinct_message_ids() {
  const positiveMessage = await getFeedbackMessage("thumbs-up");
  const negativeMessage = await getFeedbackMessage("thumbs-down");
  Assert.equal(
    positiveMessage.id,
    "SMARTWINDOW_FEEDBACK_MODAL_POSITIVE",
    "thumbs-up should use SMARTWINDOW_FEEDBACK_MODAL_POSITIVE"
  );
  Assert.equal(
    negativeMessage.id,
    "SMARTWINDOW_FEEDBACK_MODAL_NEGATIVE",
    "thumbs-down should use SMARTWINDOW_FEEDBACK_MODAL_NEGATIVE"
  );
});

add_task(async function test_both_variants_collect_text_input() {
  for (const type of ["thumbs-up", "thumbs-down"]) {
    const message = await getFeedbackMessage(type);
    const action = message.content.screens[0].content.primary_button.action;
    Assert.ok(
      action.collectTextInput,
      `${type} primary button action should have collectTextInput`
    );
  }
});

add_task(async function test_thumbs_up_submit_disabled_when_no_text() {
  const message = await getFeedbackMessage("thumbs-up");
  Assert.equal(
    message.content.screens[0].content.primary_button.disabled,
    "hasTextInput",
    "thumbs-up submit button should be disabled when no text input"
  );
});

add_task(async function test_thumbs_down_submit_not_disabled() {
  const message = await getFeedbackMessage("thumbs-down");
  Assert.ok(
    !message.content.screens[0].content.primary_button.disabled,
    "thumbs-down submit button should not have disabled set (textarea is optional)"
  );
});

add_task(async function test_both_variants_use_feedbackThumbClick_trigger() {
  for (const type of ["thumbs-up", "thumbs-down"]) {
    const message = await getFeedbackMessage(type);
    Assert.equal(
      message.trigger.id,
      "feedbackThumbClick",
      `${type} message should use feedbackThumbClick trigger`
    );
  }
});

add_task(async function test_trigger_params_match_type() {
  const positiveMessage = await getFeedbackMessage("thumbs-up");
  Assert.ok(
    positiveMessage.trigger.params.includes("thumbs-up"),
    "thumbs-up message trigger params should include thumbs-up"
  );
  const negativeMessage = await getFeedbackMessage("thumbs-down");
  Assert.ok(
    negativeMessage.trigger.params.includes("thumbs-down"),
    "thumbs-down message trigger params should include thumbs-down"
  );
});
