/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "threading/Mutex.h"

using namespace js;

#ifdef DEBUG

MOZ_THREAD_LOCAL(js::MutexBase*) js::MutexBase::HeldMutexStack;

/* static */
bool js::MutexBase::Init() { return HeldMutexStack.init(); }

void js::MutexBase::preLockChecks() const {
  MutexBase* prev = HeldMutexStack.get();
  if (prev) {
    if (id_.order <= prev->id_.order) {
      fprintf(stderr,
              "Attempt to acquire mutex %s with order %u while holding %s with "
              "order %u\n",
              id_.name, id_.order, prev->id_.name, prev->id_.order);
      MOZ_CRASH("Mutex ordering violation");
    }
  }
}

void js::MutexBase::postLockChecks() {
  MOZ_ASSERT(!owningThread_);
  owningThread_ = ThreadId::ThisThreadId();

  MOZ_ASSERT(prev_ == nullptr);
  prev_ = HeldMutexStack.get();
  HeldMutexStack.set(this);
}

void js::MutexBase::preUnlockChecks() {
  MutexBase* stack = HeldMutexStack.get();
  MOZ_ASSERT(stack == this);
  HeldMutexStack.set(prev_);
  prev_ = nullptr;

  MOZ_ASSERT(ThreadId::ThisThreadId() == owningThread_);
  owningThread_ = ThreadId();
}

void js::MutexBase::assertOwnedByCurrentThread() const {
  // This check is only thread-safe if it succeeds.
  MOZ_ASSERT(ThreadId::ThisThreadId() == owningThread_);

  MOZ_ASSERT(isOwnedByCurrentThread());
}

bool js::MutexBase::isOwnedByCurrentThread() const {
  // Check whether the mutex is on the thread-local mutex stack.
  for (MutexBase* mutex = HeldMutexStack.get(); mutex; mutex = mutex->prev_) {
    if (mutex == this) {
      return true;
    }
  }

  return false;
}

#endif
