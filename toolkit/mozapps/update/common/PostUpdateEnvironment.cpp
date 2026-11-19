/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "PostUpdateEnvironment.h"

#include <userenv.h>

#include "nsWindowsHelpers.h"
#include "updatecommon.h"

PostUpdateEnvironment::PostUpdateEnvironment(ElevationType aElevationType)
    : mEnvironmentBlock{nullptr} {
  if (aElevationType != ElevationType::None) {
    return;
  }

  HANDLE rawToken{nullptr};
  if (!OpenProcessToken(GetCurrentProcess(),
                        TOKEN_QUERY | TOKEN_DUPLICATE | TOKEN_IMPERSONATE,
                        &rawToken)) {
    LOG(
        ("PostUpdateEnvironment::PostUpdateEnvironment - OpenProcessToken "
         "failed: %lu",
         GetLastError()));
    return;
  }
  nsAutoHandle token{rawToken};

  if (!CreateEnvironmentBlock(&mEnvironmentBlock, token, FALSE)) {
    LOG(
        ("PostUpdateEnvironment::PostUpdateEnvironment - "
         "CreateEnvironmentBlock failed: %lu",
         GetLastError()));
    mEnvironmentBlock = nullptr;
  }
}

PostUpdateEnvironment::~PostUpdateEnvironment() {
  if (mEnvironmentBlock) {
    DestroyEnvironmentBlock(mEnvironmentBlock);
  }
}

LPVOID PostUpdateEnvironment::get() const {
  static WCHAR kEmptyEnvironmentBlock[]{L"\0"};

  return mEnvironmentBlock ? mEnvironmentBlock : kEmptyEnvironmentBlock;
}
