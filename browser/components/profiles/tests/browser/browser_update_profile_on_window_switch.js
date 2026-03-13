/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { SelectableProfile } = ChromeUtils.importESModule(
  "resource:///modules/profiles/SelectableProfile.sys.mjs"
);

const { sinon } = ChromeUtils.importESModule(
  "resource://testing-common/Sinon.sys.mjs"
);

add_task(async function test_updateDefaultProfileOnWindowSwitch() {
  await initGroupDatabase();
  let currentProfile = SelectableProfileService.currentProfile;
  let profileRootDir = await currentProfile.rootDir;

  ok(
    SelectableProfileService.currentProfile instanceof SelectableProfile,
    "The current selectable profile exists"
  );
  is(
    gProfileService.currentProfile.rootDir.path,
    profileRootDir.path,
    `The SelectableProfileService rootDir is correct`
  );

  Services.telemetry.clearEvents();
  Services.fog.testResetFOG();
  is(
    null,
    Glean.profilesDefault.updated.testGetValue(),
    "We have not recorded any Glean data yet"
  );

  // Override
  gProfileService.currentProfile.rootDir = "bad";

  let w = await BrowserTestUtils.openNewBrowserWindow();
  await SimpleTest.promiseFocus(w);

  let asyncFlushCurrentProfile = sinon
    .stub(gProfileService, "asyncFlushCurrentProfile")
    .resolves();
  let asyncFlush = sinon.stub(gProfileService, "asyncFlush").resolves();

  // Focus the original window so we get an "activate" event and update the toolkitProfile rootDir
  let currentProfileResolvers = Promise.withResolvers();
  asyncFlushCurrentProfile.callsFake(() => {
    currentProfileResolvers.resolve();
    return Promise.resolve();
  });
  await SimpleTest.promiseFocus(window);
  await currentProfileResolvers.promise;

  currentProfileResolvers = Promise.withResolvers();
  asyncFlushCurrentProfile.callsFake(() => {
    currentProfileResolvers.resolve();
    return Promise.resolve();
  });
  await SimpleTest.promiseFocus(w);
  await currentProfileResolvers.promise;

  currentProfileResolvers = Promise.withResolvers();
  asyncFlushCurrentProfile.callsFake(() => {
    currentProfileResolvers.resolve();
    return Promise.reject();
  });

  let flushResolvers = Promise.withResolvers();
  asyncFlush.callsFake(() => {
    flushResolvers.resolve();
    return Promise.resolve();
  });

  await SimpleTest.promiseFocus(window);

  await currentProfileResolvers.promise;
  await flushResolvers.promise;

  is(
    gProfileService.currentProfile.rootDir.path,
    profileRootDir.path,
    `The SelectableProfileService rootDir is correct`
  );

  let testEvents = Glean.profilesDefault.updated.testGetValue();
  Assert.equal(
    3,
    testEvents.length,
    "Should have recorded the default profile updated event exactly three times"
  );
  TelemetryTestUtils.assertEvents(
    [
      ["profiles", "default", "updated"],
      ["profiles", "default", "updated"],
      ["profiles", "default", "updated"],
    ],
    {
      category: "profiles",
      method: "default",
    }
  );

  await BrowserTestUtils.closeWindow(w);
  await SelectableProfileService.uninit();
  asyncFlushCurrentProfile.restore();
  asyncFlush.restore();
});
