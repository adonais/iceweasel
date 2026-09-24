/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

const lazy = {};

XPCOMUtils.defineLazyServiceGetters(lazy, {
  gHandlerService: [
    "@mozilla.org/uriloader/handler-service;1",
    Ci.nsIHandlerService,
  ],
});

ChromeUtils.defineESModuleGetters(lazy, {
  AddonManager: "resource://gre/modules/AddonManager.sys.mjs",
  AddonRepository: "resource://gre/modules/addons/AddonRepository.sys.mjs",
  setEnterpriseGuards: "resource://gre/modules/ExtensionPermissions.sys.mjs",
  FileUtils: "resource://gre/modules/FileUtils.sys.mjs",
});

const PREF_LOGLEVEL = "browser.policies.loglevel";

ChromeUtils.defineLazyGetter(lazy, "log", () => {
  let { ConsoleAPI } = ChromeUtils.importESModule(
    "resource://gre/modules/Console.sys.mjs"
  );
  return new ConsoleAPI({
    prefix: "Policies",
    // tip: set maxLogLevel to "debug" and use log.debug() to create detailed
    // messages during development. See LOG_LEVELS in Console.sys.mjs for details.
    maxLogLevel: "warn",
    maxLogLevelPref: PREF_LOGLEVEL,
  });
});

const ABOUT_CONTRACT = "@mozilla.org/network/protocol/about;1?what=";

/**
 * Records the operations that failed while a policy was being applied, so that
 * about:policies can report that policy as only partially applied.
 *
 * A policy whose operation failed stays in getActivePolicies(): those are the
 * parameters the administrator asked for, and most of the policy may well have
 * been applied. What failed is recorded here instead.
 */
export const PolicyFailures = {
  /** @type {Map<string, string[]>} */
  _failures: new Map(),

  /**
   * Records a failed operation of a policy. Callers log the message
   * themselves, with their own logger.
   *
   * @param {string} policyName
   *        The policy the failed operation belongs to.
   * @param {string} message
   *        A description of what failed.
   */
  report(policyName, message) {
    let messages = this._failures.get(policyName);
    if (!messages) {
      messages = [];
      this._failures.set(policyName, messages);
    }
    if (!messages.includes(message)) {
      messages.push(message);
    }
  },

  /**
   * @returns {object}
   *          The failures of every policy, keyed by policy name.
   */
  getAll() {
    const failures = {};
    for (const [policyName, messages] of this._failures) {
      failures[policyName] = [...messages];
    }
    return failures;
  },

  /**
   * Forgets the failures of a policy, which happens when the policy is
   * applied again or removed.
   *
   * @param {string} policyName policy name
   */
  clear(policyName) {
    this._failures.delete(policyName);
  },

  clearAll() {
    this._failures.clear();
  },
};

/**
 * Logs a failed operation of a policy and records it against that policy, so
 * that about:policies reports the policy as only partially applied. Add-on
 * installations happen asynchronously, long after the policy callback
 * returned, so their failures have to be reported here explicitly to be
 * visible at all.
 *
 * @param {string} policyName
 *        The policy the failed operation belongs to. When it isn't known, the
 *        failure is only logged.
 * @param {string} message
 *        A description of what failed.
 */
export function reportFailure(policyName, message) {
  lazy.log.error(message);
  if (policyName) {
    PolicyFailures.report(policyName, message);
  }
}

/*
 * ====================
 * = HELPER FUNCTIONS =
 * ====================
 *
 * The functions below are helpers to be used by several policies.
 */

