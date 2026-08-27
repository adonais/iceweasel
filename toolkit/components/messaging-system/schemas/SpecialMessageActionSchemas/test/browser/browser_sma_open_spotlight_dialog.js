/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { Spotlight } = ChromeUtils.importESModule(
  "resource:///modules/asrouter/Spotlight.sys.mjs"
);

add_task(async function test_OPEN_SPOTLIGHT_DIALOG() {
  const spotlightData = {
    content: {
      id: "TEST_SPOTLIGHT",
      template: "multistage",
      modal: "tab",
      screens: [],
    },
  };
  let showSpotlightStub = sinon.stub(Spotlight, "showSpotlightDialog");
  await SMATestUtils.executeAndValidateAction({
    type: "SHOW_SPOTLIGHT",
    data: { ...spotlightData },
  });

  Assert.equal(
    showSpotlightStub.callCount,
    1,
    "Should call showSpotlightDialog"
  );

  Assert.deepEqual(
    showSpotlightStub.firstCall.args[1],
    spotlightData,
    "Should be called with action.data"
  );

  showSpotlightStub.restore();
});
