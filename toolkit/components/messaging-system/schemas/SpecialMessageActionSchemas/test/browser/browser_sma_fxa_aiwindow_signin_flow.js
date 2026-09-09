/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

add_task(async function test_FXA_AIWINDOW_SIGNIN_FLOW() {
  let launchAIWindowStub = sinon.stub(AIWindow, "launchWindow");
  launchAIWindowStub.resolves(true);

  await SMATestUtils.executeAndValidateAction({
    type: "FXA_AIWINDOW_SIGNIN_FLOW",
  });

  Assert.equal(
    launchAIWindowStub.callCount,
    1,
    "Should call launchWindow once"
  );

  Assert.ok(
    launchAIWindowStub.firstCall.args[0],
    "Should be called with browser argument"
  );

  Assert.deepEqual(
    launchAIWindowStub.firstCall.args.slice(1),
    [false, "asrouter"],
    "Should default to the asrouter source"
  );

  launchAIWindowStub.restore();
});

add_task(async function test_FXA_AIWINDOW_SIGNIN_FLOW_with_source() {
  let launchAIWindowStub = sinon.stub(AIWindow, "launchWindow");
  launchAIWindowStub.resolves(true);

  await SMATestUtils.executeAndValidateAction({
    type: "FXA_AIWINDOW_SIGNIN_FLOW",
    data: { source: "spotlight" },
  });

  Assert.equal(
    launchAIWindowStub.firstCall.args[2],
    "spotlight",
    "Should pass the source supplied by the message"
  );

  launchAIWindowStub.restore();
});
