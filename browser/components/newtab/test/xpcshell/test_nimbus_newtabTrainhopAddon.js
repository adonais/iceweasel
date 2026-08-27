/* Any copyright is dedicated to the Public Domain.
https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/* import-globals-from ../../../../extensions/newtab/test/xpcshell/head.js */

/* import-globals-from head_nimbus_trainhop.js */

const { AboutHomeStartupCache } = ChromeUtils.importESModule(
  "resource:///modules/AboutHomeStartupCache.sys.mjs"
);
const { sinon } = ChromeUtils.importESModule(
  "resource://testing-common/Sinon.sys.mjs"
);

add_task(async function test_download_and_staged_install_trainhop_addon() {
  Services.fog.testResetFOG();

  // Sanity check (verifies built-in add-on resources have been mapped).
  assertNewTabResourceMapping();
  await asyncAssertNewTabAddon({
    locationName: BUILTIN_LOCATION_NAME,
  });
  assertTrainhopAddonNimbusExposure({ expectedExposure: false });

  const updateAddonVersion = `${BUILTIN_ADDON_VERSION}.123`;

  const { nimbusFeatureCleanup } = await setupNimbusTrainhopAddon({
    updateAddonVersion,
  });

  await AboutNewTabResourceMapping.updateTrainhopAddonState();
  assertTrainhopAddonVersionPref(updateAddonVersion);
  const { pendingInstall } = await asyncAssertNimbusTrainhopAddonStaged({
    updateAddonVersion,
  });

  // Verify that we are still using the New Tab resources from the builtin add-on.
  assertNewTabResourceMapping();
  // Verify that no exposure event has been recorded until the New Tab resources
  // for the train-hop add-on version are actually in use.
  assertTrainhopAddonNimbusExposure({ expectedExposure: false });

  // Verify the ASRouterTargeting attribute does still report the
  // builtin version while the train-hop version is staged but
  // not in use yet.
  assertASRouterTargetingNewtabAddonVersion(BUILTIN_ADDON_VERSION);

  await cancelPendingInstall(pendingInstall);
  await nimbusFeatureCleanup();
  // Reset the pref the way a real browser would.
  await AboutNewTabResourceMapping.updateTrainhopAddonState();
  assertTrainhopAddonVersionPref("");
});

add_task(async function test_trainhop_addon_download_errors() {
  server.registerPathHandler("/data/invalid-zip.xpi", (_request, response) => {
    response.write("NOT_A_VALID_XPI");
  });

  const brokenManifestXPI = await AddonTestUtils.createTempXPIFile({
    "manifest.json": "not valid JSON",
  });
  server.registerPathHandler(
    "/data/broken-manifest.xpi",
    (request, response) => {
      server._handler._writeFileResponse(request, brokenManifestXPI, response);
    }
  );

  const invalidManifestXPI = AddonTestUtils.createTempWebExtensionFile({
    manifest: {
      version: `${BUILTIN_ADDON_VERSION}.123`,
      browser_specific_settings: {
        gecko: { id: BUILTIN_ADDON_ID },
      },
      // Invalid manifest property that is expected to hit a manifest
      // validation error.
      background: { scripts: "it-should-be-an-array.js" },
    },
  });
  server.registerPathHandler(
    "/data/invalid-manifest.xpi",
    (request, response) => {
      server._handler._writeFileResponse(request, invalidManifestXPI, response);
    }
  );

  const invalidSignatureXPI = AddonTestUtils.createTempWebExtensionFile({
    manifest: {
      version: `${BUILTIN_ADDON_VERSION}.123`,
      browser_specific_settings: {
        gecko: { id: BUILTIN_ADDON_ID },
      },
    },
  });
  server.registerPathHandler(
    "/data/invalid-signature.xpi",
    (request, response) => {
      server._handler._writeFileResponse(
        request,
        invalidSignatureXPI,
        response
      );
    }
  );

  await ExperimentAPI.ready();
  await testDownloadError("data/non-existing.xpi");
  await testDownloadError("data/invalid-zip.xpi");
  await testDownloadError("data/broken-manifest.xpi");
  await testDownloadError(
    "data/invalid-manifest.xpi",
    `${BUILTIN_ADDON_VERSION}.123`
  );
  const oldUsePrivilegedSignatures = AddonTestUtils.usePrivilegedSignatures;
  AddonTestUtils.usePrivilegedSignatures = false;
  await testDownloadError(
    "data/invalid-signature.xpi",
    `${BUILTIN_ADDON_VERSION}.123`,
    AddonManager.STATE_CANCELLED
  );
  AddonTestUtils.usePrivilegedSignatures = oldUsePrivilegedSignatures;

  async function testDownloadError(
    xpi_download_path,
    addon_version = "9999.0",
    expectedInstallState = AddonManager.STATE_DOWNLOAD_FAILED
  ) {
    Services.fog.testResetFOG();
    const nimbusFeatureCleanup = await NimbusTestUtils.enrollWithFeatureConfig(
      {
        featureId: TRAINHOP_NIMBUS_FEATURE_ID,
        value: {
          xpi_download_path,
          addon_version,
        },
      },
      { isRollout: true }
    );

    const promiseDownloadFailed =
      AddonTestUtils.promiseInstallEvent("onDownloadFailed");
    const promiseDownloadEnded =
      AddonTestUtils.promiseInstallEvent("onDownloadEnded");

    info("Trigger download and install train-hop add-on version");
    const promiseTrainhopRequest =
      AboutNewTabResourceMapping.updateTrainhopAddonState();

    info("Wait for AddonManager onDownloadFailed");
    const [install] = await Promise.race([
      promiseDownloadFailed,
      // Ensure the test fails right away if the unexpected
      // onDownloadEnded install event is resolved.
      promiseDownloadEnded,
    ]);

    Assert.equal(
      install.state,
      expectedInstallState,
      `Expect install state to be ${AddonManager._states.get(expectedInstallState)}`
    );

    info("Wait for updateTrainhopAddonState call to be resolved as expected");
    await promiseTrainhopRequest;

    Assert.deepEqual(
      await AddonManager.getAllInstalls(),
      [],
      "Expect no pending install to be found"
    );

    assertTrainhopAddonNimbusExposure({ expectedExposure: false });
    await nimbusFeatureCleanup();
  }
});

