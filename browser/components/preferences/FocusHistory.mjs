/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Remembers which control the user had focused on each view, so going
 * back puts focus where they left it.
 */
export class FocusHistory {
  /**
   * A map of a unique identifier (the key) with its associated focusable element.
   *
   * @type {Map<number, WeakRef<Element>>}
   */
  #focused = new Map();

  /**
   * Remember the currently focused control so it can be brought back later.
   *
   * @param {number} historyId
   */
  save(historyId) {
    if (!document) {
      return;
    }
    const el = document.activeElement;
    if (!el || el === document.body || el === document.documentElement) {
      this.#focused.delete(historyId);
      return;
    }
    this.#focused.set(historyId, new WeakRef(el));
  }

  /**
   * Put focus back on the control previously remembered for this id.
   *
   * @param {number} historyId
   */
  restore(historyId) {
    const el = /** @type {HTMLElement?} */ (
      this.#focused.get(historyId)?.deref()
    );
    if (el?.isConnected) {
      el.focus({ preventScroll: true });
    }
  }
}
