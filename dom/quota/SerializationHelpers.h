/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_dom_quota_SerializationHelpers_h
#define mozilla_dom_quota_SerializationHelpers_h

#include "ipc/EnumSerializer.h"
#include "ipc/IPCMessageUtils.h"
#include "mozilla/OriginAttributes.h"
#include "mozilla/dom/quota/Client.h"
#include "mozilla/dom/quota/CommonMetadata.h"
#include "mozilla/dom/quota/PersistenceType.h"
#include "mozilla/dom/quota/UsageInfo.h"

namespace IPC {

template <>
struct ParamTraits<mozilla::dom::quota::PersistenceType>
    : public ContiguousEnumSerializer<
          mozilla::dom::quota::PersistenceType,
          mozilla::dom::quota::PERSISTENCE_TYPE_PERSISTENT,
          mozilla::dom::quota::PERSISTENCE_TYPE_INVALID> {};

template <>
struct ParamTraits<mozilla::dom::quota::Client::Type>
    : public ContiguousEnumSerializer<mozilla::dom::quota::Client::Type,
                                      mozilla::dom::quota::Client::IDB,
                                      mozilla::dom::quota::Client::TYPE_MAX> {};

template <>
struct ParamTraits<mozilla::dom::quota::ClientUsageArray> {
  using ParamType = mozilla::dom::quota::ClientUsageArray;

  static void Write(MessageWriter* aWriter, const ParamType& aParam) {
    for (size_t index = 0; index < mozilla::dom::quota::Client::TypeMax();
         index++) {
      WriteParam(aWriter, aParam[index]);
    }
  }

  static bool Read(MessageReader* aReader, ParamType* aResult) {
    for (size_t index = 0; index < mozilla::dom::quota::Client::TypeMax();
         index++) {
      if (!ReadParam(aReader, &aResult->operator[](index))) {
        return false;
      }
    }
    return true;
  }
};

DEFINE_IPC_SERIALIZER_WITH_FIELDS(mozilla::dom::quota::FullOriginMetadata,
                                  mSuffix, mGroup, mOrigin, mStorageOrigin,
                                  mIsPrivate, mPersistenceType, mLastAccessTime,
                                  mLastMaintenanceDate, mAccessed, mPersisted,
                                  mClientUsages, mOriginUsage, mQuotaVersion);

DEFINE_IPC_SERIALIZER_WITH_SUPER_CLASS_AND_FIELDS(
    mozilla::dom::quota::OriginUsageMetadata,
    mozilla::dom::quota::FullOriginMetadata, mUsage);

DEFINE_IPC_SERIALIZER_WITH_FIELDS(mozilla::OriginAttributesPattern,
                                  mFirstPartyDomain, mPrivateBrowsingId,
                                  mUserContextId, mGeckoViewSessionContextId,
                                  mPartitionKey, mPartitionKeyPattern);

DEFINE_IPC_SERIALIZER_WITH_FIELDS(mozilla::dom::PartitionKeyPatternDictionary,
                                  mScheme, mBaseDomain, mPort,
                                  mForeignByAncestorContext);

template <>
struct ParamTraits<mozilla::dom::quota::DatabaseUsageType> {
  using ParamType = mozilla::dom::quota::DatabaseUsageType;

  static void Write(MessageWriter* aWriter, const ParamType& aParam) {
    WriteParam(aWriter, aParam.GetValue());
  }

  static bool Read(MessageReader* aReader, ParamType* aResult) {
    mozilla::Maybe<uint64_t> value;
    if (!ReadParam(aReader, &value)) {
      return false;
    }

    *aResult += ParamType(value);
    return true;
  }
};

template <>
struct ParamTraits<mozilla::dom::quota::FileUsageType> {
  using ParamType = mozilla::dom::quota::FileUsageType;

  static void Write(MessageWriter* aWriter, const ParamType& aParam) {
    WriteParam(aWriter, aParam.GetValue());
  }

  static bool Read(MessageReader* aReader, ParamType* aResult) {
    mozilla::Maybe<uint64_t> value;
    if (!ReadParam(aReader, &value)) {
      return false;
    }

    *aResult += ParamType(value);
    return true;
  }
};

template <>
struct ParamTraits<mozilla::dom::quota::UsageInfo> {
  using ParamType = mozilla::dom::quota::UsageInfo;

  static void Write(MessageWriter* aWriter, const ParamType& aParam) {
    WriteParam(aWriter, aParam.DatabaseUsage());
    WriteParam(aWriter, aParam.FileUsage());
  }

  static bool Read(MessageReader* aReader, ParamType* aResult) {
    mozilla::Maybe<uint64_t> databaseUsage;
    if (!ReadParam(aReader, &databaseUsage)) {
      return false;
    }

    mozilla::Maybe<uint64_t> fileUsage;
    if (!ReadParam(aReader, &fileUsage)) {
      return false;
    }

    *aResult += mozilla::dom::quota::DatabaseUsageType(databaseUsage);
    *aResult += mozilla::dom::quota::FileUsageType(fileUsage);
    return true;
  }
};

}  // namespace IPC

#endif  // mozilla_dom_quota_SerializationHelpers_h
