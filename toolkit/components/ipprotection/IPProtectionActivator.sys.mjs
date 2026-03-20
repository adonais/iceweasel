/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { IPProtectionService } from "moz-src:///toolkit/components/ipprotection/IPProtectionService.sys.mjs";
import { IPPProxyManager } from "moz-src:///toolkit/components/ipprotection/IPPProxyManager.sys.mjs";
import { IPPAutoRestoreHelper } from "moz-src:///toolkit/components/ipprotection/IPPAutoRestore.sys.mjs";
import { IPPAutoStartHelpers } from "moz-src:///toolkit/components/ipprotection/IPPAutoStart.sys.mjs";
import { IPPEnrollAndEntitleManager } from "moz-src:///toolkit/components/ipprotection/IPPEnrollAndEntitleManager.sys.mjs";
import { IPPNimbusHelper } from "moz-src:///toolkit/components/ipprotection/IPPNimbusHelper.sys.mjs";
import { IPProtectionServerlist } from "moz-src:///toolkit/components/ipprotection/IPProtectionServerlist.sys.mjs";
import { IPPSignInWatcher } from "moz-src:///toolkit/components/ipprotection/IPPSignInWatcher.sys.mjs";
import { IPPStartupCache } from "moz-src:///toolkit/components/ipprotection/IPPStartupCache.sys.mjs";

const coreHelpers = [
  IPPStartupCache,
  IPPSignInWatcher,
  IPProtectionServerlist,
  IPPEnrollAndEntitleManager,
  IPPProxyManager,
  IPPAutoRestoreHelper,
  ...IPPAutoStartHelpers,
  IPPNimbusHelper,
];

let extraHelpers = [];

export const IPProtectionActivator = {
  addHelpers(helpers) {
    extraHelpers.push(...helpers);
  },
  setupHelpers() {
    IPProtectionService.setHelpers([...coreHelpers, ...extraHelpers]);
  },
  init() {
    this.setupHelpers();
    return IPProtectionService.init();
  },
  uninit() {
    return IPProtectionService.uninit();
  },
};
