/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "ModelFileUtils.h"

#include "mozilla/ErrorNames.h"
#include "mozilla/ErrorResult.h"
#include "mozilla/Logging.h"
#include "mozilla/dom/BindingUtils.h"
#include "mozilla/dom/Blob.h"
#include "mozilla/dom/BlobBinding.h"
#include "mozilla/ipc/FileDescriptor.h"
#include "nsIFileStreams.h"
#include "nsIInputStream.h"
#include "prio.h"
#include "private/pprio.h"

namespace mozilla::hwinference {

extern LazyLogModule gHWInferenceLog;
#define LOGE(...) MOZ_LOG_FMT(gHWInferenceLog, LogLevel::Error, __VA_ARGS__)

nsresult BlobJSObjectToFileDescriptor(JSContext* aCx,
                                      JS::Handle<JS::Value> aValue,
                                      ipc::FileDescriptor* aDesc) {
  if (!aValue.isObject()) {
    return NS_ERROR_UNEXPECTED;
  }

  RefPtr<dom::Blob> blob;
  nsresult rv = UNWRAP_OBJECT(Blob, &aValue.toObject(), blob);
  if (NS_FAILED(rv)) {
    LOGE("BlobJSObjectToFileDescriptor - ERROR: Failed to unwrap Blob: {}", rv);
    return rv;
  }

  ErrorResult errorResult;
  nsCOMPtr<nsIInputStream> stream;
  blob->CreateInputStream(getter_AddRefs(stream), errorResult);
  if (errorResult.Failed()) {
    LOGE(
        "BlobJSObjectToFileDescriptor - ERROR: Failed to create input stream "
        "from blob");
    return NS_ERROR_UNEXPECTED;
  }

  nsCOMPtr<nsIFileMetadata> fileMetadata = do_QueryInterface(stream);
  if (!fileMetadata) {
    LOGE(
        "BlobJSObjectToFileDescriptor - ERROR: Stream doesn't support "
        "nsIFileMetadata");
    return NS_ERROR_UNEXPECTED;
  }

  PRFileDesc* fileDesc;
  nsresult getRv = fileMetadata->GetFileDescriptor(&fileDesc);
  if (NS_FAILED(getRv)) {
    LOGE("BlobJSObjectToFileDescriptor - ERROR: GetFileDescriptor failed: {}",
         getRv);
    return getRv;
  }

  ipc::FileDescriptor fd(ipc::FileDescriptor::PlatformHandleType(
      PR_FileDesc2NativeHandle(fileDesc)));
  if (!fd.IsValid()) {
    LOGE("BlobJSObjectToFileDescriptor - ERROR: Failed to get native handle");
    return NS_ERROR_UNEXPECTED;
  }

  *aDesc = std::move(fd);
  return NS_OK;
}

#undef LOGE

}  // namespace mozilla::hwinference
