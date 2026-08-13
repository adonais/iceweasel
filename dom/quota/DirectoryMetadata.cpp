/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "DirectoryMetadata.h"

#include "mozilla/Result.h"
#include "mozilla/dom/quota/Assertions.h"
#include "mozilla/dom/quota/CommonMetadata.h"
#include "mozilla/dom/quota/QuotaCommon.h"
#include "mozilla/dom/quota/ResultExtensions.h"
#include "mozilla/dom/quota/StreamUtils.h"
#include "nsIBinaryInputStream.h"
#include "nsIBinaryOutputStream.h"

namespace mozilla::dom::quota {

Result<OriginStateMetadata, nsresult> ReadDirectoryMetadataHeader(
    nsIBinaryInputStream& aStream) {
  AssertIsOnIOThread();

  OriginStateMetadata originStateMetadata;

  QM_TRY_UNWRAP(originStateMetadata.mLastAccessTime,
                MOZ_TO_RESULT_INVOKE_MEMBER(aStream, Read64));

  QM_TRY_INSPECT(const bool& persistedByte,
                 MOZ_TO_RESULT_INVOKE_MEMBER(aStream, ReadBoolean));

  QM_TRY_INSPECT(const uint32_t& rawFlags,
                 MOZ_TO_RESULT_INVOKE_MEMBER(aStream, Read32));

  // If DirectoryMetadataFlags::Initialized is not set, the flags field
  // contains no valid data. Conservatively assume that the origin was in
  // use during the previous session (mAccessed) and that the cached
  // metadata is out of sync with the directory (mDirty).
  if (rawFlags == 0) {
    originStateMetadata.mAccessed = true;
    originStateMetadata.mDirty = true;
  } else {
    originStateMetadata.FromMetadataFlags(rawFlags);
  }

  // persistedByte is the authoritative source for mPersisted: it is always
  // written by both schema-3 and schema-4 code, whereas the Persisted bit in
  // rawFlags was only introduced in schema-4. Schema-3 .metadata-v2 files have
  // rawFlags != 0 (Initialized is always set) but no Persisted bit, so relying
  // solely on FromMetadataFlags would silently lose the persisted state.
  originStateMetadata.mPersisted = persistedByte;

  QM_TRY_UNWRAP(originStateMetadata.mLastMaintenanceDate,
                MOZ_TO_RESULT_INVOKE_MEMBER(aStream, Read32));

  return originStateMetadata;
}

nsresult WriteDirectoryMetadataHeader(
    nsIBinaryOutputStream& aStream,
    const OriginStateMetadata& aOriginStateMetadata) {
  AssertIsOnIOThread();

  QM_TRY(MOZ_TO_RESULT(aStream.Write64(aOriginStateMetadata.mLastAccessTime)));

  QM_TRY(MOZ_TO_RESULT(aStream.WriteBoolean(aOriginStateMetadata.mPersisted)));

  // Always set DirectoryMetadataFlags::Initialized when writing new metadata,
  // to mark the flags field as valid. This distinguishes real flags from older
  // files where the field was reserved and always written as zero.
  QM_TRY(
      MOZ_TO_RESULT(aStream.Write32(aOriginStateMetadata.ToMetadataFlags())));

  QM_TRY(MOZ_TO_RESULT(
      aStream.Write32(aOriginStateMetadata.mLastMaintenanceDate)));

  return NS_OK;
}

}  // namespace mozilla::dom::quota
