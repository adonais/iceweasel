// Copyright (c) 2010 Google Inc.
// All rights reserved.
//
// Redistribution and use in source and binary forms, with or without
// modification, are permitted provided that the following conditions are
// met:
//
//     * Redistributions of source code must retain the above copyright
// notice, this list of conditions and the following disclaimer.
//     * Redistributions in binary form must reproduce the above
// copyright notice, this list of conditions and the following disclaimer
// in the documentation and/or other materials provided with the
// distribution.
//     * Neither the name of Google Inc. nor the names of its
// contributors may be used to endorse or promote products derived from
// this software without specific prior written permission.
//
// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
// "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
// LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
// A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
// OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
// SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
// LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
// DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
// THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
// (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
// OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

#include "linux/crash_generation/crash_generation_client.h"
#include "linux/crash_generation/crash_generation.h"

#include <errno.h>
#include <stdio.h>
#include <linux/prctl.h>
#include <sys/prctl.h>
#include <sys/socket.h>
#include <sys/types.h>
#include <sys/wait.h>


#include <algorithm>

#include "common/linux/eintr_wrapper.h"
#include "common/linux/ignore_ret.h"
#include "third_party/lss/linux_syscall_support.h"

#if defined(MOZ_OXIDIZED_BREAKPAD)
#  include "mozilla/toolkit/crashreporter/rust_minidump_writer_linux_ffi_generated.h"
#endif

namespace google_breakpad {

namespace {

using CrashReporter::UniqueFd;
using CrashReporter::GenerationClientAction;

static bool CreateStreamSocketPair(UniqueFd (&pair)[2]);
static bool TakeOrCreateStreamSocketPair(UniqueFd (&pre_pair)[2],
                                         UniqueFd (&pair)[2]);

#if defined(MOZ_OXIDIZED_BREAKPAD)
constexpr uint8_t POST_FORK_SYNC_BYTE = 0xaa; // arbitrary value

static bool ForkAndLaunchExecutor(UniqueFd executor_endpoint) {
  pid_t crashed_pid = sys_getpid();

  // Need child to wait after fork until we enable it to ptrace us
  UniqueFd post_fork_sync[2];
  if (!CreateStreamSocketPair(post_fork_sync)) {
    return false;
  }
  UniqueFd& post_fork_sync_read = post_fork_sync[0];
  UniqueFd& post_fork_sync_write = post_fork_sync[1];

  pid_t child_pid = sys_fork();
  if (child_pid == -1) {
    return false;
  } else if (child_pid == 0) {
    // We're the child
    post_fork_sync_write.reset();

    uint8_t byte = 0;
    if (HANDLE_EINTR(sys_read(post_fork_sync_read.get(), &byte, sizeof(byte))) != sizeof(byte)) {
      sys_exit_group(1);
    }

    if (byte != POST_FORK_SYNC_BYTE) {
      sys_exit_group(1);
    }

    post_fork_sync_read.reset();

    if (!minidump_writer_run_remote_executor(
        crashed_pid,
        executor_endpoint.release(),
        // We're not going to bother with the error message because... What can we really do about it?
        nullptr))
    {
      sys_exit_group(1);
    }

    sys_exit_group(0);
  }

  // We're the crashed process
  post_fork_sync_read.reset();
  executor_endpoint.reset();

  // Give the child permission to ptrace us
  // Fails with EINVAL on kernels without Yama, where it isn't needed anyway
  if (prctl(PR_SET_PTRACER, child_pid) == -1 && errno != EINVAL) {
    return false;
  }

  uint8_t byte = POST_FORK_SYNC_BYTE;
  if (HANDLE_EINTR(sys_write(post_fork_sync_write.get(), &byte, sizeof(byte))) != sizeof(byte)) {
    return false;
  }

  post_fork_sync_write.reset();

  int status = 0;
  if (HANDLE_EINTR(sys_waitpid(child_pid, &status, 0)) == -1) {
    return false;
  }

  return WIFEXITED(status) && WEXITSTATUS(status) == 0;
}
#endif  // defined(MOZ_OXIDIZED_BREAKPAD)

class CrashGenerationClientImpl : public CrashGenerationClient {
 public:
  explicit CrashGenerationClientImpl(int server_fd) : server_fd_(server_fd) {
    // Create a first socket pair ahead of time to avoid the GMP sandbox.
    CreateStreamSocketPair(pre_endpoints_);
  }
  virtual ~CrashGenerationClientImpl() {}

