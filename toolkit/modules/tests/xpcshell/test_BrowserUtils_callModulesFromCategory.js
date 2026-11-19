/* Any copyright is dedicated to the Public Domain.
http://creativecommons.org/publicdomain/zero/1.0/ */

const { BrowserUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/BrowserUtils.sys.mjs"
);

const { sinon } = ChromeUtils.importESModule(
  "resource://testing-common/Sinon.sys.mjs"
);

add_setup(function initFOG() {
  do_get_profile();
  Services.fog.initializeFOG();
});

/**
 * Verify that category manager calling modules are loaded on-demand,
 * and that caching doesn't break adding more modules as category entries
 * at runtime.
 */
add_task(async function test_callModulesFromCategory() {
  const MODULE1 = "resource://test/my_catman_1.sys.mjs";
  const MODULE2 = "resource://test/my_catman_2.sys.mjs";
  const CATEGORY = "test-modules-from-catman";
  const OBSTOPIC1 = CATEGORY + "-notification";
  const OBSTOPIC2 = CATEGORY + "-other-notification";

  // The two modules both fire different observer topics to allow us to ensure
  // they have been called. This helper just makes it easier to get only
  // that return value as a result of a promise, as `topicObserved` also
  // returns the "subject" of the observer notification, which we don't care about.
  let rvFromModule = topic =>
    TestUtils.topicObserved(topic).then(([_subj, data]) => data);

  // Start off with nothing in a category:
  Assert.equal(
    Cu.isESModuleLoaded(MODULE1),
    false,
    "First module should not be loaded."
  );
  let catEntries = Array.from(Services.catMan.enumerateCategory(CATEGORY));
  Assert.deepEqual(catEntries, [], "Should be no entries for this category.");

  try {
    // There's nothing in this category right now so this should be a no-op.
    BrowserUtils.callModulesFromCategory({ categoryName: CATEGORY }, "Hello");
  } catch (ex) {
    Assert.ok(false, `Should not have thrown but received an exception ${ex}`);
  }

  // Now add an item, check that calling it now works.
  //
  // Note that category manager observer notifications are async (they get
  // dispatched as runnables) and so we have to wait for it to make sure that
  // BrowserUtils has had a chance of being told new entries have arrived.
  let catManUpdated = TestUtils.topicObserved("xpcom-category-entry-added");

  Services.catMan.addCategoryEntry(
    CATEGORY,
    MODULE1,
    `Module1.test`,
    false,
    false
  );
  catEntries = Array.from(Services.catMan.enumerateCategory(CATEGORY));
  Assert.equal(catEntries.length, 1);

  // See note above.
  await catManUpdated;

  Assert.equal(
    Cu.isESModuleLoaded(MODULE1),
    false,
    "First module should still not be loaded."
  );

  // This entry will cause an observer topic to notify, so ensure that happens.
  let moduleResult = rvFromModule(OBSTOPIC1);
  BrowserUtils.callModulesFromCategory({ categoryName: CATEGORY }, "Hello");
  Assert.equal(
    Cu.isESModuleLoaded(MODULE1),
    true,
    "First module should be loaded sync."
  );
  Assert.equal("Hello", await moduleResult, "Should have been called.");

  // Now add another item, check that both are called.
  catManUpdated = TestUtils.topicObserved("xpcom-category-entry-added");
  Services.catMan.addCategoryEntry(
    CATEGORY,
    MODULE2,
    `Module2.othertest`,
    false,
    false
  );
  await catManUpdated;

  moduleResult = Promise.all([
    rvFromModule(OBSTOPIC1),
    rvFromModule(OBSTOPIC2),
  ]);

  BrowserUtils.callModulesFromCategory({ categoryName: CATEGORY }, "Hello");
  Assert.deepEqual(
    ["Hello", "Hello"],
    await moduleResult,
    "Both modules should have been called."
  );

  // Now remove the first module again, check that only the second one notifies.
  catManUpdated = TestUtils.topicObserved("xpcom-category-entry-removed");
  Services.catMan.deleteCategoryEntry(CATEGORY, MODULE1, false);
  await catManUpdated;
  let ob = () => Assert.ok(false, "I shouldn't be called.");
  Services.obs.addObserver(ob, OBSTOPIC1);

  moduleResult = rvFromModule(OBSTOPIC2);
  BrowserUtils.callModulesFromCategory({ categoryName: CATEGORY }, "Hello");
  Assert.equal(
    "Hello",
    await moduleResult,
    "Second module should still be called."
  );

  let idleResult = null;
  let idlePromise = TestUtils.topicObserved(OBSTOPIC2).then(([_subj, data]) => {
    idleResult = data;
    return data;
  });
  BrowserUtils.callModulesFromCategory(
    { categoryName: CATEGORY, idleDispatch: true },
    "Hello"
  );
  Assert.equal(idleResult, null, "Idle calls should not happen immediately.");
  Assert.equal("Hello", await idlePromise, "Idle calls should run eventually.");

  Services.obs.removeObserver(ob, OBSTOPIC1);

  // Now clean up our category for later tests.
  Services.catMan.deleteCategory(CATEGORY);
});

