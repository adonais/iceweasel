/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

export var UnsupportedLaunchOnLogin = {
  async createLaunchOnLogin() {
    return await Promise.resolve(false);
  },

  async removeLaunchOnLogin() {
    return await Promise.resolve(true);
  },

  async getLaunchOnLoginApproved() {
    return await Promise.resolve(false);
  },

  async getLaunchOnLoginEnabled() {
    return await Promise.resolve(false);
  },

  async getLaunchOnLoginEnablementDetails() {
    return await Promise.resolve({
      isEnabled: false,
      isSupported: false,
      isAllowedByPolicy: false,
    });
  },
};