export const PoliciesUtils = {
  /**
   * setDefaultPref
   *
   * Sets the _default_ value of a pref and optionally locks it.
   * The value is only changed in memory, and not stored to disk.
   *
   * @param {string} prefName
   *        The pref to be changed
   * @param {boolean|number|string} prefValue
   *        The value to set
   * @param {boolean} locked
   *        Optionally lock the pref
   */
  setDefaultPref(prefName, prefValue, locked) {
    let prefWasLocked = Services.prefs.prefIsLocked(prefName);
    if (prefWasLocked) {
      Services.prefs.unlockPref(prefName);
    }

    let defaults = Services.prefs.getDefaultBranch("");

    switch (typeof prefValue) {
      case "boolean":
        defaults.setBoolPref(prefName, prefValue);
        break;

      case "number":
        if (!Number.isInteger(prefValue)) {
          throw new Error(`Non-integer value for ${prefName}`);
        }

        // This is ugly, but necessary. On Windows GPO and macOS
        // configs, booleans are converted to 0/1. In the previous
        // Preferences implementation, the schema took care of
        // automatically converting these values to booleans.
        // Since we allow arbitrary prefs now, we have to do
        // something different. See bug 1666836.
        if (
          defaults.getPrefType(prefName) == defaults.PREF_INT ||
          ![0, 1].includes(prefValue)
        ) {
          defaults.setIntPref(prefName, prefValue);
        } else {
          defaults.setBoolPref(prefName, !!prefValue);
        }
        break;

      case "string":
        defaults.setStringPref(prefName, prefValue);
        break;
    }

    // Prefs can only be unlocked explicitly.
    // If they were locked before, they stay locked.
    if (locked || (prefWasLocked && locked !== false)) {
      Services.prefs.lockPref(prefName);
    }
  },

  /**
   *
   * setPrefIfPresentAndLock
   *
   * Sets the pref to the value param[paramKey] if that exists. Either
   * way, the pref is locked.
   *
   * @param {object} param
   *        Object with pref values
   * @param {string} paramKey
   *        The key to look up the value in param
   * @param {string} prefName
   *        The pref to be changed
   */
  setPrefIfPresentAndLock(param, paramKey, prefName) {
    if (paramKey in param) {
      this.setAndLockPref(prefName, param[paramKey]);
    } else {
      Services.prefs.lockPref(prefName);
    }
  },

  /**
   * setAndLockPref
   *
   * Sets the _default_ value of a pref, and locks it (meaning that
   * the default value will always be returned, independent from what
   * is stored as the user value).
   * The value is only changed in memory, and not stored to disk.
   *
   * @param {string} prefName
   *        The pref to be changed
   * @param {boolean|number|string} prefValue
   *        The value to set and lock
   */
  setAndLockPref(prefName, prefValue) {
    PoliciesUtils.setDefaultPref(prefName, prefValue, true);
  },
};

const PREF_TYPE_NAMES = {
  [Ci.nsIPrefBranch.PREF_BOOL]: "boolean",
  [Ci.nsIPrefBranch.PREF_INT]: "number",
  [Ci.nsIPrefBranch.PREF_STRING]: "string",
};

/**
 * Describes why a preference could not be set, in terms an administrator can
 * act on: which type the preference takes, and what the policy provided.
 *
 * @param {string} preference
 *        The preference that could not be set.
 * @param {boolean|number|string} value
 *        The value the policy asked for.
 * @param {Error} ex
 *        The failure raised while setting it.
 * @returns {string}
 *        A description of what to correct.
 */
export function describePreferenceFailure(preference, value, ex) {
  const expected =
    PREF_TYPE_NAMES[
      Services.prefs.getDefaultBranch("").getPrefType(preference)
    ];
  if (expected && expected != typeof value) {
    return (
      `Unable to set preference ${preference}: it takes a ${expected}, ` +
      `but the policy provided a ${typeof value}.`
    );
  }
  if (expected == "number" && !Number.isInteger(value)) {
    return `Unable to set preference ${preference}: it takes a whole number.`;
  }
  const reason = ex?.result
    ? ChromeUtils.getXPCOMErrorName(ex.result)
    : (ex?.message ?? ex);
  return `Unable to set preference ${preference}: ${reason}`;
}

/**
 * setDefaultPermission
 *
 * Helper function to set preferences appropriately for the policy
 *
 * @param {string} policyName
 *        The name of the policy to set
 * @param {object} policyParam
 *        The object containing param for the policy
 */
export function setDefaultPermission(policyName, policyParam) {
  if ("BlockNewRequests" in policyParam) {
    let prefName = "permissions.default." + policyName;

    if (policyParam.BlockNewRequests) {
      PoliciesUtils.setDefaultPref(prefName, 2, policyParam.Locked);
    } else {
      PoliciesUtils.setDefaultPref(prefName, 0, policyParam.Locked);
    }
  }
}

