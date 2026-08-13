/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "AndroidNetworkBlockedReason.h"

#include <cstdint>
#include <dlfcn.h>
#include "mozilla/Maybe.h"
#include "private/pprio.h"

namespace mozilla::net {

// ANDROID_NETWORK_BLOCKED_REASON_LNP from <android/multinetwork.h>. The NDK
// doesn't declare this constant yet, so we hardcode the value Chromium
// hardcodes in net::android::NetworkBlockedReason::kLnp
// (net/android/network_library.h), which carries the same caveat.
static const int32_t kAndroidNetworkBlockedReasonLNP = 1;

bool IsAndroidNetworkBlockedReasonLNP(int32_t aBlockedReason) {
  return aBlockedReason == kAndroidNetworkBlockedReasonLNP;
}

namespace {

using AndroidGetNetworkBlockedReasonFn = int32_t (*)(int);

// android_getnetworkblockedreason() lives in libandroid.so, not libc.so, and
// (like IsAndroidNetworkBlockedReasonLNP's constant) isn't declared by the
// NDK yet, so it must be dlsym-resolved rather than called directly. Devices
// older than Android 16 won't have the symbol at all. See
// https://developer.android.com/privacy-and-security/local-network-permission#strategy-by-use-case
// ("For TCP connections, browsers should use the NDK API
// android_getnetworkblockedreason(int sockFd)...").
AndroidGetNetworkBlockedReasonFn GetAndroidGetNetworkBlockedReasonFn() {
  void* handle = dlopen("libandroid.so", RTLD_NOW);
  if (!handle) {
    return nullptr;
  }
  return reinterpret_cast<AndroidGetNetworkBlockedReasonFn>(
      dlsym(handle, "android_getnetworkblockedreason"));
}

// Returns Nothing() if the device doesn't expose the API, or |fd|'s native
// handle can't be extracted.
Maybe<int32_t> QueryAndroidNetworkBlockedReason(PRFileDesc* fd) {
  static AndroidGetNetworkBlockedReasonFn sGetNetworkBlockedReason =
      GetAndroidGetNetworkBlockedReasonFn();
  if (!sGetNetworkBlockedReason) {
    return Nothing();
  }
  PRFileDesc* bottom = PR_GetIdentitiesLayer(fd, PR_NSPR_IO_LAYER);
  if (!bottom) {
    return Nothing();
  }
  int nativeFd = PR_FileDesc2NativeHandle(bottom);
  if (nativeFd < 0) {
    return Nothing();
  }
  return Some(sGetNetworkBlockedReason(nativeFd));
}

}  // namespace

bool IsConnectBlockedByAndroidLocalNetworkPermission(PRFileDesc* fd) {
  Maybe<int32_t> reason = QueryAndroidNetworkBlockedReason(fd);
  return reason && IsAndroidNetworkBlockedReasonLNP(*reason);
}

}  // namespace mozilla::net
