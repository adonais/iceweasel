/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const HOMEPAGE_PREF = "browser.startup.homepage";
const PRIVACY_SEGMENTATION_PREF = "browser.dataFeatureRecommendations.enabled";
const MESSAGING_ACTION_PREF = "special-message-testpref";
const TIMESTAMP_PREF = "termsofuse.acceptedDate";

const PREFS_TO_CLEAR = [
  HOMEPAGE_PREF,
  PRIVACY_SEGMENTATION_PREF,
  TIMESTAMP_PREF,
  `messaging-system-action.${MESSAGING_ACTION_PREF}`,
];

add_setup(async function () {
  registerCleanupFunction(async () => {
    PREFS_TO_CLEAR.forEach(pref => Services.prefs.clearUserPref(pref));
  });
});

add_task(async function test_set_privacy_segmentation_pref() {
  const action = {
    type: "SET_PREF",
    data: {
      pref: {
        name: PRIVACY_SEGMENTATION_PREF,
        value: true,
      },
    },
  };

  Assert.ok(
    !Services.prefs.prefHasUserValue(PRIVACY_SEGMENTATION_PREF),
    "Test setup ok"
  );

  await SMATestUtils.executeAndValidateAction(action);

  Assert.ok(
    Services.prefs.getBoolPref(PRIVACY_SEGMENTATION_PREF),
    `${PRIVACY_SEGMENTATION_PREF} pref successfully updated`
  );
});

add_task(async function test_clear_privacy_segmentation_pref() {
  Services.prefs.setBoolPref(PRIVACY_SEGMENTATION_PREF, true);
  Assert.ok(
    Services.prefs.prefHasUserValue(PRIVACY_SEGMENTATION_PREF),
    "Test setup ok"
  );

  const action = {
    type: "SET_PREF",
    data: {
      pref: {
        name: PRIVACY_SEGMENTATION_PREF,
      },
    },
  };

  await SMATestUtils.executeAndValidateAction(action);

  Assert.ok(
    !Services.prefs.prefHasUserValue(PRIVACY_SEGMENTATION_PREF),
    `${PRIVACY_SEGMENTATION_PREF} pref successfully cleared`
  );
});

add_task(async function test_set_homepage_pref() {
  const action = {
    type: "SET_PREF",
    data: {
      pref: {
        name: HOMEPAGE_PREF,
        value: "https://foo.example.com",
      },
    },
  };

  Assert.ok(!Services.prefs.prefHasUserValue(HOMEPAGE_PREF), "Test setup ok");

  await SMATestUtils.executeAndValidateAction(action);

  Assert.equal(
    Services.prefs.getStringPref(HOMEPAGE_PREF),
    "https://foo.example.com",
    `${HOMEPAGE_PREF} pref successfully updated`
  );
});

add_task(async function test_clear_homepage_pref() {
  Services.prefs.setStringPref(HOMEPAGE_PREF, "https://www.example.com");
  Assert.ok(Services.prefs.prefHasUserValue(HOMEPAGE_PREF), "Test setup ok");

  const action = {
    type: "SET_PREF",
    data: {
      pref: {
        name: HOMEPAGE_PREF,
      },
    },
  };

  await SMATestUtils.executeAndValidateAction(action);

  Assert.ok(
    !Services.prefs.prefHasUserValue(HOMEPAGE_PREF),
    `${HOMEPAGE_PREF} pref successfully updated`
  );
});

// Set a pref not listed in "allowed prefs"
add_task(async function test_set_messaging_system_pref() {
  const action = {
    type: "SET_PREF",
    data: {
      pref: {
        name: MESSAGING_ACTION_PREF,
        value: true,
      },
    },
  };

  await SMATestUtils.executeAndValidateAction(action);

  Assert.equal(
    Services.prefs.getBoolPref(
      `messaging-system-action.${MESSAGING_ACTION_PREF}`
    ),
    true,
    `messaging-system-action.${MESSAGING_ACTION_PREF} pref successfully updated to correct value`
  );
});

// Clear a pref not listed in "allowed prefs" that was initially set by
// the SET_PREF special messaging action
add_task(async function test_clear_messaging_system_pref() {
  Services.prefs.setBoolPref(
    `messaging-system-action.${MESSAGING_ACTION_PREF}`,
    true
  );
  Assert.ok(
    Services.prefs.prefHasUserValue(
      `messaging-system-action.${MESSAGING_ACTION_PREF}`
    ),
    "Test setup ok"
  );

  const action = {
    type: "SET_PREF",
    data: {
      pref: {
        name: MESSAGING_ACTION_PREF,
      },
    },
  };

  await SMATestUtils.executeAndValidateAction(action);

  Assert.ok(
    !Services.prefs.prefHasUserValue(
      `messaging-system-action.${MESSAGING_ACTION_PREF}`
    ),
    `messaging-system-action.${MESSAGING_ACTION_PREF} pref successfully cleared`
  );
});