// With idleDispatch set to a window, the consumers should be queued with that
// window's requestIdleCallback, and dropped if it has closed by the time the
// idle task runs, so we don't initialize (and leak) a closing window.
add_task(
  async function test_callModulesFromCategory_idleDispatch_closed_window() {
    const CATEGORY = "test-js-global-catman-closed-window";
    const MODULE = "chrome://browser/content/fake-catman-test.js";

    let catManUpdated = TestUtils.topicObserved("xpcom-category-entry-added");
    Services.catMan.addCategoryEntry(
      CATEGORY,
      MODULE,
      "FakeObj.doThing",
      false,
      false
    );
    await catManUpdated;

    let sandbox = sinon.createSandbox();

    let fakeWindow = closed => ({
      closed,
      requestIdleCallback: sandbox.spy(cb => ChromeUtils.idleDispatch(cb)),
      FakeObj: { doThing: sandbox.spy() },
    });

    // A window that has closed: its consumer should be dropped.
    let closedWindow = fakeWindow(true);
    await BrowserUtils.callModulesFromCategory(
      {
        categoryName: CATEGORY,
        idleDispatch: closedWindow,
        jsGlobal: closedWindow,
      },
      "win"
    );
    sinon.assert.calledOnce(closedWindow.requestIdleCallback);
    sinon.assert.notCalled(closedWindow.FakeObj.doThing);

    // A window that is still open: its consumer should run as usual.
    let openWindow = fakeWindow(false);
    await BrowserUtils.callModulesFromCategory(
      {
        categoryName: CATEGORY,
        idleDispatch: openWindow,
        jsGlobal: openWindow,
      },
      "win"
    );
    sinon.assert.calledOnce(openWindow.requestIdleCallback);
    sinon.assert.calledOnce(openWindow.FakeObj.doThing);
    sinon.assert.calledWithExactly(openWindow.FakeObj.doThing, "win");

    sandbox.restore();
    Services.catMan.deleteCategory(CATEGORY);
  }
);

// Test that errors are reported but do not throw at the callsite,
// and that custom error handlers are invoked.
add_task(async function test_callModulesFromCategory_errors() {
  const OTHER_CAT = "someothercat";
  const MODULE1 = "resource://test/my_catman_1.sys.mjs";

  // Add an item that doesn't exist, and check that although we report errors,
  // the callsite doesn't throw.
  let catManUpdated = TestUtils.topicObserved("xpcom-category-entry-added");
  Services.catMan.addCategoryEntry(
    OTHER_CAT,
    MODULE1,
    `Module1.nonExistantFunction`,
    false,
    false
  );
  await catManUpdated;
  let catEntries = Array.from(Services.catMan.enumerateCategory(OTHER_CAT));
  Assert.equal(catEntries.length, 1);

  let consolePromise = TestUtils.consoleMessageObserved(m => {
    let firstArg = m.wrappedJSObject.arguments?.[0]?.message;
    return typeof firstArg == "string" && firstArg.includes("not a function");
  });
  BrowserUtils.callModulesFromCategory(
    {
      categoryName: OTHER_CAT,
    },
    "Hello"
  );
  let reportedError = await consolePromise;
  let firstArg = reportedError.wrappedJSObject.arguments?.[0]?.message;
  Assert.stringContains(
    firstArg,
    MODULE1,
    "Error message should include module URL."
  );
  Services.catMan.deleteCategoryEntry(OTHER_CAT, MODULE1, false);

  // Check that custom exception handling from extant methods works:
  catManUpdated = TestUtils.topicObserved("xpcom-category-entry-added");
  Services.catMan.addCategoryEntry(
    OTHER_CAT,
    MODULE1,
    `Module1.throwingFunction`,
    false,
    false
  );
  await catManUpdated;
  Assert.equal(catEntries.length, 1);
  let exHandler = Promise.withResolvers();
  BrowserUtils.callModulesFromCategory({
    categoryName: OTHER_CAT,
    failureHandler: exHandler.resolve,
  });
  let caughtException = await exHandler.promise;
  Assert.stringContains(
    caughtException.message,
    "Uh oh",
    "Exceptions should be handled."
  );

  // Now clean up our category for later tests.
  Services.catMan.deleteCategory(OTHER_CAT);
});

