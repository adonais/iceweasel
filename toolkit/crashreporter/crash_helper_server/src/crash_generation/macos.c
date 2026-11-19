/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

#include <stdint.h>
#include <sys/sysctl.h>

uint64_t process_starttime(pid_t pid) {
  int mib[] = {
      CTL_KERN,
      KERN_PROC,
      KERN_PROC_PID,
      pid,
  };
  u_int mib_len = sizeof(mib) / sizeof(mib[0]);

  struct kinfo_proc proc = {};
  size_t buffer_size = sizeof(proc);
  int rv = sysctl(mib, mib_len, &proc, &buffer_size, NULL, 0);

  if (rv == -1) {
    return 0;
  }

  uint64_t start_time =
      ((uint64_t)proc.kp_proc.p_un.__p_starttime.tv_sec * 1000000) +
      proc.kp_proc.p_un.__p_starttime.tv_usec;

  return start_time;
}
