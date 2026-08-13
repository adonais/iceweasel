/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef DOM_QUOTA_DIRTYTRACKINGAUTOLOCK_H_
#define DOM_QUOTA_DIRTYTRACKINGAUTOLOCK_H_

#include "mozilla/Mutex.h"
#include "mozilla/RefPtr.h"
#include "mozilla/dom/quota/ForwardDecls.h"
#include "nsClassHashtable.h"
#include "nsHashKeys.h"
#include "nsStringFwd.h"

namespace mozilla::dom::quota {

struct OriginMetadata;
class GroupInfoPair;
class OriginInfo;

// RAII lock for quota operations that mutate origin metadata. Like
// MutexAutoLock, it acquires the quota mutex on construction and releases it
// on destruction. In addition, on construction it eagerly writes the dirty
// flag to the storage database so that a crash mid-operation leaves the
// origin marked as needing a full metadata resync on next startup.
class MOZ_RAII MOZ_SCOPED_CAPABILITY MOZ_CAPABILITY("dirty_tracking_autolock")
    DirtyTrackingAutoLock {
 public:
  // RAII helper that temporarily releases the quota mutex held by a
  // DirtyTrackingAutoLock, allowing file I/O to proceed without holding
  // the lock. The mutex is re-acquired when the PauseLock is destroyed.
  // Analogous to MutexAutoUnlock.
  class MOZ_RAII MOZ_SCOPED_CAPABILITY PauseLock {
   public:
    explicit PauseLock(DirtyTrackingAutoLock& aAutoLock)
        MOZ_CAPABILITY_ACQUIRE(mLock)
        : mLock(aAutoLock) {
      mLock.Unlock<false>();
    }

    ~PauseLock() MOZ_CAPABILITY_RELEASE() { mLock.Lock(); }

    PauseLock() = delete;
    PauseLock(const PauseLock&) = delete;
    PauseLock(PauseLock&&) = delete;
    PauseLock& operator=(const PauseLock&) = delete;
    PauseLock& operator=(PauseLock&&) = delete;

   private:
    static void* operator new(size_t) noexcept(true);

    DirtyTrackingAutoLock& mLock;
  };

  DirtyTrackingAutoLock(Mutex& aLock, RefPtr<OriginInfo> aOriginInfo);

  DirtyTrackingAutoLock(
      Mutex& aLock,
      const nsClassHashtable<nsCStringHashKey, GroupInfoPair>& aGroupInfoPairs,
      const OriginMetadata& aOriginMetadata);

  DirtyTrackingAutoLock() = delete;
  DirtyTrackingAutoLock(const DirtyTrackingAutoLock&) = delete;
  DirtyTrackingAutoLock& operator=(const DirtyTrackingAutoLock&) = delete;

  ~DirtyTrackingAutoLock() { Unlock<true>(); }

  bool IsValid() const { return !!mOriginInfo; }

  void Touch() { mTouched = true; }

  RefPtr<OriginInfo> GetOriginInfo() const {
    MOZ_DIAGNOSTIC_ASSERT(IsValid());

    return mOriginInfo;
  }

 private:
  template <bool IsFinal>
  void Unlock() MOZ_CAPABILITY_RELEASE() {
    MOZ_ASSERT(mLock);
    if (mLock) {
      mLock->Unlock();
    }

    if constexpr (IsFinal) {
      mLock = nullptr;
    }
  }

  void Lock() MOZ_CAPABILITY_ACQUIRE() {
    MOZ_ASSERT(mLock);
    if (mLock) {
      mLock->Lock();
    }
  }

  void EagerMarkAsDirty();

  DirtyTrackingAutoLock(DirtyTrackingAutoLock&&) = default;
  DirtyTrackingAutoLock& operator=(DirtyTrackingAutoLock&&) = default;

  static void* operator new(size_t) noexcept(true);

  static RefPtr<OriginInfo> GetOriginInfo(
      const nsClassHashtable<nsCStringHashKey, GroupInfoPair>& aGroupInfoPairs,
      const OriginMetadata& aOriginMetadata);

  Mutex* mLock;
  mutable RefPtr<OriginInfo> mOriginInfo;
  bool mTouched;
};

}  // namespace mozilla::dom::quota

#endif  // DOM_QUOTA_DIRTYTRACKINGAUTOLOCK_H_
