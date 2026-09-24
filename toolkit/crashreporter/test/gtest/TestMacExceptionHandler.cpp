/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "gtest/gtest.h"

#include <mach/mach.h>
#include <signal.h>
#include <sys/wait.h>
#include <unistd.h>

#include "breakpad-client/mac/handler/exception_handler.h"
#include "mozilla/Assertions.h"

namespace {

// Waits for aPid for at most aTimeoutMs, returning true and filling aStatus if
// the process was reaped, false if we gave up waiting for it.
bool WaitForChild(pid_t aPid, int aTimeoutMs, int* aStatus) {
  const int kPollIntervalMs = 50;
  for (int elapsed = 0; elapsed < aTimeoutMs; elapsed += kPollIntervalMs) {
    pid_t reaped = waitpid(aPid, aStatus, WNOHANG);
    if (reaped == aPid) {
      return true;
    }
    usleep(kPollIntervalMs * 1000);
  }
  return false;
}

}  // namespace

bool DoNotWriteDump(void*) { return false; }

// A child process that inherits our exception ports but does not register its
// own exception handler must still be killed by the kernel when it crashes.
TEST(MacExceptionHandler, ChildWithoutHandlerGetsKilled)
{
  google_breakpad::ExceptionHandler handler("/tmp", DoNotWriteDump, nullptr,
                                            nullptr, /* install_handler */ true,
                                            nullptr);

  pid_t pid = fork();
  ASSERT_NE(pid, -1);

  if (pid == 0) {
    MOZ_CRASH("Intentional crash for testing");
  }

  int status = 0;
  bool reaped = WaitForChild(pid, /* aTimeoutMs */ 30000, &status);
  if (!reaped) {
    kill(pid, SIGKILL);
    waitpid(pid, &status, 0);
  }

  ASSERT_TRUE(reaped)
  << "The crashing child process was never terminated";
  ASSERT_TRUE(WIFSIGNALED(status));
  EXPECT_TRUE(WTERMSIG(status) == SIGSEGV || WTERMSIG(status) == SIGBUS)
      << "Unexpected termination signal " << WTERMSIG(status);
}
