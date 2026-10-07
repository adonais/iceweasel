/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef UPDATER_INVOCATION_H
#define UPDATER_INVOCATION_H

#include "updatedefines.h"

extern const NS_tchar* firstUpdateInvocationArg;
extern const NS_tchar* secondUpdateInvocationArg;

/**
 * This enum and its related functions are intended for interpreting the passed
 * parameter and using it to determine whether this is the first or second
 * invocation of the updater.
 */
enum class UpdaterInvocation {
  // The initial invocation of the updater. This may apply the update, or it may
  // start the second invocation of the updater to update depending on whether
  // elevation is required.
  // This invocation always does all modifications of the update directory and
  // calls the callback application, even if another updater is launched.
  First,
  // The second invocation of the updater. This basically applies the update to
  // the installation directory, calls PostUpdate (on Windows) and exits.
  Second,
  // It cannot be determined that we are doing either of the above invocations.
  // This generally represents an uninitialized value or an error.
  Unknown,
  // There is some kind of error.
  Error,
};
const char* updaterInvocationToString(UpdaterInvocation value);
UpdaterInvocation getUpdaterInvocationFromArg(const NS_tchar* argument);

#endif
