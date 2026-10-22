/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include <windows.h>

#include <algorithm>
#include <cmath>
#include <limits>

#include "TimerThreadMonitor.h"
#include "mozilla/Assertions.h"
#include "mozilla/ProfilerThreadSleep.h"

namespace mozilla {

TimerThreadMonitor::TimerThreadMonitor(const char* aName)
    : mMutex(aName),
      mHiResTimer(CreateWaitableTimerEx(nullptr, nullptr,
                                        CREATE_WAITABLE_TIMER_HIGH_RESOLUTION,
                                        TIMER_ALL_ACCESS)),
      mLoResTimer(CreateWaitableTimerEx(nullptr, nullptr, 0, TIMER_ALL_ACCESS)),
      mEvent(CreateEvent(nullptr, FALSE, FALSE, nullptr)) {
  // Release assertions because we cannot continue without these. mHiResTimer
  // is allowed to be null; timed waits fall back to mLoResTimer.
  MOZ_RELEASE_ASSERT(mLoResTimer);
  MOZ_RELEASE_ASSERT(mEvent);
}

TimerThreadMonitor::~TimerThreadMonitor() { AssertNoWaiter(); }

void TimerThreadMonitor::Wait() {
  BeginWait();
  {
    AUTO_PROFILER_THREAD_SLEEP;
    Unlock();
    WaitForSingleObject(mEvent.get(), INFINITE);
    Lock();
  }
  EndWait();
}

void TimerThreadMonitor::Wait(TimeDuration aDuration, TimeDuration aTolerance) {
  if (aDuration == TimeDuration::Forever()) {
    Wait();
    return;
  }

  BeginWait();

  // Negative means relative rather than absolute, in hundreds of nanoseconds.
  const LARGE_INTEGER dueTime{.QuadPart = -ToWaitMicroseconds(aDuration) * 10};

  // SetWaitableTimerEx takes whole milliseconds, so this is the one place that
  // gives up sub-millisecond resolution. Rounding stays closer than truncating.
  const ULONG toleranceMs = static_cast<ULONG>(
      std::clamp(std::round(aTolerance.ToMilliseconds()), 0.0,
                 static_cast<double>(std::numeric_limits<ULONG>::max())));
  const bool canBePrecise = IsPreciseTolerance(aTolerance) && mHiResTimer;
  const HANDLE timer = canBePrecise ? mHiResTimer.get() : mLoResTimer.get();
  // High-resolution timers do not accept a tolerance, so a tolerant wait uses
  // the low-resolution one and its precision.
  const ULONG timerTolerance = canBePrecise ? 0 : toleranceMs;

  [[maybe_unused]] const BOOL ok = SetWaitableTimerEx(
      timer, &dueTime, 0, nullptr, nullptr, nullptr, timerTolerance);
  MOZ_RELEASE_ASSERT(ok);

  {
    AUTO_PROFILER_THREAD_SLEEP;
    Unlock();
    // The event first: when both are signalled only the first is reset, and a
    // timer left signalled is reset when the next wait re-arms it.
    const HANDLE handles[2] = {mEvent.get(), timer};
    WaitForMultipleObjects(2, handles, FALSE, INFINITE);
    Lock();
  }

  EndWait();
}

void TimerThreadMonitor::Notify() {
  [[maybe_unused]] const BOOL ok = SetEvent(mEvent.get());
  MOZ_RELEASE_ASSERT(ok);
}

}  // namespace mozilla
