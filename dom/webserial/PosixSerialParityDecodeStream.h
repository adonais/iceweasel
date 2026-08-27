/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_dom_PosixSerialParityDecodeStream_h
#define mozilla_dom_PosixSerialParityDecodeStream_h

#include "mozilla/Mutex.h"
#include "nsCOMPtr.h"
#include "nsIAsyncInputStream.h"
#include "nsTArray.h"

namespace mozilla::dom {

// Wraps the raw serial read stream on POSIX when parity checking is enabled.
// With the PARMRK termios flag set, the kernel rewrites the byte stream so
// that:
//   * a legitimate 0xff byte is doubled to 0xff 0xff, and
//   * a byte received with a parity (or framing) error is prefixed with the
//     marker 0xff 0x00, i.e. it arrives as 0xff 0x00 <byte>.
// This stream undoes the doubling and, on encountering an error marker,
// delivers all bytes received before the marker and then fails its next read
// with NS_ERROR_DOM_SERIAL_PARITY_ERROR. That status rides the DataPipe close
// channel to the content process, where it is surfaced on the ReadableStream
// as a "ParityError" DOMException.
//
// Only ReadSegments is used by the parent-side read pump (NS_AsyncCopy with
// NS_ASYNCCOPY_VIA_READSEGMENTS); Read is implemented for completeness.
class PosixSerialParityDecodeStream final : public nsIAsyncInputStream,
                                            public nsIInputStreamCallback {
 public:
  NS_DECL_THREADSAFE_ISUPPORTS
  NS_DECL_NSIINPUTSTREAM
  NS_DECL_NSIASYNCINPUTSTREAM
  NS_DECL_NSIINPUTSTREAMCALLBACK

  explicit PosixSerialParityDecodeStream(nsIAsyncInputStream* aInner);

 private:
  ~PosixSerialParityDecodeStream() = default;

  // Decodes aInput into mPending, updating mEscapeState. Stops early and sets
  // mParityErrorLatched if an error marker is found.
  void Decode(const uint8_t* aInput, uint32_t aLength);

  // Reads up to aMaxRead raw bytes (clamped to an internal buffer size) from
  // the inner stream and decodes them into mPending, reporting the number of
  // raw bytes actually read in aRawRead (0 at inner EOF). Returns the inner
  // Read() status, including NS_BASE_STREAM_WOULD_BLOCK. Callers must first
  // ensure mPending is empty and no error is latched.
  nsresult ReadAndDecode(uint64_t aMaxRead, uint32_t* aRawRead);

  nsCOMPtr<nsIAsyncInputStream> mInner;

  // Decoded bytes produced but not yet delivered to the consumer. Only
  // non-empty while the consumer (sink) is applying back-pressure.
  nsTArray<uint8_t> mPending;

  // Position within a possible escape/marker sequence carried across reads.
  enum class EscapeState : uint8_t {
    Normal,   // not inside a sequence
    SawFF,    // saw a lone 0xff; awaiting 0xff (real byte) or 0x00 (marker)
    SawFF00,  // saw 0xff 0x00; the next byte is the errored byte
  };
  EscapeState mEscapeState = EscapeState::Normal;

  // Set once an error marker has been seen. After all preceding decoded bytes
  // are delivered, the next read fails with NS_ERROR_DOM_SERIAL_PARITY_ERROR.
  bool mParityErrorLatched = false;

  Mutex mMutex{"PosixSerialParityDecodeStream::mMutex"};

  // The consumer's callback, held while a wait on the inner stream is pending.
  nsCOMPtr<nsIInputStreamCallback> mAsyncWaitCallback MOZ_GUARDED_BY(mMutex);
};

}  // namespace mozilla::dom

#endif  // mozilla_dom_PosixSerialParityDecodeStream_h
