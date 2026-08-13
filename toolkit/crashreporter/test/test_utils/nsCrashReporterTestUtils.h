/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef nsCrashReporterTestUtils_h
#define nsCrashReporterTestUtils_h

#include "nsICrashReporterTestUtils.h"

namespace mozilla {

class nsCrashReporterTestUtils final : public nsICrashReporterTestUtils {
 public:
  NS_DECL_ISUPPORTS
  NS_DECL_NSICRASHREPORTERTESTUTILS

  nsCrashReporterTestUtils() = default;

 private:
  ~nsCrashReporterTestUtils() = default;
};

}  // namespace mozilla

#endif  // nsCrashReporterTestUtils_h