// A failing consumer should be reported to telemetry via the
// browser_utils.category_dispatch_error event, with the category, module and
// consumer identifying the category manager entry it failed in, on every
// failure.
add_task(async function test_callModulesFromCategory_error_telemetry() {
  const TELEMETRY_CAT = "sometelemetrycat";
  const MODULE1 = "resource://test/my_catman_1.sys.mjs";
  const MODULE2 = "resource://test/my_catman_2.sys.mjs";
  const CONSUMER = "Module1.throwingFunction";

  Services.fog.testResetFOG();

  let catManUpdated = TestUtils.topicObserved("xpcom-category-entry-added");
  Services.catMan.addCategoryEntry(
    TELEMETRY_CAT,
    MODULE1,
    CONSUMER,
    false,
    false
  );
  await catManUpdated;

  await BrowserUtils.callModulesFromCategory({ categoryName: TELEMETRY_CAT });

  let events = Glean.browserUtils.categoryDispatchError.testGetValue();
  Assert.equal(events?.length, 1, "One error event should be recorded.");
  Assert.equal(
    events[0].extra.category,
    TELEMETRY_CAT,
    "category extra is recorded."
  );
  Assert.equal(events[0].extra.module, MODULE1, "module extra is recorded.");
  Assert.equal(
    events[0].extra.consumer,
    CONSUMER,
    "consumer extra is the object.method identifier."
  );
  Assert.equal(
    events[0].extra.errorName,
    "Error",
    "errorName extra is recorded."
  );

  await BrowserUtils.callModulesFromCategory({ categoryName: TELEMETRY_CAT });

  events = Glean.browserUtils.categoryDispatchError.testGetValue();
  Assert.equal(
    events?.length,
    2,
    "A repeat failure of the same entry should be recorded again."
  );
  // TELEMETRY_CAT is not a declared label, so it is counted as __other__.
  Assert.equal(
    Glean.browserUtils.categoryConsumerResult
      .get("__other__", "failure")
      .testGetValue(),
    2,
    "Every failure is counted, including repeats of the same entry."
  );

  // A second failing consumer in the same category.
  catManUpdated = TestUtils.topicObserved("xpcom-category-entry-added");
  Services.catMan.addCategoryEntry(
    TELEMETRY_CAT,
    MODULE2,
    CONSUMER,
    false,
    false
  );
  await catManUpdated;

  await BrowserUtils.callModulesFromCategory({ categoryName: TELEMETRY_CAT });

  Assert.equal(
    Glean.browserUtils.categoryDispatchError.testGetValue()?.length,
    4,
    "Both failing consumers of the dispatch should be recorded."
  );
  Assert.equal(
    Glean.browserUtils.categoryConsumerResult
      .get("__other__", "failure")
      .testGetValue(),
    4,
    "Each failing consumer of a dispatch is counted, not each dispatch."
  );

  Services.catMan.deleteCategory(TELEMETRY_CAT);
});