add_task(async function test_trainhop_cancel_on_version_check() {
  await testTrainhopCancelOnVersionCheck({
    updateAddonVersion: BUILTIN_ADDON_VERSION,
    message:
      "Test train-hop add-on version equal to the built-in add-on version",
  });
  await testTrainhopCancelOnVersionCheck({
    updateAddonVersion: "140.0.1",
    message:
      "Test train-hop add-on version lower than the built-in add-on version",
  });

  async function testTrainhopCancelOnVersionCheck({
    updateAddonVersion,
    message,
  }) {
    Services.fog.testResetFOG();
    info(message);
    // Sanity check (verifies built-in add-on resources have been mapped).
    assertNewTabResourceMapping();
    assertTrainhopAddonNimbusExposure({ expectedExposure: false });

    await asyncAssertNewTabAddon({
      locationName: "app-builtin-addons",
    });
    const { nimbusFeatureCleanup } = await setupNimbusTrainhopAddon({
      updateAddonVersion,
    });

    await AboutNewTabResourceMapping.updateTrainhopAddonState();
    Assert.deepEqual(
      await AddonManager.getAllInstalls(),
      [],
      "Expect no pending install to be found"
    );

    info("Verify the built-in version is still the one installed");
    await asyncAssertNewTabAddon({
      locationName: "app-builtin-addons",
      version: BUILTIN_ADDON_VERSION,
    });
    // Verify that we are still using the New Tab resources from the builtin add-on.
    assertNewTabResourceMapping();
    assertTrainhopAddonNimbusExposure({ expectedExposure: false });

    await nimbusFeatureCleanup();
    await AboutNewTabResourceMapping.updateTrainhopAddonState();
    assertTrainhopAddonVersionPref("");
  }
});

/**
 * With multiple train-hop enrollments active, asserts the highest version wins:
 * the effective version pref reflects it and its XPI is staged for install,
 * while newtab is still served from the built-in add-on (the install is pending).
 *
 * @param {object} params
 * @param {string} params.highVersion
 *   The highest enrolled add-on version expected to win.
 */
async function checkHighVersionWinsWhenManyActive({ highVersion }) {
  await AboutNewTabResourceMapping.updateTrainhopAddonState();
  assertTrainhopAddonVersionPref(highVersion);
  await asyncAssertNimbusTrainhopAddonStaged({
    updateAddonVersion: highVersion,
  });
  assertNewTabResourceMapping();
}

/**
 * Asserts the winning version's XPI is installed in the profile and in use:
 * newtab resources map to it, the effective version pref matches, and no further
 * install is staged (the winner is already active). Meant to be called after a
 * simulated restart that applies a previously-staged install.
 *
 * @param {object} params
 * @param {string} params.highVersion
 *   The winning add-on version expected to be installed and in use.
 */
async function checkHighVersionIsInstalledAndInUse({ highVersion }) {
  await asyncAssertNewTabAddon({
    locationName: PROFILE_LOCATION_NAME,
    version: highVersion,
  });
  const trainhopAddonPolicy = WebExtensionPolicy.getByID(BUILTIN_ADDON_ID);
  Assert.equal(
    trainhopAddonPolicy?.extension?.version,
    highVersion,
    "Got newtab WebExtensionPolicy instance for the high version"
  );
  assertNewTabResourceMapping(trainhopAddonPolicy.extension.rootURI.spec);
  Assert.deepEqual(
    await AddonManager.getAllInstalls(),
    [],
    "No pending installs after restart"
  );
  assertASRouterTargetingNewtabAddonVersion(highVersion);

  await AboutNewTabResourceMapping.updateTrainhopAddonState();
  assertTrainhopAddonVersionPref(highVersion);
  Assert.deepEqual(
    await AddonManager.getAllInstalls(),
    [],
    "No new install staged when winning version is already in use"
  );
}

/**
 * Ends the higher-version rollout while a lower-version one is still active and
 * asserts the effective version pref drops to the lower version immediately,
 * with no install staged in the same session (the XPI downgrade is applied on the
 * next startup, so the higher XPI stays installed and in use for now).
 *
 * @param {object} params
 * @param {Function} params.cleanupHigh
 *   Cleanup that unenrolls the higher-version enrollment.
 * @param {string} params.lowVersion
 *   The lower add-on version expected to become the winner.
 */
