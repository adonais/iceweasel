/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { AIFeature } from "chrome://global/content/ml/AIFeature.sys.mjs";
import { FEATURES } from "chrome://global/content/ml/EngineProcess.sys.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  MLUninstallService: "chrome://global/content/ml/Utils.sys.mjs",
});

const CONTROL_PREF = "browser.ai.control.speechRecognition";
const DEFAULT_PREF = "browser.ai.control.default";

/**
 * On-device speech recognition, as exposed to AI Controls. The control pref is
 * the source of truth: SpeechRecognition::Available(), install() and start()
 * read it directly in C++ (see SpeechRecognition.cpp), so there is no separate
 * feature pref to keep in sync here.
 */
export class SpeechRecognitionFeature extends AIFeature {
  /**
   * @returns {string} The engine every speech recognition artifact is stored
   *   under.
   */
  static get engineId() {
    return FEATURES[this.id].engineId;
  }

  /**
   * @returns {string}
   */
  static get id() {
    return "speech-recognition";
  }

  /**
   * @returns {boolean} False: there is no opt-in step beyond making the
   *   feature available, the per-site download prompt aside.
   */
  static get hasDistinctEnabledState() {
    return false;
  }

  /**
   * @returns {boolean} True: recognition runs on the GPU when one is usable
   *   and falls back to the CPU otherwise, so no device is excluded.
   */
  static get canRunOnDevice() {
    return true;
  }

  /**
   * @returns {boolean} True: the feature carries no regional or rollout
   *   restriction, so its control is always offered.
   */
  static get isAllowed() {
    return true;
  }

  /**
   * @returns {boolean}
   */
  static get isEnabled() {
    return !this.isBlocked;
  }

  /**
   * @returns {boolean}
   */
  static get isBlocked() {
    return this.#resolvedControlState === "blocked";
  }

  /**
   * @returns {boolean}
   */
  static get isManagedByPolicy() {
    return Services.prefs.prefIsLocked(CONTROL_PREF);
  }

  /**
   * @returns {Promise<void>}
   */
  static async makeAvailable() {
    this.#assertMutable("make speech recognition available");
    // Set explicitly rather than clearing, so that a non-locked policy default
    // of "blocked" does not prevent the user from switching back.
    Services.prefs.setStringPref(CONTROL_PREF, "available");
    await this.uninstall();
  }

  /**
   * @returns {Promise<void>}
   */
  static async enable() {
    this.#assertMutable("enable speech recognition");
    Services.prefs.setStringPref(CONTROL_PREF, "available");
  }

  /**
   * @returns {Promise<void>}
   */
  static async block() {
    this.#assertMutable("block speech recognition");
    Services.prefs.setStringPref(CONTROL_PREF, "blocked");
    await this.uninstall();
  }

  /**
   * A locked control pref keeps whatever value the policy gave it, so a
   * mutator would otherwise silently fail to change the effective state.
   *
   * @param {string} aAttempt What the caller was trying to do, for the error.
   */
  static #assertMutable(aAttempt) {
    if (this.isManagedByPolicy) {
      throw new Error(`Cannot ${aAttempt}: controlled by enterprise policy`);
    }
  }

  /**
   * Deletes whatever language or quantization subset was downloaded: every
   * artifact is stored under the one engine id.
   *
   * @returns {Promise<void>}
   */
  static async uninstall() {
    const { engineId } = this;
    await lazy.MLUninstallService.uninstall({
      engineIds: [engineId],
      actor: engineId,
    });
  }

  /**
   * Mirror of SpeechRecognition.cpp's IsBlockedByAIControls: the feature pref
   * wins unless it is unset or "default", in which case the global default
   * applies.
   *
   * @returns {string}
   */
  static get #resolvedControlState() {
    const state = Services.prefs.getStringPref(CONTROL_PREF, "");
    if (!state || state === "default") {
      return Services.prefs.getStringPref(DEFAULT_PREF, "available");
    }
    return state;
  }
}
