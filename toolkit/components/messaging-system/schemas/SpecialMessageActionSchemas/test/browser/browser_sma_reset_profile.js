/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { ResetProfile } = ChromeUtils.importESModule(
  "resource://gre/modules/ResetProfile.sys.mjs"
);

add_task(async function test_RESET_PROFILE() {
  let sandbox = sinon.createSandbox();
  sandbox.stub(ResetProfile, "resetSupported").returns(true);
  let dialogStub = sandbox.stub(ResetProfile, "openConfirmationDialog");

  await SMATestUtils.executeAndValidateAction({ type: "RESET_PROFILE" });

  Assert.equal(
    dialogStub.callCount,
    1,
    "openConfirmationDialog called by the action"
  );

  sandbox.restore();
});

add_task(async function test_RESET_PROFILE_unsupported() {
  let sandbox = sinon.createSandbox();
  sandbox.stub(ResetProfile, "resetSupported").returns(false);
  let dialogStub = sandbox.stub(ResetProfile, "openConfirmationDialog");

  await Assert.rejects(
    SpecialMessageActions.handleAction({ type: "RESET_PROFILE" }, gBrowser),
    /Profile reset is not supported/,
    "should reject when reset is not supported"
  );

  Assert.equal(
    dialogStub.callCount,
    0,
    "openConfirmationDialog not called when reset is unsupported"
  );

  sandbox.restore();
});
