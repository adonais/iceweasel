let rootDir = getRootDirectory(gTestPath);
let jar = getJar(rootDir);
if (jar) {
  let tmpdir = extractJarToTmp(jar);
  rootDir = "file://" + tmpdir.path + "/";
}
Services.scriptloader.loadSubScript(
  /* import-globals-from privacypane_tests_perwindow.js */
  rootDir + "privacypane_tests_perwindow.js",
  this
);

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.settings-redesign.enabled", true]],
  });
});

run_test_subset([test_dependent_elements_redesigned]);
