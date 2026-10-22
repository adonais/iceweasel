/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

function createMochia() {
  const tasks = [];
  const results = [];
  const messages = [];
  const scope = {
    add_task(task) {
      tasks.push(task);
      return task;
    },
    ok(condition, message) {
      results.push({ condition, message });
    },
    info(message) {
      messages.push(message);
    },
  };
  Services.scriptloader.loadSubScript(
    "resource://testing-common/Mochia.js",
    scope
  );
  return { scope, tasks, results, messages };
}

function callback(fn, asynchronous) {
  return asynchronous
    ? async () => {
        await Promise.resolve();
        return fn();
      }
    : fn;
}

add_task(async function test_body_runs_without_hooks() {
  for (const asynchronous of [false, true]) {
    const { scope, tasks, results } = createMochia();
    let calls = 0;

    scope.it(
      "body",
      callback(() => {
        calls++;
      }, asynchronous)
    );

    Assert.equal(calls, 0, "Registration does not execute the body");
    Assert.equal(tasks.length, 1, "One task is registered");

    await tasks[0]();

    Assert.equal(calls, 1, "The task executes the body exactly once");
    Assert.deepEqual(results, [], "Successful execution reports no failures");
  }
});

add_task(async function test_hook_order() {
  for (const asynchronous of [false, true]) {
    const { scope, tasks, results, messages } = createMochia();
    const events = [];
    const record = event =>
      callback(() => {
        events.push(event);
      }, asynchronous);

    await scope.describe("outer", async () => {
      scope.beforeEach(record("outer before"));
      scope.afterEach(record("outer after"));
      await scope.describe("inner", () => {
        scope.beforeEach(record("inner before"));
        scope.afterEach(record("inner after"));
        scope.it("test", record("body"));
      });
    });

    Assert.deepEqual(
      events,
      [],
      "Test events still empty before triggering tests"
    );
    Assert.equal(tasks.length, 1, "One task is registered");
    Assert.equal(tasks[0].name, "outer / inner / test");

    await tasks[0]();

    Assert.deepEqual(events, [
      "outer before",
      "inner before",
      "body",
      "inner after",
      "outer after",
    ]);
    Assert.deepEqual(results, [], "Successful execution reports no failures");
    Assert.deepEqual(messages, ["outer / inner / test"]);
  }
});

add_task(async function test_setup_failure_runs_cleanup() {
  for (const asynchronous of [false, true]) {
    const { scope, tasks, results } = createMochia();
    const events = [];
    const setupError = new Error("setup failed");

    scope.beforeEach(
      callback(() => {
        events.push("failing setup");
        throw setupError;
      }, asynchronous)
    );
    scope.beforeEach(() => events.push("second setup"));
    scope.afterEach(() => events.push("cleanup"));
    scope.it("setup failure", () => events.push("body"));

    await Assert.rejects(
      tasks[0](),
      error => error === setupError,
      "The setup error propagates"
    );
    Assert.deepEqual(
      events,
      ["failing setup", "cleanup"],
      "Setup failure skips remaining setup and the body, but runs cleanup"
    );
    Assert.deepEqual(results, [], "Successful cleanup reports no failures");
  }
});

add_task(async function test_body_failure_does_not_prevent_afterEach() {
  for (const asynchronous of [false, true]) {
    const { scope, tasks, results, messages } = createMochia();
    const events = [];
    const bodyError = new Error("body failed");
    const cleanupError = new Error("cleanup failed");

    scope.beforeEach(() => events.push("setup"));
    scope.afterEach(() => events.push("last cleanup"));
    scope.afterEach(
      callback(() => {
        events.push("failing cleanup");
        throw cleanupError;
      }, asynchronous)
    );
    scope.it(
      "body failure",
      callback(() => {
        events.push("body");
        throw bodyError;
      }, asynchronous)
    );

    await Assert.rejects(
      tasks[0](),
      error => error === bodyError,
      "The body error propagates despite a teardown failure"
    );
    Assert.deepEqual(events, [
      "setup",
      "body",
      "failing cleanup",
      "last cleanup",
    ]);
    Assert.deepEqual(results, [
      {
        condition: false,
        message: `afterEach failed for body failure: ${cleanupError}`,
      },
    ]);
    Assert.ok(messages.includes(cleanupError.stack), "Logs the error stack");
  }
});

add_task(async function test_after_each_failures_continue_cleanup() {
  for (const asynchronous of [false, true]) {
    const { scope, tasks, results } = createMochia();
    const events = [];
    const cleanupError = new Error("cleanup failed");

    scope.afterEach(() => events.push("last cleanup"));
    for (const error of [cleanupError, null, undefined]) {
      scope.afterEach(
        callback(() => {
          events.push(error);
          throw error;
        }, asynchronous)
      );
    }
    scope.it("cleanup", () => events.push("body"));

    await tasks[0]();
    Assert.deepEqual(events, [
      "body",
      undefined,
      null,
      cleanupError,
      "last cleanup",
    ]);
    Assert.deepEqual(results, [
      {
        condition: false,
        message: "afterEach failed for cleanup: undefined",
      },
      {
        condition: false,
        message: "afterEach failed for cleanup: null",
      },
      {
        condition: false,
        message: `afterEach failed for cleanup: ${cleanupError}`,
      },
    ]);
  }
});
