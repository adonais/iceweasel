/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include <thread>

#include "TimerThreadMonitor.h"
#include "gtest/gtest.h"
#include "mozilla/TimeStamp.h"

using mozilla::TimeDuration;
using mozilla::TimerThreadMonitor;
using mozilla::TimerThreadMonitorAutoLock;
using mozilla::TimeStamp;

namespace {

constexpr double kWaitMs = 20.0;

// A timed wait that comes back earlier than this did not run to its deadline
// but returned at once. Only earliness is bounded: the tests check that the
// wait mechanism works, not how precisely it keeps time, and a lateness bound
// would be an intermittent on a loaded machine.
constexpr double kReturnedAtOnceMs = kWaitMs / 2.0;

const TimeDuration kNoTolerance;

// Waits that should time out use a short duration so a hang is obvious; waits
// that should be notified use one long enough that reaching it means the
// notification was lost.
constexpr double kNeverReachedMs = 30000.0;

}  // namespace

// A timed wait must come back on its own, and not immediately: an unarmed
// timer hangs, a stale latched wakeup returns straight away.
TEST(TimerThreadMonitor, PreciseWaitTimesOut)
{
  TimerThreadMonitor monitor("TestTimerThreadMonitor");
  TimerThreadMonitorAutoLock lock(monitor);

  const TimeStamp start = TimeStamp::Now();
  monitor.Wait(TimeDuration::FromMilliseconds(kWaitMs), kNoTolerance);
  const TimeDuration elapsed = TimeStamp::Now() - start;

  EXPECT_GT(elapsed.ToMilliseconds(), kReturnedAtOnceMs);
}

// The same, for a tolerance large enough to take the coalescing path.
TEST(TimerThreadMonitor, TolerantWaitTimesOut)
{
  TimerThreadMonitor monitor("TestTimerThreadMonitor");
  TimerThreadMonitorAutoLock lock(monitor);

  const TimeDuration tolerance = TimeDuration::FromMilliseconds(64.0);
  ASSERT_FALSE(TimerThreadMonitor::IsPreciseTolerance(tolerance));

  const TimeStamp start = TimeStamp::Now();
  monitor.Wait(TimeDuration::FromMilliseconds(kWaitMs), tolerance);
  const TimeDuration elapsed = TimeStamp::Now() - start;

  EXPECT_GT(elapsed.ToMilliseconds(), kReturnedAtOnceMs);
}

// Consecutive waits on the same monitor must each arm the timer afresh.
TEST(TimerThreadMonitor, RepeatedWaits)
{
  TimerThreadMonitor monitor("TestTimerThreadMonitor");
  TimerThreadMonitorAutoLock lock(monitor);

  const TimeStamp start = TimeStamp::Now();
  for (size_t i = 0; i < 5; ++i) {
    monitor.Wait(TimeDuration::FromMilliseconds(kWaitMs), kNoTolerance);
  }
  const TimeDuration elapsed = TimeStamp::Now() - start;

  EXPECT_GT(elapsed.ToMilliseconds(), 5 * kReturnedAtOnceMs);
}

// Returns once the waiter thread has entered Wait(). The waiter sets aWaiting
// under the monitor right before waiting and only releases the monitor inside
// Wait(), so seeing the flag while holding the monitor means it is waiting.
static void SpinUntilWaiting(TimerThreadMonitor& aMonitor,
                             const bool& aWaiting) {
  for (;;) {
    {
      TimerThreadMonitorAutoLock lock(aMonitor);
      if (aWaiting) {
        return;
      }
    }
    std::this_thread::yield();
  }
}

// Notify() must interrupt a wait that would otherwise run essentially forever.
TEST(TimerThreadMonitor, NotifyInterruptsTimedWait)
{
  TimerThreadMonitor monitor("TestTimerThreadMonitor");
  bool waiting = false;
  bool woken = false;

  std::thread waiter([&] {
    TimerThreadMonitorAutoLock lock(monitor);
    waiting = true;
    while (!woken) {
      monitor.Wait(TimeDuration::FromMilliseconds(kNeverReachedMs),
                   kNoTolerance);
    }
  });

  SpinUntilWaiting(monitor, waiting);
  const TimeStamp start = TimeStamp::Now();
  {
    TimerThreadMonitorAutoLock lock(monitor);
    woken = true;
    monitor.Notify();
  }
  waiter.join();

  EXPECT_LT((TimeStamp::Now() - start).ToMilliseconds(), kNeverReachedMs);
}

// Notify() must also interrupt an untimed wait.
TEST(TimerThreadMonitor, NotifyInterruptsUntimedWait)
{
  TimerThreadMonitor monitor("TestTimerThreadMonitor");
  bool waiting = false;
  bool woken = false;

  std::thread waiter([&] {
    TimerThreadMonitorAutoLock lock(monitor);
    waiting = true;
    while (!woken) {
      monitor.Wait();
    }
  });

  SpinUntilWaiting(monitor, waiting);
  {
    TimerThreadMonitorAutoLock lock(monitor);
    woken = true;
    monitor.Notify();
  }
  waiter.join();
}

static void WaitOnceOnNewThread(TimerThreadMonitor& aMonitor,
                                TimeDuration aDuration,
                                TimeDuration aTolerance) {
  std::thread waiter([&] {
    TimerThreadMonitorAutoLock lock(aMonitor);
    aMonitor.Wait(aDuration, aTolerance);
  });
  waiter.join();
}

// One waiter at a time is the contract, but it need not always be the same
// thread. The debug bookkeeping must not reject a second waiter that only
// starts once the first has finished.
TEST(TimerThreadMonitor, WaitersOnDifferentThreadsInSequence)
{
  TimerThreadMonitor monitor("TestTimerThreadMonitor");

  const TimeDuration duration = TimeDuration::FromMilliseconds(kWaitMs);
  WaitOnceOnNewThread(monitor, duration, kNoTolerance);
  WaitOnceOnNewThread(monitor, duration, kNoTolerance);
}

// Where the backend waits on an OS object a notification latches, but however
// many arrive with no waiter they may release only one wait between them.
TEST(TimerThreadMonitor, NotificationsDoNotAccumulate)
{
  TimerThreadMonitor monitor("TestTimerThreadMonitor");
  TimerThreadMonitorAutoLock lock(monitor);

  monitor.Notify();
  monitor.Notify();
  monitor.Notify();

  // Returns at once where the notification latched, runs to the deadline
  // where it did not.
  monitor.Wait(TimeDuration::FromMilliseconds(kWaitMs), kNoTolerance);

  const TimeStamp start = TimeStamp::Now();
  monitor.Wait(TimeDuration::FromMilliseconds(kWaitMs), kNoTolerance);
  const TimeDuration elapsed = TimeStamp::Now() - start;

  EXPECT_GT(elapsed.ToMilliseconds(), kReturnedAtOnceMs);
}
