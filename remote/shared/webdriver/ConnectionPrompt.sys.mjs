/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};

ChromeUtils.defineLazyGetter(
  lazy,
  "l10n",
  () => new Localization(["locales-preview/remote-agent.ftl"])
);

const PREF_CONNECTION_PROMPT_ENABLED =
  "remote.experimental.dynamicstart.prompt.enabled";

/**
 * Possible outcomes of a connection prompt.
 *
 * @enum {string}
 */
export const ConnectionPromptResult = {
  ALLOW: "allow",
  DENY: "deny",
};

/**
 * Prompt displayed when creating WebDriver (Classic or BiDi) sessions unrelated
 * to browser automation.
 *
 * Allows the user to accept or deny the connection and also to save the
 * decision for the lifetime of the browser.
 */
class ConnectionPromptClass {
  // Decision remembered for the whole browser session. Either null, or one of
  // the ConnectionPromptResult values.
  #rememberedDecision;

  constructor() {
    this.#rememberedDecision = null;
  }

  async #showPrompt() {
    const [title, message, allowLabel, denyLabel, checkboxLabel] =
      await lazy.l10n.formatValues([
        "remote-agent-connection-prompt-title",
        "remote-agent-connection-prompt-message",
        "remote-agent-connection-prompt-allow-button",
        "remote-agent-connection-prompt-deny-button",
        "remote-agent-connection-prompt-remember-checkbox",
      ]);

    const prompts = Services.prompt;
    const flags =
      // use allowLabel for BUTTON_POS_0
      (prompts.BUTTON_TITLE_IS_STRING * prompts.BUTTON_POS_0) |
      // use denyLabel for BUTTON_POS_1
      (prompts.BUTTON_TITLE_IS_STRING * prompts.BUTTON_POS_1) |
      // Deny/BUTTON_POS_1 is the default.
      prompts.BUTTON_POS_1_DEFAULT;

    const checkbox = { value: false };
    const buttonClicked = prompts.confirmEx(
      null,
      title,
      message,
      flags,
      allowLabel, // BUTTON_POS_0
      denyLabel, // BUTTON_POS_1 (default)
      null,
      checkboxLabel,
      checkbox
    );

    const decision =
      buttonClicked === 0
        ? ConnectionPromptResult.ALLOW
        : ConnectionPromptResult.DENY;

    if (checkbox.value) {
      this.#rememberedDecision = decision;
    }

    return decision;
  }

  /**
   * Ask the user to accept a new connection.
   *
   * @returns {string}
   *     One of the ConnectionPromptResult values.
   */
  async show() {
    if (!Services.prefs.getBoolPref(PREF_CONNECTION_PROMPT_ENABLED, true)) {
      return ConnectionPromptResult.ALLOW;
    }

    if (this.#rememberedDecision !== null) {
      return this.#rememberedDecision;
    }

    return this.#showPrompt();
  }
}

export const ConnectionPrompt = new ConnectionPromptClass();
