/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef DOM_QUOTA_COMMONMETADATA_H_
#define DOM_QUOTA_COMMONMETADATA_H_

#include <utility>

#include "mozilla/dom/quota/Client.h"
#include "mozilla/dom/quota/Constants.h"
#include "mozilla/dom/quota/PersistenceType.h"
#include "nsString.h"

namespace mozilla::dom::quota {

struct PrincipalMetadata {
  nsCString mSuffix;
  nsCString mGroup;
  nsCString mOrigin;
  nsCString mStorageOrigin;
  bool mIsPrivate = false;

  // These explicit constructors exist to prevent accidental aggregate
  // initialization which could for example initialize mSuffix as group and
  // mGroup as origin (if only two string arguments are used).
  PrincipalMetadata() = default;

  PrincipalMetadata(nsCString aSuffix, nsCString aGroup, nsCString aOrigin,
                    nsCString aStorageOrigin, bool aIsPrivate)
      : mSuffix{std::move(aSuffix)},
        mGroup{std::move(aGroup)},
        mOrigin{std::move(aOrigin)},
        mStorageOrigin{std::move(aStorageOrigin)},
        mIsPrivate{aIsPrivate} {
    AssertInvariants();
  }

  void AssertInvariants() const {
    MOZ_ASSERT(!StringBeginsWith(mOrigin, kUUIDOriginScheme));
    MOZ_ASSERT_IF(!mIsPrivate, mOrigin == mStorageOrigin);
    MOZ_ASSERT_IF(mIsPrivate, mOrigin != mStorageOrigin);
  }
};

struct OriginMetadata : public PrincipalMetadata {
  PersistenceType mPersistenceType;

  OriginMetadata() = default;

  OriginMetadata(nsCString aSuffix, nsCString aGroup, nsCString aOrigin,
                 nsCString aStorageOrigin, bool aIsPrivate,
                 PersistenceType aPersistenceType)
      : PrincipalMetadata(std::move(aSuffix), std::move(aGroup),
                          std::move(aOrigin), std::move(aStorageOrigin),
                          aIsPrivate),
        mPersistenceType(aPersistenceType) {}

  OriginMetadata(PrincipalMetadata aPrincipalMetadata,
                 PersistenceType aPersistenceType)
      : PrincipalMetadata(std::move(aPrincipalMetadata)),
        mPersistenceType(aPersistenceType) {}

  // Returns a composite string key in the form "<persistence>*<origin>".
  // Useful for flat hash maps keyed by both persistence type and origin,
  // as an alternative to using structured keys or nested maps.
  // Suitable when tree-based representation is unnecessary.
  nsCString GetCompositeKey() const {
    nsCString result;

    result.AppendInt(mPersistenceType);
    result.Append("*");
    result.Append(mOrigin);

    return result;
  }
};

struct OriginStateMetadata {
  int64_t mLastAccessTime;
  bool mAccessed;
  bool mPersisted;

  OriginStateMetadata() = default;

  OriginStateMetadata(int64_t aLastAccessTime, bool aAccessed, bool aPersisted)
      : mLastAccessTime(aLastAccessTime),
        mAccessed(aAccessed),
        mPersisted(aPersisted) {}
};

struct FullOriginMetadata : OriginMetadata, OriginStateMetadata {
  FullOriginMetadata() = default;

  FullOriginMetadata(OriginMetadata aOriginMetadata,
                     OriginStateMetadata aOriginStateMetadata)
      : OriginMetadata(std::move(aOriginMetadata)),
        OriginStateMetadata(aOriginStateMetadata) {}
};

struct OriginUsageMetadata : FullOriginMetadata {
  uint64_t mUsage;

  OriginUsageMetadata() = default;

  OriginUsageMetadata(FullOriginMetadata aFullOriginMetadata, uint64_t aUsage)
      : FullOriginMetadata(std::move(aFullOriginMetadata)), mUsage(aUsage) {}
};

struct ClientMetadata : OriginMetadata {
  Client::Type mClientType;

  ClientMetadata() = default;

  ClientMetadata(OriginMetadata aOriginMetadata, Client::Type aClientType)
      : OriginMetadata(std::move(aOriginMetadata)), mClientType(aClientType) {}
};

}  // namespace mozilla::dom::quota

#endif  // DOM_QUOTA_COMMONMETADATA_H_
