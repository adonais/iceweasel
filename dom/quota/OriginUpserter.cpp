/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "OriginUpserter.h"

#include "OriginInfo.h"
#include "mozIStorageConnection.h"
#include "mozIStorageStatement.h"
#include "mozilla/dom/quota/QuotaCommon.h"
#include "mozilla/dom/quota/ResultExtensions.h"
#include "nsISupportsImpl.h"

namespace mozilla::dom::quota {

NS_IMPL_ISUPPORTS(OriginUpserter, nsISupports)

OriginUpserter::OriginUpserter(
    nsCOMPtr<mozIStorageConnection> aStorageConnection)
    : mStorageConnection(std::move(aStorageConnection)), mUpsertStmt(nullptr) {}

Result<Ok, nsresult> OriginUpserter::Refresh(
    const FullOriginMetadata& aFullOriginMetadata) {
  AssertIsOnIOThread();
  MOZ_ASSERT(mStorageConnection);

  QM_TRY(Reset());

  QM_TRY(MOZ_TO_RESULT(aFullOriginMetadata.BindToStatement(mUpsertStmt)));

  QM_TRY(MOZ_TO_RESULT(mUpsertStmt->Execute()));

  return Ok{};
}

Result<Ok, nsresult> OriginUpserter::Reset() {
  MOZ_ASSERT(mStorageConnection);

  if (mUpsertStmt) {
    MOZ_ALWAYS_SUCCEEDS(mUpsertStmt->Reset());

    return Ok{};
  }

  QM_TRY_UNWRAP(
      mUpsertStmt,
      MOZ_TO_RESULT_INVOKE_MEMBER_TYPED(
          nsCOMPtr<mozIStorageStatement>, mStorageConnection, CreateStatement,
          "INSERT INTO origin ( "
          "  repository_id, "
          "  suffix, "
          "  group_, "
          "  origin, "
          "  client_usages, "
          "  usage, "
          "  last_access_time, "
          "  last_maintenance_date, "
          "  metadata_flags ) "
          "VALUES ( "
          "  :repository_id, "
          "  :suffix, "
          "  :group_, "
          "  :origin, "
          "  :client_usages, "
          "  :usage, "
          "  :last_access_time, "
          "  :last_maintenance_date, "
          "  :metadata_flags ) "
          "ON CONFLICT ( "
          "  repository_id, "
          "  origin ) "
          "DO UPDATE SET "
          // Suffix should not change.
          "  group_ = excluded.group_, "
          "  client_usages = excluded.client_usages, "
          "  usage = excluded.usage, "
          "  last_access_time = excluded.last_access_time, "
          "  last_maintenance_date = excluded.last_maintenance_date, "
          "  metadata_flags = excluded.metadata_flags;"_ns));

  return Ok{};
}

}  // namespace mozilla::dom::quota
