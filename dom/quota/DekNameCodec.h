/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef DOM_QUOTA_DEKNAMECODEC_H_
#define DOM_QUOTA_DEKNAMECODEC_H_

#include "mozilla/Result.h"
#include "nsError.h"
#include "nsString.h"

namespace mozilla::dom::quota {

// Builds DEK (Data Encryption Key) names for the lockstore.
//
// Format: dom-quota:<len>:<profileId>:<len>:<storageOrigin>:<len>:<bottleUUID>:
//         <len>:<clientType>:<len>:<keyId>
//
// Every component uses length-prefix encoding (<decimal_byte_count>:<bytes>).
// The keyId is opaque to this codec; clients are responsible for its internal
// structure.
class DekNameCodec {
 public:
  static constexpr auto kNilBottleUUID =
      "00000000-0000-0000-0000-000000000000"_ns;
  static constexpr auto kPrefix = "dom-quota:"_ns;

  struct DekNameParts {
    nsCString mProfileId;
    nsCString mStorageOrigin;
    nsCString mBottleUUID;
    nsCString mClientType;
    nsCString mKeyId;
  };

  static nsCString Build(const DekNameParts& aParts);

  // Prefix matching all DEKs for a given profile + origin.
  static nsCString OriginPrefix(const nsACString& aProfileId,
                                const nsACString& aStorageOrigin);

  // Base64url-encode a profile name (no padding).
  static Result<nsCString, nsresult> ProfileId(const nsACString& aProfileName);
};

}  // namespace mozilla::dom::quota

#endif  // DOM_QUOTA_DEKNAMECODEC_H_
