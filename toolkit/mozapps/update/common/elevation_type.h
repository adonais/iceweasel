/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef ELEVATION_TYPE_H
#define ELEVATION_TYPE_H

#include "updater_invocation.h"

enum class BoolResult { True, False, Error };

enum class ElevationType {
  Unknown,
  None,
  ElevatedByMMS,
  ElevatedWithoutMMS,
  Error,
};
const char* elevationTypeToString(ElevationType elevationType);
BoolResult isProcessElevated(const NS_tchar* cmd = nullptr);
ElevationType getElevationType(int argc = 0, NS_tchar** argv = nullptr);
bool isElevationTypeElevated(ElevationType elevationType);
bool isValidInvocationForElevationType(UpdaterInvocation updaterInvocation,
                                       ElevationType elevationType);

#endif