async function checkUnenrollHigh({ cleanupHigh, lowVersion }) {
  await cleanupHigh();
  await AboutNewTabResourceMapping.updateTrainhopAddonState();
  // The higher rollout ended, so the highest currently-enrolled version is now the
  // lower one, and the effective version pref reflects it right away. The actual
  // XPI downgrade is applied on the next startup(s), so nothing is staged in this
  // same session (the higher XPI is still installed and in use for now).
  assertTrainhopAddonVersionPref(lowVersion);
  Assert.deepEqual(
    await AddonManager.getAllInstalls(),
    [],
    "No install staged in the same session (the downgrade is applied on restart)"
  );
}

/**
 * Ends the last remaining train-hop rollout and asserts the effective version
 * pref is cleared (nothing is enrolled anymore, so the built-in will take over).
 *
 * @param {object} params
 * @param {Function} params.cleanupLow
 *   Cleanup that unenrolls the last remaining enrollment.
 */
async function checkUnenrollLow({ cleanupLow }) {
  await cleanupLow();
  await AboutNewTabResourceMapping.updateTrainhopAddonState();
  assertTrainhopAddonVersionPref("");
}

/**
 * Resets the in-memory "exposure event already sent" flag on both train-hop
 * features so a subsequent task can assert exposure recording from a clean state.
 */
function resetNimbusExposureEventForTests() {
  for (const featureId of [
    TRAINHOP_NIMBUS_FEATURE_ID,
    TRAINHOP_NIMBUS_DEPLOYMENT_FEATURE_ID,
  ]) {
    NimbusFeatures[featureId]._didSendExposureEvent = false;
  }
}

/**
 * Asserts the built-in add-on has taken back over newtab: no train-hop XPI is in
 * use, the built-in add-on is active at its bundled version, and ASRouter
 * targeting reports the built-in version.
 */
async function checkBuiltinTakesOver() {
  assertNewTabResourceMapping();
  await AboutNewTabResourceMapping.updateTrainhopAddonState();
  await asyncAssertNewTabAddon({
    locationName: BUILTIN_LOCATION_NAME,
    version: BUILTIN_ADDON_VERSION,
  });
  assertASRouterTargetingNewtabAddonVersion(BUILTIN_ADDON_VERSION);
}

add_task(async function test_coenrollment_highest_version_wins() {
  let sandbox = sinon.createSandbox();
  sandbox.stub(ExperimentAPI._rsLoader, "updateRecipes");

  assertNewTabResourceMapping();
  assertTrainhopAddonVersionPref("");

  const lowVersion = `${BUILTIN_ADDON_VERSION}.1`;
  const highVersion = `${BUILTIN_ADDON_VERSION}.2`;

  for (const version of [lowVersion, highVersion]) {
    const fakeXPI = AddonTestUtils.createTempWebExtensionFile({
      manifest: {
        version,
        browser_specific_settings: { gecko: { id: BUILTIN_ADDON_ID } },
      },
      files: {
        "lib/NewTabGleanUtils.sys.mjs": `
          export const NewTabGleanUtils = {
            registerMetricsAndPings() {},
          };
        `,
      },
    });
    server.registerFile(`/data/newtab-coenroll-${version}.xpi`, fakeXPI);
  }

  await ExperimentAPI.ready();
  const cleanupLow = await NimbusTestUtils.enrollWithFeatureConfig(
    {
      featureId: TRAINHOP_NIMBUS_DEPLOYMENT_FEATURE_ID,
      value: {
        xpi_download_path: `data/newtab-coenroll-${lowVersion}.xpi`,
        addon_version: lowVersion,
      },
    },
    { isRollout: true }
  );
  const cleanupHigh = await NimbusTestUtils.enrollWithFeatureConfig(
    {
      featureId: TRAINHOP_NIMBUS_DEPLOYMENT_FEATURE_ID,
      value: {
        xpi_download_path: `data/newtab-coenroll-${highVersion}.xpi`,
        addon_version: highVersion,
      },
    },
    { isRollout: true }
  );

  await checkHighVersionWinsWhenManyActive({ highVersion });

  info("Simulate browser restart while high version staged");
  Services.fog.testResetFOG();
  mockAboutNewTabUninit();
  await AddonTestUtils.promiseRestartManager();
  AboutNewTab.init();

  await checkHighVersionIsInstalledAndInUse({ highVersion });
  await checkUnenrollHigh({ cleanupHigh, lowVersion });
  await checkUnenrollLow({ cleanupLow });

  info("Simulate browser restart while unenrolled");
  mockAboutNewTabUninit();
  await AddonTestUtils.promiseRestartManager();
  AboutNewTab.init();

  await checkBuiltinTakesOver();

  resetNimbusExposureEventForTests();
  Services.fog.testResetFOG();
  sandbox.restore();
});

