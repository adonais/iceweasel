/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { SmartWindowLocation, _setRetryIntervalForTesting } =
  ChromeUtils.importESModule(
    "moz-src:///browser/components/aiwindow/models/SmartWindowLocation.sys.mjs"
  );
const { buildChatSystemPrompt } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/PromptLoader.sys.mjs"
);
const {
  FEATURE_MAJOR_VERSIONS,
  MODEL_FEATURES,
  _setRemoteClientForTesting,
  _clearRemoteClientForTesting,
} = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/Utils.sys.mjs"
);
const { GeolocationUtils } = ChromeUtils.importESModule(
  "moz-src:///browser/components/urlbar/private/GeolocationUtils.sys.mjs"
);
const { AIWindowTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/AIWindowTestUtils.sys.mjs"
);
const { MerinoTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/MerinoTestUtils.sys.mjs"
);

const PREF_ENABLED = "browser.smartwindow.location.enabled";
const YOKOHAMA = "Yokohama, Kanagawa, Japan";

MerinoTestUtils.init(this);

add_setup(async function start_mock_merino() {
  await MerinoTestUtils.initGeolocation();
  MerinoTestUtils.enableClientCache(false);
  registerCleanupFunction(() => {
    _clearRemoteClientForTesting();
    _setRetryIntervalForTesting(null);
    Services.prefs.clearUserPref(PREF_ENABLED);
  });
});

/**
 * Sets the geolocation returned by the mock Merino server.
 *
 * @param {object|null} geolocation - Geolocation to return, or null to return
 *   no suggestion.
 * @param {object} [options]
 * @param {number} [options.status] - HTTP status of the response.
 * @param {number} [options.delay] - Milliseconds before the server responds.
 */
