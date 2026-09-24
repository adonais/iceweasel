/* Any copyright is dedicated to the Public Domain.
https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// If we think profiles have been created but there is no current profile in the database and there
// are no other profiles we should reset state.
add_task(async function test_recover_empty_database() {
  startProfileService();

  const SelectableProfileService = getSelectableProfileService();
  const ProfilesDatastoreService = getProfilesDatastoreService();

  await ProfilesDatastoreService.init();

  let toolkitProfile = getProfileService().currentProfile;
  toolkitProfile.storeID = await ProfilesDatastoreService.storeID;

  Services.prefs.setBoolPref("browser.profiles.enabled", true);
  Services.prefs.setBoolPref("browser.profiles.created", true);
  await SelectableProfileService.init();

  Assert.ok(SelectableProfileService.isEnabled, "Service should be enabled");

  Assert.ok(
    !Services.prefs.getBoolPref("browser.profiles.created", false),
    "Should have reset the profile created state."
  );

  let missingEvents = Glean.profiles.currentMissing.testGetValue();
  Assert.equal(
    missingEvents.length,
    1,
    "Should have recorded a profiles.current_missing event"
  );
  Assert.equal(
    missingEvents[0].extra.profile_count,
    "0",
    "profiles.current_missing should report 0 profiles"
  );

  Assert.equal(
    Glean.profiles.active.testGetValue(),
    false,
    "profiles.active should be false after reset"
  );

  Assert.ok(!toolkitProfile.storeID, "Should have cleared the store ID");
  Assert.ok(
    !SelectableProfileService.currentProfile,
    "Should be no current profile"
  );

  let profiles = await SelectableProfileService.getAllProfiles();
  Assert.ok(!profiles.length, "No selectable profiles exist yet");

  let newProfile = await SelectableProfileService.createNewProfile(
    false,
    null,
    "tests"
  );
  Assert.ok(newProfile, "Should have created a new profile");
  Assert.ok(
    Services.prefs.getBoolPref("browser.profiles.created", false),
    "Should have set the profile created state."
  );
  Assert.equal(
    toolkitProfile.storeID,
    await ProfilesDatastoreService.storeID,
    "Should have set the store ID"
  );

  Assert.ok(
    SelectableProfileService.currentProfile,
    "Should have created a current profile entry"
  );

  profiles = await SelectableProfileService.getAllProfiles();
  Assert.equal(profiles.length, 2, "Two profiles should exist in the database");
});