add_task(async function test_set_pref_to_timestamp_string() {
  Assert.ok(!Services.prefs.prefHasUserValue(TIMESTAMP_PREF), "Test setup ok");

  const action = {
    type: "SET_PREF",
    data: {
      pref: {
        name: TIMESTAMP_PREF,
        value: { timestamp: true },
      },
    },
  };

  const before = Date.now();
  await SMATestUtils.executeAndValidateAction(action);
  const after = Date.now();

  Assert.ok(
    Services.prefs.prefHasUserValue(TIMESTAMP_PREF),
    "Timestamp pref successfully set"
  );

  const value = Services.prefs.getStringPref(TIMESTAMP_PREF);
  const timestamp = parseInt(value, 10);
  Assert.ok(!isNaN(timestamp), "Timestamp value is a valid number");
  Assert.ok(
    timestamp >= before && timestamp <= after,
    "Timestamp is within the expected time range"
  );
});

add_task(async function test_set_messaging_system_pref_onImpression() {
  const action = {
    type: "SET_PREF",
    data: {
      pref: {
        name: MESSAGING_ACTION_PREF,
        value: true,
      },
      onImpression: true,
    },
  };

  Assert.ok(
    !Services.prefs.prefHasUserValue(
      `messaging-system-action.${MESSAGING_ACTION_PREF}`
    ),
    "Test setup ok"
  );

  await SMATestUtils.executeAndValidateAction(action);

  Assert.equal(
    Services.prefs.getBoolPref(
      `messaging-system-action.${MESSAGING_ACTION_PREF}`
    ),
    true,
    "messaging-system-action.<name> pref successfully set on impression"
  );

  Services.prefs.clearUserPref(
    `messaging-system-action.${MESSAGING_ACTION_PREF}`
  );
});

add_task(async function test_set_unallowed_pref_onImpression_namespaced() {
  const action = {
    type: "SET_PREF",
    data: {
      pref: {
        name: PRIVACY_SEGMENTATION_PREF,
        value: true,
      },
      onImpression: true,
    },
  };

  Assert.ok(
    !Services.prefs.prefHasUserValue(PRIVACY_SEGMENTATION_PREF),
    "Original pref not set"
  );
  Assert.ok(
    !Services.prefs.prefHasUserValue(
      `messaging-system-action.${PRIVACY_SEGMENTATION_PREF}`
    ),
    "Namespaced pref not set"
  );

  await SMATestUtils.executeAndValidateAction(action);

  Assert.ok(
    !Services.prefs.prefHasUserValue(PRIVACY_SEGMENTATION_PREF),
    "Original pref still not set"
  );

  Assert.ok(
    Services.prefs.getBoolPref(
      `messaging-system-action.${PRIVACY_SEGMENTATION_PREF}`
    ),
    "Non-allowed existing pref name was namespaced and set on impression"
  );

  Services.prefs.clearUserPref(
    `messaging-system-action.${PRIVACY_SEGMENTATION_PREF}`
  );
});

add_task(async function test_clear_namespaced_pref_onImpression() {
  const namespaced = `messaging-system-action.${MESSAGING_ACTION_PREF}`;

  Services.prefs.setBoolPref(namespaced, true);
  Assert.ok(Services.prefs.prefHasUserValue(namespaced), "Test setup ok");

  const action = {
    type: "SET_PREF",
    data: {
      pref: {
        name: namespaced,
      },
      onImpression: true,
    },
  };

  await SMATestUtils.executeAndValidateAction(action);

  Assert.ok(
    !Services.prefs.prefHasUserValue(namespaced),
    "Namespace pref successfully cleared on impression"
  );
});

add_task(async function test_update_namespaced_timestamp_pref_onImpression() {
  const namespaced = `messaging-system-action.${MESSAGING_ACTION_PREF}`;
  Services.prefs.clearUserPref(namespaced);

  const action = {
    type: "SET_PREF",
    data: {
      pref: {
        name: namespaced,
        value: { timestamp: true },
      },
      onImpression: true,
    },
  };

  await SMATestUtils.executeAndValidateAction(action);
  const first = Services.prefs.getStringPref(namespaced);
  Assert.ok(first, "First timestamp was written");

  // Small delay so the next timestamp will be strictly greater
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(r => setTimeout(r, 5));

  await SMATestUtils.executeAndValidateAction(action);
  const second = Services.prefs.getStringPref(namespaced);
  Assert.ok(second, "Second timestamp was written");
  Assert.greater(
    parseInt(second, 10),
    parseInt(first, 10),
    `Timestamp bumped on re-impression (first=${first}, second=${second})`
  );

  Services.prefs.clearUserPref(namespaced);
});
