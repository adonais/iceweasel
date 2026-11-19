/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_net_HttpActivityArgs_h
#define mozilla_net_HttpActivityArgs_h

#include <stdint.h>

#include "mozilla/Variant.h"
#include "nsString.h"

namespace mozilla::net {

struct HttpActivity {
  HttpActivity(const nsCString& aHost, int32_t aPort, bool aEndToEndSSL)
      : host(aHost), port(aPort), endToEndSSL(aEndToEndSSL) {}

  nsCString host;
  int32_t port;
  bool endToEndSSL;
};

struct HttpConnectionActivity {
  HttpConnectionActivity(const nsCString& aConnInfoKey, const nsCString& aHost,
                         int32_t aPort, bool aSsl, bool aHasECH, bool aIsHttp3)
      : connInfoKey(aConnInfoKey),
        host(aHost),
        port(aPort),
        ssl(aSsl),
        hasECH(aHasECH),
        isHttp3(aIsHttp3) {}

  nsCString connInfoKey;
  nsCString host;
  int32_t port;
  bool ssl;
  bool hasECH;
  bool isHttp3;
};

// Either a channel id, or the details of a non-channel activity.
using HttpActivityArgs =
    Variant<uint64_t, HttpActivity, HttpConnectionActivity>;

}  // namespace mozilla::net

#endif  // mozilla_net_HttpActivityArgs_h
