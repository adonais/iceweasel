/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsCrashReporterTestUtils.h"

#include "nsExceptionHandler.h"

namespace mozilla {

NS_IMPL_ISUPPORTS(nsCrashReporterTestUtils, nsICrashReporterTestUtils)

NS_IMETHODIMP
nsCrashReporterTestUtils::GetCrashHelperPid(uint32_t* aResult) {
  if (!aResult) {
    return NS_ERROR_INVALID_ARG;
  }
  *aResult = CrashReporter::GetCrashHelperPid();
  return NS_OK;
}

}  // namespace mozilla
