/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include <stdint.h>  // uint32_t

#include "gtest/gtest.h"
#include "mozilla/Atomics.h"         // Atomic
#include "mozilla/EventQueue.h"      // EventQueuePriority
#include "mozilla/Mutex.h"           // Mutex, MutexAutoLock
#include "mozilla/RefPtr.h"          // RefPtr, do_AddRef
#include "mozilla/TaskController.h"  // TaskController, Task
#include "nsString.h"                // nsACString
#include "nsThreadUtils.h"           // NS_ProcessNextEvent
#include "prthread.h"                // PR_Sleep

using namespace mozilla;

namespace TestTaskController {

class Logger {
 public:
  Logger() : mMutex("Logger") {}

  void Add(const char* aText) {
    MutexAutoLock lock(mMutex);

    mLog += aText;
  }

  const nsAutoCString& GetLog() const { return mLog; }

 private:
  nsAutoCString mLog;
  Mutex mMutex;
};

class CountingTaskManager : public TaskManager {
 public:
  bool IsSuspended(const MutexAutoLock& aProofOfLock) override { return false; }
};

class ReschedulingTask : public Task {
  static constexpr uint32_t LoopCount = 3;

 public:
  explicit ReschedulingTask(
      Kind aKind, Logger* aLogger, const char* aName,
      EventQueuePriority aPriority = EventQueuePriority::Normal)
      : Task(aKind, aPriority),
        mCount(0),
        mIsDone(false),
        mLogger(aLogger),
        mName(aName) {}

  TaskResult Run() override {
    mLogger->Add(mName);

    mCount++;

    if (mCount < LoopCount) {
      return TaskResult::Incomplete;
    }

    mIsDone = true;

    return TaskResult::Complete;
  }

#ifdef MOZ_COLLECTING_RUNNABLE_TELEMETRY
  bool GetName(nsACString& aName) override {
    aName.AssignLiteral("AsyncScriptCompileTask");
    return true;
  }
#endif

  bool IsDone() const { return mIsDone; }

