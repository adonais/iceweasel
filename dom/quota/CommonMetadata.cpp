/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "CommonMetadata.h"

#include "mozilla/dom/quota/QuotaCommon.h"
#include "mozilla/dom/quota/ResultExtensions.h"

namespace mozilla::dom::quota {

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
