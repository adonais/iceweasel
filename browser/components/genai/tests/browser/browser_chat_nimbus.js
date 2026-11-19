/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

const { GenAI } = ChromeUtils.importESModule(
  "moz-src:///browser/components/genai/GenAI.sys.mjs"
);
const { NimbusTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/NimbusTestUtils.sys.mjs"
);

/**
 * Check that enrolling into chatbot experiments sets user prefs
 */
add_task(async function test_nimbus_user_prefs() {
  const foo = "browser.ml.chat.foo";
  const nimbus = "browser.ml.chat.nimbus";
  const sidebar = "browser.ml.chat.sidebar";
  Assert.ok(!Services.prefs.prefHasUserValue(foo), "No user foo pref yet");
  Assert.ok(
    !Services.prefs.prefHasUserValue(nimbus),
    "No user nimbus pref yet"
  );

  let cleanup = await NimbusTestUtils.enrollWithFeatureConfig({
    featureId: "chatbot",
    value: {
      prefs: {
        foo: { value: "bar" },
      },
    },
  });

  Assert.equal(
    Services.prefs.getStringPref(foo),
    "bar",
    "Set user pref with experiment"
  );
  Assert.ok(Services.prefs.prefHasUserValue(foo), "foo pref has user value");
  const nimbusValue = Services.prefs.getStringPref(nimbus);
  Assert.ok(nimbusValue, "Set some nimbus slug");
  Assert.ok(
    Services.prefs.prefHasUserValue(nimbus),
    "nimbus pref has user value"
  );

  await cleanup();

  Assert.equal(Services.prefs.getStringPref(foo), "bar", "foo pref still set");
  Assert.equal(
    Services.prefs.getStringPref(nimbus),
    nimbusValue,
    "nimbus pref still set"
  );
  Assert.ok(Services.prefs.getBoolPref(sidebar), "sidebar is default value");
  Assert.ok(
    !Services.prefs.prefHasUserValue(sidebar),
    "sidebar used default value"
  );

  cleanup = await NimbusTestUtils.enrollWithFeatureConfig({
    featureId: "chatbot",
    value: {
      prefs: {
        foo: {},
        sidebar: { value: false },
      },
    },
  });

  Assert.ok(!Services.prefs.prefHasUserValue(foo), "foo pref no longer set");
  Assert.notEqual(
    Services.prefs.getStringPref(nimbus),
    nimbusValue,
    "nimbus pref changed"
  );
  Assert.ok(!Services.prefs.getBoolPref(sidebar), "sidebar set to false");
  Assert.ok(
    Services.prefs.prefHasUserValue(sidebar),
    "sidebar pref has user value"
  );

  await cleanup();
  Services.prefs.clearUserPref(nimbus);
  Services.prefs.clearUserPref(sidebar);
});

/**
 * Check that enrolling into chatbot experiments sets default prefs
 */
add_task(async function test_nimbus_default_prefs() {
  const pref = "browser.ml.chat.sidebar";
  Assert.ok(Services.prefs.getBoolPref(pref), "sidebar is default value");
  Assert.ok(
    !Services.prefs.prefHasUserValue(pref),
    "sidebar used default value"
  );

  const cleanup = await NimbusTestUtils.enrollWithFeatureConfig({
    featureId: "chatbot",
    value: {
      prefs: {
        sidebar: { branch: "default", value: false },
      },
    },
  });

  Assert.ok(!Services.prefs.getBoolPref(pref), "sidebar set to false");
  Assert.ok(
    !Services.prefs.prefHasUserValue(pref),
    "sidebar still is default value"
  );

  await cleanup();
  Services.prefs.clearUserPref("browser.ml.chat.nimbus");
  Services.prefs.getDefaultBranch("").setBoolPref(pref, true);
});

/**
 * Check that rollout sets prefs then prefer experiment
 */
