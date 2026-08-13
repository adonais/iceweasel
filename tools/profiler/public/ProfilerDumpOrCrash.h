/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// This is a small, dependency-light header so that fatal test-only conditions
// can use MOZ_DUMP_PROFILE_OR_CRASH_UNSAFE without pulling in (and recompiling
// against) the whole profiler API.

#ifndef ProfilerDumpOrCrash_h
#define ProfilerDumpOrCrash_h

#include "mozilla/Assertions.h"
#include "nsString.h"

// If the profiler is active, notify the "profiler-dump-and-quit" observer topic
// (passing aReason as the notification data) and block until it has been
// delivered on the main thread. The test harness handles this by saving a
// profile artifact and ending the process with an unmissable failure, so a
// profile that would otherwise be lost is preserved. A no-op if the profiler is
// inactive. This normally does not return when handled, as the harness ends the
// process. Used to implement MOZ_DUMP_PROFILE_OR_CRASH_UNSAFE.
void profiler_request_dump_and_quit_for_test(const nsACString& aReason);

// For fatal, test-only conditions: in a profiled run, save a profile and end
// the process with an unmissable failure (via the test harness) instead of
// crashing, so the profile leading up to the failure isn't lost. If the
// profiler is inactive, or no harness handles the request, crash via
// MOZ_CRASH_UNSAFE. aReason is a runtime string (e.g. an nsCString) describing
// the failure.
#define MOZ_DUMP_PROFILE_OR_CRASH_UNSAFE(aReason)                   \
  do {                                                              \
    const nsCString _profileOrCrashReason(aReason);                 \
    profiler_request_dump_and_quit_for_test(_profileOrCrashReason); \
    MOZ_CRASH_UNSAFE(_profileOrCrashReason.get());                  \
  } while (false)

#endif  // ProfilerDumpOrCrash_h