add_task(
  async function test_pending_higher_version_wins_over_later_lower_enrollment() {
    let sandbox = sinon.createSandbox();
    sandbox.stub(ExperimentAPI._rsLoader, "updateRecipes");

    // Sanity check, newtab add-on version expected to be the built-in version.
    assertNewTabResourceMapping();
    await asyncAssertNewTabAddon({
      locationName: BUILTIN_LOCATION_NAME,
      version: BUILTIN_ADDON_VERSION,
    });
    assertTrainhopAddonVersionPref("");

    const highVersion = `${BUILTIN_ADDON_VERSION}.999`;
    const lowVersion = `${BUILTIN_ADDON_VERSION}.1`;

    info("Enrolling in higher version experiment and staging its install");
    const { nimbusFeatureCleanup: cleanupHigh } =
      await setupNimbusTrainhopAddon({ updateAddonVersion: highVersion });
    await AboutNewTabResourceMapping.updateTrainhopAddonState();
    assertTrainhopAddonVersionPref(highVersion);
    await asyncAssertNimbusTrainhopAddonStaged({
      updateAddonVersion: highVersion,
    });

    info(
      "Enrolling in lower version experiment while higher version is pending install"
    );
    const { nimbusFeatureCleanup: cleanupLow } = await setupNimbusTrainhopAddon(
      {
        updateAddonVersion: lowVersion,
      }
    );
    // The lower-version co-enrollment must not disrupt the pending higher
    // version. It should still be the higher version staged for install.
    await asyncAssertNimbusTrainhopAddonStaged({
      updateAddonVersion: highVersion,
    });

    info("Simulated restart while the higher version install is pending");
    Services.fog.testResetFOG();
    mockAboutNewTabUninit();
    await AddonTestUtils.promiseRestartManager();
    AboutNewTab.init();

    // The higher version wins and is installed/in use, not the lower version.
    await checkHighVersionIsInstalledAndInUse({ highVersion });

    // Unenrolling the higher version while the lower one is still enrolled must
    // not downgrade. Unenrolling the last version leaves the built-in to take over.
    await checkUnenrollHigh({ cleanupHigh, lowVersion });
    await checkUnenrollLow({ cleanupLow });

    info("Simulate browser restart while unenrolled");
    mockAboutNewTabUninit();
    await AddonTestUtils.promiseRestartManager();
    AboutNewTab.init();

    await checkBuiltinTakesOver();

    resetNimbusExposureEventForTests();
    Services.fog.testResetFOG();
    sandbox.restore();
  }
);

// Graceful retirement: an existing enrollment in the original settings-pref
// newtabTrainhopAddon feature keeps working (install, in-use, exposure) after
// the co-enrollment deployment feature is added. This is the guarantee that
// upgrading to a build with the new feature does not downgrade currently
// train-hopped clients.
add_task(async function test_original_feature_enrollment_still_works() {
  let sandbox = sinon.createSandbox();
  sandbox.stub(ExperimentAPI._rsLoader, "updateRecipes");

  Services.fog.testResetFOG();
  assertNewTabResourceMapping();
  await asyncAssertNewTabAddon({
    locationName: BUILTIN_LOCATION_NAME,
    version: BUILTIN_ADDON_VERSION,
  });
  assertTrainhopAddonVersionPref("");

  const updateAddonVersion = `${BUILTIN_ADDON_VERSION}.123`;

  const { nimbusFeatureCleanup } = await setupNimbusTrainhopAddon({
    updateAddonVersion,
    featureId: TRAINHOP_NIMBUS_FEATURE_ID,
  });
  // The original feature still sets the version pref via setPref on enroll.
  assertTrainhopAddonVersionPref(updateAddonVersion);

  await AboutNewTabResourceMapping.updateTrainhopAddonState();
  assertTrainhopAddonVersionPref(updateAddonVersion);
  await asyncAssertNimbusTrainhopAddonStaged({ updateAddonVersion });

  info("Simulate browser restart while original-feature version staged");
  Services.fog.testResetFOG();
  mockAboutNewTabUninit();
  await AddonTestUtils.promiseRestartManager();
  AboutNewTab.init();

  await checkHighVersionIsInstalledAndInUse({
    highVersion: updateAddonVersion,
  });
  // Exposure is attributed to the original feature.
  assertTrainhopAddonNimbusExposure({
    expectedExposure: true,
    featureId: TRAINHOP_NIMBUS_FEATURE_ID,
  });

  await nimbusFeatureCleanup();
  await AboutNewTabResourceMapping.updateTrainhopAddonState();
  assertTrainhopAddonVersionPref("");

  info("Simulate browser restart while unenrolled");
  mockAboutNewTabUninit();
  await AddonTestUtils.promiseRestartManager();
  AboutNewTab.init();

  await checkBuiltinTakesOver();

  resetNimbusExposureEventForTests();
  Services.fog.testResetFOG();
  sandbox.restore();
});

