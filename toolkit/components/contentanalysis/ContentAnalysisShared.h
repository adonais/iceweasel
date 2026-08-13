/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
#ifndef mozilla_contentanalysisshared_h
#define mozilla_contentanalysisshared_h

#include "mozilla/ErrorNames.h"
#include "nsError.h"

namespace mozilla::contentanalysis {

// Pref names shared between ContentAnalysis.cpp (URL filter) and
// ExternalAgentBackend.cpp (connection-settings telemetry).
inline constexpr const char* kAllowUrlPref =
    "browser.contentanalysis.allow_url_regex_list";
inline constexpr const char* kDenyUrlPref =
    "browser.contentanalysis.deny_url_regex_list";

// Used by callers that log via nsresult.
inline const char* SafeGetStaticErrorName(nsresult aRv) {
  const auto* ret = mozilla::GetStaticErrorName(aRv);
  return ret ? ret : "<illegal value>";
}

}  // namespace mozilla::contentanalysis

#endif  // mozilla_contentanalysisshared_h
