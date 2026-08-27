/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { CustomIconManager, ICON_CATALOG } = ChromeUtils.importESModule(
  "moz-src:///browser/components/shell/CustomIconManager.sys.mjs"
);

const KNOWN_ICON_ID = Object.keys(ICON_CATALOG).find(id => id !== "default");

add_task(async function test_SET_BROWSER_ICON_known_id() {
  let sandbox = sinon.createSandbox();
  let applyStub = sandbox.stub(CustomIconManager, "apply").resolves();
  let revertStub = sandbox.stub(CustomIconManager, "revert").resolves();

  await SMATestUtils.executeAndValidateAction({
    type: "SET_BROWSER_ICON",
    data: { id: KNOWN_ICON_ID },
  });

  Assert.ok(
    applyStub.calledOnceWith(KNOWN_ICON_ID),
    "apply was called with the requested icon id"
  );
  Assert.ok(revertStub.notCalled, "revert was not called for a known icon id");

  sandbox.restore();
});

add_task(async function test_SET_BROWSER_ICON_default_id() {
  let sandbox = sinon.createSandbox();
  let applyStub = sandbox.stub(CustomIconManager, "apply").resolves();
  let revertStub = sandbox.stub(CustomIconManager, "revert").resolves();

  await SMATestUtils.executeAndValidateAction({
    type: "SET_BROWSER_ICON",
    data: { id: "default" },
  });

  Assert.ok(revertStub.calledOnce, "revert was called for the default icon id");
  Assert.ok(
    applyStub.notCalled,
    "apply was not called for the default icon id"
  );

  sandbox.restore();
});

add_task(async function test_SET_BROWSER_ICON_unknown_id() {
  let sandbox = sinon.createSandbox();
  let applyStub = sandbox.stub(CustomIconManager, "apply").resolves();
  let revertStub = sandbox.stub(CustomIconManager, "revert").resolves();

  await SMATestUtils.executeAndValidateAction({
    type: "SET_BROWSER_ICON",
    data: { id: "this-icon-does-not-exist" },
  });

  Assert.ok(
    applyStub.notCalled,
    "apply was not called for an icon id that is not in the catalog"
  );
  Assert.ok(
    revertStub.notCalled,
    "revert was not called for an icon id that is not in the catalog"
  );

  sandbox.restore();
});