// Graceful retirement: the winning enrollment is chosen across both features.
// A higher version from the co-enrollment deployment feature wins over a lower
// version from the original feature, and unenrolling the higher one while the
// lower remains must not downgrade.
add_task(async function test_dual_read_highest_across_features_wins() {
  let sandbox = sinon.createSandbox();
  sandbox.stub(ExperimentAPI._rsLoader, "updateRecipes");

  assertNewTabResourceMapping();
  assertTrainhopAddonVersionPref("");

  const lowVersion = `${BUILTIN_ADDON_VERSION}.1`;
  const highVersion = `${BUILTIN_ADDON_VERSION}.2`;

  // Lower version from the original settings-pref feature.
  const { nimbusFeatureCleanup: cleanupLow } = await setupNimbusTrainhopAddon({
    updateAddonVersion: lowVersion,
    featureId: TRAINHOP_NIMBUS_FEATURE_ID,
  });
  assertTrainhopAddonVersionPref(lowVersion);

  // Higher version from the co-enrollment deployment feature.
  const { nimbusFeatureCleanup: cleanupHigh } = await setupNimbusTrainhopAddon({
    updateAddonVersion: highVersion,
    featureId: TRAINHOP_NIMBUS_DEPLOYMENT_FEATURE_ID,
  });

  await checkHighVersionWinsWhenManyActive({ highVersion });

  info("Simulate browser restart while high version staged");
  Services.fog.testResetFOG();
  mockAboutNewTabUninit();
  await AddonTestUtils.promiseRestartManager();
  AboutNewTab.init();

  await checkHighVersionIsInstalledAndInUse({ highVersion });
  // Exposure is attributed to the winning (deployment) feature.
  assertTrainhopAddonNimbusExposure({
    expectedExposure: true,
    featureId: TRAINHOP_NIMBUS_DEPLOYMENT_FEATURE_ID,
  });

  // Unenrolling the higher (deployment) version while the lower (original) one
  // remains must not downgrade.
  await checkUnenrollHigh({ cleanupHigh, lowVersion });
  await checkUnenrollLow({ cleanupLow });

  info("Simulate browser restart while unenrolled");
  mockAboutNewTabUninit();
  await AddonTestUtils.promiseRestartManager();
  AboutNewTab.init();

  await checkBuiltinTakesOver();

  resetNimbusExposureEventForTests();
  Services.fog.testResetFOG();
  sandbox.restore();
});

// Graceful retirement: the union is feature-agnostic. A higher version from the
// original feature wins over a lower version from the deployment feature.
add_task(async function test_dual_read_original_feature_version_can_win() {
  let sandbox = sinon.createSandbox();
  sandbox.stub(ExperimentAPI._rsLoader, "updateRecipes");

  assertNewTabResourceMapping();
  assertTrainhopAddonVersionPref("");

  const lowVersion = `${BUILTIN_ADDON_VERSION}.1`;
  const highVersion = `${BUILTIN_ADDON_VERSION}.2`;

  const { nimbusFeatureCleanup: cleanupLow } = await setupNimbusTrainhopAddon({
    updateAddonVersion: lowVersion,
    featureId: TRAINHOP_NIMBUS_DEPLOYMENT_FEATURE_ID,
  });
  const { nimbusFeatureCleanup: cleanupHigh } = await setupNimbusTrainhopAddon({
    updateAddonVersion: highVersion,
    featureId: TRAINHOP_NIMBUS_FEATURE_ID,
  });

  await AboutNewTabResourceMapping.updateTrainhopAddonState();
  assertTrainhopAddonVersionPref(highVersion);
  const { pendingInstall } = await asyncAssertNimbusTrainhopAddonStaged({
    updateAddonVersion: highVersion,
  });

  await cancelPendingInstall(pendingInstall);
  await cleanupHigh();
  await cleanupLow();
  await AboutNewTabResourceMapping.updateTrainhopAddonState();
  assertTrainhopAddonVersionPref("");

  resetNimbusExposureEventForTests();
  Services.fog.testResetFOG();
  sandbox.restore();
});

// Track highest active (Bug 1995391): with a higher and a lower deployment
// rollout both active, the client runs the higher version.
// Ending the higher rollout must roll the client back to the lower version (not
// keep the higher one), and finally to the built-in once nothing remains.
add_task(async function test_rollback_downgrades_to_lower_enrollment() {
  let sandbox = sinon.createSandbox();
  sandbox.stub(ExperimentAPI._rsLoader, "updateRecipes");

  assertNewTabResourceMapping();
  assertTrainhopAddonVersionPref("");

  const lowVersion = `${BUILTIN_ADDON_VERSION}.11`;
  const highVersion = `${BUILTIN_ADDON_VERSION}.12`;

  const { nimbusFeatureCleanup: cleanupLow } = await setupNimbusTrainhopAddon({
    updateAddonVersion: lowVersion,
  });
  const { nimbusFeatureCleanup: cleanupHigh } = await setupNimbusTrainhopAddon({
    updateAddonVersion: highVersion,
  });

  await checkHighVersionWinsWhenManyActive({ highVersion });

  info("Restart while the high version is staged");
  Services.fog.testResetFOG();
  mockAboutNewTabUninit();
  await AddonTestUtils.promiseRestartManager();
  AboutNewTab.init();
  await checkHighVersionIsInstalledAndInUse({ highVersion });

  info(
    "Roll back by ending the higher rollout (the lower one is still active)"
  );
  await cleanupHigh();
  await AboutNewTabResourceMapping.updateTrainhopAddonState();
  // Effective version drops to the lower enrollment right away. The high XPI is
  // still installed and in use this session (the downgrade is applied on restart).
  assertTrainhopAddonVersionPref(lowVersion);
  await asyncAssertNewTabAddon({
    locationName: PROFILE_LOCATION_NAME,
    version: highVersion,
  });

  info("Restart: stop using the high XPI, uninstall it and stage the low XPI");
  mockAboutNewTabUninit();
  await AddonTestUtils.promiseRestartManager();
  AboutNewTab.init();
  await AboutNewTabResourceMapping.updateTrainhopAddonState();
  await asyncAssertNimbusTrainhopAddonStaged({
    updateAddonVersion: lowVersion,
  });

  info("Restart: the lower version is installed and in use");
  mockAboutNewTabUninit();
  await AddonTestUtils.promiseRestartManager();
  AboutNewTab.init();
  await asyncAssertNewTabAddon({
    locationName: PROFILE_LOCATION_NAME,
    version: lowVersion,
  });
  const trainhopAddonPolicy = WebExtensionPolicy.getByID(BUILTIN_ADDON_ID);
  assertNewTabResourceMapping(trainhopAddonPolicy.extension.rootURI.spec);
  assertTrainhopAddonVersionPref(lowVersion);

  info("End the lower rollout too: the built-in takes over");
  await cleanupLow();
  await AboutNewTabResourceMapping.updateTrainhopAddonState();
  assertTrainhopAddonVersionPref("");
  mockAboutNewTabUninit();
  await AddonTestUtils.promiseRestartManager();
  AboutNewTab.init();
  await checkBuiltinTakesOver();

  resetNimbusExposureEventForTests();
  Services.fog.testResetFOG();
  sandbox.restore();
});

