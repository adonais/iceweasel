/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

do_get_profile();

const { getUserMemories } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/Tools.sys.mjs"
);

const { SecurityProperties } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/SecurityProperties.sys.mjs"
);

add_task(async function test_getUserMemories_sets_security_flags() {
  const securityProperties = new SecurityProperties();
  await getUserMemories({}, securityProperties);
  securityProperties.commit();
  Assert.equal(securityProperties.privateData, true, "private_data set");
  Assert.equal(
    securityProperties.untrustedInput,
    false,
    "untrusted_input not set"
  );
});

add_task(async function test_getUserMemories_allowed_when_flags_set() {
  const securityProperties = new SecurityProperties();
  securityProperties.setPrivateData();
  securityProperties.setUntrustedInput();
  securityProperties.commit();
  const result = await getUserMemories({}, securityProperties);

  Assert.ok(Array.isArray(result), "returns array, not a refusal");
});
