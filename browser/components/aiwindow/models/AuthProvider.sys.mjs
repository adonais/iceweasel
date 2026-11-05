/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

const PREF_TOS_CONSENT_TIME = "browser.smartwindow.tos.consentTime";

const lazy = XPCOMUtils.declareLazy({
  FxAccounts: "resource://gre/modules/FxAccounts.sys.mjs",
  getFxAccountsSingleton: "resource://gre/modules/FxAccounts.sys.mjs",
  OAUTH_CLIENT_ID: "resource://gre/modules/FxAccountsCommon.sys.mjs",
  ONLOGOUT_NOTIFICATION: "resource://gre/modules/FxAccountsCommon.sys.mjs",
  SpecialMessageActions:
    "resource://messaging-system/lib/SpecialMessageActions.sys.mjs",
  hasAIWindowToSConsent: {
    pref: PREF_TOS_CONSENT_TIME,
    default: 0,
  },
  log: () =>
    console.createInstance({
      prefix: "AuthProvider",
      maxLogLevel: Services.prefs.getBoolPref("browser.smartwindow.log", false)
        ? "Debug"
        : "Warn",
    }),
});

/**
 * Handles authentication and Terms of Service consent for Smart Window.
 *
 * @fires AuthProviderSingleton#"AuthProvider:Logout"
 *  When the user signs out of their account.
 */
class AuthProviderSingleton extends EventTarget {
  constructor() {
    super();
    Services.obs.addObserver(
      () => this.dispatchEvent(new Event("AuthProvider:Logout")),
      lazy.ONLOGOUT_NOTIFICATION
    );
  }

  get hasToSConsent() {
    return !!lazy.hasAIWindowToSConsent;
  }

  set hasToSConsent(value) {
    const nowSeconds = Math.floor(Date.now() / 1000);

    Services.prefs.setIntPref(PREF_TOS_CONSENT_TIME, value ? nowSeconds : 0);
  }

  clearToSConsent() {
    Services.prefs.clearUserPref(PREF_TOS_CONSENT_TIME);
  }

  /**
   * Retrieves the Firefox account token
   *
   * @returns {Promise<string|null>}   The Firefox account token (string) or null
   */
  async getToken() {
    try {
      const fxAccounts = lazy.getFxAccountsSingleton();
      return await fxAccounts.getOAuthToken({
        service: "smartwindow",
        client_id: lazy.OAUTH_CLIENT_ID,
      });
    } catch (error) {
      console.warn("Error obtaining FxA token:", error);
      return null;
    }
  }

  /**
   * Drops a token the server rejected, so the next getToken call fetches a
   * fresh one.
   *
   * @param {string|null} token
   */
  async invalidateToken(token) {
    if (!token) {
      return;
    }
    const fxAccounts = lazy.getFxAccountsSingleton();
    await fxAccounts.removeCachedOAuthToken({ token });
  }

  /**
   * Whether the user is signed in to their account.
   *
   * @returns {Promise<boolean>}
   */
  async isSignedIn() {
    try {
      const fxAccounts = lazy.getFxAccountsSingleton();
      return !!(await fxAccounts.getSignedInUser());
    } catch (error) {
      lazy.log.error("Error checking sign-in status:", error);
      return false;
    }
  }

  /**
   * Runs the sign-in flow, recording a signin_flow_started /
   * signin_flow_completed pair around it.
   *
   * @param {Browser} browser
   * @param {object} options
   * @param {string} options.reason Why access was denied, recorded on
   *   signin_flow_started
   * @returns {Promise<boolean>} Whether the user signed in successfully
   */
  async runSignInFlow(browser, { reason }) {
    Glean.smartWindow.signinFlowStarted.record({ reason });

    let outcome = "abandoned";
    try {
      // Checked here as well as inside fxaSignInFlow so that a blocked flow,
      // where the sign-in page is never shown, is distinguishable from one the
      // user abandoned. Both make fxaSignInFlow return false.
      if (!(await lazy.FxAccounts.canConnectAccount())) {
        outcome = "blocked";
        return false;
      }

      const didSignIn = await lazy.SpecialMessageActions.fxaSignInFlow(
        {
          autoClose: Services.prefs.getBoolPref(
            "browser.smartwindow.firstrun.hasCompleted",
            false
          ),
          entrypoint: "smartwindow",
          extraParams: {
            service: "smartwindow",
          },
        },
        browser
      );
      if (didSignIn) {
        outcome = "completed";
      }
      return didSignIn;
    } catch (error) {
      outcome = "error";
      lazy.log.error("Error prompting sign-in:", error);
      throw error;
    } finally {
      Glean.smartWindow.signinFlowCompleted.record({ outcome });
    }
  }

  /**
   * Describes why Smart Window access was denied, which is what makes the
   * sign-in flow necessary. Recorded as the reason key on signin_flow_started.
   *
   * @param {boolean} signedIn Whether the user is signed in to their account
   * @returns {string} One of signed_out, no_consent, both, or none
   */
  #denialReason(signedIn) {
    if (this.hasToSConsent) {
      return signedIn ? "none" : "signed_out";
    }
    return signedIn ? "no_consent" : "both";
  }

  /**
   * Whether the user can use Smart Window without going through the sign-in
   * flow: they have consented to the Terms of Service and are signed in.
   *
   * @returns {Promise<boolean>}
   */
  async hasAccess() {
    return this.hasToSConsent && (await this.isSignedIn());
  }

  /**
   * Runs the sign-in flow unless the user already has access.
   *
   * @param {Browser} browser
   * @returns {Promise<boolean>} Whether the user has access afterwards
   */
  async maybeSignIn(browser) {
    if (await this.hasAccess()) {
      return true;
    }
    return this.promptSignIn(browser);
  }

  /**
   * Runs the sign-in flow regardless of the current sign-in state, and records
   * Terms of Service consent once the user signs in.
   *
   * @param {Browser} browser
   * @returns {Promise<boolean>} Whether the user signed in successfully
   */
  async promptSignIn(browser) {
    const signedIn = await this.isSignedIn();

    const didSignIn = await this.runSignInFlow(browser, {
      reason: this.#denialReason(signedIn),
    });
    if (!didSignIn) {
      lazy.log.error("User did not sign in successfully.");
      return false;
    }
    this.hasToSConsent = true;
    return true;
  }
}

export const AuthProvider = new AuthProviderSingleton();
