/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=2 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include <chrono>
#include <thread>

#include "FFmpegDecodeStats.h"
#include "gtest/gtest.h"

using mozilla::FFmpegDecodeStats;

// UpdateDecodeTimes takes the decoded frame's duration in microseconds and
// converts it to milliseconds for comparison with the elapsed decode time.
//
// To force a "slow" frame: sleep 2 ms between DecodeStart / UpdateDecodeTimes
// and pass a 1 µs budget (0.001 ms), so decodeTime (>=2 ms) always exceeds it.
//
// To force a "fast" frame: pass a huge duration (10^9 µs -> 10^6 ms ~= 17 min)
// so that no real measurement can exceed the frame budget.
static constexpr int64_t kSlowFrameDuration = 1;              // 0.001 ms budget
static constexpr int64_t kFastFrameDuration = 1'000'000'000;  // 10^6 ms budget

static void InsertSlowFrame(FFmpegDecodeStats& aStats) {
  aStats.DecodeStart();
  std::this_thread::sleep_for(std::chrono::milliseconds(2));
  aStats.UpdateDecodeTimes(kSlowFrameDuration);
}

static void InsertFastFrame(FFmpegDecodeStats& aStats) {
  aStats.DecodeStart();
  aStats.UpdateDecodeTimes(kFastFrameDuration);
}

TEST(FFmpegDecodeStatsTest, InitiallyNotSlow)
{
  FFmpegDecodeStats stats;
  EXPECT_FALSE(stats.IsDecodingSlow());
}

TEST(FFmpegDecodeStatsTest, NotSlowAtLimit)
{
  FFmpegDecodeStats stats;
  // Decoding is not considered slow until the late-frame count exceeds
  // kMaxLateDecodedFrames.
  for (uint32_t i = 0; i < FFmpegDecodeStats::kMaxLateDecodedFrames; ++i) {
    InsertSlowFrame(stats);
  }
  EXPECT_FALSE(stats.IsDecodingSlow());
}

TEST(FFmpegDecodeStatsTest, BecomesSlow)
{
  FFmpegDecodeStats stats;
  for (uint32_t i = 0; i < FFmpegDecodeStats::kMaxLateDecodedFrames + 1; ++i) {
    InsertSlowFrame(stats);
  }
  EXPECT_TRUE(stats.IsDecodingSlow());
}

TEST(FFmpegDecodeStatsTest, ResetsAfterGoodPlayback)
{
  FFmpegDecodeStats stats;

  // Drive into slow state.
  for (uint32_t i = 0; i < FFmpegDecodeStats::kMaxLateDecodedFrames + 1; ++i) {
    InsertSlowFrame(stats);
  }
  ASSERT_TRUE(stats.IsDecodingSlow());

  // A single fast frame with a huge duration triggers the correctPlaybackTime
  // check: (count - mLastDelayedFrameNum) * avgFrameDuration >> 3000 ms.
  InsertFastFrame(stats);
  EXPECT_FALSE(stats.IsDecodingSlow());
}

TEST(FFmpegDecodeStatsTest, ZeroDurationSkipped)
{
  FFmpegDecodeStats stats;
  // A zero (or negative) duration must be ignored -- not counted as late.
  for (uint32_t i = 0; i < FFmpegDecodeStats::kMaxLateDecodedFrames + 1; ++i) {
    stats.DecodeStart();
    stats.UpdateDecodeTimes(0);
  }
  EXPECT_FALSE(stats.IsDecodingSlow());
}