add_task(async function test_trainhop_addon_after_browser_restart() {
  let sandbox = sinon.createSandbox();
  sandbox.stub(ExperimentAPI._rsLoader, "updateRecipes");

  // Sanity check (verifies built-in add-on resources have been mapped).
  assertNewTabResourceMapping();
  await asyncAssertNewTabAddon({
    locationName: BUILTIN_LOCATION_NAME,
  });
  assertTrainhopAddonVersionPref("");

  const updateAddonVersion = `${BUILTIN_ADDON_VERSION}.123`;

  const { nimbusFeatureCleanup } = await setupNimbusTrainhopAddon({
    updateAddonVersion,
  });

  await AboutNewTabResourceMapping.updateTrainhopAddonState();
  assertTrainhopAddonVersionPref(updateAddonVersion);
  await asyncAssertNimbusTrainhopAddonStaged({
    updateAddonVersion,
  });
  // Verify that we are still using the New Tab resources from the builtin add-on.
  assertNewTabResourceMapping();
  Assert.ok(
    !Glean.newtab.addonXpiUsed.testGetValue(),
    "Probe says we're not using an XPI"
  );

  Assert.ok(
    ExperimentAPI._rsLoader.updateRecipes.notCalled,
    "Have not yet called updateRecipes"
  );

  info(
    "Simulated browser restart while train-hop add-on is pending installation"
  );
  Services.fog.testResetFOG();
  mockAboutNewTabUninit();
  await AddonTestUtils.promiseRestartManager();
  AboutNewTab.init();

  await asyncAssertNewTabAddon({
    locationName: PROFILE_LOCATION_NAME,
    version: updateAddonVersion,
  });
  const trainhopAddonPolicy = WebExtensionPolicy.getByID(BUILTIN_ADDON_ID);
  Assert.equal(
    trainhopAddonPolicy?.extension?.version,
    updateAddonVersion,
    "Got newtab WebExtensionPolicy instance for the train-hop add-on version"
  );

  assertNewTabResourceMapping(trainhopAddonPolicy.extension.rootURI.spec);
  Assert.ok(
    Glean.newtab.addonXpiUsed.testGetValue(),
    "Probe says we're using an XPI"
  );

  Assert.deepEqual(
    await AddonManager.getAllInstalls(),
    [],
    "Expect no pending install to be found"
  );

  await AboutNewTabResourceMapping.updateTrainhopAddonState();
  Assert.deepEqual(
    await AddonManager.getAllInstalls(),
    [],
    "Expect no additional pending install for the same train-hop add-on version"
  );

  assertTrainhopAddonNimbusExposure({ expectedExposure: true });
  assertTrainhopAddonVersionPref(updateAddonVersion);
  // Verify the ASRouterTargeting attribute is reporting the
  // train-hop version as expected.
  assertASRouterTargetingNewtabAddonVersion(updateAddonVersion);

  Assert.ok(
    ExperimentAPI._rsLoader.updateRecipes.calledWith(
      "newtab-trainhop",
      sinon.match({
        onlyFeatureIds: sinon.match(
          s => s.size === 1 && s.has("newtabTrainhop"),
          'Set {"newtabTrainhop"}'
        ),
      })
    ),
    "Re-computed Experiment recipes"
  );

  info("Simulate newtabTrainhopAddon nimbus feature unenrolled");
  await nimbusFeatureCleanup();

  // Expect train-hop add-on to not be uninstalled yet because it is still
  // used by newtab resources mapping.
  await AboutNewTabResourceMapping.updateTrainhopAddonState();
  assertTrainhopAddonVersionPref("");
  assertNewTabResourceMapping(trainhopAddonPolicy.extension.rootURI.spec);
  await asyncAssertNewTabAddon({
    locationName: PROFILE_LOCATION_NAME,
    version: updateAddonVersion,
  });

  info(
    "Simulated browser restart while newtabTrainhopAddon nimbus feature is unenrolled"
  );
  mockAboutNewTabUninit();
  await AddonTestUtils.promiseRestartManager();
  AboutNewTab.init();

  // Expected bundled newtab resources mapping for this session.
  assertNewTabResourceMapping();
  await AboutNewTabResourceMapping.updateTrainhopAddonState();
  await asyncAssertNewTabAddon({
    locationName: BUILTIN_LOCATION_NAME,
    version: BUILTIN_ADDON_VERSION,
  });

  // Verify the ASRouterTargeting attribute is reporting the
  // built-in version again after the client was fully unrolled
  // from the train-hop experiment version.
  assertASRouterTargetingNewtabAddonVersion(BUILTIN_ADDON_VERSION);
  sandbox.restore();
});

