/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

export const DEFAULT_WINDOWS_LAUNCH_ON_LOGIN_NIMBUS_FEATURE_ID =
  "defaultWindowsLaunchOnLogin";

export const DEFAULT_WINDOWS_LAUNCH_ON_LOGIN_PREF =
  "browser.startup.windowsLaunchOnLogin.defaultEnabled";

const lazy = XPCOMUtils.declareLazy({
  ClientEnvironmentBase:
    "resource://gre/modules/components-utils/ClientEnvironment.sys.mjs",
  NimbusFeatures: "resource://nimbus/ExperimentAPI.sys.mjs",
});

export var DefaultWindowsLaunchOnLogin = {
  // Called once per new install to give Nimbus a chance to override the
  // default-enabled launch-on-login behavior in either direction by setting
  // the defaultEnabled pref. The actual registry write to enable
  // launch-on-login happens later in StartupOSIntegration.onStartupIdle.
  async applyExperimentOverride() {
    if (!lazy.ClientEnvironmentBase.os.isWindows) {
      return;
    }

    this.logger.debug(
      "New install - checking Nimbus for launch on login override"
    );

    const nimbusFeature =
      lazy.NimbusFeatures[DEFAULT_WINDOWS_LAUNCH_ON_LOGIN_NIMBUS_FEATURE_ID];
    await nimbusFeature.ready();
    let metadata = await nimbusFeature.getEnrollmentMetadata();
    if (!metadata) {
      this.logger.debug("   - user not enrolled");
      return;
    }

    // Use the pref's default value as the Nimbus fallback so that an
    // enrolled-but-variable-unset state behaves the same as not being
    // enrolled at all (no override).
    let prefDefault = Services.prefs
      .getDefaultBranch("")
      .getBoolPref(DEFAULT_WINDOWS_LAUNCH_ON_LOGIN_PREF, true);

    const { enabled } = nimbusFeature.getAllVariables({
      defaultValues: { enabled: prefDefault },
    });

    Services.prefs.setBoolPref(DEFAULT_WINDOWS_LAUNCH_ON_LOGIN_PREF, enabled);
    this.logger.debug(`   - Nimbus set default to ${enabled}`);
  },

  logger: console.createInstance({
    prefix: "DefaultWindowsLaunchOnLogin",
    maxLogLevel: "Debug",
  }),
};
