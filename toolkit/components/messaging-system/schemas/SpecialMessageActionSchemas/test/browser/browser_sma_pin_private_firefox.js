/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

add_task(async function test_PIN_PRIVATE_FIREFOX_TO_TASKBAR() {
  const sandbox = sinon.createSandbox();
  let shell = {
    canPinToTaskbar() {},
    QueryInterface: () => shell,
    get macDockSupport() {
      return this;
    },
    get shellService() {
      return this;
    },

    ensureAppIsPinnedToDock: sandbox.stub(),
    isCurrentAppPinnedToTaskbar: sandbox.stub(),
    pinCurrentAppToTaskbar: sandbox.stub().resolves(undefined),
    isAppInDock: false,
  };

  // Prefer the mocked implementation and fall back to the original version,
  // which can call back into the mocked version (via this.shellService).
  shell = new Proxy(shell, {
    get(target, prop) {
      return (Object.hasOwn(target, prop) ? target : ShellService)[prop];
    },
  });

  const test = () =>
    SMATestUtils.executeAndValidateAction(
      {
        type: "PIN_FIREFOX_TO_TASKBAR",
        data: {
          privatePin: true,
        },
      },
      {
        documentGlobal: {
          getShellService: () => shell,
        },
      }
    );

  await test();

  function check(count, message, arg) {
    Assert.equal(
      shell.pinCurrentAppToTaskbar.callCount,
      count,
      `pinCurrentAppToTaskbar was ${message} by the action for windows`
    );
    if (arg) {
      Assert.equal(
        shell.pinCurrentAppToTaskbar.calledWith(arg),
        true,
        `pinCurrentAppToTaskbar was ${message} with the arg: ${JSON.stringify(
          arg
        )}`
      );
    }
  }
  check(1, "called", true);

  // Pretend the app is already pinned.
  shell.isCurrentAppPinnedToTaskbar.resolves(true);
  shell.isAppInDock = true;
  await test();
  check(1, "not called");

  // Pretend the app became unpinned.
  shell.isCurrentAppPinnedToTaskbar.resolves(false);
  shell.isAppInDock = false;
  await test();
  check(2, "called again", true);
});
