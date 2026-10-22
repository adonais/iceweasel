/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Allow list of URL protocols for tabs and pages exposed to the LLM. Only http/https are
// permitted; internal (about:, chrome:, moz-extension:, file:, data:, etc.)
const ALLOWED_URL_PROTOCOLS = new Set(["http:", "https:"]);

/**
 * Whether a URL uses an http(s) protocol, the only protocols permitted to be
 * exposed to the language model. Note this checks the protocol only, not
 * whether the specific URL is otherwise safe to expose.
 *
 * Important! Changing or removing this allow list requires a security review.
 *
 * @param {string} url
 * @returns {boolean}
 */
export function isAllowedURLProtocol(url) {
  return ALLOWED_URL_PROTOCOLS.has(URL.parse(url)?.protocol);
}

/**
 * Sticky security-flag container. A flag that has been set to `true` can never
 * be cleared back to `false`, preventing a later tool call from accidentally
 * downgrading a flag raised by an earlier one.
 *
 * Flags are written to a staging area and only become visible after `commit()`
 * is called. This ensures that parallel tool calls requested in the same
 * conversation turn all see the same committed flags.
 *
 * `Conversation.run()` and `runWithGenerator()` commit before every LLM call,
 * so a turn is governed by every flag raised before it started and by none a
 * sibling tool call staged after it, wherever that turn is driven from. Code
 * that raises a flag does not need to commit it itself.
 */
export class SecurityProperties {
  #privateData = false;
  #untrustedInput = false;
  #newPrivateData = false;
  #newUntrustedInput = false;

  /** @returns {boolean} */
  get privateData() {
    return this.#privateData;
  }
  setPrivateData() {
    this.#newPrivateData = true;
  }

  /** @returns {boolean} */
  get untrustedInput() {
    return this.#untrustedInput;
  }
  setUntrustedInput() {
    this.#newUntrustedInput = true;
  }

  /**
   * Promotes staged flag values to the committed state. Call this once all
   * tool calls in a batch have completed so that parallel tool calls all see
   * the same flags.
   */
  commit() {
    this.#privateData = this.#privateData || this.#newPrivateData;
    this.#untrustedInput = this.#untrustedInput || this.#newUntrustedInput;
    this.#newPrivateData = false;
    this.#newUntrustedInput = false;
  }

  /**
   * Serializes flag state for persistence, staged flags included. Staging is
   * only about what a turn in flight may observe, not about durability: a
   * conversation is written out mid-turn, and can end on a path that runs no
   * further LLM call, so a flag that was raised has to survive either way.
   * Restoring the result yields it committed, which is the fail-closed
   * direction for a sticky flag.
   *
   * @returns {{ privateData: boolean, untrustedInput: boolean }}
   */
  toJSON() {
    return {
      privateData: this.#privateData || this.#newPrivateData,
      untrustedInput: this.#untrustedInput || this.#newUntrustedInput,
    };
  }

  /**
   * Restores a SecurityProperties instance from a persisted JSON object.
   * Returns a clean default instance if input is null or undefined.
   *
   * Migration behavior: Conversations created before securityProperties
   * persistence existed have no stored flag payload. Those conversations
   * restore as false/false and will only become tainted again if later
   * conversation activity sets and commits the flags.
   *
   * @param {object|null} obj - Parsed JSON from SQLite
   * @returns {SecurityProperties}
   */
  static fromJSON(obj) {
    const props = new SecurityProperties();
    if (!obj) {
      return props;
    }
    if (obj.privateData) {
      props.#privateData = true;
    }
    if (obj.untrustedInput) {
      props.#untrustedInput = true;
    }
    return props;
  }

  /**
   * Get text that can be used in logging.
   *
   * @returns {string}
   */
  getLogText() {
    return `private=${this.privateData} untrusted=${this.untrustedInput}`;
  }
}