add_task(async function test_callModulesFromCategory_success_telemetry() {
  const SUCCESS_CAT = "somesuccesstelemetrycat";

  Services.fog.testResetFOG();

  let catManUpdated = TestUtils.topicObserved("xpcom-category-entry-added");
  Services.catMan.addCategoryEntry(
    SUCCESS_CAT,
    "resource://test/my_catman_1.sys.mjs",
    "Module1.test",
    false,
    false
  );
  await catManUpdated;

  await BrowserUtils.callModulesFromCategory({ categoryName: SUCCESS_CAT });
  await BrowserUtils.callModulesFromCategory({ categoryName: SUCCESS_CAT });

  Assert.equal(
    Glean.browserUtils.categoryConsumerResult
      .get("__other__", "success")
      .testGetValue(),
    2,
    "Each consumer that returns is counted as a success."
  );
  Assert.equal(
    Glean.browserUtils.categoryConsumerResult
      .get("__other__", "failure")
      .testGetValue(),
    null,
    "A consumer that returns is not counted as a failure."
  );
  Assert.equal(
    Glean.browserUtils.categoryDispatchError.testGetValue(),
    null,
    "No error event is recorded for a consumer that returns."
  );

  Services.catMan.deleteCategory(SUCCESS_CAT);
});

// An entry registered at runtime can name an arbitrary module URI and object,
// neither of which may be recorded as-is.
add_task(async function test_callModulesFromCategory_error_telemetry_runtime() {
  const RUNTIME_CAT = "someruntimetelemetrycat";
  const MODULE = "file:///tmp/my_catman_runtime.js";
  const CONSUMER = "/tmp/RuntimeObj.doThing";

  Services.fog.testResetFOG();

  let catManUpdated = TestUtils.topicObserved("xpcom-category-entry-added");
  Services.catMan.addCategoryEntry(RUNTIME_CAT, MODULE, CONSUMER, false, false);
  await catManUpdated;

  let jsGlobal = {
    "/tmp/RuntimeObj": {
      doThing() {
        throw new Error("Runtime consumer failed.");
      },
    },
  };
  await BrowserUtils.callModulesFromCategory({
    categoryName: RUNTIME_CAT,
    jsGlobal,
  });

  let events = Glean.browserUtils.categoryDispatchError.testGetValue();
  Assert.equal(events?.length, 1, "One error event should be recorded.");
  Assert.equal(
    events[0].extra.module,
    "other",
    "A module URI outside the allowed schemes is not recorded."
  );
  Assert.equal(
    events[0].extra.consumer,
    "other",
    "A consumer that is not an identifier is not recorded."
  );

  Services.catMan.deleteCategory(RUNTIME_CAT);
});

// fileName and lineNumber name where the thrown error was created, and are
// held to the same URI schemes as the module extra.
add_task(
  async function test_callModulesFromCategory_error_telemetry_location() {
    const LOCATION_CAT = "somelocationtelemetrycat";
    const MODULE = "resource://test/my_catman_1.sys.mjs";

    Services.fog.testResetFOG();

    for (let [module, consumer] of [
      [MODULE, "Module1.throwingFunction"],
      ["file:///tmp/my_catman_local.js", "LocalObj.fail"],
      ["file:///tmp/my_catman_chained.js", "ChainedObj.fail"],
      ["file:///tmp/my_catman_eval.js", "EvalObj.fail"],
      ["file:///tmp/my_catman_nofile.js", "NoFileObj.fail"],
    ]) {
      let catManUpdated = TestUtils.topicObserved("xpcom-category-entry-added");
      Services.catMan.addCategoryEntry(
        LOCATION_CAT,
        module,
        consumer,
        false,
        false
      );
      await catManUpdated;
    }

    // LocalObj throws from this test file, whose fileName is a local path.
    // The others pass Error's fileName and lineNumber arguments to stand in
    // for a script loaded by another, evaluated code, and a value with a
    // line but no file.
    let jsGlobal = {
      LocalObj: {
        fail() {
          throw new Error("Local consumer failed.");
        },
      },
      ChainedObj: {
        fail() {
          throw new Error(
            "Chained consumer failed.",
            "resource://gre/modules/ExtensionCommon.sys.mjs -> moz-extension://uuid/api.js",
            3
          );
        },
      },
      EvalObj: {
        fail() {
          throw new Error(
            "Evaluated consumer failed.",
            "chrome://browser/content/browser.js line 7 > eval",
            1
          );
        },
      },
      NoFileObj: {
        fail() {
          throw new Error("Consumer without a file failed.", "", 5);
        },
      },
    };
    await BrowserUtils.callModulesFromCategory({
      categoryName: LOCATION_CAT,
      jsGlobal,
    });

    let locations = Object.fromEntries(
      Glean.browserUtils.categoryDispatchError
        .testGetValue()
        .map(e => [
          e.extra.consumer,
          { fileName: e.extra.fileName, lineNumber: e.extra.lineNumber },
        ])
    );
    Assert.deepEqual(
      locations,
      {
        "Module1.throwingFunction": { fileName: MODULE, lineNumber: "10" },
        "LocalObj.fail": { fileName: "other", lineNumber: undefined },
        "ChainedObj.fail": { fileName: "other", lineNumber: undefined },
        "EvalObj.fail": { fileName: "other", lineNumber: undefined },
        "NoFileObj.fail": { fileName: undefined, lineNumber: undefined },
      },
      "The error's file and line are recorded only for a single URI with an allowed scheme."
    );

    Services.catMan.deleteCategory(LOCATION_CAT);
  }
);

