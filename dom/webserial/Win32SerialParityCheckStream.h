/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_dom_Win32SerialParityCheckStream_h
#define mozilla_dom_Win32SerialParityCheckStream_h

#include "mozilla/UniquePtrExtensions.h"
#include "nsCOMPtr.h"
#include "nsIAsyncInputStream.h"

namespace mozilla::dom {

// Wraps the raw serial read stream on Windows when parity checking is enabled.
// Windows does not mark parity errors inline in the byte stream; instead the
// driver records them and they are reported by ClearCommError(). This stream
// delegates reads to the inner stream and, after each read, polls
// ClearCommError() for CE_RXPARITY. On detecting a parity error it delivers the
// bytes from the current read and then fails its next read with
// NS_ERROR_DOM_SERIAL_PARITY_ERROR, which rides the DataPipe close channel to
// the content process to surface a "ParityError" DOMException.
class Win32SerialParityCheckStream final : public nsIAsyncInputStream {
 public:
  NS_DECL_THREADSAFE_ISUPPORTS
  NS_DECL_NSIINPUTSTREAM
  NS_DECL_NSIASYNCINPUTSTREAM

  Win32SerialParityCheckStream(nsCOMPtr<nsIAsyncInputStream> aInner,
                               UniqueFileHandle aCommHandle);

 private:
  ~Win32SerialParityCheckStream() = default;

  // Polls ClearCommError() and latches a parity error if CE_RXPARITY is set.
  void CheckForParityError();

  nsCOMPtr<nsIAsyncInputStream> mInner;
  // A duplicate of the comm port handle, used solely for ClearCommError().
  UniqueFileHandle mCommHandle;

  // Set once CE_RXPARITY has been observed. After the bytes from the read that
  // observed it are delivered, the next read fails with the parity error.
  bool mParityErrorLatched = false;
};

}  // namespace mozilla::dom

#endif  // mozilla_dom_Win32SerialParityCheckStream_h
