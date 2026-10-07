const pb = Services.prefs;

// Dynamically named prefs, i.e. ones that no pref file gives a default value.
// They must not match sDynamicPrefOverrideList or
// sRestrictFromWebContentProcesses so that, while they are Strings without a
// default value, they are classified as sanitized and updates for them are not
// forwarded to web content processes.
const kPrefName1 = "test.libpref.sanitizedTypeFlip";
const kPrefName2 = "test.libpref.sanitizedTypeFlipCleared";
const kIntValue = 0x41414141;

function childPrefState(aPrefName) {
  return new Promise(resolve => {
    sendCommand(
      `(() => {
         let type = Services.prefs.getPrefType("${aPrefName}");
         if (type == Ci.nsIPrefBranch.PREF_STRING) {
           return "string:" + Services.prefs.getCharPref("${aPrefName}", "");
         }
         if (type == Ci.nsIPrefBranch.PREF_INT) {
           return "int:" + Services.prefs.getIntPref("${aPrefName}", 0);
         }
         return "none";
       })();`,
      resolve
    );
  });
}

// Leaves the parent holding a String user value that the child never saw, so
// the child still has an Int cached under the shared type tag, and gives the
// pref a default value so that it stops being sanitized.
async function desyncTypeTag(aPrefName) {
  // Int prefs are never sanitized, so the child caches the value and the type.
  pb.setIntPref(aPrefName, kIntValue);
  Assert.equal(await childPrefState(aPrefName), "int:" + kIntValue);

  // The parent may legally flip the type because the pref has no default
  // value, but the update is dropped on the way to web content processes: the
  // child keeps its stale Int.
  pb.setCharPref(aPrefName, "AAAAAAAA");
  Assert.equal(await childPrefState(aPrefName), "int:" + kIntValue);

  // Installing a default value stops the pref from being sanitized. It does not
  // notify anybody, because the user value masks the default one.
  pb.getDefaultBranch("").setCharPref(aPrefName, "defaultvalue");
  Assert.equal(await childPrefState(aPrefName), "int:" + kIntValue);
}

add_setup(async () => {
  // Force the content process to exist before the pref choreography starts, so
  // that every step below travels as a PreferenceUpdate.
  await new Promise(resolve => sendCommand("1;", resolve));
  registerCleanupFunction(() => {
    pb.deleteBranch(kPrefName1);
    pb.deleteBranch(kPrefName2);
  });
});

// Processing of the pref update triggered by each parent-side write
// happens-before the sendCommand() that follows it, because both travel over
// the same channel.
add_task(async function test_stale_user_value_is_replaced() {
  await desyncTypeTag(kPrefName1);

  // This update carries both values, so the child has to apply a String
  // default over a pref whose user value is a stale Int.
  pb.setCharPref(kPrefName1, "BBBBBBBB");
  Assert.equal(await childPrefState(kPrefName1), "string:BBBBBBBB");
});

add_task(async function test_stale_user_value_is_cleared() {
  await desyncTypeTag(kPrefName2);

  // Same, except that this update carries no user value at all, so the child
  // has to discard the stale Int rather than replace it.
  pb.clearUserPref(kPrefName2);
  Assert.equal(await childPrefState(kPrefName2), "string:defaultvalue");
});
