/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { LaunchOnLogin } = ChromeUtils.importESModule(
  "resource://gre/modules/LaunchOnLogin.sys.mjs"
);

add_task(async function test_CONFIRM_LAUNCH_ON_LOGIN() {
  const sandbox = sinon.createSandbox();
  sandbox.stub(LaunchOnLogin, "enable").resolves();
  registerCleanupFunction(() => sandbox.restore());

  await SMATestUtils.executeAndValidateAction({
    type: "CONFIRM_LAUNCH_ON_LOGIN",
  });

  Assert.ok(
    LaunchOnLogin.enable.calledOnce,
    "LaunchOnLogin.enable was called by the action"
  );
});

add_task(async function test_REMOVE_LAUNCH_ON_LOGIN() {
  const sandbox = sinon.createSandbox();
  sandbox.stub(LaunchOnLogin, "disable").resolves();
  registerCleanupFunction(() => sandbox.restore());

  await SMATestUtils.executeAndValidateAction({
    type: "REMOVE_LAUNCH_ON_LOGIN",
  });

  Assert.ok(
    LaunchOnLogin.disable.calledOnce,
    "LaunchOnLogin.disable was called by the action"
  );
});