add_task(async function test_builtin_version_upgrades() {
  // Sanity check (verifies built-in addon resources have been mapped).
  assertNewTabResourceMapping();
  await asyncAssertNewTabAddon({
    locationName: BUILTIN_LOCATION_NAME,
    version: BUILTIN_ADDON_VERSION,
  });
  assertTrainhopAddonVersionPref("");

  const updateAddonVersion = `${BUILTIN_ADDON_VERSION}.123`;

  const { nimbusFeatureCleanup } = await setupNimbusTrainhopAddon({
    updateAddonVersion,
  });

  await AboutNewTabResourceMapping.updateTrainhopAddonState();
  assertTrainhopAddonVersionPref(updateAddonVersion);
  await asyncAssertNimbusTrainhopAddonStaged({
    updateAddonVersion,
  });
  // Verify that we are still using the New Tab resources from the builtin add-on.
  assertNewTabResourceMapping();
  assertASRouterTargetingNewtabAddonVersion(BUILTIN_ADDON_VERSION);

  info(
    "Simulated browser restart while train-hop add-on is pending installation"
  );
  mockAboutNewTabUninit();
  await AddonTestUtils.promiseRestartManager();
  AboutNewTab.init();

  await asyncAssertNewTabAddon({
    locationName: PROFILE_LOCATION_NAME,
    version: updateAddonVersion,
  });
  const trainhopAddonPolicy = WebExtensionPolicy.getByID(BUILTIN_ADDON_ID);
  Assert.equal(
    trainhopAddonPolicy?.extension?.version,
    updateAddonVersion,
    "Got newtab WebExtensionPolicy instance for the train-hop add-on version"
  );
  assertNewTabResourceMapping(trainhopAddonPolicy.extension.rootURI.spec);
  assertASRouterTargetingNewtabAddonVersion(updateAddonVersion);

  info(
    "Simulated browser restart with a builtin add-on version higher than the train-hop add-on version"
  );
  // Mock a builtin version with an add-on version higher than the train-hop add-on version.
  const fakeUpdatedBuiltinVersion = "9999.0";
  const restoreBuiltinAddonsSubstitution =
    await overrideBuiltinAddonsSubstitution(fakeUpdatedBuiltinVersion);

  mockAboutNewTabUninit();
  await AddonTestUtils.promiseRestartManager();
  AboutNewTab.init();
  assertNewTabResourceMapping();
  await AboutNewTabResourceMapping.updateTrainhopAddonState();
  // Expect the newtab xpi to have been uninstalled and the updated
  // builtin add-on to be the newtab add-on version becoming active.
  await asyncAssertNewTabAddon({
    locationName: BUILTIN_LOCATION_NAME,
    version: fakeUpdatedBuiltinVersion,
  });
  // Verify the ASRouter targeting attribute is also reflecting
  // the update to the new built-in version.
  assertASRouterTargetingNewtabAddonVersion(fakeUpdatedBuiltinVersion);
  Assert.deepEqual(
    await AddonManager.getAllInstalls(),
    [],
    "Expect no pending install to be found"
  );

  // Cleanup
  mockAboutNewTabUninit();
  await restoreBuiltinAddonsSubstitution();
  await AddonTestUtils.promiseRestartManager();
  AboutNewTab.init();
  assertNewTabResourceMapping();
  await asyncAssertNewTabAddon({
    locationName: BUILTIN_LOCATION_NAME,
    version: BUILTIN_ADDON_VERSION,
  });
  await nimbusFeatureCleanup();

  async function overrideBuiltinAddonsSubstitution(updatedBuiltinVersion) {
    const { ExtensionTestCommon } = ChromeUtils.importESModule(
      "resource://testing-common/ExtensionTestCommon.sys.mjs"
    );
    const fakeBuiltinAddonsDir = AddonTestUtils.tempDir.clone();
    fakeBuiltinAddonsDir.append("builtin-addons-override");
    const addonDir = fakeBuiltinAddonsDir.clone();
    addonDir.append("newtab");
    await AddonTestUtils.promiseWriteFilesToDir(
      addonDir.path,
      ExtensionTestCommon.generateFiles({
        manifest: {
          version: updatedBuiltinVersion,
          browser_specific_settings: {
            gecko: { id: BUILTIN_ADDON_ID },
          },
        },
      })
    );
    const resProto = Cc[
      "@mozilla.org/network/protocol;1?name=resource"
    ].getService(Ci.nsIResProtocolHandler);
    let defaultBuiltinAddonsSubstitution =
      resProto.getSubstitution("builtin-addons");
    resProto.setSubstitutionWithFlags(
      "builtin-addons",
      Services.io.newFileURI(fakeBuiltinAddonsDir),
      Ci.nsISubstitutingProtocolHandler.ALLOW_CONTENT_ACCESS
    );

    // Verify we mocked an updated newtab builtin manifest as expected.
    const mockedManifest = await fetch(
      "resource://builtin-addons/newtab/manifest.json"
    ).then(r => r.json());
    Assert.equal(
      mockedManifest.version,
      fakeUpdatedBuiltinVersion,
      "Got the expected manifest version in the mocked builtin add-on manifest"
    );

    // Update built_in_addons.json accordingly.
    await overrideBuiltinsNewTabVersion(updatedBuiltinVersion);

    return async () => {
      await overrideBuiltinsNewTabVersion(BUILTIN_ADDON_VERSION);
      resProto.setSubstitutionWithFlags(
        "builtin-addons",
        defaultBuiltinAddonsSubstitution,
        Ci.nsISubstitutingProtocolHandler.ALLOW_CONTENT_ACCESS
      );
      fakeBuiltinAddonsDir.remove(true);
    };
  }

  async function overrideBuiltinsNewTabVersion(addon_version) {
    // Override newtab builtin version in built_in_addons.json metadata.
    const builtinsConfig = await fetch(
      "chrome://browser/content/built_in_addons.json"
    ).then(res => res.json());
    await AddonTestUtils.overrideBuiltIns({
      system: [],
      builtins: builtinsConfig.builtins
        .filter(entry => entry.addon_id === BUILTIN_ADDON_ID)
        .map(entry => {
          entry.addon_version = addon_version;
          return entry;
        }),
    });
  }
});