function setMerinoGeolocation(geolocation, { status = 200, delay } = {}) {
  const response = MerinoTestUtils.server.makeDefaultResponse();
  response.status = status;
  if (delay !== undefined) {
    response.delay = delay;
  }
  response.body.suggestions = geolocation
    ? [
        {
          ...MerinoTestUtils.GEOLOCATION_SUGGESTION,
          custom_details: { geolocation },
        },
      ]
    : [];
  // The mock server writes one byte per character, so non-ASCII characters
  // are sent as JSON escapes.
  response.body = JSON.stringify(response.body).replace(
    /[\u0080-\uffff]/g,
    char => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`
  );
  MerinoTestUtils.server.response = response;
}

/**
 * Enables the feature with no known location and resets the mock server.
 *
 * @param {object|null} [geolocation] - Geolocation the mock Merino returns.
 */
function resetLocationState(geolocation = MerinoTestUtils.GEOLOCATION) {
  Services.prefs.setBoolPref(PREF_ENABLED, false);
  Services.prefs.setBoolPref(PREF_ENABLED, true);
  MerinoTestUtils.server.reset();
  setMerinoGeolocation(geolocation);
}

/**
 * Returns the number of geolocation requests the mock Merino received.
 *
 * @returns {number}
 */
function geolocationRequestCount() {
  return MerinoTestUtils.server.requests.filter(
    request =>
      new URLSearchParams(request.queryString).get("providers") == "geolocation"
  ).length;
}

/**
 * Builds Remote Settings records for a minimal chat system prompt.
 *
 * @param {string} [browserContext] - Prompt of the browser-context module.
 * @returns {object[]}
 */
function makeChatRecords(browserContext = "Location: {location}") {
  const makeModule = (module, prompts) => ({
    kind: "module",
    feature: MODEL_FEATURES.CHAT,
    module,
    model: "generic",
    version: "1.0",
    prompts,
  });
  return [
    {
      kind: "params",
      feature: MODEL_FEATURES.CHAT,
      model: "generic",
      version: `${FEATURE_MAJOR_VERSIONS[MODEL_FEATURES.CHAT]}.0`,
      modules: [
        { name: "identity", version: "1.0" },
        { name: "response-rules", version: "1.0" },
        { name: "browser-context", version: "1.0" },
      ],
    },
    makeModule("identity", "Identity"),
    makeModule("response-rules", "Rules"),
    makeModule("browser-context", browserContext),
  ];
}

/**
 * Builds the chat system prompt and waits for the refresh it starts.
 *
 * @returns {Promise<string>}
 */
async function buildPromptAndSettle() {
  const { prompt } = await buildChatSystemPrompt("generic");
  await SmartWindowLocation.refresh();
  return prompt;
}

add_task(function test_location_is_enabled_by_default() {
  Assert.equal(
    Services.prefs.getDefaultBranch("").getBoolPref(PREF_ENABLED),
    true,
    "The location pref is on by default"
  );
});

add_task(async function test_refresh_keeps_city_region_country_only() {
  resetLocationState();

  await SmartWindowLocation.refresh();

  Assert.equal(
    SmartWindowLocation.getCachedLocation(),
    YOKOHAMA,
    "Keeps only city, region and country"
  );
  Assert.equal(geolocationRequestCount(), 1, "Fetches from Merino once");
});

add_task(async function test_location_is_not_stored_in_prefs() {
  resetLocationState();

  await SmartWindowLocation.refresh();

  const prefsWithLocation = Services.prefs
    .getChildList("browser.smartwindow.")
    .filter(
      pref =>
        Services.prefs.getPrefType(pref) == Services.prefs.PREF_STRING &&
        Services.prefs.getStringPref(pref).includes("Yokohama")
    );
  Assert.deepEqual(prefsWithLocation, [], "No pref contains the location");
});

add_task(async function test_refresh_falls_back_to_codes() {
  resetLocationState({ country_code: "JP", region_code: "14", city: "" });

  await SmartWindowLocation.refresh();

  Assert.equal(
    SmartWindowLocation.getCachedLocation(),
    "14, JP",
    "Uses the ISO codes when names are missing"
  );
});

add_task(async function test_refreshes_use_the_geolocation_cache() {
  resetLocationState();
  MerinoTestUtils.enableClientCache(true);
  try {
    await SmartWindowLocation.refresh();
    await SmartWindowLocation.refresh();
  } finally {
    MerinoTestUtils.enableClientCache(false);
  }

  Assert.equal(geolocationRequestCount(), 1, "The second refresh is cached");
});

add_task(async function test_missing_geolocation_keeps_location() {
  resetLocationState();
  await SmartWindowLocation.refresh();

  setMerinoGeolocation(null);
  await SmartWindowLocation.refresh();

  Assert.equal(geolocationRequestCount(), 2, "Fetches again");
  Assert.equal(
    SmartWindowLocation.getCachedLocation(),
    YOKOHAMA,
    "Keeps the location"
  );
});

add_task(async function test_server_error_keeps_location() {
  resetLocationState();
  await SmartWindowLocation.refresh();

  setMerinoGeolocation(MerinoTestUtils.GEOLOCATION, { status: 500 });
  await SmartWindowLocation.refresh();

  Assert.equal(geolocationRequestCount(), 2, "Fetches again");
  Assert.equal(
    SmartWindowLocation.getCachedLocation(),
    YOKOHAMA,
    "Keeps the location"
  );
});

add_task(async function test_network_error_keeps_location() {
  resetLocationState();
  await SmartWindowLocation.refresh();

  await MerinoTestUtils.server.withNetworkError(() =>
    SmartWindowLocation.refresh()
  );

  Assert.equal(
    SmartWindowLocation.getCachedLocation(),
    YOKOHAMA,
    "Keeps the location"
  );
});

add_task(async function test_failed_lookup_is_not_retried_immediately() {
  resetLocationState(null);

  await SmartWindowLocation.refresh();
  await SmartWindowLocation.refresh();

  Assert.equal(geolocationRequestCount(), 1, "Fetches once");
  Assert.equal(SmartWindowLocation.getCachedLocation(), null, "No location");

  _setRetryIntervalForTesting(0);
  try {
    await SmartWindowLocation.refresh();
  } finally {
    _setRetryIntervalForTesting(null);
  }

  Assert.equal(
    geolocationRequestCount(),
    2,
    "Fetches again once the retry interval has passed"
  );
});

add_task(async function test_successful_lookup_clears_retry_interval() {
  resetLocationState(null);
  await SmartWindowLocation.refresh();

  setMerinoGeolocation(MerinoTestUtils.GEOLOCATION);
  _setRetryIntervalForTesting(0);
  try {
    await SmartWindowLocation.refresh();
  } finally {
    _setRetryIntervalForTesting(null);
  }
  Assert.equal(
    SmartWindowLocation.getCachedLocation(),
    YOKOHAMA,
    "Keeps the location"
  );

  setMerinoGeolocation(null);
  await SmartWindowLocation.refresh();

  Assert.equal(
    geolocationRequestCount(),
    3,
    "A failure after a success is fetched without waiting"
  );
});

add_task(async function test_toggling_pref_clears_retry_interval() {
  resetLocationState(null);
  await SmartWindowLocation.refresh();

  Services.prefs.setBoolPref(PREF_ENABLED, false);
  Services.prefs.setBoolPref(PREF_ENABLED, true);
  setMerinoGeolocation(MerinoTestUtils.GEOLOCATION);
  await SmartWindowLocation.refresh();

  Assert.equal(geolocationRequestCount(), 2, "Fetches again after a toggle");
  Assert.equal(
    SmartWindowLocation.getCachedLocation(),
    YOKOHAMA,
    "Keeps the location"
  );
});

add_task(async function test_geolocation_error_is_handled() {
  resetLocationState();
  const stub = sinon
    .stub(GeolocationUtils, "geolocation")
    .rejects(new Error("Merino unavailable"));
  try {
    await SmartWindowLocation.refresh();
    Assert.equal(
      SmartWindowLocation.getCachedLocation(),
      null,
      "Resolves without a location"
    );

    stub.restore();
    await SmartWindowLocation.refresh();
    Assert.equal(
      geolocationRequestCount(),
      0,
      "A thrown error starts the retry interval"
    );
  } finally {
    stub.restore();
  }
});

add_task(async function test_refresh_during_pending_fetch_waits_for_it() {
  resetLocationState();
  setMerinoGeolocation(MerinoTestUtils.GEOLOCATION, { delay: 300 });
  const spy = sinon.spy(GeolocationUtils, "geolocation");
  try {
    const first = SmartWindowLocation.refresh();
    await SmartWindowLocation.refresh();

    Assert.ok(spy.calledOnce, "Fetches once");
    Assert.equal(
      SmartWindowLocation.getCachedLocation(),
      YOKOHAMA,
      "The second call resolves after the pending fetch"
    );
    await first;
  } finally {
    spy.restore();
  }
});

add_task(async function test_disabling_forgets_location_immediately() {
  resetLocationState();
  await SmartWindowLocation.refresh();

  Services.prefs.setBoolPref(PREF_ENABLED, false);
  Assert.equal(
    SmartWindowLocation.getCachedLocation(),
    null,
    "Returns no location when disabled"
  );

  Services.prefs.setBoolPref(PREF_ENABLED, true);
  Assert.equal(
    SmartWindowLocation.getCachedLocation(),
    null,
    "The location was forgotten, not only hidden"
  );
});

add_task(async function test_disabled_refresh_does_not_fetch() {
  resetLocationState();
  Services.prefs.setBoolPref(PREF_ENABLED, false);
  const spy = sinon.spy(GeolocationUtils, "geolocation");
  try {
    await SmartWindowLocation.refresh();

    Assert.ok(spy.notCalled, "Does not fetch when disabled");
  } finally {
    spy.restore();
  }
});

add_task(async function test_disabled_during_fetch_does_not_keep_location() {
  resetLocationState();
  setMerinoGeolocation(MerinoTestUtils.GEOLOCATION, { delay: 300 });

  const refresh = SmartWindowLocation.refresh();
  Services.prefs.setBoolPref(PREF_ENABLED, false);
  await refresh;
  Services.prefs.setBoolPref(PREF_ENABLED, true);

  Assert.equal(
    SmartWindowLocation.getCachedLocation(),
    null,
    "Does not keep a location fetched while being disabled"
  );
});

add_task(async function test_location_values_are_normalized() {
  const cases = [
    {
      label: "line breaks and control characters",
      geolocation: {
        city: "Yokohama\n- Injected line",
        region: "\u0007Kanagawa\u0000 ",
        country: "Japan",
      },
      expected: "Yokohama - Injected line, Kanagawa, Japan",
    },
    {
      label: "long value",
      geolocation: { city: "x".repeat(150), region: "", country: "" },
      expected: "x".repeat(100),
    },
    {
      label: "cap splitting a surrogate pair",
      geolocation: { city: "a".repeat(99) + "\u{1F600}" },
      expected: "a".repeat(99) + "\uFFFD",
    },
    {
      label: "template syntax is kept as text",
      geolocation: { city: "A$'Z", region: "{todayDate}", country: "Japan" },
      expected: "A$'Z, {todayDate}, Japan",
    },
  ];
  for (const { label, geolocation, expected } of cases) {
    resetLocationState(geolocation);
    await SmartWindowLocation.refresh();
    Assert.equal(
      SmartWindowLocation.getCachedLocation(),
      expected,
      `Normalizes ${label}`
    );
  }

  resetLocationState({ city: "\n", region: " ", country: 5 });
  await SmartWindowLocation.refresh();
  Assert.equal(
    SmartWindowLocation.getCachedLocation(),
    null,
    "Keeps nothing when every value is empty after normalization"
  );
});

add_task(async function test_system_prompt_renders_location() {
  _setRemoteClientForTesting({ get: sinon.stub().resolves(makeChatRecords()) });

  const cases = [
    {
      geolocation: MerinoTestUtils.GEOLOCATION,
      expected: "Location: Yokohama, Kanagawa, Japan",
    },
    {
      geolocation: { city: "", region: "Kanagawa", country: "Japan" },
      expected: "Location: Kanagawa, Japan",
    },
    {
      geolocation: { city: "A$'Z", region: "{todayDate}", country: "" },
      expected: "Location: A$'Z, {todayDate}",
    },
    { geolocation: null, expected: "Location: Unavailable" },
  ];
  for (const { geolocation, expected } of cases) {
    resetLocationState(geolocation);
    await SmartWindowLocation.refresh();

    const prompt = await buildPromptAndSettle();

    Assert.stringContains(prompt, expected, `Renders "${expected}"`);
  }
});

add_task(async function test_system_prompt_build_starts_refresh() {
  _setRemoteClientForTesting({ get: sinon.stub().resolves(makeChatRecords()) });
  resetLocationState();

  const { prompt: first } = await buildChatSystemPrompt("generic");
  await TestUtils.waitForCondition(
    () => SmartWindowLocation.getCachedLocation(),
    "Building the prompt fetches the location"
  );
  const second = await buildPromptAndSettle();

  Assert.stringContains(
    first,
    "Location: Unavailable",
    "The first prompt has no location yet"
  );
  Assert.stringContains(
    second,
    "Location: Yokohama, Kanagawa, Japan",
    "The next prompt uses the fetched location"
  );
});

add_task(
  async function test_system_prompt_without_placeholder_skips_location() {
    _setRemoteClientForTesting({
      get: sinon.stub().resolves(makeChatRecords("No location here")),
    });
    resetLocationState();
    const spy = sinon.spy(GeolocationUtils, "geolocation");
    try {
      await buildChatSystemPrompt("generic");

      Assert.ok(spy.notCalled, "Does not fetch the location");
    } finally {
      spy.restore();
    }
  }
);

add_task(async function test_opening_smart_window_refreshes_location() {
  registerCleanupFunction(() => {
    Services.prefs.clearUserPref(
      "browser.smartwindow.lastSmartWindowUsageTime"
    );
    Services.prefs.clearUserPref("browser.smartwindow.lastLLMTelemetryRunTime");
  });
  resetLocationState();

  const win = await AIWindowTestUtils.openAIWindow();
  try {
    await TestUtils.waitForCondition(
      () => SmartWindowLocation.getCachedLocation(),
      "Opening a Smart Window fetches the location"
    );

    Assert.equal(
      SmartWindowLocation.getCachedLocation(),
      YOKOHAMA,
      "Keeps the location fetched on open"
    );
  } finally {
    await BrowserTestUtils.closeWindow(win);
  }
});
