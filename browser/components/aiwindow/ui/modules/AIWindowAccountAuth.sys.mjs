/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  FxAccounts: "resource://gre/modules/FxAccounts.sys.mjs",
  SpecialMessageActions:
    "resource://messaging-system/lib/SpecialMessageActions.sys.mjs",
});

ChromeUtils.defineLazyGetter(lazy, "fxAccounts", () => {
  return ChromeUtils.importESModule(
    "resource://gre/modules/FxAccounts.sys.mjs"
  ).getFxAccountsSingleton();
});

ChromeUtils.defineLazyGetter(lazy, "log", function () {
  return console.createInstance({
    prefix: "AIWindowAccountAuth",
    maxLogLevelPref: Services.prefs.getBoolPref(
      "browser.smartwindow.log",
      false
    )
      ? "Debug"
      : "Warn",
  });
});

XPCOMUtils.defineLazyPreferenceGetter(
  lazy,
  "hasAIWindowToSConsent",
  "browser.smartwindow.tos.consentTime",
  0
);

XPCOMUtils.defineLazyPreferenceGetter(
  lazy,
  "hasFirstrunCompleted",
  "browser.smartwindow.firstrun.hasCompleted",
  false
);

export const AIWindowAccountAuth = {
  get hasToSConsent() {
    return !!lazy.hasAIWindowToSConsent;
  },

  set hasToSConsent(value) {
    const nowSeconds = Math.floor(Date.now() / 1000);

    Services.prefs.setIntPref(
      "browser.smartwindow.tos.consentTime",
      value ? nowSeconds : 0
    );
  },

  async isSignedIn() {
    try {
      const userData = await lazy.fxAccounts.getSignedInUser();
      return !!userData;
    } catch (error) {
      lazy.log.error("Error checking sign-in status:", error);
      return false;
    }
  },

  async canAccessAIWindow() {
    if (!this.hasToSConsent) {
      return false;
    }
    return await this.isSignedIn();
  },

  /**
   * Describes why Smart Window access was denied, which is what makes the
   * sign-in flow necessary. Recorded as the reason key on signin_flow_started.
   *
   * @param {boolean} signedIn Whether the user is signed in to their account
   * @returns {string} One of signed_out, no_consent, both, or none
   */
  denialReason(signedIn) {
    if (this.hasToSConsent) {
      return signedIn ? "none" : "signed_out";
    }
    return signedIn ? "no_consent" : "both";
  },

  /**
   * Sends the user through the Firefox Accounts sign-in flow, recording a
   * signin_flow_started / signin_flow_completed pair around it.
   *
   * @param {Browser} browser
   * @param {boolean} [signedIn] Whether the user is already signed in, when the
   *   caller has just checked. Only used to label the started event; omit it to
   *   have it read here.
   * @returns {Promise<boolean>} Whether the user signed in successfully
   */
  async promptSignIn(browser, signedIn) {
    Glean.smartWindow.signinFlowStarted.record({
      reason: this.denialReason(signedIn ?? (await this.isSignedIn())),
    });

    let outcome = "abandoned";
    try {
      // Checked here as well as inside fxaSignInFlow so that a blocked flow,
      // where the sign-in page is never shown, is distinguishable from one the
      // user abandoned. Both make fxaSignInFlow return false.
      if (!(await lazy.FxAccounts.canConnectAccount())) {
        outcome = "blocked";
        return false;
      }

      const data = {
        autoClose: !!lazy.hasFirstrunCompleted,
        entrypoint: "smartwindow",
        extraParams: {
          service: "smartwindow",
        },
      };
      const didSignIn = await lazy.SpecialMessageActions.fxaSignInFlow(
        data,
        browser
      );
      if (didSignIn) {
        outcome = "completed";
        this.hasToSConsent = true;
      }
      return didSignIn;
    } catch (error) {
      outcome = "error";
      lazy.log.error("Error prompting sign-in:", error);
      throw error;
    } finally {
      Glean.smartWindow.signinFlowCompleted.record({ outcome });
    }
  },

  async ensureAIWindowAccess(browser) {
    // Deliberately not canAccessAIWindow: that short-circuits on missing
    // consent without reading the sign-in state, and both halves are needed to
    // label the sign-in flow with why access was denied.
    const signedIn = await this.isSignedIn();
    if (this.hasToSConsent && signedIn) {
      return true;
    }

    if (!(await this.promptSignIn(browser, signedIn))) {
      lazy.log.error("User did not sign in successfully.");
      return false;
    }
    return true;
  },
};
