/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Sticky security-flag container. A flag that has been set to `true` can never
 * be cleared back to `false`, preventing a later tool call from accidentally
 * downgrading a flag raised by an earlier one.
 *
 * Flags are written to a staging area and only become visible after `commit()`
 * is called. This ensures that parallel tool calls requested in the same
 * conversation turn all see the same committed flags.
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
}
