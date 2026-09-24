/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Bug 1486337 - Shim BmAuth by 9c9media
 *
 * Sites using Bell Media's authentication script expect it to define
 * window.BmAuth, and can fail to render at all when the script is blocked.
 * This shim provides a stub which reports the user as signed out, so that the
 * rest of the page continues to load.
 */

"use strict";

if (!window.BmAuth) {
  window.BmAuth = {
    init: () => new Promise(() => {}),
    handleSignIn: () => {
      // TODO: handle this properly!
    },
    isAuthenticated: () => Promise.resolve(false),
    addListener: () => {},
    api: {
      event: {
        addListener: () => {},
      },
    },
  };
}
