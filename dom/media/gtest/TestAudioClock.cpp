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
// base position to 0, and replaces the serviced-frame history with the audio
// handed over but not yet played. The argument is a frame count, not a time: a
// stream reused across a seek keeps its counter climbing, so the clock is
// re-zeroed at the current count, while the seek target itself is applied
// separately by the sink. At 48000 Hz one second is exactly 48000 frames, so
// the expected microsecond values below are exact.

// Rebase at a non-zero count: after servicing frames, Rebase(currentRawCount)
// makes that count read as position 0, and later servicing advances from there.
TEST(AudioClock, RebaseOnReset)
{
  const uint32_t rate = 48000;
  AudioClock clock(rate);

  clock.UpdateFrameHistory(rate, 0, false);
  EXPECT_EQ(clock.GetPosition(rate), 1000000)
      << "one second of serviced frames reads as 1.0 s";

  clock.Rebase(rate, AudioClock::CarryUnplayed::Yes);
  EXPECT_EQ(clock.GetPosition(rate), 0)
      << "rebasing at the current count makes that count read as 0";

  clock.UpdateFrameHistory(rate / 2, 0, false);
  EXPECT_EQ(clock.GetPosition(rate + rate / 2), 500000)
      << "servicing half a second more reads as 0.5 s from the rebased base";

  clock.Rebase(rate + rate / 2, AudioClock::CarryUnplayed::Yes);
  EXPECT_EQ(clock.GetPosition(rate + rate / 2), 0)
      << "a second rebase re-zeroes again at the current count";
}

// Rebase at zero: the boundary case (RebaseLive falls back to Rebase(0) when
// the engine position reads 0). Nothing has been played, so all of the
// accumulated history is carried over as worth no media time.
TEST(AudioClock, RebaseToZero)
{
  const uint32_t rate = 48000;
  AudioClock clock(rate);

  clock.UpdateFrameHistory(rate, 0, false);
  EXPECT_EQ(clock.GetPosition(rate), 1000000)
      << "one second of serviced frames reads as 1.0 s";

  clock.Rebase(0, AudioClock::CarryUnplayed::Yes);
  EXPECT_EQ(clock.GetPosition(0), 0)
      << "Rebase(0) makes the current count read as 0";

  clock.UpdateFrameHistory(rate, 0, false);
  EXPECT_EQ(clock.GetPosition(rate), 0)
      << "the first second is the carried-over audio, so it reads as 0";
  EXPECT_EQ(clock.GetPosition(2 * rate), 1000000)
      << "the second past it was serviced after the rebase and reads as 1.0 s";
}

// A rebase mid-playback, where the play cursor trails the write cursor by the
// unplayed audio. Three 480-frame callbacks at 48000 Hz, two of them played:
//
//   frames:   0           960          1440          1920
//             |-----------|------------|-------------|
//             | heard     | unplayed   | written     |
//             | pre-seek  | at rebase  | post-seek   |
//   worth:    | 20 ms     | 0          | 10 ms       |
//                         ^
//                         rebase here
TEST(AudioClock, RebaseWithUnplayedAudio)
{
  const uint32_t rate = 48000;
  const uint32_t framesPerCallback = rate / 100;
  AudioClock clock(rate);

  // Write three callbacks, then pass GetPosition a play cursor that simulates
  // the device having played two of them, leaving one callback unplayed. That
  // is the phase where the defect is largest; a smaller gap shrinks it.
  for (int i = 0; i < 3; ++i) {
    clock.UpdateFrameHistory(framesPerCallback, 0, false);
  }
  const int64_t written = 3 * framesPerCallback;
  const int64_t played = 2 * framesPerCallback;
  const int64_t unplayed = written - played;
  EXPECT_EQ(clock.GetPosition(played), 20000)
      << "960 frames played reads as 20 ms";

  // The seek rebases the running stream at the play cursor.
  clock.Rebase(played, AudioClock::CarryUnplayed::Yes);
  EXPECT_EQ(clock.GetPosition(played), 0)
      << "the rebase count reads as the target";

  // Write the first post-seek callback, then walk the play cursor further into
  // the unplayed audio. Those frames were written before the rebase, so however
  // many of them the device plays, none of them is post-seek audio and the
  // position must not move.
  clock.UpdateFrameHistory(framesPerCallback, 0, false);
  EXPECT_EQ(clock.GetPosition(played + unplayed / 2), 0)
      << "half the unplayed audio played, all of it pre-seek, so still 0";
  EXPECT_EQ(clock.GetPosition(played + unplayed), 0)
      << "the last unplayed frame played, the final pre-seek one, so still 0";

  // Past the unplayed audio the device reaches what was written after the
  // rebase, and only that counts towards the position.
  EXPECT_EQ(clock.GetPosition(played + unplayed + rate / 1000), 1000)
      << "1 ms beyond the unplayed audio reads as 1 ms";
  EXPECT_EQ(clock.GetPosition(played + unplayed + framesPerCallback), 10000)
      << "a whole post-seek callback beyond it reads as 10 ms";

  // Write a second post-seek callback, so the same holds once the position has
  // to span two of them rather than one.
  clock.UpdateFrameHistory(framesPerCallback, 0, false);
  EXPECT_EQ(clock.GetPosition(played + unplayed + framesPerCallback +
                              framesPerCallback / 2),
            15000)
      << "one and a half post-seek callbacks beyond it reads as 15 ms";
  EXPECT_EQ(clock.GetPosition(played + unplayed + 2 * framesPerCallback), 20000)
      << "two post-seek callbacks beyond it reads as 20 ms";
}