/**
 * addAllowDenyPermissions
 *
 * Helper function to call the permissions manager (Services.perms.addFromPrincipal)
 * for two arrays of URLs.
 *
 * @param {string} permissionName
 *        The name of the permission to change
 * @param {Array} allowList
 *        The list of URLs to be set as ALLOW_ACTION for the chosen permission.
 * @param {Array} blockList
 *        The list of URLs to be set as DENY_ACTION for the chosen permission.
 */
export function addAllowDenyPermissions(permissionName, allowList, blockList) {
  allowList = allowList || [];
  blockList = blockList || [];

  for (let origin of allowList) {
    try {
      Services.perms.addFromPrincipal(
        Services.scriptSecurityManager.createContentPrincipalFromOrigin(origin),
        permissionName,
        Ci.nsIPermissionManager.ALLOW_ACTION,
        Ci.nsIPermissionManager.EXPIRE_POLICY
      );
    } catch (ex) {
      // It's possible if the origin was invalid, we'll have a string instead of an origin.
      lazy.log.error(
        `Unable to add ${permissionName} permission for ${
          origin.href || origin
        }`
      );
    }
  }

  for (let origin of blockList) {
    Services.perms.addFromPrincipal(
      Services.scriptSecurityManager.createContentPrincipalFromOrigin(origin),
      permissionName,
      Ci.nsIPermissionManager.DENY_ACTION,
      Ci.nsIPermissionManager.EXPIRE_POLICY
    );
  }
}

/**
 * runOnce
 *
 * Helper function to run a callback only once per policy.
 *
 * @param {string} actionName
 *        A given name which will be used to track if this callback has run.
 * @param {Functon} callback
 *        The callback to run only once.
 */
// eslint-disable-next-line no-unused-vars
export function runOnce(actionName, callback) {
  let prefName = `browser.policies.runonce.${actionName}`;
  if (Services.prefs.getBoolPref(prefName, false)) {
    lazy.log.debug(
      `Not running action ${actionName} again because it has already run.`
    );
    return;
  }
  Services.prefs.setBoolPref(prefName, true);
  callback();
}

/**
 * runOncePerModification
 *
 * Helper function similar to runOnce. The difference is that runOnce runs the
 * callback once when the policy is set, then never again.
 * runOncePerModification runs the callback once each time the policy value
 * changes from its previous value.
 * If the callback that was passed is an async function, you can await on this
 * function to await for the callback.
 *
 * @param {string} actionName
 *        A given name which will be used to track if this callback has run.
 *        This string will be part of a pref name.
 * @param {string} policyValue
 *        The current value of the policy. This will be compared to previous
 *        values given to this function to determine if the policy value has
 *        changed. Regardless of the data type of the policy, this must be a
 *        string.
 * @param {Function} callback
 *        The callback to be run when the pref value changes
 * @returns {Promise}
 *        A promise that will resolve once the callback finishes running.
 */
export async function runOncePerModification(
  actionName,
  policyValue,
  callback
) {
  // Stringify the value so that it matches what we'd get from getStringPref.
  policyValue = policyValue + "";
  let prefName = `browser.policies.runOncePerModification.${actionName}`;
  let oldPolicyValue = Services.prefs.getStringPref(prefName, undefined);
  if (policyValue === oldPolicyValue) {
    lazy.log.debug(
      `Not running action ${actionName} again because the policy's value is unchanged`
    );
    return Promise.resolve();
  }
  Services.prefs.setStringPref(prefName, policyValue);
  return callback();
}

/**
 * clearRunOnceModification
 *
 * Helper function that clears a runOnce policy.
 *
 * @param {string} actionName
 *        A given name which was used to track if this callback has run. This
 *        string is part of a pref name.
 */
export function clearRunOnceModification(actionName) {
  let prefName = `browser.policies.runOncePerModification.${actionName}`;
  Services.prefs.clearUserPref(prefName);
}

export function replacePathVariables(path) {
  if (path.includes("${home}")) {
    return path.replace(
      "${home}",
      Services.dirsvc.get("Home", Ci.nsIFile).path
    );
  }
  return path;
}

