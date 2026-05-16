/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { IPPFxaAuthProviderSingleton } from "moz-src:///toolkit/components/ipprotection/fxa/IPPFxaAuthProvider.sys.mjs";
import { androidEnroll } from "moz-src:///toolkit/components/ipprotection/android/IPPAndroidEnroll.sys.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  IPPAndroidSignInWatcher:
    "moz-src:///toolkit/components/ipprotection/android/IPPAndroidSignInWatcher.sys.mjs",
});

/**
 * Android implementation of IPPFxaAuthProviderSingleton.
 * Uses EventDispatcher to bridge sign-in state and enrollment to the Android layer.
 */
class IPPAndroidAuthProviderSingleton extends IPPFxaAuthProviderSingleton {
  constructor() {
    super(lazy.IPPAndroidSignInWatcher, androidEnroll);
  }
}

const IPPAndroidAuthProvider = new IPPAndroidAuthProviderSingleton();

export { IPPAndroidAuthProvider };
