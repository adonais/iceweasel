/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// This is a cut down version of Chromium source file base/threading/platform_thread_linux.h
// with only the functions required.

#include "base/threading/platform_thread.h"

#include "base/threading/platform_thread_internal_posix.h"

#include "mozilla/Assertions.h"

namespace base {

void InitThreading() {}

void TerminateOnThread() {}

size_t GetDefaultThreadStackSize(const pthread_attr_t& attributes) {
#if !defined(THREAD_SANITIZER)
  return 0;
#else
  // ThreadSanitizer bloats the stack heavily. Evidence has been that the
  // default stack size isn't enough for some browser tests.
  return 2 * (1 << 23);  // 2 times 8192K (the default stack size on Linux).
#endif
}

}  // namespace base
