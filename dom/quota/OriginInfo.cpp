/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "OriginInfo.h"

#include "DirtyTrackingAutoLock.h"
#include "GroupInfo.h"
#include "GroupInfoPair.h"
#include "OriginUpserter.h"
#include "mozIStorageConnection.h"
#include "mozIStorageStatement.h"
#include "mozilla/dom/quota/AssertionsImpl.h"
#include "mozilla/dom/quota/ResultExtensions.h"
#include "mozilla/dom/quota/UsageInfo.h"

namespace mozilla::dom::quota {

// This constructor is called from the "QuotaManager IO" thread and so we
// can't check if the principal has a WebExtensionPolicy instance associated
// to it, and even besides that if the extension is currently disabled (and so
// no WebExtensionPolicy instance would actually exist) its stored data
// shouldn't be cleared until the extension is uninstalled and so here we
// resort to check the origin scheme instead to initialize mIsExtension.
OriginInfo::OriginInfo(GroupInfo* aGroupInfo, const nsACString& aOrigin,
                       const nsACString& aStorageOrigin, bool aIsPrivate,
                       const ClientUsageArray& aClientUsages, uint64_t aUsage,
                       int64_t aAccessTime, int32_t aMaintenanceDate,
                       bool aPersisted, bool aDirectoryExists)
    : mGroupInfo(aGroupInfo),
      mOrigin(aOrigin),
      mStorageOrigin(aStorageOrigin),
      mAccessTime(aAccessTime),
      mMaintenanceDate(aMaintenanceDate),
      mIsPrivate(aIsPrivate),
      mAccessed(false),
      mPersisted(aPersisted),
      mIsExtension(StringBeginsWith(aOrigin, "moz-extension://"_ns)),
      mDirectoryExists(aDirectoryExists),
      mClientUsages(aClientUsages),
      mUsage(aUsage) {
  MOZ_ASSERT(aGroupInfo);
  MOZ_ASSERT_IF(!aIsPrivate, aOrigin == aStorageOrigin);
  MOZ_ASSERT_IF(aIsPrivate, aOrigin != aStorageOrigin);
  MOZ_ASSERT(aClientUsages.Length() == Client::TypeMax());
  MOZ_ASSERT_IF(aPersisted,
                aGroupInfo->mPersistenceType == PERSISTENCE_TYPE_DEFAULT);

#ifdef DEBUG
  QuotaManager* quotaManager = QuotaManager::Get();
  MOZ_ASSERT(quotaManager);

  uint64_t usage = 0;
  for (Client::Type type : quotaManager->AllClientTypes()) {
    AssertNoOverflow(usage, aClientUsages[type].valueOr(0));
    usage += aClientUsages[type].valueOr(0);
  }
  MOZ_ASSERT(aUsage == usage);
#endif

  MOZ_COUNT_CTOR(OriginInfo);
}

int64_t OriginInfo::LockedUsage() const {
  AssertCurrentThreadOwnsQuotaMutex();

#ifdef DEBUG
  QuotaManager* quotaManager = QuotaManager::Get();
  MOZ_ASSERT(quotaManager);

  uint64_t usage = 0;
  for (Client::Type type : quotaManager->AllClientTypes()) {
    AssertNoOverflow(usage, mClientUsages[type].valueOr(0));
    usage += mClientUsages[type].valueOr(0);
  }
  MOZ_ASSERT(mUsage == usage);
#endif

  return mUsage;
}

OriginMetadata OriginInfo::FlattenToOriginMetadata() const {
  MOZ_ASSERT(mGroupInfo);
  return {mGroupInfo->mGroupInfoPair->Suffix(),
          mGroupInfo->mGroupInfoPair->Group(),
          mOrigin,
          mStorageOrigin,
          mIsPrivate,
          mGroupInfo->mPersistenceType};
}

OriginStateMetadata OriginInfo::LockedFlattenToOriginStateMetadata() const {
  AssertCurrentThreadOwnsQuotaMutex();

  return {mAccessTime, mMaintenanceDate, mAccessed, mPersisted, LockedDirty()};
}

FullOriginMetadata OriginInfo::LockedFlattenToFullOriginMetadata() const {
  AssertCurrentThreadOwnsQuotaMutex();

  return {FlattenToOriginMetadata(), LockedFlattenToOriginStateMetadata(),
          mClientUsages, mUsage, kCurrentQuotaVersion};
}

nsresult OriginInfo::LockedBindToStatement(
    mozIStorageStatement* aStatement) const {
  AssertCurrentThreadOwnsQuotaMutex();
  MOZ_ASSERT(mGroupInfo);

  QM_TRY(MOZ_TO_RESULT(aStatement->BindInt32ByName(
      "repository_id"_ns, mGroupInfo->mPersistenceType)));

  QM_TRY(MOZ_TO_RESULT(aStatement->BindUTF8StringByName(
      "suffix"_ns, mGroupInfo->mGroupInfoPair->Suffix())));
  QM_TRY(MOZ_TO_RESULT(aStatement->BindUTF8StringByName(
      "group_"_ns, mGroupInfo->mGroupInfoPair->Group())));
  QM_TRY(MOZ_TO_RESULT(aStatement->BindUTF8StringByName("origin"_ns, mOrigin)));

  MOZ_ASSERT(!mIsPrivate);

  nsCString clientUsagesText;
  mClientUsages.Serialize(clientUsagesText);

  QM_TRY(MOZ_TO_RESULT(
      aStatement->BindUTF8StringByName("client_usages"_ns, clientUsagesText)));
  QM_TRY(MOZ_TO_RESULT(aStatement->BindInt64ByName("usage"_ns, mUsage)));
  QM_TRY(MOZ_TO_RESULT(
      aStatement->BindInt64ByName("last_access_time"_ns, mAccessTime)));
  QM_TRY(MOZ_TO_RESULT(aStatement->BindInt32ByName("last_maintenance_date"_ns,
                                                   mMaintenanceDate)));
  OriginStateMetadata stateMetadata = LockedFlattenToOriginStateMetadata();
  QM_TRY(MOZ_TO_RESULT(aStatement->BindInt32ByName(
      "metadata_flags"_ns, stateMetadata.ToMetadataFlags())));

  return NS_OK;
}

nsresult OriginInfo::UpdateDirtyMetadata(mozIStorageConnection* aConnection,
                                         uint32_t aMetadataFlags,
                                         int64_t aLastAccessTime) const {
  MOZ_ASSERT(aConnection);

  nsCOMPtr<mozIStorageStatement> stmt;
  QM_TRY(MOZ_TO_RESULT(aConnection->CreateStatement(
      "UPDATE origin SET metadata_flags = :metadata_flags, "
      "last_access_time = :last_access_time "
      "WHERE repository_id = :repository_id "
      "AND origin = :origin;"_ns,
      getter_AddRefs(stmt))));

  QM_TRY(MOZ_TO_RESULT(
      stmt->BindInt32ByName("metadata_flags"_ns, aMetadataFlags)));
  QM_TRY(MOZ_TO_RESULT(
      stmt->BindInt64ByName("last_access_time"_ns, aLastAccessTime)));
  QM_TRY(MOZ_TO_RESULT(
      stmt->BindInt32ByName("repository_id"_ns, mGroupInfo->mPersistenceType)));
  QM_TRY(MOZ_TO_RESULT(stmt->BindUTF8StringByName("origin"_ns, mOrigin)));

  QM_TRY(MOZ_TO_RESULT(stmt->Execute()));

  return NS_OK;
}

void OriginInfo::LockedDecreaseUsage(Client::Type aClientType, int64_t aSize,
                                     DirtyTrackingAutoLock& aProofOfLock) {
  AssertCurrentThreadOwnsQuotaMutex();

  MOZ_ASSERT(mClientUsages[aClientType].isSome());
  QM_ASSERT_NO_UNDERFLOW_2(
      mClientUsages[aClientType].value(), aSize,
      "mClientUsages["_ns + Client::TypeToText(aClientType) + "]"_ns);
  mClientUsages[aClientType] = Some(mClientUsages[aClientType].value() - aSize);

  QM_ASSERT_NO_UNDERFLOW(mUsage, aSize);
  mUsage -= aSize;
  MakeDirty(aProofOfLock);

  if (!LockedPersisted()) {
    QM_ASSERT_NO_UNDERFLOW(mGroupInfo->mUsage, aSize);
    mGroupInfo->mUsage -= aSize;
  }

  QuotaManager* quotaManager = QuotaManager::Get();
  MOZ_ASSERT(quotaManager);

  QM_ASSERT_NO_UNDERFLOW(quotaManager->mTemporaryStorageUsage, aSize);
  quotaManager->mTemporaryStorageUsage -= aSize;
}

void OriginInfo::LockedResetUsageForClient(
    Client::Type aClientType, DirtyTrackingAutoLock& aProofOfLock) {
  AssertCurrentThreadOwnsQuotaMutex();

  uint64_t size = mClientUsages[aClientType].valueOr(0);

  mClientUsages[aClientType].reset();

  QM_ASSERT_NO_UNDERFLOW(mUsage, size);
  mUsage -= size;
  MakeDirty(aProofOfLock);

  if (!LockedPersisted()) {
    QM_ASSERT_NO_UNDERFLOW(mGroupInfo->mUsage, size);
    mGroupInfo->mUsage -= size;
  }

  QuotaManager* quotaManager = QuotaManager::Get();
  MOZ_ASSERT(quotaManager);

  QM_ASSERT_NO_UNDERFLOW(quotaManager->mTemporaryStorageUsage, size);
  quotaManager->mTemporaryStorageUsage -= size;
}

UsageInfo OriginInfo::LockedGetUsageForClient(Client::Type aClientType) {
  AssertCurrentThreadOwnsQuotaMutex();

  // The current implementation of this method only supports DOMCACHE and LS,
  // which only use DatabaseUsage. If this assertion is lifted, the logic below
  // must be adapted.
  MOZ_ASSERT(aClientType == Client::Type::DOMCACHE ||
             aClientType == Client::Type::LS ||
             aClientType == Client::Type::FILESYSTEM);

  return UsageInfo{DatabaseUsageType{mClientUsages[aClientType]}};
}

void OriginInfo::LockedPersist(DirtyTrackingAutoLock& aProofOfLock) {
  AssertCurrentThreadOwnsQuotaMutex();
  MOZ_ASSERT(mGroupInfo->mPersistenceType == PERSISTENCE_TYPE_DEFAULT);
  MOZ_ASSERT(!mPersisted);

  mPersisted = true;
  MakeDirty(aProofOfLock);

  // Remove Usage from GroupInfo
  QM_ASSERT_NO_UNDERFLOW(mGroupInfo->mUsage, mUsage);
  mGroupInfo->mUsage -= mUsage;
}

void OriginInfo::LockedTruncateUsages(Client::Type aClientType, uint64_t aDelta,
                                      DirtyTrackingAutoLock& aProofOfLock) {
  AssertCurrentThreadOwnsQuotaMutex();

  QuotaManager* quotaManager = QuotaManager::Get();
  MOZ_ASSERT(quotaManager);

  QM_ASSERT_NO_UNDERFLOW(quotaManager->mTemporaryStorageUsage, aDelta);
  quotaManager->mTemporaryStorageUsage -= aDelta;

  if (!LockedPersisted()) {
    QM_ASSERT_NO_UNDERFLOW(mGroupInfo->mUsage, aDelta);
    mGroupInfo->mUsage -= aDelta;
  }

  QM_ASSERT_NO_UNDERFLOW(mUsage, aDelta);
  mUsage -= aDelta;
  MakeDirty(aProofOfLock);

  MOZ_ASSERT(mClientUsages[aClientType].isSome());
  QM_ASSERT_NO_UNDERFLOW_2(
      mClientUsages[aClientType].value(), aDelta,
      "mClientUsages["_ns + Client::TypeToText(aClientType) + "]"_ns);
  mClientUsages[aClientType] =
      Some(mClientUsages[aClientType].value() - aDelta);
};

Maybe<bool> OriginInfo::LockedUpdateUsages(
    Client::Type aClientType, uint64_t aDelta,
    DirtyTrackingAutoLock& aProofOfLock) {
  AssertCurrentThreadOwnsQuotaMutex();

  QuotaManager* quotaManager = QuotaManager::Get();
  MOZ_ASSERT(quotaManager);

  const auto& complementaryPersistenceTypes =
      ComplementaryPersistenceTypes(mGroupInfo->mPersistenceType);

  AssertNoOverflow(mClientUsages[aClientType].valueOr(0), aDelta);
  uint64_t newClientUsage = mClientUsages[aClientType].valueOr(0) + aDelta;

  AssertNoOverflow(mUsage, aDelta);
  uint64_t newUsage = mUsage + aDelta;
  MakeDirty(aProofOfLock);

  // Temporary storage has no limit for origin usage (there's a group and the
  // global limit though).

  uint64_t newGroupUsage = mGroupInfo->mUsage;
  if (!LockedPersisted()) {
    AssertNoOverflow(mGroupInfo->mUsage, aDelta);
    newGroupUsage += aDelta;

    uint64_t groupUsage = mGroupInfo->mUsage;
    for (const auto& complementaryPersistenceType :
         complementaryPersistenceTypes) {
      const auto& complementaryGroupInfo =
          mGroupInfo->mGroupInfoPair->LockedGetGroupInfo(
              complementaryPersistenceType);

      if (complementaryGroupInfo) {
        AssertNoOverflow(groupUsage, complementaryGroupInfo->mUsage);
        groupUsage += complementaryGroupInfo->mUsage;
      }
    }

    // Temporary storage has a hard limit for group usage (20 % of the global
    // limit).
    AssertNoOverflow(groupUsage, aDelta);
    if (groupUsage + aDelta > quotaManager->GetGroupLimit()) {
      return Some(false);
    }
  }

  AssertNoOverflow(quotaManager->mTemporaryStorageUsage, aDelta);
  uint64_t newTemporaryStorageUsage =
      quotaManager->mTemporaryStorageUsage + aDelta;

  if (newTemporaryStorageUsage <= quotaManager->mTemporaryStorageLimit) {
    mClientUsages[aClientType] = Some(newClientUsage);

    mUsage = newUsage;
    if (!LockedPersisted()) {
      mGroupInfo->mUsage = newGroupUsage;
    }
    quotaManager->mTemporaryStorageUsage = newTemporaryStorageUsage;

    return Some(true);
  }

  return Nothing();
}

bool OriginInfo::LockedUpdateUsagesForEviction(
    Client::Type aClientType, uint64_t aDelta,
    DirtyTrackingAutoLock& aProofOfLock) {
  AssertCurrentThreadOwnsQuotaMutex();

  QuotaManager* quotaManager = QuotaManager::Get();
  MOZ_ASSERT(quotaManager);

  AssertNoOverflow(mUsage, aDelta);
  uint64_t newUsage = mUsage + aDelta;
  MakeDirty(aProofOfLock);

  AssertNoOverflow(mClientUsages[aClientType].valueOr(0), aDelta);
  uint64_t newClientUsage = mClientUsages[aClientType].valueOr(0) + aDelta;

  AssertNoOverflow(quotaManager->mTemporaryStorageUsage, aDelta);
  uint64_t newTemporaryStorageUsage =
      quotaManager->mTemporaryStorageUsage + aDelta;

  uint64_t newGroupUsage = mGroupInfo->mUsage;
  if (!LockedPersisted()) {
    AssertNoOverflow(mGroupInfo->mUsage, aDelta);
    newGroupUsage += aDelta;

    uint64_t groupUsage = mGroupInfo->mUsage;

    const auto& complementaryPersistenceTypes =
        ComplementaryPersistenceTypes(mGroupInfo->mPersistenceType);
    for (const auto& complementaryPersistenceType :
         complementaryPersistenceTypes) {
      const auto& complementaryGroupInfo =
          mGroupInfo->mGroupInfoPair->LockedGetGroupInfo(
              complementaryPersistenceType);

      if (complementaryGroupInfo) {
        AssertNoOverflow(groupUsage, complementaryGroupInfo->mUsage);
        groupUsage += complementaryGroupInfo->mUsage;
      }
    }

    AssertNoOverflow(groupUsage, aDelta);
    if (groupUsage + aDelta > quotaManager->GetGroupLimit()) {
      // Unfortunately some other thread increased the group usage in the
      // meantime and we are not below the group limit anymore.
      return false;
    }
  }

  AssertNoOverflow(quotaManager->mTemporaryStorageUsage, aDelta);
  newTemporaryStorageUsage = quotaManager->mTemporaryStorageUsage + aDelta;

  NS_ASSERTION(newTemporaryStorageUsage <= quotaManager->mTemporaryStorageLimit,
               "How come?!");

  // Ok, we successfully freed enough space and the operation can continue
  // without throwing the quota error.
  mClientUsages[aClientType] = Some(newClientUsage);

  mUsage = newUsage;
  if (!LockedPersisted()) {
    MOZ_ASSERT(mGroupInfo);
    mGroupInfo->mUsage = newGroupUsage;
  }
  quotaManager->mTemporaryStorageUsage = newTemporaryStorageUsage;

  return true;
};

void OriginInfo::MakeDirty(DirtyTrackingAutoLock& aProofOfLock) {
  AssertCurrentThreadOwnsQuotaMutex();

  mLastModifiedTime = TimeStamp::Now();
  if (!mMetadataDirty) {
    auto* const quotaManager = QuotaManager::Get();
    MOZ_ASSERT(quotaManager);

    quotaManager->RegisterDirtyOriginInfo(aProofOfLock);
    mMetadataDirty = true;
  }
}

void OriginInfo::LockedDirectoryCreated() {
  AssertCurrentThreadOwnsQuotaMutex();
  MOZ_ASSERT(!mDirectoryExists);

  mDirectoryExists = true;
}

}  // namespace mozilla::dom::quota
