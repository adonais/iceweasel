/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "TimerThreadMonitor.h"

namespace mozilla {

// A condition variable cannot coalesce, so this waits for the end of the
// window, as the OS backends do when nothing else is due.

TimerThreadMonitor::TimerThreadMonitor(const char* aName)
    : mMutex(aName), mCondVar(mMutex, "[TimerThreadMonitor.mCondVar]") {}

TimerThreadMonitor::~TimerThreadMonitor() { AssertNoWaiter(); }

void TimerThreadMonitor::Wait() {
  BeginWait();
  mCondVar.Wait();
  EndWait();
}

void TimerThreadMonitor::Wait(TimeDuration aDuration, TimeDuration aTolerance) {
  BeginWait();
  mCondVar.Wait(aDuration + aTolerance);
  EndWait();
}

void TimerThreadMonitor::Notify() { mCondVar.Notify(); }

}  // namespace mozilla
