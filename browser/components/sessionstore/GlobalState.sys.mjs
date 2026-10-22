/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Module that contains global session data.
 */
export class GlobalState {
  /**
   * Storage for global state.
   *
   * @type {Record<string, string>}
   */
  #state = {};

  /**
   * Get all value from the global state.
   */
  getState() {
    return this.#state;
  }

  /**
   * Clear all currently stored global state.
   */
  clear() {
    this.#state = {};
  }

  /**
   * Retrieve a value from the global state.
   *
   * @param {string} aKey
   *        A key the value is stored under.
   * @returns {string}
   *          The value stored at aKey, or an empty string if no value is set.
   */
  get(aKey) {
    return this.#state[aKey] || "";
  }

  /**
   * Set a global value.
   *
   * @param {string} aKey
   *        A key to store the value under.
   * @param {string} aStringValue
   */
  set(aKey, aStringValue) {
    this.#state[aKey] = aStringValue;
  }

  /**
   * Delete a global value.
   *
   * @param {string} aKey
   *        A key to delete the value for.
   */
  delete(aKey) {
    delete this.#state[aKey];
  }

  /**
   * Set the current global state from a state object. Any previous global
   * state will be removed, even if the new state does not contain a matching
   * key.
   *
   * @param {object} aState
   *        A state object to extract global state from to be set.
   */
  setFromState(aState) {
    this.#state = (aState && aState.global) || {};
  }
}
