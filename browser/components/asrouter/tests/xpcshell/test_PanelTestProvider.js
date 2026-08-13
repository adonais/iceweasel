/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

const { PanelTestProvider } = ChromeUtils.importESModule(
  "resource:///modules/asrouter/PanelTestProvider.sys.mjs"
);

const MESSAGE_VALIDATORS = {};
let EXPERIMENT_VALIDATOR;

add_setup(async function setup() {
  const validators = await makeValidators();

  EXPERIMENT_VALIDATOR = validators.experimentValidator;
  Object.assign(MESSAGE_VALIDATORS, validators.messageValidators);
});

add_task(async function test_PanelTestProvider() {
  const messages = await PanelTestProvider.getMessages();
  for (const message of messages) {
    const validator = MESSAGE_VALIDATORS[message.template];
    Assert.notStrictEqual(
      typeof validator,
      "undefined",
      typeof validator !== "undefined"
        ? `Schema validator found for ${message.template}`
        : `No schema validator found for template ${message.template}. Please update this test to add one.`
    );
    assertValidates(
      validator,
      message,
      `Message ${message.id} validates as ${message.template} template`
    );
    assertValidates(
      EXPERIMENT_VALIDATOR,
      message,
      `Message ${message.id} validates as MessagingExperiment`
    );

    // Confirm the messages can't unintentionally be shown to users. This
    // targeting expression will always be false as panel_local_testing is a
    // local provider with no cohort property. PanelTestProvider assigns it to
    // all messages to prevent them from matching.
    Assert.stringContains(
      message.targeting,
      `providerCohorts.panel_local_testing == "SHOW_TEST"`,
      "Message targeting should prevent showing to users"
    );
  }
});

add_task(async function test_emptyMessage() {
  info(
    "Testing blank FxMS messages validate with the Messaging Experiment schema"
  );

  assertValidates(EXPERIMENT_VALIDATOR, {}, "Empty message should validate");
});
