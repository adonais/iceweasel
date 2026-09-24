/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_dom_NativeThreadId_h
#define mozilla_dom_NativeThreadId_h

#if defined(XP_DARWIN)
#  include "mozilla/UniquePtrExtensions.h"
#else
#  include "nsExceptionHandler.h"
#endif  // defined(XP_DARWIN)

namespace mozilla::dom {
#if defined(XP_DARWIN)
typedef mozilla::UniqueMachSendRight NativeThreadId;
#else
typedef CrashReporter::ThreadId NativeThreadId;
#endif  // defined(XP_DARWIN)
}  // namespace mozilla::dom

#endif
