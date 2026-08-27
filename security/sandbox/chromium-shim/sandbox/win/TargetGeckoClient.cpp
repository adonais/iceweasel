/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "TargetGeckoClient.h"

#include "base/win/win_util.h"
#include "mozilla/Assertions.h"
#include "mozilla/NativeNt.h"

namespace mozilla::sandboxing {

static TargetGeckoServices sTargetGeckoServices;

void SetTargetGeckoServices(const TargetGeckoServices& aServices) {
  sTargetGeckoServices = aServices;
}

namespace {

// TLS is not allocated on some OS-owned threads; the Gecko marker callbacks
// use thread_local and would crash there. See bug 1705579; see also bug
// 2057023, where an intercepted syscall ran on a thread-pool worker doing
// heap maintenance.
bool CurrentThreadHasWorkingTLS() {
  return ::mozilla::nt::RtlGetThreadLocalStoragePointer() != nullptr;
}

}  // namespace

SyscallBrokering::SyscallBrokering(std::string_view aFunctionName,
                                   const UNICODE_STRING* aContext)
    : mFunctionName(aFunctionName),
      mContext(aContext ? base::win::UnicodeStringToView(*aContext)
                        : std::wstring_view{}),
      mBrokered(false) {
  if (!sTargetGeckoServices.markIntervalStart || !CurrentThreadHasWorkingTLS()) {
    return;
  }

  MOZ_ASSERT(sTargetGeckoServices.markSyscallBrokeringIntervalEnd,
             "markSyscallBrokeringIntervalEnd must be set to end the started "
             "interval.");

  sTargetGeckoServices.markIntervalStart(mFunctionName);
}

SyscallBrokering::~SyscallBrokering() {
  if (!sTargetGeckoServices.markSyscallBrokeringIntervalEnd ||
      !CurrentThreadHasWorkingTLS()) {
    return;
  }

  MOZ_ASSERT(sTargetGeckoServices.markIntervalStart,
             "markIntervalStart must be set to have started the interval.");

  sTargetGeckoServices.markSyscallBrokeringIntervalEnd(mFunctionName, mContext,
                                                        mBrokered);
}

AutoProfileMarker::AutoProfileMarker(std::string_view aName) : mName(aName) {
  if (!sTargetGeckoServices.markIntervalStart || !CurrentThreadHasWorkingTLS()) {
    return;
  }

  MOZ_ASSERT(sTargetGeckoServices.markIntervalEnd,
             "markIntervalEnd must be set to end the started interval.");

  sTargetGeckoServices.markIntervalStart(mName);
}

AutoProfileMarker::~AutoProfileMarker() {
  if (!sTargetGeckoServices.markIntervalEnd || !CurrentThreadHasWorkingTLS()) {
    return;
  }

  MOZ_ASSERT(sTargetGeckoServices.markIntervalStart,
             "markIntervalStart must be set to have started the interval.");

  sTargetGeckoServices.markIntervalEnd(mName);
}

}  // namespace mozilla::sandboxing