// A backend position reported above the write cursor. The pair makes no sense,
// so nothing is carried and the clock counts up from the rebase.
//
//   frames:   0          1440   1920
//             |----------|       |
//             | written  |       ^ rebase reported here, past the write cursor
//   worth:    |          |       | counts up from 0
TEST(AudioClock, RebaseAboveWriteCursorCarriesNothing)
{
  const uint32_t rate = 48000;
  const uint32_t framesPerCallback = rate / 100;
  AudioClock clock(rate);

  for (int i = 0; i < 3; ++i) {
    clock.UpdateFrameHistory(framesPerCallback, 0, false);
  }
  const int64_t aboveWriteCursor = 4 * framesPerCallback;

  clock.Rebase(aboveWriteCursor, AudioClock::CarryUnplayed::Yes);
  EXPECT_EQ(clock.GetPosition(aboveWriteCursor), 0)
      << "the rebase count reads 0 with nothing carried";

  clock.UpdateFrameHistory(framesPerCallback, 0, false);
  EXPECT_EQ(clock.GetPosition(aboveWriteCursor + framesPerCallback / 2), 5000)
      << "the next callback advances from the rebase rather than being "
         "swallowed by an underflowed window";
}

// The same rebase without the carry, which a really-stopped backend gets: it
// discarded its queued audio, so nothing holds the position back.
//
//   frames:   0           960          1440
//             |-----------|------------|
//             | heard     | post-seek  |
//   worth:    | 20 ms     | counts up  |
//                         ^
//                         rebase, carrying nothing
TEST(AudioClock, RebaseWithoutCarryDoesNotHold)
{
  const uint32_t rate = 48000;
  const uint32_t framesPerCallback = rate / 100;
  AudioClock clock(rate);

  for (int i = 0; i < 3; ++i) {
    clock.UpdateFrameHistory(framesPerCallback, 0, false);
  }
  const int64_t played = 2 * framesPerCallback;

  clock.Rebase(played, AudioClock::CarryUnplayed::No);
  EXPECT_EQ(clock.GetPosition(played), 0) << "the rebase count still reads 0";

  clock.UpdateFrameHistory(framesPerCallback, 0, false);
  EXPECT_EQ(clock.GetPosition(played + framesPerCallback / 2), 5000)
      << "nothing is carried, so the next callback advances from the rebase";
}

