/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "mozilla/dom/quota/DekNameCodec.h"

#include "mozilla/Base64.h"
#include "mozilla/dom/quota/QuotaCommon.h"
#include "mozilla/dom/quota/ResultExtensions.h"

namespace mozilla::dom::quota {

namespace {

void AppendLengthPrefixed(nsCString& aOut, const nsACString& aValue) {
  aOut.AppendInt(static_cast<uint64_t>(aValue.Length()));
  aOut.Append(':');
  aOut.Append(aValue);
}

}  // namespace

// static
nsCString DekNameCodec::Build(const DekNameParts& aParts) {
  nsCString result(kPrefix);
  AppendLengthPrefixed(result, aParts.mProfileId);
  result.Append(':');
  AppendLengthPrefixed(result, aParts.mStorageOrigin);
  result.Append(':');
  AppendLengthPrefixed(result, aParts.mBottleUUID);
  result.Append(':');
  AppendLengthPrefixed(result, aParts.mClientType);
  result.Append(':');
  AppendLengthPrefixed(result, aParts.mKeyId);

  return result;
}

// static
nsCString DekNameCodec::OriginPrefix(const nsACString& aProfileId,
                                     const nsACString& aStorageOrigin) {
  nsCString result(kPrefix);
  AppendLengthPrefixed(result, aProfileId);
  result.Append(':');
  AppendLengthPrefixed(result, aStorageOrigin);
  result.Append(':');
  return result;
}

// static
Result<nsCString, nsresult> DekNameCodec::ProfileId(
    const nsACString& aProfileName) {
  nsCString encoded;
  QM_TRY(MOZ_TO_RESULT(Base64URLEncode(
      aProfileName.Length(),
      reinterpret_cast<const uint8_t*>(aProfileName.BeginReading()),
      Base64URLEncodePaddingPolicy::Omit, encoded)));

  return encoded;
}

}  // namespace mozilla::dom::quota
