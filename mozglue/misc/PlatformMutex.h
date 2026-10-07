/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_PlatformMutex_h
#define mozilla_PlatformMutex_h

#if defined(XP_WIN)
#  include <atomic>
#endif

#include "mozilla/Types.h"

#if defined(XP_WIN)
#  include "mozilla/Futex.h"
#elif !defined(__wasi__)
#  include <pthread.h>
#endif

namespace mozilla {

namespace detail {

class ConditionVariableImpl;

class MutexImpl {
 public:
#if defined(XP_WIN)
  constexpr MutexImpl() = default;
#else
  explicit MFBT_API MutexImpl();
#endif
  MFBT_API ~MutexImpl();

  MutexImpl(const MutexImpl&) = delete;
  void operator=(const MutexImpl&) = delete;
  MutexImpl(MutexImpl&&) = delete;
  void operator=(MutexImpl&&) = delete;
  bool operator==(const MutexImpl& rhs) = delete;

 protected:
  MFBT_API void lock();
  MFBT_API void unlock();
  // We have a separate, forwarding API so internal uses don't have to go
  // through the PLT.
  MFBT_API bool tryLock();

#if defined(XP_WIN)
  void reset() { mFutex.mValue.store(0, std::memory_order_relaxed); }
#endif

 private:
  void mutexLock();
  bool mutexTryLock();

#if defined(XP_WIN)
  SmallFutex mFutex;
  static_assert(std::atomic<uint8_t>::is_always_lock_free);
  static_assert(sizeof(std::atomic<uint8_t>) == sizeof(uint8_t));
#elif !defined(__wasi__)
  pthread_mutex_t mMutex;
#endif

  friend class mozilla::detail::ConditionVariableImpl;
};

}  // namespace detail

}  // namespace mozilla
#endif  // mozilla_PlatformMutex_h
