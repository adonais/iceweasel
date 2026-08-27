/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim:set ts=2 sw=2 sts=2 et cindent: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef FFmpegDecodeStats_h_
#define FFmpegDecodeStats_h_

#include <stdint.h>

#include "mozilla/CumulativeAverage.h"
#include "mozilla/TimeStamp.h"

namespace mozilla {

// Tracks per-frame decode timing and detects sustained slow decoding.
// A decoder is considered "slow" when more than kMaxLateDecodedFrames frames
// have decoded slower than both the current frame duration and the running
// average frame duration.
class FFmpegDecodeStats {
 public:
  void DecodeStart();
  // aDuration is the duration of the frame being decoded, in microseconds.
  void UpdateDecodeTimes(int64_t aDuration);
  bool IsDecodingSlow() const;

  // Number of delayed frames until we consider decoding as slow.
  static constexpr uint32_t kMaxLateDecodedFrames = 15;

 private:
  CumulativeAverage<double> mAverageFrameDuration;    // in milliseconds
  CumulativeAverage<double> mAverageFrameDecodeTime;  // in milliseconds

  // How many frames is decoded behind its pts time, i.e. video decode lags.
  uint32_t mDecodedFramesLate = 0;

  // Reset mDecodedFramesLate every 3 seconds of correct playback.
  const uint32_t mDelayedFrameReset = 3000;

  uint32_t mLastDelayedFrameNum = 0;

  TimeStamp mDecodeStart;
};

}  // namespace mozilla

#endif  // FFmpegDecodeStats_h_
