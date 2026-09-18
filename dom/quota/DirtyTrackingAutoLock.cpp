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
  Lock();
  if (!IsValid()) {
    Unlock<true>();
    return;
  }

  if (!mOriginInfo->LockedDirty()) {
    EagerMarkAsDirty();
  }
  if (!IsValid()) {
    Unlock<true>();
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
  if (!IsValid()) {
    Unlock<true>();
  }
}

void DirtyTrackingAutoLock::EagerMarkAsDirty() {
  MOZ_ASSERT(IsValid());

  auto* quotaManager = QuotaManager::Get();
  MOZ_ASSERT(quotaManager);

  auto stateMetadata = mOriginInfo->LockedFlattenToOriginStateMetadata();
  stateMetadata.mDirty = true;
  {
    PauseLock pausedLock(*this);

    quotaManager->AssertNotCurrentThreadOwnsQuotaMutex();

    quotaManager->FlagOriginInfoAsDirtyOnDisk(*this, stateMetadata);
  }

  // The origin may have been removed while the lock was paused.
  if (!mOriginInfo->GetGroupInfo()) {
    mOriginInfo = nullptr;
  }
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
