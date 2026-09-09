/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef threading_Mutex_h
#define threading_Mutex_h

#include "mozilla/Assertions.h"
#include "mozilla/PlatformMutex.h"
#include "mozilla/ThreadLocal.h"

#include "threading/ThreadId.h"

namespace js {

// A MutexId secifies the name and mutex order for a mutex.
//
// The mutex order defines the allowed order of mutex acqusition on a single
// thread. Mutexes must be acquired in strictly increasing order. Mutexes with
// the same order may not be held at the same time by that thread.
struct MutexId {
  const char* name;
  uint32_t order;
};

// Base class for mutex implementations that maintains a per-thread stack of
// currently-held mutexes to enable it to check mutex ordering is observed in
// debug builds.
class MutexBase {
#ifdef DEBUG
  const MutexId id_;
  MutexBase* prev_ = nullptr;
  ThreadId owningThread_;

  static MOZ_THREAD_LOCAL(MutexBase*) HeldMutexStack;

 protected:
  void preLockChecks() const;
  void postLockChecks();
  void preUnlockChecks();

 public:
  static bool Init();
  explicit MutexBase(const MutexId& id) : id_(id) {
    MOZ_ASSERT(id_.order != 0);
  }
  bool isOwnedByCurrentThread() const;
  void assertOwnedByCurrentThread() const;

#else
 protected:
  void preLockChecks() const {}
  void postLockChecks() {}
  void preUnlockChecks() {}

 public:
  static bool Init() { return true; }
  explicit MutexBase(const MutexId& id) {}
  void assertOwnedByCurrentThread() const {}
#endif
};

class Mutex : public MutexBase, private mozilla::detail::MutexImpl {
 public:
  explicit Mutex(const MutexId& id) : MutexBase(id) {}

  void lock() {
    preLockChecks();
    MutexImpl::lock();
    postLockChecks();
  }

  bool tryLock() {
    preLockChecks();
    if (!MutexImpl::tryLock()) {
      return false;
    }

    postLockChecks();
    return true;
  }

  void unlock() {
    preUnlockChecks();
    MutexImpl::unlock();
  }

  // Call |func| which unlocks and re-locks the mutex, adding checks before and
  // afterwards.
  template <typename F>
  void checkScopedUnlock(F&& func) {
    preUnlockChecks();
    func();
    preLockChecks();
    postLockChecks();
  }

  friend class ConditionVariable;
};

}  // namespace js

#endif  // threading_Mutex_h
