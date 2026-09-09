/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

const lazy = {};

XPCOMUtils.defineLazyServiceGetter(
  lazy,
  "MacShellService",
  "@mozilla.org/browser/shell-service;1",
  Ci.nsIMacShellService
);

export var MacOSLaunchOnLogin = {
  async createLaunchOnLogin() {
    return lazy.MacShellService.enableLaunchOnLogin();
  },

  async removeLaunchOnLogin() {
    return lazy.MacShellService.disableLaunchOnLogin();
  },

  /**
   *
   * @returns {bool}
   *          Always returns true as this is an OS level policy
   *          restriction and this is not supported on macOS
   */
  async getLaunchOnLoginApproved() {
    return true;
  },

  async getLaunchOnLoginEnabled() {
    return lazy.MacShellService.getLaunchOnLoginEnabled();
  },

  async getLaunchOnLoginEnablementDetails() {
    return {
      isEnabled: lazy.MacShellService.getLaunchOnLoginEnabled(),
      isSupported: true,
      isAllowedByPolicy: true,
    };
  },
};
