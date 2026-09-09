/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef gc_LightLock_h
#define gc_LightLock_h

#include "mozilla/Atomics.h"

#include "js/TypeDecls.h"
#include "threading/ConditionVariable.h"
#include "threading/Mutex.h"
#include "threading/ThreadId.h"

namespace js {

#ifdef MOZ_TSAN
extern void TSANMemoryAcquireFence(JSRuntime* runtime);
extern void TSANMemoryReleaseFence(JSRuntime* runtime);
#endif

// A lightweight lock modelled after rust's parking lot mutex.
//
// WARNING: This is not a general purpose mutex! There are the following
// restrictions on use:
//
//  - only two threads are supported
//
// This is intended for use in concurrent marking which only requires the
// current feature set. This greatly simplifies the implementation.
//
// The fast path uses an atomic compare and swap so should not present much
// overhead if there's no contention. The lock object itself has a small
// footprint and can be easily embedded in other objects.
//
// The rust implementation can be found here:
// https://docs.rs/parking_lot/latest/src/parking_lot/raw_mutex.rs.html
class LightLock : public MutexBase {
  enum StateBits : uint32_t {
    // Whether the mutex is locked. Set and cleared by the locking thread.
    IsLocked = Bit(0),

    // Whether a thread is waiting on the mutex. Set and cleared by the waiting
    // thread.
    HasWaiter = Bit(1),
  };

  static constexpr uint32_t UnlockedState = 0;
  static constexpr uint32_t LockedState = IsLocked;
  static constexpr uint32_t LockedWithWaiterState = IsLocked | HasWaiter;

  // TODO: Our Atomic class doesn't give us a way to do compare_exchange_weak
  // with relaxed ordering on failure, which is ideally what we would use here.
  // It's unlikely to be a big deal but this could be improved in the future.
  mozilla::Atomic<uint32_t, mozilla::ReleaseAcquire> state;

 public:
  explicit LightLock(const MutexId& id) : MutexBase(id) {}

  void lock(JSRuntime* runtime) {
    preLockChecks();
    if (MOZ_UNLIKELY(!state.compareExchange(UnlockedState, LockedState))) {
      lockSlow(runtime);
    }
    MOZ_ASSERT(isLocked());
    postLockChecks();
  }
  void lockSlow(JSRuntime* runtime);

  void unlock(JSRuntime* runtime) {
    preUnlockChecks();
    if (MOZ_UNLIKELY(!state.compareExchange(LockedState, UnlockedState))) {
      unlockSlow(runtime);
    }
  }
  void unlockSlow(JSRuntime* runtime);

  bool isLocked() const { return state & IsLocked; }
  bool hasWaiter() const { return state & HasWaiter; }

 private:
  bool spin(uint32_t& counter);
  bool tryBlockUntilWoken(JSRuntime* runtime);
  void wakeOtherThread(JSRuntime* runtime, const LockGuard<Mutex>& lock);
};

class LightLockRuntime {
  Mutex mutex;
  ConditionVariable condVar;
  bool* waitingPtr = nullptr;
  friend class LightLock;

 public:
  LightLockRuntime();
  static LightLockRuntime* from(JSRuntime* runtime);
};

}  // namespace js

#endif  // gc_LightLock_h
