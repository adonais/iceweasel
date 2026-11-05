/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);

// The oblivious HTTP service is created during nsDNSService::Init, and must
// not fetch its config before the DNS service has finished initializing.
add_task(async function test_dns_init_with_ohttp_config() {
  Assert.ok(Services.dns, "DNS service was created");

  let ohttpService = Cc[
    "@mozilla.org/network/oblivious-http-service;1"
  ].getService(Ci.nsIObliviousHttpService);
  await TestUtils.waitForCondition(() => {
    let relayURI = {};
    ohttpService.getTRRSettings(relayURI, {});
    return relayURI.value?.spec == "https://localhost/relay";
  }, "OHTTP prefs were read");
});
