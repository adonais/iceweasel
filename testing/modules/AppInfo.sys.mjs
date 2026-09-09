/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

let origPlatformInfo = Cc["@mozilla.org/xre/app-info;1"].getService(
  Ci.nsIPlatformInfo
);

// eslint-disable-next-line mozilla/use-services
let origRuntime = Cc["@mozilla.org/xre/app-info;1"].getService(
  Ci.nsIXULRuntime
);

/**
 * Create new XULAppInfo instance with specified options.
 *
 * options is a object with following keys:
 *   ID:              nsIXULAppInfo.ID
 *   name:            nsIXULAppInfo.name
 *   version:         nsIXULAppInfo.version
 *   platformVersion: nsIXULAppInfo.platformVersion
 *   OS:              nsIXULRuntime.OS
 *   appBuildID:      nsIXULRuntime.appBuildID
 *   lastAppBuildID:  nsIXULRuntime.lastAppBuildID
 *   lastAppVersion:  nsIXULRuntime.lastAppVersion
 *
 *   crashReporter:   nsICrashReporter interface is implemented if true
 */
export var newAppInfo = function (options = {}) {
  let appInfo = {
    // nsIXULAppInfo
    vendor: "Mozilla",
    name: options.name ?? "xpcshell",
    ID: options.ID ?? "xpcshell@tests.mozilla.org",
    version: options.version ?? "1",
    appBuildID: options.appBuildID ?? "20160315",

    // nsIPlatformInfo
    platformVersion: options.platformVersion ?? "p-ver",
    platformBuildID: origPlatformInfo.platformBuildID,

    // nsIXULRuntime
    ...Ci.nsIXULRuntime,
    inSafeMode: false,
    logConsoleErrors: true,
    OS: options.OS ?? "XPCShell",
    XPCOMABI: "noarch-spidermonkey",
    invalidateCachesOnRestart() {},
    processType: origRuntime.processType,
    uniqueProcessID: origRuntime.uniqueProcessID,

    fissionAutostart: origRuntime.fissionAutostart,
    browserTabsRemoteAutostart: origRuntime.browserTabsRemoteAutostart,
    get maxWebProcessCount() {
      return origRuntime.maxWebProcessCount;
    },
    get launcherProcessState() {
      return origRuntime.launcherProcessState;
    },

    // nsIWinAppHelper
    get userCanElevate() {
      return false;
    },
  };

  appInfo.lastAppBuildID = options.lastAppBuildID ?? appInfo.appBuildID;
  appInfo.lastAppVersion = options.lastAppVersion ?? appInfo.version;

  let interfaces = [
    Ci.nsIXULAppInfo,
    Ci.nsIPlatformInfo,
    Ci.nsIXULRuntime,
    Ci.nsICrashReporter,
  ];
  if ("nsIWinAppHelper" in Ci) {
    interfaces.push(Ci.nsIWinAppHelper);
  }

  // nsICrashReporter
  appInfo.annotations = {};
  appInfo.annotateCrashReport = function (key, data) {
    if (options.crashReporter) {
      this.annotations[key] = data;
    } else {
      throw Components.Exception("", Cr.NS_ERROR_NOT_INITIALIZED);
    }
  };

  appInfo.QueryInterface = ChromeUtils.generateQI(interfaces);

  return appInfo;
};

var currentAppInfo = newAppInfo();
var registered = false;

/**
 * Obtain a reference to the current object used to define XULAppInfo.
 */
export var getAppInfo = function () {
  return currentAppInfo;
};

/**
 * Update the current application info.
 *
 * See newAppInfo for options.
 *
 * To change the current XULAppInfo, simply call this function. This assumes
 * that nobody else has dynamically registered an app info factory.
 */
export var updateAppInfo = function (options) {
  currentAppInfo = newAppInfo(options);
  Services.appinfo = currentAppInfo;

  if (!registered) {
    registered = true;

    let factory = {
      createInstance(iid) {
        return currentAppInfo.QueryInterface(iid);
      },
    };
    let registrar = Components.manager.QueryInterface(Ci.nsIComponentRegistrar);
    let cid = Components.ID("{fbfae60b-64a4-44ef-a911-08ceb70b9f31}");
    let contractID = "@mozilla.org/xre/app-info;1";
    registrar.registerFactory(cid, "XULAppInfo", contractID, factory);
  }
};
