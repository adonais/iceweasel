/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "GkRustUtils.h"

#include "gk_rust_utils_ffi_generated.h"

using namespace mozilla;

/* static */
bool GkRustUtils::ParseSemVer(const nsACString& aVersion, uint64_t& aOutMajor,
                              uint64_t& aOutMinor, uint64_t& aOutPatch) {
  return GkRustUtils_ParseSemVer(&aVersion, &aOutMajor, &aOutMinor, &aOutPatch);
}