 private:
  Atomic<uint32_t> mCount;
  Atomic<bool> mIsDone;
  Logger* mLogger;
  const char* mName;
};

using namespace mozilla;

TEST(TaskController, RescheduleOnMainThread)
{
  Logger logger;

  RefPtr mainThreadTask =
      MakeRefPtr<ReschedulingTask>(Task::Kind::MainThreadOnly, &logger, "1");

  TaskController::Get()->AddTask(do_AddRef(mainThreadTask));

  while (NS_ProcessNextEvent(nullptr, false)) {
  }

  ASSERT_TRUE(mainThreadTask->IsDone());

  ASSERT_TRUE(logger.GetLog() == "111");
}

TEST(TaskController, RescheduleManagedOnMainThread)
{
  Logger logger;

  RefPtr manager = MakeRefPtr<CountingTaskManager>();
  RefPtr mainThreadTask =
      MakeRefPtr<ReschedulingTask>(Task::Kind::MainThreadOnly, &logger, "1");
  mainThreadTask->SetManager(manager);

  TaskController::Get()->AddTask(do_AddRef(mainThreadTask));
  ASSERT_EQ(manager->PendingTaskCount(), 1u);

  while (NS_ProcessNextEvent(nullptr, false)) {
  }

  ASSERT_TRUE(mainThreadTask->IsDone());
  ASSERT_TRUE(logger.GetLog() == "111");
  // A task that reschedules itself is pending again, so the count must not run
  // below zero on the way.
  ASSERT_EQ(manager->PendingTaskCount(), 0u);
}

TEST(TaskController, LowestPriorityRunsLast)
{
  Logger logger;

  LowestTaskManager* manager = TaskController::Get()->GetLowestTaskManager();
  RefPtr lowestTask = MakeRefPtr<ReschedulingTask>(
      Task::Kind::MainThreadOnly, &logger, "1", EventQueuePriority::Lowest);
  lowestTask->SetManager(manager);
  RefPtr normalTask =
      MakeRefPtr<ReschedulingTask>(Task::Kind::MainThreadOnly, &logger, "2");

  TaskController::Get()->AddTask(do_AddRef(lowestTask));
  TaskController::Get()->AddTask(do_AddRef(normalTask));
  ASSERT_EQ(manager->PendingTaskCount(), 1u);

  while (NS_ProcessNextEvent(nullptr, false)) {
  }

  ASSERT_TRUE(lowestTask->IsDone());
  ASSERT_TRUE(normalTask->IsDone());
  // Although it was queued first, the lowest priority task runs only once the
  // normal priority task is done.
  ASSERT_TRUE(logger.GetLog() == "222111");
  ASSERT_EQ(manager->PendingTaskCount(), 0u);
}

TEST(TaskController, LowestPriorityDoesNotStarveIdle)
{
  IdleTaskManager* idleManager = TaskController::Get()->GetIdleTaskManager();
  ASSERT_TRUE(idleManager);

  // A lowest priority task keeps the main thread from ever running out of
  // tasks, which is what the idle task manager normally waits for before it
  // asks for a deadline. Check first that this environment grants idle time at
  // all, so that a failure below cannot be mistaken for one.
  {
    Logger logger;
    RefPtr aloneTask = MakeRefPtr<ReschedulingTask>(
        Task::Kind::MainThreadOnly, &logger, "I", EventQueuePriority::Idle);
    aloneTask->SetManager(idleManager);
    TaskController::Get()->AddTask(do_AddRef(aloneTask));
    while (NS_ProcessNextEvent(nullptr, false)) {
    }
    ASSERT_TRUE(aloneTask->IsDone())
    << "no idle time available here";
  }

  Logger logger;
  RefPtr lowestTask = MakeRefPtr<ReschedulingTask>(
      Task::Kind::MainThreadOnly, &logger, "L", EventQueuePriority::Lowest);
  lowestTask->SetManager(TaskController::Get()->GetLowestTaskManager());
  RefPtr idleTask = MakeRefPtr<ReschedulingTask>(
      Task::Kind::MainThreadOnly, &logger, "I", EventQueuePriority::Idle);
  idleTask->SetManager(idleManager);

  TaskController::Get()->AddTask(do_AddRef(lowestTask));
  TaskController::Get()->AddTask(do_AddRef(idleTask));

  while (NS_ProcessNextEvent(nullptr, false)) {
  }

  ASSERT_TRUE(idleTask->IsDone());
  ASSERT_TRUE(lowestTask->IsDone());

  // The lowest priority task may win the first turn, because the idle task
  // manager is suspended until someone asks for a deadline. It must not win
  // all of them: an idle task that was already queued has to overtake it
  // rather than wait for it to finish.
  const nsAutoCString& log = logger.GetLog();
  ASSERT_LT(log.RFindChar('I'), log.RFindChar('L'))
      << "idle task starved by a lowest priority task, log was " << log.get();
}

TEST(TaskController, RescheduleOffMainThread)
{
  Logger logger;

  RefPtr offThreadTask =
      MakeRefPtr<ReschedulingTask>(Task::Kind::OffMainThreadOnly, &logger, "1");

  TaskController::Get()->AddTask(do_AddRef(offThreadTask));

  uint32_t count = 0;
  while (!offThreadTask->IsDone() && count < 100) {
    PR_Sleep(PR_MillisecondsToInterval(100));
    count++;
  }
  ASSERT_TRUE(offThreadTask->IsDone());

  ASSERT_TRUE(logger.GetLog() == "111");
}

TEST(TaskController, RescheduleMainAndOffMainThreads)
{
  Logger logger;

  RefPtr offThreadTask =
      MakeRefPtr<ReschedulingTask>(Task::Kind::OffMainThreadOnly, &logger, "1");
  RefPtr mainThreadTask =
      MakeRefPtr<ReschedulingTask>(Task::Kind::MainThreadOnly, &logger, "2");

  mainThreadTask->AddDependency(offThreadTask.get());

  TaskController::Get()->AddTask(do_AddRef(offThreadTask));
  TaskController::Get()->AddTask(do_AddRef(mainThreadTask));

  uint32_t count = 0;
  while (!offThreadTask->IsDone() && count < 100) {
    PR_Sleep(PR_MillisecondsToInterval(100));
    count++;
  }
  ASSERT_TRUE(offThreadTask->IsDone());

  // At this point, the main thread task shouldn't have run.
  ASSERT_TRUE(logger.GetLog() == "111");

  while (NS_ProcessNextEvent(nullptr, false)) {
  }

  ASSERT_TRUE(mainThreadTask->IsDone());

  ASSERT_TRUE(logger.GetLog() == "111222");
}

TEST(TaskController, RescheduleOrder)
{
  Logger logger;

  RefPtr mainThreadTask1 =
      MakeRefPtr<ReschedulingTask>(Task::Kind::MainThreadOnly, &logger, "1");
  RefPtr mainThreadTask2 =
      MakeRefPtr<ReschedulingTask>(Task::Kind::MainThreadOnly, &logger, "2");
  RefPtr mainThreadTask3 =
      MakeRefPtr<ReschedulingTask>(Task::Kind::MainThreadOnly, &logger, "3");

  TaskController::Get()->AddTask(do_AddRef(mainThreadTask1));
  TaskController::Get()->AddTask(do_AddRef(mainThreadTask2));
  TaskController::Get()->AddTask(do_AddRef(mainThreadTask3));

  while (NS_ProcessNextEvent(nullptr, false)) {
  }

  ASSERT_TRUE(mainThreadTask1->IsDone());
  ASSERT_TRUE(mainThreadTask2->IsDone());
  ASSERT_TRUE(mainThreadTask3->IsDone());

  // Rescheduled tasks should be added to the beginning of the queue.
  ASSERT_TRUE(logger.GetLog() == "111222333");
}

TEST(TaskController, RescheduleOrderOffMainThread)
{
  Logger logger1;
  Logger logger2;
  Logger logger3;

  RefPtr offThreadTask1 = MakeRefPtr<ReschedulingTask>(
      Task::Kind::OffMainThreadOnly, &logger1, "1");
  RefPtr offThreadTask2 = MakeRefPtr<ReschedulingTask>(
      Task::Kind::OffMainThreadOnly, &logger2, "2");
  RefPtr offThreadTask3 = MakeRefPtr<ReschedulingTask>(
      Task::Kind::OffMainThreadOnly, &logger3, "3");

  TaskController::Get()->AddTask(do_AddRef(offThreadTask1));
  TaskController::Get()->AddTask(do_AddRef(offThreadTask2));
  TaskController::Get()->AddTask(do_AddRef(offThreadTask3));

  uint32_t count = 0;
  while (!(offThreadTask1->IsDone() && offThreadTask2->IsDone() &&
           offThreadTask3->IsDone()) &&
         count < 100) {
    PR_Sleep(PR_MillisecondsToInterval(100));
    count++;
  }

  ASSERT_TRUE(offThreadTask1->IsDone());
  ASSERT_TRUE(offThreadTask2->IsDone());
  ASSERT_TRUE(offThreadTask3->IsDone());

  // Rescheduled tasks should be enqueued.
  // The order between off-thread tasks are not deterministic.
  ASSERT_TRUE(logger1.GetLog() == "111");
  ASSERT_TRUE(logger2.GetLog() == "222");
  ASSERT_TRUE(logger3.GetLog() == "333");
}

}  // namespace TestTaskController
