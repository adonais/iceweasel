/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const IDONLY_INI = `
[Global]
id=idonlytest

[Preferences]
distribution.test.idonly=true
`;

async function setupDistributionDir(iniContent) {
  Services.prefs.setBoolPref("distribution.testing.loadFromProfile", true);

  let distroDir = gProfD.clone();
  distroDir.leafName = "distribution";
  await IOUtils.makeDirectory(distroDir.path, { ignoreExisting: true });

  let iniFile = distroDir.clone();
  iniFile.append("distribution.ini");
  await IOUtils.writeUTF8(iniFile.path, iniContent);
}

registerCleanupFunction(async function () {
  let folderPath = PathUtils.join(PathUtils.profileDir, "distribution");
  await IOUtils.remove(folderPath, { ignoreAbsent: true, recursive: true });
  Services.prefs.clearUserPref("distribution.testing.loadFromProfile");
});

add_setup(async function () {
  do_get_profile();
  await setupDistributionDir(IDONLY_INI);
});

add_task(async function test_idonly_distribution() {
  let { DistributionManagement } = ChromeUtils.importESModule(
    "resource:///modules/distribution.sys.mjs"
  );

  DistributionManagement.applyCustomizations();

  let defaultBranch = Services.prefs.getDefaultBranch(null);

  Assert.equal(
    defaultBranch.getCharPref("distribution.id"),
    "idonlytest",
    "distribution.id should be set from an id-only distribution.ini"
  );

  Assert.ok(
    defaultBranch.getBoolPref("distribution.test.idonly"),
    "customization should continue past the id-only global section"
  );
});
