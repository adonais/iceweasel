/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include <type_traits>

#include "js/friend/MicroTask.h"
#include "js/GCAPI.h"
#include "js/Promise.h"
#include "jsapi-tests/tests.h"

using namespace JS;

// JSMicroTaskRef refers into the MicroTask it came from, so it is only usable
// as a temporary: it can't be copied or moved, and its methods can't be called
// on an lvalue.
static_assert(!std::is_copy_constructible_v<JSMicroTaskRef>);
static_assert(!std::is_move_constructible_v<JSMicroTaskRef>);
static_assert(std::is_invocable_v<decltype(&JSMicroTaskRef::executionGlobal),
                                  JSMicroTaskRef&&>);
static_assert(!std::is_invocable_v<decltype(&JSMicroTaskRef::executionGlobal),
                                   JSMicroTaskRef&>);
static_assert(!std::is_invocable_v<decltype(&JSMicroTaskRef::executionGlobal),
                                   const JSMicroTaskRef&>);

namespace {

// Stands in for a Gecko MicroTaskRunnable: an embedder-side C++ task that is
// put on the queue as a PrivateValue and owned by the queue while it is there.
struct EmbedderTask {
  size_t traceCalls = 0;
};

// A minimal embedder JobQueue whose only job is to observe the microtask
// tracing hooks.
class TestJobQueue : public JS::JobQueue {
 public:
  size_t traceNonGCThingCalls = 0;

  bool getHostDefinedData(
      JSContext* cx, JS::MutableHandle<JSObject*> incumbentGlobal,
      JS::MutableHandle<JSObject*> optionalHostDefinedData) const override {
    incumbentGlobal.set(nullptr);
    optionalHostDefinedData.set(nullptr);
    return true;
  }

  bool getHostDefinedGlobal(JSContext* cx,
                            JS::MutableHandle<JSObject*> data) const override {
    data.set(nullptr);
    return true;
  }

  void runJobs(JSContext* cx) override {}
  bool isDrainingStopped() const override { return false; }

  void traceNonGCThingMicroTask(JSTracer* trc, JS::Value* valuePtr) override {
    traceNonGCThingCalls++;
    // A real embedder decodes the value back into its own task type and traces
    // whatever that task keeps reachable. Nothing here is a GC thing, so just
    // record that the hook reached the right task.
    auto* task = static_cast<EmbedderTask*>(valuePtr->toPrivate());
    task->traceCalls++;
  }

 protected:
  js::UniquePtr<SavedJobQueue> saveJobQueue(JSContext*) override {
    return nullptr;
  }
};

}  // namespace

// An embedder microtask (a non-object Value) must be traced via the
// JobQueue's traceNonGCThingMicroTask hook, not directly. Enqueue a
// PrivateValue task, force a GC, and confirm the hook fired for that task.
BEGIN_TEST(testMicroTask_embedderTracedViaHook) {
  TestJobQueue queue;
  JS::SetJobQueue(cx, &queue);

  EmbedderTask embedderTask;
  CHECK(JS::EnqueueMicroTask(cx, MicroTask::FromEmbedderPtr(&embedderTask)));
  CHECK(JS::HasRegularMicroTasks(cx));

  size_t before = queue.traceNonGCThingCalls;
  JS_GC(cx);
  CHECK(queue.traceNonGCThingCalls > before);
  CHECK(embedderTask.traceCalls > 0);

  // Drain the task so it doesn't outlive the stack pointer we enqueued. A
  // PrivateValue is stored as a double; it round-trips unchanged.
  JS::Rooted<mozilla::Maybe<MicroTask>> task(cx, JS::DequeueNextMicroTask(cx));
  CHECK(task.isSome());
  CHECK(!task->isJS());
  CHECK(task->isEmbedder());

  CHECK(task->embedderValue().toPrivate() == &embedderTask);
  CHECK(!JS::HasAnyMicroTasks(cx));

  JS::SetJobQueue(cx, nullptr);
  return true;
}
END_TEST(testMicroTask_embedderTracedViaHook)

