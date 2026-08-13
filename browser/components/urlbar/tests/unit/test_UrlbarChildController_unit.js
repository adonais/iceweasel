/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

/**
 * These tests unit test the listener registration and notification dispatch of
 * UrlbarChildController.
 */

"use strict";

let sandbox;
let controller;

add_setup(function () {
  sandbox = sinon.createSandbox();
  controller = UrlbarTestUtils.newMockController();
});

add_task(function test_add_and_remove_listeners() {
  Assert.throws(
    () => controller.addListener(null),
    /Expected listener to be an object/,
    "Should throw for a null listener"
  );
  Assert.throws(
    () => controller.addListener(123),
    /Expected listener to be an object/,
    "Should throw for a non-object listener"
  );

  const listener = { onFake: sandbox.stub() };

  controller.addListener(listener);

  controller.notify("onFake");
  Assert.equal(
    listener.onFake.callCount,
    1,
    "Should have notified the added listener."
  );

  // Adding a non-existent listener shouldn't throw.
  controller.removeListener(123);

  controller.removeListener(listener);

  controller.notify("onFake");
  Assert.equal(
    listener.onFake.callCount,
    1,
    "Should not have notified the removed listener."
  );

  sandbox.resetHistory();
});

add_task(function test__notify() {
  const listener1 = {
    onFake: sandbox.stub().callsFake(() => {
      throw new Error("fake error");
    }),
  };
  const listener2 = {
    onFake: sandbox.stub(),
  };

  controller.addListener(listener1);
  controller.addListener(listener2);

  const param = "1234";

  controller.notify("onFake", param);

  Assert.equal(
    listener1.onFake.callCount,
    1,
    "Should have called the first listener method."
  );
  Assert.deepEqual(
    listener1.onFake.args[0],
    [param],
    "Should have called the first listener with the correct argument"
  );
  Assert.equal(
    listener2.onFake.callCount,
    1,
    "Should have called the second listener method."
  );
  Assert.deepEqual(
    listener2.onFake.args[0],
    [param],
    "Should have called the first listener with the correct argument"
  );

  controller.removeListener(listener2);
  controller.removeListener(listener1);

  // This should succeed without errors.
  controller.notify("onNewFake");

  sandbox.resetHistory();
});
