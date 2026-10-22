/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include <errno.h>
#include <sys/event.h>
#include <sys/types.h>

#include "TimerThreadMonitor.h"
#include "mozilla/Assertions.h"
#include "mozilla/ProfilerThreadSleep.h"

namespace mozilla {

namespace {
// Identifiers for our registrations on mKq. They only need to be unique per
// filter.
constexpr uint64_t kNotifyIdent = 1;
constexpr uint64_t kTimerIdent = 2;

void ApplyChange(int aKq, const struct kevent64_s& aChange) {
  [[maybe_unused]] const int rv =
      kevent64(aKq, &aChange, 1, nullptr, 0, 0, nullptr);
  MOZ_ASSERT(rv >= 0);
}

// Blocks until at least one event is delivered. Room for both of our knotes,
// so the queue is always drained: a notification left behind by a wait that
// woke on its timer would otherwise return the next wait immediately.
void BlockOnKqueue(int aKq) {
  struct kevent64_s events[2];
  while (kevent64(aKq, nullptr, 0, events, 2, 0, nullptr) < 0) {
    MOZ_RELEASE_ASSERT(errno == EINTR);
  }
}
}  // namespace

TimerThreadMonitor::TimerThreadMonitor(const char* aName)
    : mMutex(aName), mKq(kqueue()) {
  MOZ_RELEASE_ASSERT(mKq);

  struct kevent64_s change;
  EV_SET64(&change, kNotifyIdent, EVFILT_USER, EV_ADD | EV_CLEAR, 0, 0, 0, 0,
           0);
  MOZ_RELEASE_ASSERT(kevent64(mKq.get(), &change, 1, nullptr, 0, 0, nullptr) >=
                     0);
}

TimerThreadMonitor::~TimerThreadMonitor() { AssertNoWaiter(); }

void TimerThreadMonitor::Wait() {
  BeginWait();
  {
    AUTO_PROFILER_THREAD_SLEEP;
    Unlock();
    BlockOnKqueue(mKq.get());
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

  // NOTE_LEEWAY hands the kernel ext[1] as a coalescing budget. On its own
  // that budget is only a floor, and the system stays free to coalesce well
  // past it, most aggressively when idle. NOTE_CRITICAL asks it to observe the
  // budget strictly instead, at the cost of power.
  const uint32_t urgency = IsPreciseTolerance(aTolerance)
                               ? NOTE_CRITICAL | NOTE_LEEWAY
                               : NOTE_LEEWAY;

  struct kevent64_s change;
  EV_SET64(&change, kTimerIdent, EVFILT_TIMER, EV_ADD | EV_ONESHOT,
           NOTE_USECONDS | urgency, ToWaitMicroseconds(aDuration), 0, 0,
           ToWaitMicroseconds(aTolerance));
  ApplyChange(mKq.get(), change);

  {
    AUTO_PROFILER_THREAD_SLEEP;
    Unlock();
    BlockOnKqueue(mKq.get());
    Lock();
  }

  // EV_ONESHOT only removes the timer once it has fired, so drop it in case we
  // woke on the notification instead. This fails with ENOENT if it did fire.
  struct kevent64_s remove;
  EV_SET64(&remove, kTimerIdent, EVFILT_TIMER, EV_DELETE, 0, 0, 0, 0, 0);
  kevent64(mKq.get(), &remove, 1, nullptr, 0, 0, nullptr);

  EndWait();
}

void TimerThreadMonitor::Notify() {
  struct kevent64_s change;
  EV_SET64(&change, kNotifyIdent, EVFILT_USER, 0, NOTE_TRIGGER, 0, 0, 0, 0);
  ApplyChange(mKq.get(), change);
}

}  // namespace mozilla
