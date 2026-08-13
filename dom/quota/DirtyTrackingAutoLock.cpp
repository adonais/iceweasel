/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "DirtyTrackingAutoLock.h"

#include "Assertions.h"
#include "GroupInfo.h"
#include "GroupInfoPair.h"
#include "OriginInfo.h"
#include "QuotaManager.h"

namespace mozilla::dom::quota {

DirtyTrackingAutoLock::DirtyTrackingAutoLock(Mutex& aLock,
                                             RefPtr<OriginInfo> aOriginInfo)
    : mLock(&aLock), mOriginInfo(std::move(aOriginInfo)), mTouched(false) {
  if (IsValid()) {
    Lock();
    if (!mOriginInfo->LockedDirty()) {
      EagerMarkAsDirty();
    }
  }
}

DirtyTrackingAutoLock::DirtyTrackingAutoLock(
    Mutex& aLock,
    const nsClassHashtable<nsCStringHashKey, GroupInfoPair>& aGroupInfoPairs,
    const OriginMetadata& aOriginMetadata)
    : mLock(&aLock), mOriginInfo(nullptr), mTouched(false) {
  Lock();
  mOriginInfo = GetOriginInfo(aGroupInfoPairs, aOriginMetadata);
  if (!IsValid()) {
    Unlock<true>();
    return;
  }

  if (!mOriginInfo->LockedDirty()) {
    EagerMarkAsDirty();
  }
}

void DirtyTrackingAutoLock::EagerMarkAsDirty() {
  MOZ_ASSERT(IsValid());

  auto stateMetadata = mOriginInfo->LockedFlattenToOriginStateMetadata();
  stateMetadata.mDirty = true;
  // The lock was acquired to set the dirty flag and timestamp above.
  // Release it for the disk write that persists the flag, then re-acquire
  // in RAII manner so the caller can proceed with the actual metadata
  // modifications.
  PauseLock pausedLock(*this);

  auto* quotaManager = QuotaManager::Get();
  MOZ_ASSERT(quotaManager);
  quotaManager->AssertNotCurrentThreadOwnsQuotaMutex();

  quotaManager->FlagOriginInfoAsDirtyOnDisk(*this, stateMetadata);
}

RefPtr<OriginInfo> DirtyTrackingAutoLock::GetOriginInfo(
    const nsClassHashtable<nsCStringHashKey, GroupInfoPair>& aGroupInfoPairs,
    const OriginMetadata& aOriginMetadata) {
  GroupInfoPair* pair;
  if (!aGroupInfoPairs.Get(aOriginMetadata.mGroup, &pair)) {
    return nullptr;
  }
  MOZ_DIAGNOSTIC_ASSERT(pair);

  RefPtr<GroupInfo> groupInfo =
      pair->LockedGetGroupInfo(aOriginMetadata.mPersistenceType);

  return groupInfo ? groupInfo->LockedGetOriginInfo(aOriginMetadata.mOrigin)
                   : nullptr;
}

}  // namespace mozilla::dom::quota
