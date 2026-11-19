/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef toolkit_crashreporter_breakpad_client_linux_crash_generation
#define toolkit_crashreporter_breakpad_client_linux_crash_generation

#include "third_party/lss/linux_syscall_support.h"
#include <cstdint>

namespace CrashReporter {

// We can't use Mozilla's UniqueFileHandle in the crash generator, because it uses libc and we may be in
// a signal context
class UniqueFd {
 public:
  UniqueFd() = default;
  explicit UniqueFd(int fd) : mFd(fd) {}

  UniqueFd(UniqueFd&& rv) : mFd(rv.release()) {}

  UniqueFd& operator=(UniqueFd&& rv) {
    reset(rv.release());
    return *this;
  }

  ~UniqueFd() {
    reset();
  }

  void reset(int fd = -1) {
    if (mFd != -1) {
        sys_close(mFd);
    }
    mFd = fd;
  }

  int get() const {
    return mFd;
  }

  int release() {
    int fd = mFd;
    mFd = -1;
    return fd;
  }

  explicit operator bool() const {
    return mFd != -1;
  }

 private:
  int mFd = -1;
};

enum class GenerationClientAction: uint8_t {
    ForkAndLaunchExecutor = 1,
};

} // namespace CrashReporter

#endif // toolkit_crashreporter_breakpad_client_linux_crash_generation