// The errorName extra names XPCOM exceptions and bare nsresults by their
// NS_ERROR_* name, and DOMExceptions by their DOM name.
add_task(async function test_callModulesFromCategory_error_telemetry_names() {
  const NAMES_CAT = "somenamestelemetrycat";

  Services.fog.testResetFOG();

  for (let [module, consumer] of [
    ["chrome://test/content/xpcom.js", "XpcomObj.fail"],
    ["chrome://test/content/dom.js", "DomObj.fail"],
    ["chrome://test/content/nsresult.js", "NsresultObj.fail"],
  ]) {
    let catManUpdated = TestUtils.topicObserved("xpcom-category-entry-added");
    Services.catMan.addCategoryEntry(NAMES_CAT, module, consumer, false, false);
    await catManUpdated;
  }

  let jsGlobal = {
    XpcomObj: {
      fail() {
        Services.prefs.getIntPref("browserutils.test.nonexistent");
      },
    },
    DomObj: {
      fail() {
        throw new DOMException("Not here.", "NotFoundError");
      },
    },
    NsresultObj: {
      fail() {
        // eslint-disable-next-line mozilla/no-throw-cr-literal
        throw Cr.NS_ERROR_NOT_IMPLEMENTED;
      },
    },
  };
  await BrowserUtils.callModulesFromCategory({
    categoryName: NAMES_CAT,
    jsGlobal,
  });

  let errorNames = Object.fromEntries(
    Glean.browserUtils.categoryDispatchError
      .testGetValue()
      .map(e => [e.extra.consumer, e.extra.errorName])
  );
  Assert.deepEqual(
    errorNames,
    {
      "XpcomObj.fail": "NS_ERROR_UNEXPECTED",
      "DomObj.fail": "NotFoundError",
      "NsresultObj.fail": "NS_ERROR_NOT_IMPLEMENTED",
    },
    "Each thrown value is recorded by its error name."
  );

  Services.catMan.deleteCategory(NAMES_CAT);
});

/**
 * Test that callModulesFromCategory returns a Promise that resolves when all
 * category tasks have settled.
 */
add_task(async function test_callModulesFromCategory_returns_promise() {
  const CATEGORY = "test-modules-from-catman";
  const MODULE1 = "resource://test/my_catman_1.sys.mjs";
  const OBSTOPIC1 = CATEGORY + "-notification";

  let catManUpdated = TestUtils.topicObserved("xpcom-category-entry-added");
  Services.catMan.addCategoryEntry(
    CATEGORY,
    MODULE1,
    `Module1.test`,
    false,
    false
  );
  await catManUpdated;

  let moduleResult = TestUtils.topicObserved(OBSTOPIC1).then(
    ([_subj, data]) => data
  );

  let result = BrowserUtils.callModulesFromCategory(
    { categoryName: CATEGORY },
    "Hello"
  );

  Assert.ok(result.then, "Should return a Promise");

  let settledResults = await result;
  Assert.ok(Array.isArray(settledResults), "Should return an array of results");
  Assert.equal(settledResults.length, 1, "Should have one result");
  Assert.equal(
    settledResults[0].status,
    "fulfilled",
    "Task should have been fulfilled"
  );

  Assert.equal(await moduleResult, "Hello", "Module should have been called");

  // Now clean up our category for later tests.
  Services.catMan.deleteCategory(CATEGORY);
});

