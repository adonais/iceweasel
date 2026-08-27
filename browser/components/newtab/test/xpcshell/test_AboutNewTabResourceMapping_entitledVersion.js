/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/* import-globals-from ../../../../extensions/newtab/test/xpcshell/head.js */

// Tests how getPreferredMapping compares an installed train-hop XPI version
// against the version the client is entitled to (the maximum of the
// browser.newtabpage.trainhopAddon.version and
// browser.newtabpage.trainhopAddonDeployment.version prefs).
//
// Also tests that the "any" sentinel value can be used in place of a version
// number in those prefs for development / CI jobs.
const { AboutNewTabResourceMapping, TRAINHOP_ANY_VERSION_SENTINEL } =
  ChromeUtils.importESModule(
    "resource:///modules/AboutNewTabResourceMapping.sys.mjs"
  );

const { FileUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/FileUtils.sys.mjs"
);

const { sinon } = ChromeUtils.importESModule(
  "resource://testing-common/Sinon.sys.mjs"
);

const TRAINHOP_VERSION_PREF = "browser.newtabpage.trainhopAddon.version";
const TRAINHOP_DEPLOYMENT_VERSION_PREF =
  "browser.newtabpage.trainhopAddonDeployment.version";

// Higher than any built-in version this test could run against, so that the
// "built-in is equal or newer" check is never what decides the outcome.
const XPI_VERSION = "9999.0";

/**
 * Calls getPreferredMapping with a fake train-hop XPI installed inside the
 * current profile, and the given entitled version prefs.
 *
 * @param {object} options
 * @param {string} [options.trainhopVersion]
 *   Value for browser.newtabpage.trainhopAddon.version ("" to leave it unset).
 * @param {string} [options.deploymentVersion]
 *   Value for browser.newtabpage.trainhopAddonDeployment.version ("" to leave
 *   it unset).
 * @returns {{isXPI: boolean, version: string, rootURI: nsIURI}}
 *   The result of getPreferredMapping.
 */
function getPreferredMappingWithEntitledVersion({
  trainhopVersion = "",
  deploymentVersion = "",
}) {
  // isXPIInCurrentProfile requires the XPI to live in <profile>/extensions/, and
  // the isXPI detection requires the spec to end with ".xpi!/". The file itself
  // need not exist: the check is purely path-based.
  const xpiFile = FileUtils.getDir("ProfD", ["extensions"]).clone();
  xpiFile.append("newtab@mozilla.org.xpi");
  const rootURI = Services.io.newURI(
    `jar:${Services.io.newFileURI(xpiFile).spec}!/`
  );

  const sandbox = sinon.createSandbox();
  // isPrivileged: true so that the REQUIRE_SIGNING check is not what decides the
  // outcome here (that path is covered by the Nimbus train-hop tests).
  sandbox.stub(AboutNewTabResourceMapping, "getActiveAddonInfo").returns({
    version: XPI_VERSION,
    rootURI,
    isPrivileged: true,
  });

  if (trainhopVersion) {
    Services.prefs.setCharPref(TRAINHOP_VERSION_PREF, trainhopVersion);
  }
  if (deploymentVersion) {
    Services.prefs.setCharPref(
      TRAINHOP_DEPLOYMENT_VERSION_PREF,
      deploymentVersion
    );
  }

  try {
    return AboutNewTabResourceMapping.getPreferredMapping();
  } finally {
    Services.prefs.clearUserPref(TRAINHOP_VERSION_PREF);
    Services.prefs.clearUserPref(TRAINHOP_DEPLOYMENT_VERSION_PREF);
    sandbox.restore();
  }
}

// What the train-hop CI variants and the manual train-hop testing steps
// actually do: set the sentinel in both prefs, so that the join is
// unambiguously the sentinel regardless of which of the two train-hop Nimbus
// features the build under test knows about.
add_task(function test_sentinel_in_both_prefs_keeps_xpi() {
  const { isXPI, version } = getPreferredMappingWithEntitledVersion({
    trainhopVersion: TRAINHOP_ANY_VERSION_SENTINEL,
    deploymentVersion: TRAINHOP_ANY_VERSION_SENTINEL,
  });

  Assert.ok(
    isXPI,
    "Expect the installed XPI to stay mapped when both version prefs hold the sentinel"
  );
  Assert.equal(
    version,
    XPI_VERSION,
    "Expect the installed train-hop XPI version to be the preferred one"
  );
});

add_task(function test_sentinel_in_trainhop_pref_keeps_xpi() {
  const { isXPI, version } = getPreferredMappingWithEntitledVersion({
    trainhopVersion: TRAINHOP_ANY_VERSION_SENTINEL,
  });

  Assert.ok(
    isXPI,
    `Expect the installed XPI to stay mapped when only ${TRAINHOP_VERSION_PREF} holds the sentinel`
  );
  Assert.equal(
    version,
    XPI_VERSION,
    "Expect the installed train-hop XPI version to be the preferred one"
  );
});

add_task(function test_sentinel_in_deployment_pref_keeps_xpi() {
  const { isXPI, version } = getPreferredMappingWithEntitledVersion({
    deploymentVersion: TRAINHOP_ANY_VERSION_SENTINEL,
  });

  Assert.ok(
    isXPI,
    `Expect the installed XPI to stay mapped when only ${TRAINHOP_DEPLOYMENT_VERSION_PREF} holds the sentinel`
  );
  Assert.equal(
    version,
    XPI_VERSION,
    "Expect the installed train-hop XPI version to be the preferred one"
  );
});

add_task(function test_matching_entitled_version_keeps_xpi() {
  const { isXPI, version } = getPreferredMappingWithEntitledVersion({
    trainhopVersion: XPI_VERSION,
  });

  Assert.ok(
    isXPI,
    "Expect the installed XPI to stay mapped when it matches the entitled version exactly"
  );
  Assert.equal(
    version,
    XPI_VERSION,
    "Expect the installed train-hop XPI version to be the preferred one"
  );
});

// The behaviour introduced by Bug 1995391: an installed XPI higher than the
// version the client is currently entitled to is on its way out, so we stop
// using it and let the highest currently-enrolled version take over.
add_task(function test_lower_entitled_version_falls_back() {
  const { isXPI } = getPreferredMappingWithEntitledVersion({
    trainhopVersion: "1.0",
  });

  Assert.ok(
    !isXPI,
    "Expect an installed XPI higher than the entitled version to fall back to the built-in"
  );
});

// A non-version value other than the sentinel is still parsed as version 0 by
// nsIVersionComparator, and so still falls back. Asserted explicitly so that
// widening the sentinel to "any non-version string" is a deliberate choice.
add_task(function test_unrecognized_non_version_value_falls_back() {
  const { isXPI } = getPreferredMappingWithEntitledVersion({
    trainhopVersion: "whatever",
  });

  Assert.ok(
    !isXPI,
    "Expect an unrecognized non-version entitled value to fall back to the built-in"
  );
});

add_task(function test_sentinel_beats_real_version_in_other_pref() {
  const { isXPI } = getPreferredMappingWithEntitledVersion({
    trainhopVersion: TRAINHOP_ANY_VERSION_SENTINEL,
    deploymentVersion: "1.0",
  });
  Assert.ok(isXPI, "Expected the sentinel value to win.");
});
