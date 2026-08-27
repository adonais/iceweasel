/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* global AppConstants, ExtensionAPI, XPCOMUtils */

const lazy = {};

if (AppConstants.ENABLE_WEBDRIVER) {
  XPCOMUtils.defineLazyServiceGetter(
    lazy,
    "Marionette",
    "@mozilla.org/remote/marionette;1",
    Ci.nsIMarionette
  );
  XPCOMUtils.defineLazyServiceGetter(
    lazy,
    "RemoteAgent",
    "@mozilla.org/remote/agent;1",
    Ci.nsIRemoteAgent
  );
} else {
  lazy.Marionette = { running: false };
  lazy.RemoteAgent = { running: false };
}

this.appConstants = class extends ExtensionAPI {
  getAPI() {
    return {
      appConstants: {
        getAndroidPackageName: () => {
          return Services.env.get("MOZ_ANDROID_PACKAGE_NAME");
        },
        getAppVersion: () => {
          return Services.appinfo.version;
        },
        getEffectiveUpdateChannel: () => {
          const ver = AppConstants.MOZ_APP_VERSION_DISPLAY;
          if (ver.includes("a")) {
            return "nightly";
          } else if (ver.includes("b")) {
            return "beta";
          } else if (ver.includes("esr")) {
            return "esr";
          }
          return "stable";
        },
        getPlatform: () => {
          const os = AppConstants.platform;
          if (os == "win") {
            return "windows";
          } else if (os == "macosx") {
            return "mac";
          }
          return os;
        },
        isInAutomation: () => {
          return (
            Cu.isInAutomation ||
            lazy.Marionette.running ||
            lazy.RemoteAgent.running
          );
        },
      },
    };
  }
};
