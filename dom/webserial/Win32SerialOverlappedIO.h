/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_dom_Win32SerialOverlappedIO_h
#define mozilla_dom_Win32SerialOverlappedIO_h

#include <windows.h>

#include "mozilla/UniquePtrExtensions.h"

namespace mozilla::dom {

// Serial ports are opened with FILE_FLAG_OVERLAPPED, and the same kernel file
// object is shared via DuplicateHandle with a PlatformPipeReader that keeps
// an eventless overlapped ReadFile pending on an IOCP. Issuing synchronous
// (NULL lpOverlapped) calls on such a handle is unsafe: the Win32 wrapper waits
// on the file object's event, which the reader's completion also signals, so
// the wrapper can return while its IRP is still pending. Every operation on the
// port should therefore go through this class, which supplies a private event
// so the wait is only satisfied by our own completion.
class Win32SerialOverlappedIO final {
 public:
  Win32SerialOverlappedIO() = default;
  Win32SerialOverlappedIO(const Win32SerialOverlappedIO&) = delete;
  Win32SerialOverlappedIO& operator=(const Win32SerialOverlappedIO&) = delete;

  // Creates the event. Returns true on success, and on failure
  // GetLastError() describes the error.
  bool Init();

  // Resets the event so the OVERLAPPED can be reused for another operation.
  void Reset();

  OVERLAPPED* Get() { return &mOverlapped; }

  // Blocks until the operation issued with Get() completes. Returns true on
  // success, and on failure GetLastError() describes the error.
  bool Wait(HANDLE aHandle, DWORD* aBytesTransferred);

  // Checks for parity errors on an overlapped handle and blocks until
  // it completes. Returns true on success and false if there was a parity
  // error.
  static bool SyncCheckParity(HANDLE aHandle);

  // Purges the specified buffers on an overlapped handle and blocks
  // until it completes. Returns true on success. aPurgeFlags can be
  // any combination of SERIAL_PURGE_RXCLEAR and SERIAL_PURGE_TXCLEAR.
  static bool SyncPurge(HANDLE aHandle, ULONG aPurgeFlags);

  // Sets or clears the passed-in signal and blocks until it completes.
  // Returns true on success.
  static bool SyncSetSignal(HANDLE aHandle, DWORD aIoControlCode);

  // Gets the signals into aSignals and blocks until it completes.
  // Returns true on success.
  static bool SyncGetSignals(HANDLE aHandle, ULONG& aSignals);

 private:
  // Issues DeviceIoControl on an overlapped handle and blocks until it
  // completes. Returns true on success, and on failure GetLastError()
  // describes the error.
  static bool SyncDeviceIoControl(HANDLE aHandle, DWORD aIoControlCode,
                                  const void* aInBuffer, DWORD aInBufferSize,
                                  void* aOutBuffer, DWORD aOutBufferSize,
                                  DWORD* aBytesReturned = nullptr);

  UniqueFileHandle mEvent;
  OVERLAPPED mOverlapped = {};
};

}  // namespace mozilla::dom

#endif  // mozilla_dom_Win32SerialOverlappedIO_h