add_task(async function test_nonsystem_xpi_uninstalled() {
  let sandbox = sinon.createSandbox();

  // Sanity check (verifies builtin add-on resources have been mapped).
  assertNewTabResourceMapping();

  const updateAddonVersion = `${BUILTIN_ADDON_VERSION}.123`;
  const { nimbusFeatureCleanup } = await setupNimbusTrainhopAddon({
    updateAddonVersion,
  });
  await AboutNewTabResourceMapping.updateTrainhopAddonState();
  assertTrainhopAddonVersionPref(updateAddonVersion);

  info("Simulated restart after train-hop add-on version install pending");
  mockAboutNewTabUninit();
  await AddonTestUtils.promiseRestartManager();
  AboutNewTab.init();

  await asyncAssertNewTabAddon({
    locationName: PROFILE_LOCATION_NAME,
    version: updateAddonVersion,
  });

  // Install non-system signed newtab XPI (Expected to be installed
  // right away because the fake train-hop add-on version doesn't
  // have an onUpdateAvailable listener).
  const xpiVersion = `${BUILTIN_ADDON_VERSION}.456`;
  let extension = await ExtensionTestUtils.loadExtension({
    useAddonManager: "permanent",
    manifest: {
      version: xpiVersion,
      browser_specific_settings: {
        gecko: { id: BUILTIN_ADDON_ID },
      },
    },
  });
  const oldUsePrivilegedSignatures = AddonTestUtils.usePrivilegedSignatures;
  AddonTestUtils.usePrivilegedSignatures = false;
  await extension.startup();
  AddonTestUtils.usePrivilegedSignatures = oldUsePrivilegedSignatures;

  let addon = await asyncAssertNewTabAddon({
    locationName: PROFILE_LOCATION_NAME,
    version: xpiVersion,
  });
  Assert.deepEqual(
    addon.signedState,
    AddonManager.SIGNEDSTATE_SIGNED,
    "Got the expected signedState for the installed XPI version"
  );

  mockAboutNewTabUninit();
  await AddonTestUtils.promiseRestartManager();
  AboutNewTab.init();
  assertNewTabResourceMapping();

  sandbox.stub(AboutHomeStartupCache, "clearCacheAndUninit").returns();
  await AboutNewTabResourceMapping.updateTrainhopAddonState();
  Assert.ok(
    AboutHomeStartupCache.clearCacheAndUninit.called,
    "Uninstalling caused the startup cache to be cleared."
  );

  // Expect the newtab xpi to have been uninstalled and the updated
  // builtin add-on to be the newtab add-on version becoming active.
  await asyncAssertNewTabAddon({
    locationName: BUILTIN_LOCATION_NAME,
    version: BUILTIN_ADDON_VERSION,
  });
  // Along with uninstalling the non-system signed xpi we expect the
  // call to updateTrainhopAddonState to be installing the original
  // train-hop add-on version again.
  const { pendingInstall } = await asyncAssertNimbusTrainhopAddonStaged({
    updateAddonVersion,
  });
  await cancelPendingInstall(pendingInstall);

  await nimbusFeatureCleanup();
  sandbox.restore();
});