add_task(async function test_nimbus_rollout_experiment() {
  const foo = "browser.ml.chat.foo";
  const nimbus = "browser.ml.chat.nimbus";
  const cleanRollout = await NimbusTestUtils.enrollWithFeatureConfig(
    {
      featureId: "chatbot",
      value: {
        prefs: {
          foo: { value: "roll" },
        },
      },
    },
    { isRollout: true }
  );

  Assert.equal(
    Services.prefs.getStringPref(foo),
    "roll",
    "Set user pref with rollout"
  );
  const nimbusValue = Services.prefs.getStringPref(nimbus);
  Assert.ok(nimbusValue, "Set some nimbus slug");

  const cleanExperiment = await NimbusTestUtils.enrollWithFeatureConfig({
    featureId: "chatbot",
    value: {
      prefs: {
        foo: { value: "exp" },
      },
    },
  });

  Assert.equal(
    Services.prefs.getStringPref(foo),
    "exp",
    "Set user pref with experiment"
  );
  Assert.notEqual(
    Services.prefs.getStringPref(nimbus),
    nimbusValue,
    "nimbus pref changed by experiment"
  );

  await cleanRollout();
  await cleanExperiment();
  Services.prefs.clearUserPref(nimbus);
  Services.prefs.clearUserPref(foo);
});

/**
 * Check that minimum versions get enforced
 */
add_task(async function test_nimbus_minimum_version() {
  const foo = "browser.ml.chat.foo";
  const nimbus = "browser.ml.chat.nimbus";
  let cleanup = await NimbusTestUtils.enrollWithFeatureConfig({
    featureId: "chatbot",
    value: {
      minVersion: AppConstants.MOZ_APP_VERSION_DISPLAY + ".1",
      prefs: {
        foo: { value: "ver" },
      },
    },
  });

  Assert.ok(
    !Services.prefs.prefHasUserValue(foo),
    "foo pref not set for version"
  );
  Assert.ok(!Services.prefs.prefHasUserValue(nimbus), "nimbus pref not set");

  await cleanup();

  cleanup = await NimbusTestUtils.enrollWithFeatureConfig({
    featureId: "chatbot",
    value: {
      minVersion: AppConstants.MOZ_APP_VERSION_DISPLAY,
      prefs: {
        foo: { value: "ver" },
      },
    },
  });

  Assert.equal(
    Services.prefs.getStringPref(foo),
    "ver",
    "pref set for version"
  );
  Assert.ok(Services.prefs.getStringPref(nimbus), "nimbus pref set");

  await cleanup();
  Services.prefs.clearUserPref(nimbus);
  Services.prefs.clearUserPref(foo);
});

/**
 * Check that the search feature's ignored sites variable sets the default pref,
 * that the list follows it, and that both go back when the enrollment ends.
 */
add_task(async function test_nimbus_ignored_sites() {
  const pref = "browser.highlightToSearch.ignoredSites";
  const original = Services.prefs.getStringPref(pref);

  const cleanup = await NimbusTestUtils.enrollWithFeatureConfig({
    featureId: "search",
    value: { highlightToSearchIgnoredSites: "example.com" },
  });
  Assert.equal(
    Services.prefs.getStringPref(pref),
    "example.com",
    "Enrolling sets the ignored sites pref"
  );
  Assert.deepEqual(
    GenAI.ignoredSites,
    ["example.com"],
    "The ignored sites follow the pref"
  );

  await cleanup();
  Assert.equal(
    Services.prefs.getStringPref(pref),
    original,
    "The pref goes back when the enrollment ends"
  );
  Assert.deepEqual(
    GenAI.ignoredSites,
    original.split(","),
    "The ignored sites go back too"
  );
});

/**
 * Check that the search feature's page menu detection variable sets the
 * default pref, and that the pref goes back when the enrollment ends.
 */
add_task(async function test_nimbus_detect_page_menus() {
  const pref = "browser.highlightToSearch.detectPageMenus";
  const original = Services.prefs.getBoolPref(pref);

  const cleanup = await NimbusTestUtils.enrollWithFeatureConfig({
    featureId: "search",
    value: { highlightToSearchDetectPageMenus: !original },
  });
  Assert.equal(
    Services.prefs.getBoolPref(pref),
    !original,
    "Enrolling sets the detection pref"
  );

  await cleanup();
  Assert.equal(
    Services.prefs.getBoolPref(pref),
    original,
    "The pref goes back when the enrollment ends"
  );
});
