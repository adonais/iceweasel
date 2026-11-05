"use strict";

const TEST_URL = `https://example.com${DIRECTORY_PATH}form_signup_detection.html`;

add_setup(async () => {
  Services.fog.testResetFOG();
});

add_task(async () => {
  let formProcessed = listenForTestNotification("FormProcessed", 2);

  let tab = await BrowserTestUtils.openNewForegroundTab(gBrowser, TEST_URL);

  await formProcessed;

  await Services.fog.testFlushAllChildren();
  Assert.equal(
    Glean.pwmgr.signupFormDetection.testGetValue().count,
    2,
    "Two form detections"
  );

  gBrowser.removeTab(tab);
});
