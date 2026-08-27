/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim:set ts=2 sw=2 sts=2 et cindent: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "FFmpegDecodeStats.h"

#include "FFmpegLog.h"
#include "mozilla/Casting.h"
#include "mozilla/ProfilerMarkers.h"
#include "mozilla/TimeStamp.h"

namespace mozilla {

void FFmpegDecodeStats::DecodeStart() { mDecodeStart = TimeStamp::Now(); }

bool FFmpegDecodeStats::IsDecodingSlow() const {
  return mDecodedFramesLate > kMaxLateDecodedFrames;
}

void FFmpegDecodeStats::UpdateDecodeTimes(int64_t aDuration) {
  TimeStamp now = TimeStamp::Now();
  double decodeTime = (now - mDecodeStart).ToMilliseconds();
  mDecodeStart = now;

  const double frameDuration = AssertedCast<double>(aDuration) / 1000.0;
  if (frameDuration <= 0.0) {
    FFMPEGV_LOG("Incorrect frame duration, skipping decode stats.");
    return;
  }

  mAverageFrameDuration.insert(frameDuration);
  mAverageFrameDecodeTime.insert(decodeTime);

  FFMPEGV_LOG(
      "Frame decode takes {:.2f} ms average decode time {:.2f} ms frame "
      "duration "
      "{:.2f} average frame duration {:.2f} decoded {} frames\n",
      decodeTime, mAverageFrameDecodeTime.mean(), frameDuration,
      mAverageFrameDuration.mean(), mAverageFrameDuration.count());

  // Frame duration and frame decode times may vary and may not
  // neccessarily lead to video playback failure.
  //
  // Checks frame decode time and recent frame duration and also
  // frame decode time and average frame duration (video fps).
  //
  // Log a problem only if both indicators fails.
  if (decodeTime > frameDuration && decodeTime > mAverageFrameDuration.mean()) {
    PROFILER_MARKER_TEXT("FFmpegVideoDecoder::DoDecode", MEDIA_PLAYBACK, {},
                         "frame decode takes too long");
    mDecodedFramesLate++;
    mLastDelayedFrameNum = mAverageFrameDuration.count();
    FFMPEGV_LOG("  slow decode: failed to decode in time (decoded late {})",
                mDecodedFramesLate);
  } else if (mLastDelayedFrameNum) {
    // Reset mDecodedFramesLate in case of correct decode during
    // mDelayedFrameReset period.
    double correctPlaybackTime =
        AssertedCast<double>(mAverageFrameDuration.count() -
                             mLastDelayedFrameNum) *
        mAverageFrameDuration.mean();
    if (correctPlaybackTime > mDelayedFrameReset) {
      FFMPEGV_LOG("  mLastFramePts reset due to seamless decode period");
      mDecodedFramesLate = 0;
      mLastDelayedFrameNum = 0;
    }
  }
}

}  // namespace mozilla
