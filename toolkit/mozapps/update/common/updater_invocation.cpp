/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

#include "updater_invocation.h"

const NS_tchar* firstUpdateInvocationArg = NS_T("first");
const NS_tchar* secondUpdateInvocationArg = NS_T("second");

/**
 * Gets which updater invocation this is based on the value passed to this
 * function by the caller.
 */
UpdaterInvocation getUpdaterInvocationFromArg(const NS_tchar* argument) {
  if (NS_tstrcmp(argument, firstUpdateInvocationArg) == 0) {
    return UpdaterInvocation::First;
  }
  if (NS_tstrcmp(argument, secondUpdateInvocationArg) == 0) {
    // The second invocation may or may not be through MMS. Both are valid.
    return UpdaterInvocation::Second;
  }
  // Didn't recognize the invocation arg.
  return UpdaterInvocation::Error;
}

/**
 * Returns a human-readable representation of an `UpdaterInvocation`.
 */
const char* updaterInvocationToString(UpdaterInvocation value) {
  switch (value) {
    case UpdaterInvocation::First:
      return "UpdaterInvocation::First";
    case UpdaterInvocation::Second:
      return "UpdaterInvocation::Second";
    case UpdaterInvocation::Error:
      return "UpdaterInvocation::Error";
    case UpdaterInvocation::Unknown:
      return "UpdaterInvocation::Unknown";
  }
  MOZ_CRASH("impossible value for UpdaterInvocation");
}
