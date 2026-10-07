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
// driver records them and they are reported by IOCTL_SERIAL_GET_COMMSTATUS
// (the IOCTL behind ClearCommError()). This stream delegates reads to the inner
// stream and, after each read, polls that IOCTL for SERIAL_ERROR_PARITY. On
// detecting a parity error it delivers the bytes from the current read and
// then fails its next read with NS_ERROR_DOM_SERIAL_PARITY_ERROR, which rides
// the DataPipe close channel to the content process to surface a "ParityError"
// DOMException.
class Win32SerialParityCheckStream final : public nsIAsyncInputStream {
 public:
  NS_DECL_THREADSAFE_ISUPPORTS
  NS_DECL_NSIINPUTSTREAM
  NS_DECL_NSIASYNCINPUTSTREAM

  Win32SerialParityCheckStream(nsCOMPtr<nsIAsyncInputStream> aInner,
                               UniqueFileHandle aCommHandle);

 private:
  ~Win32SerialParityCheckStream() = default;

  // Polls the comm status and latches a parity error if one is reported.
  void CheckForParityError();

  nsCOMPtr<nsIAsyncInputStream> mInner;
  // A duplicate of the comm port handle, used solely for comm status polling.
  UniqueFileHandle mCommHandle;

  // Set once a parity error has been observed. After the bytes from the read
  // that observed it are delivered, the next read fails with the parity error.
  bool mParityErrorLatched = false;
};

}  // namespace mozilla::dom

#endif  // mozilla_dom_Win32SerialParityCheckStream_h