// Underrun silence is what the carried window is usually made of, so the
// accounting uses each chunk's total frames, not just its serviced ones.
//
//   frames:   0           960          1440          1920
//             |-----------|------------|-------------|
//             | heard     | silence    | post-seek   |
//   worth:    | 20 ms     | 0          | counts up   |
//                         ^
//                         rebase
TEST(AudioClock, RebaseCarriesUnderrunFrames)
{
  const uint32_t rate = 48000;
  const uint32_t framesPerCallback = rate / 100;
  const int64_t played = 2 * framesPerCallback;
  AudioClock clock(rate);

  for (int i = 0; i < 2; ++i) {
    clock.UpdateFrameHistory(framesPerCallback, 0, false);
  }
  // A third callback that services nothing: pure underrun silence.
  clock.UpdateFrameHistory(0, framesPerCallback, false);
  EXPECT_EQ(clock.GetPosition(played), 20000)
      << "the serviced frames played read as 20 ms; the silence carries none";

  clock.Rebase(played, AudioClock::CarryUnplayed::Yes);
  clock.UpdateFrameHistory(framesPerCallback, 0, false);

  EXPECT_EQ(clock.GetPosition(played + rate / 1000), 0)
      << "the silence is unplayed audio, so playing into it reads 0";
  EXPECT_EQ(clock.GetPosition(played + framesPerCallback), 0)
      << "the last silent frame reads 0";
  EXPECT_EQ(clock.GetPosition(played + framesPerCallback + rate / 1000), 1000)
      << "1 ms past the silence reads as 1 ms";
}

// A second seek while the first carried chunk is still outstanding. The window
// comes from the frames handed over, so what the first rebase left behind in
// the history does not matter.
//
//   1st rebase at 960 carries 480; a callback lands; 2nd rebase at 1200:
//
//   frames:  1200 -------------------- 1920
//            | carried at 2nd rebase    | post-seek
//   worth:   | 0                        | counts up
TEST(AudioClock, ConsecutiveRebaseWithUnplayedAudio)
{
  const uint32_t rate = 48000;
  const uint32_t framesPerCallback = rate / 100;
  AudioClock clock(rate);

  for (int i = 0; i < 3; ++i) {
    clock.UpdateFrameHistory(framesPerCallback, 0, false);
  }
  const int64_t firstPlayed = 2 * framesPerCallback;
  EXPECT_EQ(clock.GetPosition(firstPlayed), 20000);

  clock.Rebase(firstPlayed, AudioClock::CarryUnplayed::Yes);
  clock.UpdateFrameHistory(framesPerCallback, 0, false);

  // Second seek, taken while the first carried chunk is still outstanding.
  const int64_t secondPlayed = firstPlayed + framesPerCallback / 2;
  clock.Rebase(secondPlayed, AudioClock::CarryUnplayed::Yes);
  clock.UpdateFrameHistory(framesPerCallback, 0, false);

  const int64_t unplayed = 3 * framesPerCallback / 2;
  EXPECT_EQ(clock.GetPosition(secondPlayed + unplayed), 0)
      << "everything outstanding at the second rebase reads 0";
  EXPECT_EQ(clock.GetPosition(secondPlayed + unplayed + rate / 1000), 1000)
      << "1 ms past it reads as 1 ms";
}

// Only macOS routes callback info through a queue, so only there can an item
// reach the history after a rebase. A seek stops the sink, so its callbacks are
// pure underrun, and a seek longer than the queue holds strands the overflow on
// the audio thread until a later callback flushes it. Those frames sit at or
// below the rebase anchor, and an underrun-only append merges into the first
// chunk, so applying them again would freeze the clock for the whole stranded
// amount.
//
//   frames:  0 ... 150 silent callbacks ... 71,520 --- 72,000
//                                          ^ rebase      ^ write cursor
TEST(AudioClock, RebaseAfterQueueOverflowOfSilence)
{
  const uint32_t rate = 48000;
  const uint32_t framesPerCallback = rate / 100;
  const uint32_t callbacks = 150;
  AudioClock clock(rate);

  for (uint32_t i = 0; i < callbacks; ++i) {
    clock.UpdateFrameHistory(0, framesPerCallback, false);
  }
  const int64_t written =
      static_cast<int64_t>(callbacks) * static_cast<int64_t>(framesPerCallback);
  const int64_t played = written - framesPerCallback;

  clock.Rebase(played, AudioClock::CarryUnplayed::Yes);
  clock.UpdateFrameHistory(framesPerCallback, 0, false);

  EXPECT_EQ(clock.GetPosition(written), 0) << "the unplayed window reads 0";
  EXPECT_EQ(clock.GetPosition(written + rate / 1000), 1000)
      << "1 ms past the carried window reads as 1 ms, not frozen by the "
         "stranded silence";
}
