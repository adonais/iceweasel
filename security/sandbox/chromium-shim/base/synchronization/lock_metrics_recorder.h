/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// This is a dummy version of Chromium source file
// base/synchronization/lock_metrics_recorder.h to provide a stub implementation.

#ifndef BASE_SYNCHRONIZATION_LOCK_METRICS_RECORDER_H_
#define BASE_SYNCHRONIZATION_LOCK_METRICS_RECORDER_H_

namespace base {

struct LockMetricsRecorder {
  struct ScopedLockAcquisitionTimer {
    // Empty destructor to prevent unused warning.
    ~ScopedLockAcquisitionTimer() {}
  };
};

}  // namespace base

#endif  // BASE_SYNCHRONIZATION_LOCK_METRICS_RECORDER_H_
