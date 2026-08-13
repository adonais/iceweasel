/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "AudioStream.h"
#include "gtest/gtest.h"

using namespace mozilla;

// AudioClock maps the audio engine's raw frame counter -- an absolute,
// monotonically increasing frame position -- to a media-time position in
// microseconds. Rebase(rawCount) re-zeroes that mapping so the given raw count
// corresponds to media position 0: it sets the base offset to rawCount, the
// base position to 0, and clears the serviced-frame history. The argument is a
// frame count, not a time: a stream reused across a seek keeps its counter
// climbing, so the clock is re-zeroed at the current count, while the seek
// target itself is applied separately by the sink. At 48000 Hz one second is
// exactly 48000 frames, so the expected microsecond values below are exact.

// Rebase at a non-zero count: after servicing frames, Rebase(currentRawCount)
// makes that count read as position 0, and later servicing advances from there.
TEST(AudioClock, RebaseOnReset)
{
  const uint32_t rate = 48000;
  AudioClock clock(rate);

  clock.UpdateFrameHistory(rate, 0, false);
  EXPECT_EQ(clock.GetPosition(rate), 1000000)
      << "one second of serviced frames reads as 1.0 s";

  clock.Rebase(rate);
  EXPECT_EQ(clock.GetPosition(rate), 0)
      << "rebasing at the current count makes that count read as 0";

  clock.UpdateFrameHistory(rate / 2, 0, false);
  EXPECT_EQ(clock.GetPosition(rate + rate / 2), 500000)
      << "servicing half a second more reads as 0.5 s from the rebased base";

  clock.Rebase(rate + rate / 2);
  EXPECT_EQ(clock.GetPosition(rate + rate / 2), 0)
      << "a second rebase re-zeroes again at the current count";
}

// Rebase at zero: the boundary case (RebaseLive falls back to Rebase(0) when
// the engine position reads 0). It clears any accumulated history so the
// current count reads as 0, and later servicing accumulates from there.
TEST(AudioClock, RebaseToZero)
{
  const uint32_t rate = 48000;
  AudioClock clock(rate);

  clock.UpdateFrameHistory(rate, 0, false);
  EXPECT_EQ(clock.GetPosition(rate), 1000000)
      << "one second of serviced frames reads as 1.0 s";

  clock.Rebase(0);
  EXPECT_EQ(clock.GetPosition(0), 0)
      << "Rebase(0) clears accumulated history so the count reads as 0";

  clock.UpdateFrameHistory(rate, 0, false);
  EXPECT_EQ(clock.GetPosition(rate), 1000000)
      << "later servicing accumulates from the rebased zero";
}
