/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "CookiePrefixes.h"

namespace mozilla::net {

namespace {

struct CookiePrefix {
  CookiePrefixes::Prefix mPrefix;
  nsCString mPrefixCString;
  nsString mPrefixString;
  std::function<bool(const CookieStruct&, bool)> mCallback;
};

MOZ_RUNINIT CookiePrefix gCookiePrefixes[] = {
    {CookiePrefixes::eSecure, "__Secure-"_ns, u"__Secure-"_ns,
     [](const CookieStruct& aCookieData, bool aSecureRequest) -> bool {
       // If a cookie's name begins with a case-sensitive match for the string
       // __Secure-, then the cookie will have been set with a Secure attribute.
       return aSecureRequest && aCookieData.isSecure();
     }},

    {CookiePrefixes::eHost, "__Host-"_ns, u"__Host-"_ns,
     [](const CookieStruct& aCookieData, bool aSecureRequest) -> bool {
       // If a cookie's name begins with a case-sensitive match for the string
       // __Host-, then the cookie will have been set with a Secure attribute, a
       // Path attribute with a value of /, and no Domain attribute.
       return aSecureRequest && aCookieData.isSecure() &&
              aCookieData.host()[0] != '.' &&
              aCookieData.path().EqualsLiteral("/");
     }},

    {CookiePrefixes::eHttp, "__Http-"_ns, u"__Http-"_ns,
     [](const CookieStruct& aCookieData, bool aSecureRequest) -> bool {
       // If a cookie's name begins with a case-sensitive match for the string
       // __Http-, then the cookie will have been set with a Secure attribute,
       // and an HttpOnly attribute.
       return aSecureRequest && aCookieData.isSecure() &&
              aCookieData.isHttpOnly();
     }},

    {CookiePrefixes::eHostHttp, "__Host-Http-"_ns, u"__Host-Http-"_ns,
     [](const CookieStruct& aCookieData, bool aSecureRequest) -> bool {
       // If a cookie's name begins with a case-sensitive match for the string
       // __Host-Http-, then the cookie will have been set with a Secure
       // attribute, an HttpOnly attribute, a Path attribute with a value of /,
       // and no Domain attribute.
       return aSecureRequest && aCookieData.isSecure() &&
              aCookieData.isHttpOnly() && aCookieData.host()[0] != '.' &&
              aCookieData.path().EqualsLiteral("/");
     }},
};

}  // namespace

// static
bool CookiePrefixes::Has(Prefix aPrefix, const nsAString& aString) {
  for (CookiePrefix& prefix : gCookiePrefixes) {
    if (prefix.mPrefix == aPrefix) {
      return StringBeginsWith(aString, prefix.mPrefixString,
                              nsCaseInsensitiveStringComparator);
    }
  }

  return false;
}

// static
bool CookiePrefixes::Has(const nsACString& aString) {
  for (CookiePrefix& prefix : gCookiePrefixes) {
    if (StringBeginsWith(aString, prefix.mPrefixCString,
                         nsCaseInsensitiveCStringComparator)) {
      return true;
    }
  }

  return false;
}

// static
bool CookiePrefixes::Check(const CookieStruct& aCookieData,
                           bool aSecureRequest) {
  for (CookiePrefix& prefix : gCookiePrefixes) {
    if (StringBeginsWith(aCookieData.name(), prefix.mPrefixCString,
                         nsCaseInsensitiveCStringComparator)) {
      return prefix.mCallback(aCookieData, aSecureRequest);
    }
  }

  // not one of the magic prefixes: carry on
  return true;
}

}  // namespace mozilla::net
