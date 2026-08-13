Services.scriptloader.loadSubScript(
  "chrome://mochitests/content/browser/browser/modules/test/browser/head.js",
  this
);
Services.scriptloader.loadSubScript(
  "chrome://mochitests/content/browser/toolkit/components/antitracking/test/browser/storage_access_head.js",
  this
);

add_setup(async function () {
  await setPreferences();
  registerCleanupFunction(clearSiteTestData);
});

add_task(async function testInitialBlock() {
  await openPageAndRunCode(
    TEST_TOP_PAGE_7,
    getExpectPopupAndClick("reject"),
    TEST_3RD_PARTY_PAGE,
    requestStorageAccessAndExpectFailure
  );
});

add_task(async function testSameSitePermissionReversed() {
  await openPageAndRunCode(
    TEST_TOP_PAGE_8,
    getExpectPopupAndClick("accept"),
    TEST_3RD_PARTY_PAGE,
    requestStorageAccessAndExpectSuccess
  );

  await openPageAndRunCode(
    TEST_TOP_PAGE_7,
    expectNoPopup,
    TEST_3RD_PARTY_PAGE,
    requestStorageAccessAndExpectSuccess
  );
});