// The hook is not just for tasks sitting in the queue: an embedder that holds a
// dequeued task across a GC (Gecko does this while a task is suppressed, and
// while it is running) roots the MicroTask, and MicroTask::trace must reach the
// hook there too.
BEGIN_TEST(testMicroTask_rootedEmbedderTracedViaHook) {
  TestJobQueue queue;
  JS::SetJobQueue(cx, &queue);

  EmbedderTask embedderTask;
  CHECK(JS::EnqueueMicroTask(cx, MicroTask::FromEmbedderPtr(&embedderTask)));

  JS::Rooted<mozilla::Maybe<MicroTask>> task(cx, JS::DequeueNextMicroTask(cx));
  CHECK(task.isSome());
  CHECK(!JS::HasAnyMicroTasks(cx));

  size_t before = queue.traceNonGCThingCalls;
  JS_GC(cx);
  CHECK(queue.traceNonGCThingCalls > before);
  CHECK(embedderTask.traceCalls > 0);

  CHECK(task->isEmbedder());
  CHECK(task->embedderValue().toPrivate() == &embedderTask);

  JS::SetJobQueue(cx, nullptr);
  return true;
}
END_TEST(testMicroTask_rootedEmbedderTracedViaHook)

// Dequeueing from an empty queue yields Nothing, and tracing Nothing must not
// report anything to the embedder; the hook would have no valid task to decode.
BEGIN_TEST(testMicroTask_emptyRootedTaskNotReported) {
  TestJobQueue queue;
  JS::SetJobQueue(cx, &queue);

  CHECK(!JS::HasAnyMicroTasks(cx));
  JS::Rooted<mozilla::Maybe<MicroTask>> task(cx, JS::DequeueNextMicroTask(cx));
  CHECK(task.isNothing());

  size_t before = queue.traceNonGCThingCalls;
  JS_GC(cx);
  CHECK(queue.traceNonGCThingCalls == before);

  JS::SetJobQueue(cx, nullptr);
  return true;
}
END_TEST(testMicroTask_emptyRootedTaskNotReported)

static bool NoopHandler(JSContext* cx, unsigned argc, JS::Value* vp) {
  JS::CallArgs args = JS::CallArgsFromVp(argc, vp);
  args.rval().setUndefined();
  return true;
}

// A JS microtask (a Promise reaction job) is enqueued through the internal
// EnqueueJob path with Kind::JS, so it is traced directly rather than via the
// embedder hook. Attaching a reaction and resolving the promise schedules such
// a job; it must survive GC without the embedder's traceNonGCThingMicroTask
// hook being consulted for it.
BEGIN_TEST(testMicroTask_jsReactionJobTracedDirectly) {
  TestJobQueue queue;
  JS::SetJobQueue(cx, &queue);

  RootedObject promise(cx, JS::NewPromiseObject(cx, nullptr));
  CHECK(promise);

  RootedFunction onFulfilled(
      cx, JS_NewFunction(cx, NoopHandler, 1, 0, "onFulfilled"));
  CHECK(onFulfilled);
  RootedObject onFulfilledObj(cx, JS_GetFunctionObject(onFulfilled));
  CHECK(JS::AddPromiseReactions(cx, promise, onFulfilledObj, nullptr));

  // Resolving the promise enqueues the reaction as a JS microtask.
  CHECK(JS::ResolvePromise(cx, promise, JS::UndefinedHandleValue));
  CHECK(JS::HasRegularMicroTasks(cx));

  size_t hookCallsBefore = queue.traceNonGCThingCalls;
  JS_GC(cx);
  // The JS reaction job is an object traced directly; the embedder hook must
  // not have been used to keep it alive.
  CHECK(queue.traceNonGCThingCalls == hookCallsBefore);

  // The surviving task is a live JS microtask.
  JS::Rooted<mozilla::Maybe<MicroTask>> task(cx, JS::PeekNextMicroTask(cx));
  CHECK(task.isSome());
  CHECK(task->isJS());
  CHECK(task->asJS().executionGlobal());

  JS::SetJobQueue(cx, nullptr);
  return true;
}
END_TEST(testMicroTask_jsReactionJobTracedDirectly)