  virtual bool RequestDump(const void* blob, size_t blob_size) {
    UniqueFd endpoints[2];
    if (!TakeOrCreateStreamSocketPair(pre_endpoints_, endpoints)) {
      return false;
    }
    UniqueFd& server_endpoint = endpoints[0];
    UniqueFd& client_endpoint = endpoints[1];

    static const unsigned kControlMsgSize = CMSG_SPACE(sizeof(int));

    struct kernel_iovec iov;
    iov.iov_base = const_cast<void*>(blob);
    iov.iov_len = blob_size;

    struct kernel_msghdr msg = { 0 };
    msg.msg_iov = &iov;
    msg.msg_iovlen = 1;
    char cmsg[kControlMsgSize] = "";
    msg.msg_control = cmsg;
    msg.msg_controllen = sizeof(cmsg);

    struct cmsghdr* hdr = CMSG_FIRSTHDR(&msg);
    hdr->cmsg_level = SOL_SOCKET;
    hdr->cmsg_type = SCM_RIGHTS;
    hdr->cmsg_len = CMSG_LEN(sizeof(int));
    int* p = reinterpret_cast<int*>(CMSG_DATA(hdr));
    *p = server_endpoint.get();

    ssize_t ret = HANDLE_EINTR(sys_sendmsg(server_fd_, &msg, 0));
    if (ret < 0) {
      return false;
    }

    server_endpoint.reset();

    // Wait for server to indicate that it's done (by hanging up on us), or that
    // there is some work to be performed (via a `GenerationClientAction` value)
    uint8_t action_byte;
    ssize_t rv = HANDLE_EINTR(sys_read(client_endpoint.get(), &action_byte, sizeof(action_byte)));
    if (rv == -1) {
      return false;
    } else if (rv == 0) {
      return true;
    }

#if defined(MOZ_OXIDIZED_BREAKPAD)
    switch(static_cast<GenerationClientAction>(action_byte)) {
      case GenerationClientAction::ForkAndLaunchExecutor:
        return ForkAndLaunchExecutor(std::move(client_endpoint));
    }
#endif

    return false;
  }

 private:
  int server_fd_;
  // Server and client endpoints, in that order
  UniqueFd pre_endpoints_[2];

  DISALLOW_COPY_AND_ASSIGN(CrashGenerationClientImpl);
};

static bool CreateStreamSocketPair(UniqueFd (&pair)[2]) {
  int fds[2];
  if (sys_socketpair(AF_UNIX, SOCK_STREAM | SOCK_CLOEXEC, 0, fds) == -1) {
    return false;
  }
  pair[0] = UniqueFd(fds[0]);
  pair[1] = UniqueFd(fds[1]);
  return true;
}

// Takes the pre-created pair if still available, otherwise creates a new one.
static bool TakeOrCreateStreamSocketPair(UniqueFd (&pre_pair)[2],
                                         UniqueFd (&pair)[2]) {
  if (pre_pair[0] && pre_pair[1]) {
    pair[0] = std::move(pre_pair[0]);
    pair[1] = std::move(pre_pair[1]);
    return true;
  }
  return CreateStreamSocketPair(pair);
}

}  // namespace

// static
CrashGenerationClient* CrashGenerationClient::TryCreate(int server_fd) {
  if (server_fd < 0)
    return NULL;
  return new CrashGenerationClientImpl(server_fd);
}

}  // namespace google_breakpad
