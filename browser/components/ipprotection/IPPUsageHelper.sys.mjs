/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { IPPProxyManager } from "moz-src:///toolkit/components/ipprotection/IPPProxyManager.sys.mjs";
import { BANDWIDTH } from "chrome://browser/content/ipprotection/ipprotection-constants.mjs";

/**
 * @typedef {"none" | "warning-75-percent" | "warning-90-percent"} UsageState
 * An Object containing instances of UsageState.
 * @typedef {object} UsageStates
 *
 * @property {string} NONE
 *  Usage is below warning thresholds or the quota is exhausted.
 * @property {string} WARNING_75_PERCENT
 *  75% or more of bandwidth has been used.
 * @property {string} WARNING_90_PERCENT
 *  90% or more of bandwidth has been used.
 */
export const UsageStates = Object.freeze({
  NONE: "none",
  WARNING_75_PERCENT: "warning-75-percent",
  WARNING_90_PERCENT: "warning-90-percent",
});

/**
 * Tracks bandwidth usage warning state by listening to IPPProxyManager usage changes.
 *
 * @fires IPPUsageHelperSingleton#"IPPUsageHelper:StateChanged"
 *  When the usage warning state changes. Check the `state` attribute to
 *  know the current state.
 */
class IPPUsageHelperSingleton extends EventTarget {
  /** @type {UsageState} */
  #state = UsageStates.NONE;

  constructor() {
    super();
    this.handleEvent = this.#handleEvent.bind(this);
  }

  /**
   * @returns {UsageState}
   */
  get state() {
    return this.#state;
  }

  init() {
    IPPProxyManager.addEventListener(
      "IPPProxyManager:UsageChanged",
      this.handleEvent
    );
  }

  initOnStartupCompleted() {}

  uninit() {
    IPPProxyManager.removeEventListener(
      "IPPProxyManager:UsageChanged",
      this.handleEvent
    );
    this.#setState(UsageStates.NONE);
  }

  #handleEvent(event) {
    if (event.type !== "IPPProxyManager:UsageChanged") {
      return;
    }

    const { usage } = event.detail;
    if (!usage || usage.max == null || usage.remaining == null) {
      return;
    }

    const max = Number(usage.max);
    const remainingPercent = Number(usage.remaining) / max;

    let newState;
    if (remainingPercent <= BANDWIDTH.THIRD_THRESHOLD) {
      newState = UsageStates.WARNING_90_PERCENT;
    } else if (remainingPercent <= BANDWIDTH.SECOND_THRESHOLD) {
      newState = UsageStates.WARNING_75_PERCENT;
    } else {
      newState = UsageStates.NONE;
    }

    this.#setState(newState);
  }

  #setState(state) {
    if (state === this.#state) {
      return;
    }
    this.#state = state;
    this.dispatchEvent(
      new CustomEvent("IPPUsageHelper:StateChanged", {
        bubbles: true,
        composed: true,
        detail: { state },
      })
    );
  }
}

const IPPUsageHelper = new IPPUsageHelperSingleton();

export { IPPUsageHelper };