/**
 * Validates a list of host patterns intended for runtime_blocked_hosts or
 * runtime_allowed_hosts.
 *
 * @param {Array} patterns
 *        List of host match patterns. These accept match patterns without a
 *        path component (e.g. `*://*.example.com` or `<all_urls>`), matching
 *        Chrome's ExtensionSettings policy format. Throws on the first invalid
 *        pattern.
 */
function validateExtensionGuardPatterns(patterns) {
  for (let pattern of patterns) {
    if (typeof pattern !== "string") {
      throw new Error(`Expected a string, got ${typeof pattern}`);
    }
    if (pattern === "<all_urls>") {
      continue;
    }
    if (!/^[a-z*][a-z0-9*+.-]*:\/\/[^/]+$/i.test(pattern)) {
      throw new Error(`Host pattern must not include a path: ${pattern}`);
    }
  }
  // MatchPatternSet throws on any other malformed pattern (bad scheme,
  // malformed host, etc.). ignorePath:true mirrors the backend's parser
  // in setEnterpriseGuards; restrictSchemes defaults to true.
  new MatchPatternSet(patterns, { ignorePath: true });
}

/**
 * Build the enterprise guards map from an ExtensionSettings policy value and
 * apply it via setEnterpriseGuards from ExtensionPermissions.sys.mjs.
 *
 * Throws if any pattern is malformed; the caller logs and skips applying
 * guards in that case.
 *
 * @param {object} extensionSettings
 *        An object mapping extension ID to settings. Settings are defining
 *        runtime_blocked_hosts and runtime_allowed_hosts properties.
 */
export function applyExtensionGuards(extensionSettings) {
  let guards = {};
  for (let [extensionID, settings] of Object.entries(extensionSettings)) {
    let blocked = settings.runtime_blocked_hosts;
    let allowed = settings.runtime_allowed_hosts;
    if (!blocked && !allowed) {
      continue;
    }
    validateExtensionGuardPatterns(blocked ?? []);
    validateExtensionGuardPatterns(allowed ?? []);
    guards[extensionID] = {
      runtime_blocked_hosts: blocked ?? [],
      runtime_allowed_hosts: allowed ?? [],
    };
  }
  lazy.setEnterpriseGuards(guards);
}

/**
 * installAddonFromRepository
 *
 * Helper function that installs an addon from addons.mozilla.org.
 *
 * @param {string} extensionID The extension ID that is to be installed.
 * @param {string} [policyName] The policy requesting the installation.
 */
export function installAddonFromRepository(extensionID, policyName) {
  lazy.AddonRepository.getAddonsByIDs([extensionID])
    .then(repoAddons => {
      if (!repoAddons[0]?.sourceURI) {
        reportFailure(
          policyName,
          `No XPI URL found on AMO for ${extensionID}. Please use install_url for add-ons not listed on addons.mozilla.org.`
        );
        return;
      }
      installAddonFromURL(
        repoAddons[0].sourceURI.spec,
        extensionID,
        null,
        policyName
      );
    })
    .catch(err => {
      reportFailure(
        policyName,
        `Failed to retrieve ${extensionID} from AMO: ${err}`
      );
    });
}

/**
 * installAddonFromURL
 *
 * Helper function that installs an addon from a URL
 * and verifies that the addon ID matches.
 *
 * @param {string} url The URL to install from.
 * @param {string} extensionID The extension ID that is to be installed.
 * @param {object|null} addon Object representing the addon.
 * @param {string} [policyName] The policy requesting the installation.
 */
