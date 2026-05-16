/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { IPPAuthProvider } from "moz-src:///toolkit/components/ipprotection/IPPAuthProvider.sys.mjs";
import { GUARDIAN_EXPERIMENT_TYPE } from "moz-src:///toolkit/components/ipprotection/GuardianClient.sys.mjs";

const lazy = {};

ChromeUtils.defineLazyGetter(lazy, "fxAccounts", () =>
  ChromeUtils.importESModule(
    "resource://gre/modules/FxAccounts.sys.mjs"
  ).getFxAccountsSingleton()
);
ChromeUtils.defineESModuleGetters(lazy, {
  IPPEnrollAndEntitleManager:
    "moz-src:///toolkit/components/ipprotection/fxa/IPPEnrollAndEntitleManager.sys.mjs",
  IPPSignInWatcher:
    "moz-src:///toolkit/components/ipprotection/fxa/IPPSignInWatcher.sys.mjs",
  IPProtectionService:
    "moz-src:///toolkit/components/ipprotection/IPProtectionService.sys.mjs",
});

/**
 * FxA implementation of IPPAuthProvider. Handles OAuth token retrieval,
 * enrollment via Guardian, and FxA-specific proxy bypass rules.
 */
class IPPFxaAuthProviderSingleton extends IPPAuthProvider {
  #signInWatcher = null;
  #enrollFn = null;

  /**
   * @param {object} [signInWatcher] - Custom sign-in watcher. Defaults to IPPSignInWatcher.
   * @param {Function} [enrollFn] - Custom enroll function. Defaults to the FxA hidden-window flow.
   */
  constructor(signInWatcher = null, enrollFn = null) {
    super();
    this.#signInWatcher = signInWatcher;
    this.#enrollFn = enrollFn ?? IPPFxaAuthProviderSingleton.#defaultEnroll;
  }

  get signInWatcher() {
    return this.#signInWatcher ?? lazy.IPPSignInWatcher;
  }

  async enroll(abortSignal) {
    return this.#enrollFn(abortSignal);
  }

  /**
   * Enrolls the current FxA account with Guardian.
   *
   * Static to avoid changing internal state of the singleton.
   *
   * @param {AbortSignal} [abortSignal=null] - a signal to indicate the enrollment should be aborted
   * @returns {Promise<object>} status
   * @returns {boolean} status.enrollment - True if enrollment succeeded.
   * @returns {string} [status.error] - Error message if enrollment failed.
   */
  static async #defaultEnroll(abortSignal = null) {
    try {
      const enrollment = await lazy.IPProtectionService.guardian.enrollWithFxa(
        GUARDIAN_EXPERIMENT_TYPE,
        abortSignal
      );
      if (!enrollment?.ok) {
        return { enrollment: null, error: enrollment?.error };
      }
    } catch (error) {
      return { enrollment: null, error: error?.message };
    }
    return { enrollment: true };
  }

  get helpers() {
    return [this.signInWatcher, lazy.IPPEnrollAndEntitleManager];
  }

  get isReady() {
    // For non authenticated users, we don't know yet their enroll state so the UI
    // is shown and they have to login.
    if (!this.signInWatcher.isSignedIn) {
      return false;
    }

    // If the current account is not enrolled and entitled, the UI is shown and
    // they have to opt-in.
    // If they are currently enrolling, they have already opted-in.
    if (
      !lazy.IPPEnrollAndEntitleManager.isEnrolledAndEntitled &&
      !lazy.IPPEnrollAndEntitleManager.isEnrolling
    ) {
      return false;
    }

    return true;
  }

  /**
   * Retrieves an FxA OAuth token and returns a disposable handle that revokes
   * it on disposal.
   *
   * @param {AbortSignal} [abortSignal]
   * @returns {Promise<{token: string} & Disposable>}
   */
  async getToken(abortSignal = null) {
    let tasks = [
      lazy.fxAccounts.getOAuthToken({
        scope: ["profile", "https://identity.mozilla.com/apps/vpn"],
      }),
    ];
    if (abortSignal) {
      abortSignal.throwIfAborted();
      tasks.push(
        new Promise((_, rej) => {
          abortSignal?.addEventListener("abort", rej, { once: true });
        })
      );
    }
    const token = await Promise.race(tasks);
    if (!token) {
      return null;
    }
    return {
      token,
      [Symbol.dispose]: () => {
        lazy.fxAccounts.removeCachedOAuthToken({ token });
      },
    };
  }

  async aboutToStart() {
    let result;
    if (lazy.IPPEnrollAndEntitleManager.isEnrolling) {
      result = await lazy.IPPEnrollAndEntitleManager.waitForEnrollment();
    }
    if (!lazy.IPPEnrollAndEntitleManager.isEnrolledAndEntitled) {
      return { error: result?.error };
    }
    return null;
  }

  get excludedUrlPrefs() {
    return [
      "identity.fxaccounts.remote.profile.uri",
      "identity.fxaccounts.auth.uri",
    ];
  }
}

const IPPFxaAuthProvider = new IPPFxaAuthProviderSingleton();

export { IPPFxaAuthProvider, IPPFxaAuthProviderSingleton };
