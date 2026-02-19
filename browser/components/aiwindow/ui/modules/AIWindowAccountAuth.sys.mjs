/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
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
    maxLogLevelPref: Services.prefs.getBoolPref("browser.aiwindow.log", false)
      ? "Debug"
      : "Warn",
  });
});

// Temporary gating while feature is in development
// To be set to true by default before MVP launch
XPCOMUtils.defineLazyPreferenceGetter(
  lazy,
  "AIWindowRequireSignIn",
  "browser.aiwindow.requireSignIn",
  false
);
XPCOMUtils.defineLazyPreferenceGetter(
  lazy,
  "hasAIWindowToSConsent",
  "browser.aiwindow.tos.hasConsent",
  false
);

export const AIWindowAccountAuth = {
  get hasToSConsent() {
    return lazy.hasAIWindowToSConsent;
  },

  set hasToSConsent(value) {
    Services.prefs.setBoolPref("browser.aiwindow.tos.hasConsent", value);
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

  requiresSignIn() {
    return lazy.AIWindowRequireSignIn;
  },

  async canAccessAIWindow() {
    if (!this.requiresSignIn()) {
      return true;
    }
    if (!this.hasToSConsent) {
      return false;
    }
    return await this.isSignedIn();
  },

  async promptSignIn(browser) {
    try {
      const data = {
        autoClose: false,
        entrypoint: "aiwindow",
        extraParams: {
          service: "aiwindow",
        },
      };
      const signedIn = await lazy.SpecialMessageActions.fxaSignInFlow(
        data,
        browser
      );
      if (signedIn) {
        this.hasToSConsent = true;
      }
      return signedIn;
    } catch (error) {
      lazy.log.error("Error prompting sign-in:", error);
      throw error;
    }
  },

  async launchAIWindow(browser) {
    if (!(await this.canAccessAIWindow())) {
      const signedIn = await this.promptSignIn(browser);
      if (!signedIn) {
        lazy.log.error("User did not sign in successfully.");
        return false;
      }
    }
    // Proceed with launching the AI window
    // Tobe updated with window switching toggleWindow call implemented with fix of bug 2006469
    browser.ownerGlobal.OpenBrowserWindow({ aiWindow: true });
    return true;
  },
};