export function installAddonFromURL(url, extensionID, addon, policyName) {
  if (
    addon &&
    addon.sourceURI &&
    addon.sourceURI.spec == url &&
    !addon.sourceURI.schemeIs("file")
  ) {
    // It's the same addon, don't reinstall.
    return;
  }
  lazy.AddonManager.getInstallForURL(url, {
    telemetryInfo: { source: "enterprise-policy" },
  })
    .then(install => {
      if (!install) {
        reportFailure(policyName, `Unable to install add-on from ${url}`);
        return;
      }
      if (install.addon && install.addon.appDisabled) {
        reportFailure(policyName, `Incompatible add-on - ${install.addon.id}`);
        install.cancel();
        return;
      }
      let listener = {
        /* eslint-disable-next-line no-shadow */
        onDownloadEnded: install => {
          // Install failed, error will be reported elsewhere.
          if (!install.addon) {
            return;
          }
          if (extensionID && install.addon.id != extensionID) {
            reportFailure(
              policyName,
              `Add-on downloaded from ${url} had unexpected id (got ${install.addon.id} expected ${extensionID})`
            );
            install.removeListener(listener);
            install.cancel();
            return;
          }
          if (install.addon.appDisabled) {
            reportFailure(policyName, `Incompatible add-on - ${url}`);
            install.removeListener(listener);
            install.cancel();
            return;
          }
          if (
            addon &&
            Services.vc.compare(addon.version, install.addon.version) == 0
          ) {
            lazy.log.debug(
              "Installation cancelled because versions are the same"
            );
            install.removeListener(listener);
            install.cancel();
            return;
          }

          // Cancel install if the addon version downloaded is detected
          // to be a downgrade compared to the version already installed.
          if (
            addon &&
            Services.vc.compare(addon.version, install.addon.version) > 0
          ) {
            lazy.log.warn(
              `Installation cancelled because installed version ${addon.version} is greater than ${install.addon.version} downloaded from ${url}`
            );
            install.removeListener(listener);
            install.cancel();
          }
        },
        onDownloadFailed: () => {
          install.removeListener(listener);
          reportFailure(
            policyName,
            `Download failed - ${lazy.AddonManager.errorToString(
              install.error
            )} - ${url}`
          );
          clearRunOnceModification("extensionsInstall");
        },
        onInstallFailed: () => {
          install.removeListener(listener);
          reportFailure(
            policyName,
            `Installation failed - ${lazy.AddonManager.errorToString(
              install.error
            )} - ${url}`
          );
        },
        /* eslint-disable-next-line no-shadow */
        onInstallEnded: (install, addon) => {
          if (addon.type == "theme") {
            addon.enable();
          }
          install.removeListener(listener);
          lazy.log.debug(`Installation succeeded - ${url}`);
        },
      };
      // If it's a local file install, onDownloadEnded is never called.
      // So we call it manually, to handle some error cases.
      if (url.startsWith("file:")) {
        listener.onDownloadEnded(install);
        if (install.state == lazy.AddonManager.STATE_CANCELLED) {
          return;
        }
      }
      install.addListener(listener);
      install.install();
    })
    .catch(e => {
      reportFailure(
        policyName,
        `Unable to install add-on from ${url}: ${e.message ?? e}`
      );
    });
}

let gBlockedAboutPages = [];

export function clearBlockedAboutPages() {
  gBlockedAboutPages = [];
}

export function blockAboutPage(manager, feature) {
  addChromeURLBlocker();
  gBlockedAboutPages.push(feature);

  try {
    let aboutModule = Cc[ABOUT_CONTRACT + feature.split(":")[1]].getService(
      Ci.nsIAboutModule
    );
    let chromeURL = aboutModule.getChromeURI(Services.io.newURI(feature)).spec;
    gBlockedAboutPages.push(chromeURL);
  } catch (e) {
    // Some about pages don't have chrome URLS (compat)
  }
}

let ChromeURLBlockPolicy = {
  shouldLoad(contentLocation, loadInfo) {
    let contentType = loadInfo.externalContentPolicyType;
    if (
      (contentLocation.scheme != "chrome" &&
        contentLocation.scheme != "about") ||
      (contentType != Ci.nsIContentPolicy.TYPE_DOCUMENT &&
        contentType != Ci.nsIContentPolicy.TYPE_SUBDOCUMENT)
    ) {
      return Ci.nsIContentPolicy.ACCEPT;
    }
    let contentLocationSpec = contentLocation.spec.toLowerCase();
    if (
      gBlockedAboutPages.some(function (aboutPage) {
        return contentLocationSpec.startsWith(aboutPage.toLowerCase());
      })
    ) {
      return Ci.nsIContentPolicy.REJECT_POLICY;
    }
    return Ci.nsIContentPolicy.ACCEPT;
  },
  shouldProcess() {
    return Ci.nsIContentPolicy.ACCEPT;
  },
  classDescription: "Policy Engine Content Policy",
  contractID: "@mozilla-org/policy-engine-content-policy-service;1",
  classID: Components.ID("{ba7b9118-cabc-4845-8b26-4215d2a59ed7}"),
  QueryInterface: ChromeUtils.generateQI(["nsIContentPolicy"]),
  createInstance(iid) {
    return this.QueryInterface(iid);
  },
};