// Test a category with both a plain .js entry and an ESM entry, for both
// single-window and multi-window scenarios.
add_task(async function test_callModulesFromCategory_multiple_window() {
  const CATEGORY = "test-js-global-catman";
  // A fake .js URL — the file doesn't need to exist since we rely on
  // jsGlobal having the object already (via lazy getter in production).
  const MODULE_JS = "chrome://browser/content/fake-catman-test.js";
  const MODULE_ESM = "resource://test/my_catman_1.sys.mjs";
  const OBSTOPIC = "test-modules-from-catman-notification";

  let catManUpdated = TestUtils.topicObserved("xpcom-category-entry-added");
  Services.catMan.addCategoryEntry(
    CATEGORY,
    MODULE_JS,
    "FakeObj.doThing",
    false,
    false
  );
  await catManUpdated;

  catManUpdated = TestUtils.topicObserved("xpcom-category-entry-added");
  Services.catMan.addCategoryEntry(
    CATEGORY,
    MODULE_ESM,
    "Module1.test",
    false,
    false
  );
  await catManUpdated;

  let sandbox = sinon.createSandbox();

  // Window 1: both the .js and ESM entries should be called.
  let fakeGlobal1 = { FakeObj: { doThing: sandbox.spy() } };

  let esmResult = TestUtils.topicObserved(OBSTOPIC).then(([, data]) => data);
  BrowserUtils.callModulesFromCategory(
    { categoryName: CATEGORY, jsGlobal: fakeGlobal1 },
    "window1"
  );
  sinon.assert.calledOnce(fakeGlobal1.FakeObj.doThing);
  sinon.assert.calledWithExactly(fakeGlobal1.FakeObj.doThing, "window1");
  Assert.equal(await esmResult, "window1", "ESM entry called for window 1.");

  // Window 2 (multi-window): the .js entry must use the new jsGlobal, while
  // the ESM entry continues to use the same singleton module instance.
  let fakeGlobal2 = { FakeObj: { doThing: sandbox.spy() } };

  esmResult = TestUtils.topicObserved(OBSTOPIC).then(([, data]) => data);
  BrowserUtils.callModulesFromCategory(
    { categoryName: CATEGORY, jsGlobal: fakeGlobal2 },
    "window2"
  );
  sinon.assert.calledOnce(fakeGlobal2.FakeObj.doThing);
  sinon.assert.calledWithExactly(fakeGlobal2.FakeObj.doThing, "window2");
  sinon.assert.calledOnce(fakeGlobal1.FakeObj.doThing); // not called again
  Assert.equal(await esmResult, "window2", "ESM entry called for window 2.");

  sandbox.restore();
  Services.catMan.deleteCategory(CATEGORY);
});

// Test error paths for the jsGlobal / plain-.js-script code path.
add_task(async function test_callModulesFromCategory_jsGlobal_errors() {
  const CATEGORY = "test-js-global-catman-errors";
  const MODULE = "chrome://browser/content/fake-catman-test.js";

  let catManUpdated = TestUtils.topicObserved("xpcom-category-entry-added");
  Services.catMan.addCategoryEntry(
    CATEGORY,
    MODULE,
    "FakeObj.doThing",
    false,
    false
  );
  await catManUpdated;

  // Omitting jsGlobal for a .js entry should log an error.
  let consolePromise = TestUtils.consoleMessageObserved(m => {
    let firstArg = m.wrappedJSObject.arguments?.[0];
    return typeof firstArg == "string" && firstArg.includes(CATEGORY);
  });
  BrowserUtils.callModulesFromCategory({ categoryName: CATEGORY }, "hello");
  await consolePromise;

  // Providing a jsGlobal that lacks the expected object should log an error.
  consolePromise = TestUtils.consoleMessageObserved(m => {
    let firstArg = m.wrappedJSObject.arguments?.[0];
    return typeof firstArg == "string" && firstArg.includes(CATEGORY);
  });
  BrowserUtils.callModulesFromCategory(
    { categoryName: CATEGORY, jsGlobal: {} },
    "hello"
  );
  await consolePromise;

  Services.catMan.deleteCategory(CATEGORY);
});
