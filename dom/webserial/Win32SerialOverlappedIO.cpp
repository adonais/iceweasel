/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "Win32SerialOverlappedIO.h"

// ntddser.h depends on windows.h and winioctl.h, so disable clang-format to
// keep the include order.

// clang-format off
#include <windows.h>
#include <winioctl.h>
#include <ntddser.h>
// clang-format on

namespace mozilla::dom {

bool Win32SerialOverlappedIO::Init() {
  mEvent = UniqueFileHandle(CreateEvent(nullptr, TRUE, FALSE, nullptr));
  if (!mEvent) {
    return false;
  }
  mOverlapped = {};
  // Setting the low-order bit of hEvent prevents the I/O completion from
  // being queued to the IOCP. This is necessary because PlatformPipeReader
  // may have registered a DuplicateHandle of this port with the IOCP, and
  // completions from our local OVERLAPPED would corrupt the IOCP handler
  // lookup. GetOverlappedResult still works via the event.
  HANDLE rawEvent = mEvent.get();
  mOverlapped.hEvent =
      reinterpret_cast<HANDLE>(reinterpret_cast<uintptr_t>(rawEvent) | 1);
  return true;
}

void Win32SerialOverlappedIO::Reset() { ResetEvent(mEvent.get()); }

bool Win32SerialOverlappedIO::Wait(HANDLE aHandle, DWORD* aBytesTransferred) {
  return GetOverlappedResult(aHandle, &mOverlapped, aBytesTransferred,
                             /* bWait */ TRUE);
}

/* static */
bool Win32SerialOverlappedIO::SyncCheckParity(HANDLE aHandle) {
  // This is what ClearCommError() does internally.
  SERIAL_STATUS status = {};
  return !(Win32SerialOverlappedIO::SyncDeviceIoControl(
               aHandle, IOCTL_SERIAL_GET_COMMSTATUS, nullptr, 0, &status,
               sizeof(status)) &&
           (status.Errors & SERIAL_ERROR_PARITY));
}

/* static */
bool Win32SerialOverlappedIO::SyncPurge(HANDLE aHandle, ULONG aPurgeFlags) {
  ULONG purgeFlags = aPurgeFlags;
  return Win32SerialOverlappedIO::SyncDeviceIoControl(
      aHandle, IOCTL_SERIAL_PURGE, &purgeFlags, sizeof(purgeFlags), nullptr, 0);
}

/* static */
bool Win32SerialOverlappedIO::SyncSetSignal(HANDLE aHandle,
                                            DWORD aIoControlCode) {
  return Win32SerialOverlappedIO::SyncDeviceIoControl(aHandle, aIoControlCode,
                                                      nullptr, 0, nullptr, 0);
}

/* static */
bool Win32SerialOverlappedIO::SyncGetSignals(HANDLE aHandle, ULONG& aSignals) {
  return Win32SerialOverlappedIO::SyncDeviceIoControl(
      aHandle, IOCTL_SERIAL_GET_MODEMSTATUS, nullptr, 0, &aSignals,
      sizeof(aSignals));
}

/* static */
bool Win32SerialOverlappedIO::SyncDeviceIoControl(
    HANDLE aHandle, DWORD aIoControlCode, const void* aInBuffer,
    DWORD aInBufferSize, void* aOutBuffer, DWORD aOutBufferSize,
    DWORD* aBytesReturned) {
  Win32SerialOverlappedIO io;
  if (!io.Init()) {
    return false;
  }
  if (!DeviceIoControl(aHandle, aIoControlCode, const_cast<void*>(aInBuffer),
                       aInBufferSize, aOutBuffer, aOutBufferSize,
                       /* lpBytesReturned */ nullptr, io.Get()) &&
      GetLastError() != ERROR_IO_PENDING) {
    return false;
  }
  DWORD bytes = 0;
  if (!io.Wait(aHandle, &bytes)) {
    return false;
  }
  if (aBytesReturned) {
    *aBytesReturned = bytes;
  }
  return true;
}

}  // namespace mozilla::dom
