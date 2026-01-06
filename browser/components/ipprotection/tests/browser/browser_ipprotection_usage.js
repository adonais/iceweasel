/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { IPPChannelFilter } = ChromeUtils.importESModule(
  "resource:///modules/ipprotection/IPPChannelFilter.sys.mjs"
);
const { IPProtectionUsage } = ChromeUtils.importESModule(
  "resource:///modules/ipprotection/IPProtectionUsage.sys.mjs"
);

add_task(async function test_createConnection_and_proxy() {
  await withProxyServer(async proxyInfo => {
    // Create the IPP connection filter
    const filter = IPPChannelFilter.create();
    filter.initialize("", proxyInfo.server);
    filter.start();

    const observer = new IPProtectionUsage();
    observer.addIsolationKey(filter.isolationKey);
    observer.start();

    let tab = await BrowserTestUtils.openNewForegroundTab(
      gBrowser,
      // Note: this will not be loaded as the proxy will refuse the connection
      // eslint-disable-next-line @microsoft/sdl/no-insecure-url
      `http://example.com/`
    );

    await proxyInfo.gotConnection;
    await BrowserTestUtils.removeTab(tab);

    Assert.greater(
      Glean.ipprotection.usageRx.testGetValue().sum,
      0,
      "usageRx should have recorded bytes"
    );
    Assert.greater(
      Glean.ipprotection.usageTx.testGetValue().sum,
      0,
      "usageTx should record bytes for POST requests"
    );
  });
});
