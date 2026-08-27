/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "Win32SerialParityCheckStream.h"

#include <windows.h>

#include "SerialLogging.h"
#include "nsError.h"
#include "nsStreamUtils.h"

namespace mozilla::dom {

NS_IMPL_ISUPPORTS(Win32SerialParityCheckStream, nsIInputStream,
                  nsIAsyncInputStream)

Win32SerialParityCheckStream::Win32SerialParityCheckStream(
    nsCOMPtr<nsIAsyncInputStream> aInner, UniqueFileHandle aCommHandle)
    : mInner(std::move(aInner)), mCommHandle(std::move(aCommHandle)) {
  MOZ_ASSERT(mCommHandle);
}

void Win32SerialParityCheckStream::CheckForParityError() {
  if (MOZ_UNLIKELY(mParityErrorLatched)) {
    return;
  }
  DWORD errors = 0;
  if (ClearCommError(mCommHandle.get(), &errors, nullptr) &&
      (errors & CE_RXPARITY)) {
    MOZ_LOG(gWebSerialLog, LogLevel::Debug,
            ("Win32SerialParityCheckStream[%p] detected CE_RXPARITY", this));
    mParityErrorLatched = true;
  }
}

NS_IMETHODIMP Win32SerialParityCheckStream::ReadSegments(
    nsWriteSegmentFun aWriter, void* aClosure, uint32_t aCount,
    uint32_t* aResult) {
  *aResult = 0;
  if (MOZ_UNLIKELY(mParityErrorLatched)) {
    return NS_ERROR_DOM_SERIAL_PARITY_ERROR;
  }

  nsresult rv = mInner->ReadSegments(aWriter, aClosure, aCount, aResult);
  if (NS_SUCCEEDED(rv)) {
    // If there is a parity error, record it so we can return it next time.
    // We do this instead of returning the error now to avoid a confusing
    // return from ReadSegments() that would return data but also an error.
    CheckForParityError();
  }
  return rv;
}

NS_IMETHODIMP Win32SerialParityCheckStream::Read(char* aBuf, uint32_t aCount,
                                                 uint32_t* aResult) {
  return ReadSegments(NS_CopySegmentToBuffer, aBuf, aCount, aResult);
}

NS_IMETHODIMP Win32SerialParityCheckStream::Available(uint64_t* aResult) {
  if (MOZ_UNLIKELY(mParityErrorLatched)) {
    return NS_ERROR_DOM_SERIAL_PARITY_ERROR;
  }
  return mInner->Available(aResult);
}

NS_IMETHODIMP Win32SerialParityCheckStream::StreamStatus() {
  if (MOZ_UNLIKELY(mParityErrorLatched)) {
    return NS_ERROR_DOM_SERIAL_PARITY_ERROR;
  }
  return mInner->StreamStatus();
}

NS_IMETHODIMP Win32SerialParityCheckStream::Close() { return mInner->Close(); }

NS_IMETHODIMP Win32SerialParityCheckStream::IsNonBlocking(bool* aResult) {
  return mInner->IsNonBlocking(aResult);
}

NS_IMETHODIMP Win32SerialParityCheckStream::CloseWithStatus(nsresult aStatus) {
  return mInner->CloseWithStatus(aStatus);
}

NS_IMETHODIMP Win32SerialParityCheckStream::AsyncWait(
    nsIInputStreamCallback* aCallback, uint32_t aFlags,
    uint32_t aRequestedCount, nsIEventTarget* aTarget) {
  // We never buffer and never return WOULD_BLOCK while a parity error is
  // latched (ReadSegments returns the error directly), so delegating the wait
  // to the inner stream always wakes the consumer at the right time.
  return mInner->AsyncWait(aCallback, aFlags, aRequestedCount, aTarget);
}

}  // namespace mozilla::dom
