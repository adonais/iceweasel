/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef AndroidNetworkBlockedReason_h
#define AndroidNetworkBlockedReason_h

#include "prio.h"

namespace mozilla::net {

// Returns true if |aBlockedReason| matches ANDROID_NETWORK_BLOCKED_REASON_LNP
// from <android/multinetwork.h>. The NDK does not declare that constant yet
// (checked against android-ndk-r28b/r28c/r29), so this mirrors the value
// Chromium hardcodes in net::android::NetworkBlockedReason::kLnp
// (net/android/network_library.h) until the NDK catches up.
bool IsAndroidNetworkBlockedReasonLNP(int32_t aBlockedReason);

// Returns true if the OS reports that |fd|'s connect attempt was blocked by
// Android 16+'s Local Network Protection because we lack ACCESS_LOCAL_NETWORK
// / NEARBY_DEVICES. See bug 2053432.
bool IsConnectBlockedByAndroidLocalNetworkPermission(PRFileDesc* fd);

}  // namespace mozilla::net

#endif  // AndroidNetworkBlockedReason_h
