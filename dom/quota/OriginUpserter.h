/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef DOM_QUOTA_ORIGINUPSERTER_H_
#define DOM_QUOTA_ORIGINUPSERTER_H_

#include "mozilla/Result.h"
#include "nsCOMPtr.h"

class mozIStorageConnection;
class mozIStorageStatement;

namespace mozilla::dom::quota {

struct FullOriginMetadata;
class OriginInfo;

class OriginUpserter : public nsISupports {
 public:
  NS_DECL_ISUPPORTS

  OriginUpserter() = default;

  explicit OriginUpserter(nsCOMPtr<mozIStorageConnection> aStorageConnection);

  Result<Ok, nsresult> Refresh(const FullOriginMetadata& aFullOriginMetadata);

 protected:
  virtual ~OriginUpserter() = default;

 private:
  Result<Ok, nsresult> Reset();

  nsCOMPtr<mozIStorageConnection> mStorageConnection;
  nsCOMPtr<mozIStorageStatement> mUpsertStmt;
};

}  // namespace mozilla::dom::quota

#endif  // DOM_QUOTA_ORIGINUPSERTER_H_