function addChromeURLBlocker() {
  if (Cc[ChromeURLBlockPolicy.contractID]) {
    return;
  }

  let registrar = Components.manager.QueryInterface(Ci.nsIComponentRegistrar);
  registrar.registerFactory(
    ChromeURLBlockPolicy.classID,
    ChromeURLBlockPolicy.classDescription,
    ChromeURLBlockPolicy.contractID,
    ChromeURLBlockPolicy
  );

  Services.catMan.addCategoryEntry(
    "content-policy",
    ChromeURLBlockPolicy.contractID,
    ChromeURLBlockPolicy.contractID,
    false,
    true
  );
}

export function pemToBase64(pem) {
  return pem
    .replace(/(.*)-----BEGIN CERTIFICATE-----/, "")
    .replace(/-----END CERTIFICATE-----(.*)/, "")
    .replace(/[\r\n]/g, "");
}

export function processMIMEInfo(mimeInfo, realMIMEInfo, policyName) {
  if ("handlers" in mimeInfo) {
    let firstHandler = true;
    for (let handler of mimeInfo.handlers) {
      // handler can be null which means they don't
      // want a preferred handler.
      if (handler) {
        let handlerApp;
        if ("path" in handler) {
          try {
            let file = new lazy.FileUtils.File(handler.path);
            handlerApp = Cc[
              "@mozilla.org/uriloader/local-handler-app;1"
            ].createInstance(Ci.nsILocalHandlerApp);
            handlerApp.executable = file;
          } catch (ex) {
            reportFailure(
              policyName,
              `Unable to create handler executable (${handler.path})`
            );
            continue;
          }
        } else if ("uriTemplate" in handler) {
          let templateURL;
          try {
            templateURL = new URL(handler.uriTemplate);
          } catch (ex) {
            reportFailure(
              policyName,
              `Invalid web handler URL (${handler.uriTemplate})`
            );
            continue;
          }
          if (templateURL.protocol != "https:") {
            reportFailure(
              policyName,
              `Web handler must be https (${handler.uriTemplate})`
            );
            continue;
          }
          if (
            !templateURL.pathname.includes("%s") &&
            !templateURL.search.includes("%s")
          ) {
            reportFailure(
              policyName,
              `Web handler must contain %s (${handler.uriTemplate})`
            );
            continue;
          }
          handlerApp = Cc[
            "@mozilla.org/uriloader/web-handler-app;1"
          ].createInstance(Ci.nsIWebHandlerApp);
          handlerApp.uriTemplate = handler.uriTemplate;
        } else {
          reportFailure(policyName, "Invalid handler");
          continue;
        }
        if ("name" in handler) {
          handlerApp.name = handler.name;
        }
        realMIMEInfo.possibleApplicationHandlers.appendElement(handlerApp);
        if (firstHandler) {
          realMIMEInfo.preferredApplicationHandler = handlerApp;
        }
      }
      firstHandler = false;
    }
  }
  if ("action" in mimeInfo) {
    let action = realMIMEInfo[mimeInfo.action];
    if (
      action == realMIMEInfo.useHelperApp &&
      !realMIMEInfo.possibleApplicationHandlers.length
    ) {
      reportFailure(policyName, "useHelperApp requires a handler");
      return;
    }
    realMIMEInfo.preferredAction = action;
  }
  if ("ask" in mimeInfo) {
    realMIMEInfo.alwaysAskBeforeHandling = mimeInfo.ask;
  }
  lazy.gHandlerService.store(realMIMEInfo);
}
