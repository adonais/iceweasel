/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "PosixSerialParityDecodeStream.h"

#include <algorithm>
#include <cstring>

#include "nsError.h"
#include "nsStreamUtils.h"

namespace mozilla::dom {

NS_IMPL_ISUPPORTS(PosixSerialParityDecodeStream, nsIInputStream,
                  nsIAsyncInputStream, nsIInputStreamCallback)

PosixSerialParityDecodeStream::PosixSerialParityDecodeStream(
    nsIAsyncInputStream* aInner)
    : mInner(aInner) {}

void PosixSerialParityDecodeStream::Decode(const uint8_t* aInput,
                                           uint32_t aLength) {
  for (uint32_t i = 0; i < aLength; ++i) {
    uint8_t b = aInput[i];
    switch (mEscapeState) {
      case EscapeState::Normal: {
        const uint8_t* nextFF = static_cast<const uint8_t*>(
            std::memchr(aInput + i, 0xff, aLength - i));
        // if there is an FF, don't copy it since we'll set mEscapeState to
        // SawFF
        size_t runLength = (nextFF ? nextFF : aInput + aLength) - (aInput + i);
        mPending.AppendElements(aInput + i, runLength);
        if (nextFF) {
          // land on the FF so we'll step past it with ++i
          i += runLength;
          mEscapeState = EscapeState::SawFF;
        } else {
          // land on the last byte so we'll step past it with ++i
          i += runLength - 1;
        }
        break;
      }
      case EscapeState::SawFF:
        if (MOZ_LIKELY(b == 0xff)) {
          // 0xff 0xff is an escaped legitimate 0xff byte.
          mPending.AppendElement(0xff);
          mEscapeState = EscapeState::Normal;
        } else if (b == 0x00) {
          mEscapeState = EscapeState::SawFF00;
        } else {
          // PARMRK only ever emits 0xff followed by 0xff or 0x00. Be defensive
          // and pass both bytes through literally if that invariant breaks.
          mPending.AppendElement(0xff);
          mPending.AppendElement(b);
          mEscapeState = EscapeState::Normal;
        }
        break;
      case EscapeState::SawFF00:
        // The marker 0xff 0x00 <byte> denotes a parity (or framing) error on
        // <byte>. Drop the errored byte and latch the error; bytes already in
        // mPending (received before the marker) are delivered first.
        mEscapeState = EscapeState::Normal;
        mParityErrorLatched = true;
        return;
    }
  }
}

nsresult PosixSerialParityDecodeStream::ReadAndDecode(uint64_t aMaxRead,
                                                      uint32_t* aRawRead) {
  MOZ_ASSERT(mPending.IsEmpty());
  MOZ_ASSERT(!mParityErrorLatched);

  *aRawRead = 0;

  uint8_t raw[4096];
  uint32_t toRead = std::min<uint64_t>(aMaxRead, sizeof(raw));
  nsresult rv = mInner->Read(reinterpret_cast<char*>(raw), toRead, aRawRead);
  if (NS_FAILED(rv)) {
    return rv;
  }
  if (*aRawRead > 0) {
    Decode(raw, *aRawRead);
  }
  return NS_OK;
}

NS_IMETHODIMP PosixSerialParityDecodeStream::ReadSegments(
    nsWriteSegmentFun aWriter, void* aClosure, uint32_t aCount,
    uint32_t* aResult) {
  *aResult = 0;

  if (mPending.IsEmpty()) {
    if (MOZ_UNLIKELY(mParityErrorLatched)) {
      return NS_ERROR_DOM_SERIAL_PARITY_ERROR;
    }

    uint32_t nRead = 0;
    nsresult rv = ReadAndDecode(aCount, &nRead);
    if (rv == NS_BASE_STREAM_WOULD_BLOCK) {
      return NS_BASE_STREAM_WOULD_BLOCK;
    }
    if (NS_FAILED(rv)) {
      return rv;
    }
    if (nRead == 0) {
      // EOF on the inner stream.
      return NS_OK;
    }

    // If there is a parity error and we have bytes to return, just record
    // the error so we can return it next time.
    // We do this instead of returning the error now to avoid a confusing
    // return from ReadSegments() that would return data but also an error.
    if (MOZ_UNLIKELY(mPending.IsEmpty())) {
      if (MOZ_UNLIKELY(mParityErrorLatched)) {
        return NS_ERROR_DOM_SERIAL_PARITY_ERROR;
      }
      // The chunk decoded to no output (e.g. an incomplete escape prefix at
      // the end of the chunk). Ask the consumer to wait for more data.
      return NS_BASE_STREAM_WOULD_BLOCK;
    }
  }

  uint32_t offset = 0;
  while (offset < mPending.Length() && *aResult < aCount) {
    uint32_t avail =
        std::min<uint32_t>(mPending.Length() - offset, aCount - *aResult);
    uint32_t written = 0;
    nsresult rv = aWriter(this, aClosure,
                          reinterpret_cast<const char*>(&mPending[offset]),
                          *aResult, avail, &written);
    if (NS_FAILED(rv) || written == 0) {
      break;
    }
    offset += written;
    *aResult += written;
  }
  mPending.RemoveElementsAt(0, offset);

  return NS_OK;
}

NS_IMETHODIMP PosixSerialParityDecodeStream::Read(char* aBuf, uint32_t aCount,
                                                  uint32_t* aResult) {
  return ReadSegments(NS_CopySegmentToBuffer, aBuf, aCount, aResult);
}

NS_IMETHODIMP PosixSerialParityDecodeStream::Available(uint64_t* aResult) {
  *aResult = 0;

  if (!mPending.IsEmpty()) {
    *aResult = mPending.Length();
    return NS_OK;
  }
  if (MOZ_UNLIKELY(mParityErrorLatched)) {
    return NS_ERROR_DOM_SERIAL_PARITY_ERROR;
  }

  // We cannot report the inner stream's raw byte count directly: PARMRK
  // escaping means it over-counts what we can actually deliver.
  // Decode whatever the inner stream currently holds so we
  // report the true number of decoded bytes. We first query the inner stream
  // to surface its closed/error status and to avoid consuming its EOF.
  uint64_t innerAvail = 0;
  nsresult rv = mInner->Available(&innerAvail);
  if (NS_FAILED(rv)) {
    return rv;
  }
  if (innerAvail == 0) {
    return NS_OK;
  }

  uint32_t nRead = 0;
  rv = ReadAndDecode(innerAvail, &nRead);
  if (rv == NS_BASE_STREAM_WOULD_BLOCK) {
    return NS_OK;
  }
  if (NS_FAILED(rv)) {
    return rv;
  }

  *aResult = mPending.Length();
  // The available raw bytes decoded to nothing but carried an error marker
  // (e.g. 0xff 0x00 <byte> with no preceding data); surface the error now.
  if (MOZ_UNLIKELY(mPending.IsEmpty() && mParityErrorLatched)) {
    return NS_ERROR_DOM_SERIAL_PARITY_ERROR;
  }
  return NS_OK;
}

NS_IMETHODIMP PosixSerialParityDecodeStream::StreamStatus() {
  if (!mPending.IsEmpty()) {
    return NS_OK;
  }
  if (MOZ_UNLIKELY(mParityErrorLatched)) {
    return NS_ERROR_DOM_SERIAL_PARITY_ERROR;
  }
  return mInner->StreamStatus();
}

NS_IMETHODIMP PosixSerialParityDecodeStream::Close() {
  return CloseWithStatus(NS_BASE_STREAM_CLOSED);
}

NS_IMETHODIMP PosixSerialParityDecodeStream::IsNonBlocking(bool* aResult) {
  return mInner->IsNonBlocking(aResult);
}

NS_IMETHODIMP PosixSerialParityDecodeStream::CloseWithStatus(nsresult aStatus) {
  mPending.Clear();
  return mInner->CloseWithStatus(aStatus);
}

NS_IMETHODIMP PosixSerialParityDecodeStream::AsyncWait(
    nsIInputStreamCallback* aCallback, uint32_t aFlags,
    uint32_t aRequestedCount, nsIEventTarget* aTarget) {
  // We must not hand aCallback straight to the inner stream: the inner stream
  // invokes the callback with *itself* as the ready stream (see
  // nsIInputStreamCallback::onInputStreamReady), and a consumer that read from
  // that stream would receive the raw PARMRK bytes, bypassing our decoding.
  // Instead we register ourselves with the inner stream and, when it fires,
  // forward the notification with |this| as the ready stream (see
  // OnInputStreamReady). A null aCallback clears an existing wait.
  nsCOMPtr<nsIInputStreamCallback> forwarder = aCallback ? this : nullptr;
  {
    MutexAutoLock lock(mMutex);
    if (NS_WARN_IF(mAsyncWaitCallback && aCallback &&
                   mAsyncWaitCallback != aCallback)) {
      return NS_ERROR_FAILURE;
    }
    mAsyncWaitCallback = aCallback;
  }
  return mInner->AsyncWait(forwarder, aFlags, aRequestedCount, aTarget);
}

NS_IMETHODIMP PosixSerialParityDecodeStream::OnInputStreamReady(
    nsIAsyncInputStream* aStream) {
  nsCOMPtr<nsIInputStreamCallback> callback;
  {
    MutexAutoLock lock(mMutex);
    // The wait may have been cleared (aCallback == nullptr) in the meantime.
    if (!mAsyncWaitCallback) {
      return NS_OK;
    }
    callback.swap(mAsyncWaitCallback);
  }
  return callback->OnInputStreamReady(this);
}

}  // namespace mozilla::dom
