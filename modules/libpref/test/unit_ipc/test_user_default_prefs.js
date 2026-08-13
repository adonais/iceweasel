const pb = Services.prefs;

// This pref is chosen somewhat arbitrarily --- we just need one
// that's guaranteed to have a default value.
const kPrefName1 = "intl.accept_languages";
// A second pref on the same branch that's also guaranteed to have a default value.
const kPrefName2 = "intl.hyphenation-alias.en";

function check_child_pref_info_eq() {
  return new Promise((resolve, reject) => {
    sendCommand(
      // Returns concatenation "[value1],[isUser1],[value2],[isUser2]"
      `Services.prefs.getCharPref("${kPrefName1}") + "," +
       Services.prefs.prefHasUserValue("${kPrefName1}") + "," +
       Services.prefs.getCharPref("${kPrefName2}", "") + "," +
       Services.prefs.prefHasUserValue("${kPrefName2}");`,
      function (info) {
        let [value1, isUser1, value2, isUser2] = info.split(",");
        try {
          Assert.equal(pb.getCharPref(kPrefName1), value1);
          Assert.equal(pb.prefHasUserValue(kPrefName1), isUser1 == "true");
          Assert.equal(pb.getCharPref(kPrefName2, ""), value2);
          Assert.equal(pb.prefHasUserValue(kPrefName2), isUser2 == "true");
        } catch (ex) {
          reject();
        }
        resolve();
      }
    );
  });
}

add_setup(async () => {
  let initialValue = pb.getCharPref(kPrefName1);

  registerCleanupFunction(async () => {
    pb.setCharPref(kPrefName1, initialValue);
    // NB: processing of the value-change notification in the child
    // process triggered by the above set happens-before the remaining
    // code here.
    await check_child_pref_info_eq();
  });
});

add_task(async function test_setting_and_clearing_pref() {
  // We rely on setting this before the content process starts up.
  // When it starts up, it should recognize this as a user pref, not
  // a default pref.
  pb.setCharPref(kPrefName1, "i-imaginarylanguage");
  // NB: processing of the value-change notification in the child
  // process triggered by the above set happens-before the remaining
  // code here
  await check_child_pref_info_eq();
  Assert.equal(pb.prefHasUserValue(kPrefName1), true);

  // NB: processing of the value-change notification in the child
  // process triggered by the above set happens-before the remaining
  // code here
  pb.clearUserPref(kPrefName1);
  await check_child_pref_info_eq();

  Assert.equal(pb.prefHasUserValue(kPrefName1), false);
});

add_task(async function test_setting_and_clearing_pref_branch() {
  pb.setCharPref(kPrefName1, "i-imaginarylanguage");
  // Also set a random preference on the same branch, but without a default value.
  pb.setCharPref(kPrefName2, "i-imaginaryRandom");
  // NB: processing of the value-change notification in the child
  // process triggered by the above set happens-before the remaining
  // code here
  await check_child_pref_info_eq();
  Assert.equal(pb.prefHasUserValue(kPrefName1), true);
  Assert.equal(pb.prefHasUserValue(kPrefName2), true);

  // NB: processing of the value-change notification in the child
  // process triggered by the above set happens-before the remaining
  // code here
  pb.clearUserBranch("intl.");
  await check_child_pref_info_eq();

  Assert.equal(pb.prefHasUserValue(kPrefName1), false);
  Assert.equal(pb.prefHasUserValue(kPrefName2), false);
});
