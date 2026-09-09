/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

ChromeUtils.defineESModuleGetters(this, {
  ExperimentAPI: "resource://nimbus/ExperimentAPI.sys.mjs",
  NimbusTestUtils: "resource://testing-common/NimbusTestUtils.sys.mjs",
});

const ML_PREF = "extensions.formautofill.useml";

add_setup(async () => {
  // The test profile pins this pref on the user branch, which would mask the
  // default-branch value that the Nimbus variable writes.
  await SpecialPowers.pushPrefEnv({ clear: [[ML_PREF]] });
});

add_task(async function test_mlNimbusPref() {
  await ExperimentAPI.ready();

  await checkEnrollmentWithValue(true);
  await checkEnrollmentWithValue(false);
});

async function checkEnrollmentWithValue(aEnabled) {
  const doCleanup = await NimbusTestUtils.enrollWithFeatureConfig({
    featureId: "autofill-ml",
    value: { enabled: aEnabled },
  });

  Assert.equal(
    FormAutofillUtils.isMLAutofillEnabled,
    aEnabled,
    `ML autofill follows the autofill-ml Nimbus variable (${aEnabled})`
  );

  await doCleanup();
}
