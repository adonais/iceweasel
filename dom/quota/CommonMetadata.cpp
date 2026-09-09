/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "CommonMetadata.h"

#include "mozilla/dom/quota/AssertionsImpl.h"
#include "mozilla/dom/quota/QuotaCommon.h"
#include "mozilla/dom/quota/QuotaManager.h"
#include "mozilla/dom/quota/ResultExtensions.h"

namespace mozilla::dom::quota {

#if defined(NIGHTLY_BUILD) || defined(DEBUG)
bool CheckClientUsagesConsistency(const ClientUsageArray& aClientUsages,
                                  uint64_t aUsage, const nsACString& aContext) {
  QuotaManager* quotaManager = QuotaManager::Get();
  MOZ_ASSERT(quotaManager);

  bool consistent = true;
  uint64_t usage = 0;
  for (const Client::Type type : quotaManager->AllClientTypes()) {
    AssertNoOverflow(usage, aClientUsages[type].valueOr(0));
    QM_SCOPED_CONTEXT(aContext + "["_ns + Client::TypeToText(type) +
                      "]Underflow"_ns);
    const uint64_t value = aClientUsages[type].valueOr(0);
    const bool valueOk = value < static_cast<uint64_t>(INT64_MAX);
    QM_WARNONLY_TRY(OkIf(valueOk));
    consistent = consistent && valueOk;
    usage += value;
  }
  {
    QM_SCOPED_CONTEXT(aContext + "Mismatch"_ns);
    const bool mismatchOk = aUsage == usage;
    QM_WARNONLY_TRY(OkIf(mismatchOk));
    consistent = consistent && mismatchOk;
  }
  {
    QM_SCOPED_CONTEXT(aContext + "UsageUnderflow"_ns);
    const bool usageOk = aUsage < static_cast<uint64_t>(INT64_MAX);
    QM_WARNONLY_TRY(OkIf(usageOk));
    consistent = consistent && usageOk;
  }
  return consistent;
}

bool FullOriginMetadata::CheckIfUsageIsConsistent(
    const nsACString& aContext) const {
  return CheckClientUsagesConsistency(mClientUsages, mOriginUsage, aContext);
}
#endif  // defined(NIGHTLY_BUILD) || defined(DEBUG)

nsresult FullOriginMetadata::BindToStatement(
    mozIStorageStatement* aStatement) const {
  QM_TRY(MOZ_TO_RESULT(
      aStatement->BindInt32ByName("repository_id"_ns, mPersistenceType)));

  QM_TRY(MOZ_TO_RESULT(aStatement->BindUTF8StringByName("suffix"_ns, mSuffix)));
  QM_TRY(MOZ_TO_RESULT(aStatement->BindUTF8StringByName("group_"_ns, mGroup)));
  QM_TRY(MOZ_TO_RESULT(aStatement->BindUTF8StringByName("origin"_ns, mOrigin)));

  MOZ_ASSERT(!mIsPrivate);

  nsCString clientUsagesText;
  mClientUsages.Serialize(clientUsagesText);

  QM_TRY(MOZ_TO_RESULT(
      aStatement->BindUTF8StringByName("client_usages"_ns, clientUsagesText)));
  QM_TRY(MOZ_TO_RESULT(aStatement->BindInt64ByName("usage"_ns, mOriginUsage)));
  QM_TRY(MOZ_TO_RESULT(
      aStatement->BindInt64ByName("last_access_time"_ns, mLastAccessTime)));
  QM_TRY(MOZ_TO_RESULT(aStatement->BindInt32ByName("last_maintenance_date"_ns,
                                                   mLastMaintenanceDate)));
  QM_TRY(MOZ_TO_RESULT(
      aStatement->BindInt32ByName("metadata_flags"_ns, ToMetadataFlags())));

  return NS_OK;
}

}  // namespace mozilla::dom::quota
