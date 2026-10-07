/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#include <algorithm>
#include <cmath>
#include <tuple>

#include "AudioGenerator.h"
#include "AudioSampleFormat.h"
#include "CubebUtils.h"
#include "FrameStatistics.h"
#include "MediaData.h"
#include "MediaSinkTestUtils.h"
#include "MockCubeb.h"
#include "MockMediaDecoderOwner.h"
#include "TimeUnits.h"
#include "VideoSink.h"
#include "gtest/gtest.h"
#include "mozilla/Maybe.h"
#include "mozilla/SpinEventLoopUntil.h"
#include "mozilla/gtest/ScopedPrefSetter.h"
#include "nsThreadUtils.h"
#include "prthread.h"

using namespace mozilla;
using namespace mozilla::layers;

using media::TimeUnit;

// A/V sync for the default playback sink pair, a VideoSink over an
// AudioSinkWrapper.
//
// VideoSink gives the compositor (mediaTime, timeStamp) per frame, placing each
// frame relative to the clock it last read:
//
//   media  --+--------+--------+-->    timeStamp =
//            M0       M1       M2        clockTimeStamp
//   wall   --+--------+--------+-->      + (mediaTime - clock) / rate
//            T0       T1       T2
//            ^
//            +-- (clock, clockTimeStamp)
//
// In sync means every queued frame sits on that line. A schedule still anchored
// to a superseded clock, as a seek, a stream handoff or a rate change can
// leave, puts the picture exactly that far from the sound.
//
// The clock is driven by hand, so real time is not part of the measurement.
// Sampling live playback was tried and could not be stabilised: MockCubeb's
// automatic mode drifts from the wall clock, and how far it drifts follows the
// hardware, the operating system and its version, the build type, the load on
// the machine and even the ambient temperature. None of that is a property of
// the code under test, and no tolerance tells it apart from a real desync.
//
// Limit: this checks the schedule against the clock, not whether the clock
// itself is right about audible audio, and nothing below the sink. The clock
// on its own is covered by the AudioClock cases in TestAudioClock.cpp and the
// sink that reports it by TestAudioSinkWrapper.cpp.

namespace {

class AVSyncTest : public ::testing::Test {
 protected:
  void SetUp() override {
    ENSURE_TAIL_DISPATCH(SetUp);
    MOZ_ASSERT(NS_IsMainThread());
    mInfo.EnableAudio();
    mInfo.EnableVideo();
    mThread = NS_GetCurrentThread();
  }

  // Only the ordering is done here. Every member cleans itself up, and they
  // are declared so that destruction already runs sink before stream before
  // context.
  void TearDown() override {
    ENSURE_TAIL_DISPATCH(TearDown);
    mInitListener.DisconnectIfExists();
    mVerificationListener.DisconnectIfExists();
    if (mVideoSink) {
      // Stop() asserts the sink started, and a failed Start() reaches here.
      if (mVideoSink->IsStarted()) {
        mVideoSink->Stop();
      }
      mVideoSink->Shutdown();
      ProcessPending();
    }
    if (mContainer) {
      mContainer->ForgetElement();
    }
  }

  // media.video-queue.send-to-compositor-size. At 1 the render timer drives
  // every update; at 9999 the compositor holds the schedule. Separate paths.
  static constexpr uint32_t kThrottledQueueSize = 1;
  static constexpr uint32_t kUnthrottledQueueSize = 9999;

  // The cubeb context is process-wide, so it is the one thing here that has to
  // be put back rather than simply dropped.
  class ScopedCubebContext {
   public:
    explicit ScopedCubebContext(MockCubeb* aCubeb) {
      CubebUtils::ForceSetCubebContext(aCubeb->AsCubebContext());
    }
    ~ScopedCubebContext() { CubebUtils::ForceSetCubebContext(nullptr); }
  };

  // Manual mode: the clock only moves when a test drives a callback.
  void CreateSink(uint32_t aOutputLatencyFrames = 0,
                  uint32_t aCompositorQueueSize = kUnthrottledQueueSize) {
    mCubeb = new MockCubeb(MockCubeb::RunningMode::Manual);
    mCubeb->SetDefaultOutputLatencyFrames(aOutputLatencyFrames);
    mCubebContext.emplace(mCubeb);

    mAudioSink = MakeAudioSinkWrapper(mAudioQueue, mInfo, /*volume*/ 1.0);
    mOwner = std::make_unique<MockMediaDecoderOwner>();
    mContainer = MakeSinkTestVideoFrameContainer(mOwner.get());
    mImage = MakeSinkTest1x1Image(mContainer->GetImageContainer());
    mFrameStats = new FrameStatistics();
    mVideoSink =
        new VideoSink(AbstractThread::GetCurrent(), mAudioSink, mVideoQueue,
                      mContainer, *mFrameStats, aCompositorQueueSize);

    mInitListener = mCubeb->StreamInitEvent().Connect(
        mThread, [this](RefPtr<SmartMockCubebStream> aStream) {
          mStream = std::move(aStream);
          // Reported once the stream stops, so it has to be hooked up here. A
          // seek can build a second stream, and rebinding over a live listener
          // asserts, so drop the previous one first.
          mVerificationListener.DisconnectIfExists();
          mVerificationListener = mStream->OutputVerificationEvent().Connect(
              mThread, [this](std::tuple<uint64_t, float, uint32_t> aSeen) {
                mOutputVerification = Some(aSeen);
              });
        });
  }

  // The sinks do their work on this thread, so anything queued by a call here
  // only runs once the loop is pumped. Call this after driving the sink when
  // the next step needs the result.
  void ProcessPending() { NS_ProcessPendingEvents(mThread); }

  // Muted playback has no audio sink, so no stream.
  enum class ExpectedAudioStream { No, Yes };

  void Start(const TimeUnit& aTime,
             MediaSink::StartType aStartType = MediaSink::StartType::Initial,
             ExpectedAudioStream aExpected = ExpectedAudioStream::Yes) {
    EXPECT_EQ(mVideoSink->Start(aTime, mInfo, aStartType), NS_OK);
    // Playback needs SetPlaying(), but Start() may already have begun the
    // clock and setting it twice asserts.
    if (!mVideoSink->IsPlaying()) {
      mVideoSink->SetPlaying(true);
    }
    ProcessPending();
    if (aExpected == ExpectedAudioStream::Yes) {
      EXPECT_TRUE(mStream) << "playback created no audio stream";
    } else {
      EXPECT_FALSE(mStream) << "muted playback must not create an audio stream";
    }
  }

  void SeekStop() {
    if (mVideoSink->IsPlaying()) {
      mVideoSink->SetPlaying(false, MediaSink::StopReason::Seeking);
    }
    mVideoSink->Stop(MediaSink::StopReason::Seeking);
    ProcessPending();
  }

  // A decoder hands the sink one packet at a time: 1024 frames for AAC LC,
  // about 1152 for mp3, and 20ms to 120ms for Opus. 1024 sits in that range
  // and well under the sink's ring buffer, which is as small as 400ms and
  // silently refuses anything larger whole, leaving the clock stopped.
  static constexpr uint32_t kAudioPacketFrames = 1024;

  // A sine rather than a constant, with the phase taken from each frame's
  // position in the stream so packets join seamlessly. The amplitude then
  // describes where in the stream a frame came from, which is what makes the
  // audio checkable at the device end: the frequency the device measures is
  // only the queued one if the frames arrived whole and in order. A constant
  // carries no position, so a repeat or a swap looks identical to the real
  // thing and there is no frequency to compare against either. MockCubeb's
  // verifier is fixed at 100Hz and scales its tolerance to the shared
  // generator's amplitude, so both come from there rather than being picked
  // here.
  static constexpr uint32_t kAudioFrequency = 100;

  // Queues at least aDuration of audio: packets are whole, so a duration that
  // is not a multiple of one rounds up. The tests only need enough audio to
  // keep the clock running, so covering slightly more is harmless.
  void PushAudio(const TimeUnit& aStart, const TimeUnit& aDuration) {
    const uint32_t channels = mInfo.mAudio.mChannels;
    const uint32_t rate = mInfo.mAudio.mRate;
    const TimeUnit packetDuration = TimeUnit(kAudioPacketFrames, rate);
    const TimeUnit end = aStart + aDuration;
    for (TimeUnit t = aStart; t < end; t = t + packetDuration) {
      AlignedAudioBuffer buffer(kAudioPacketFrames * channels);
      const int64_t startFrame = t.ToTicksAtRate(rate);
      for (uint32_t frame = 0; frame < kAudioPacketFrames; ++frame) {
        const double phase = 2.0 * M_PI * kAudioFrequency *
                             static_cast<double>(startFrame + frame) / rate;
        const AudioDataValue sample = static_cast<AudioDataValue>(
            AudioGenerator<AudioDataValue>::Amplitude() * std::sin(phase));
        for (uint32_t channel = 0; channel < channels; ++channel) {
          buffer[frame * channels + channel] = sample;
        }
      }
      mAudioQueue.Push(new AudioData(0, t, std::move(buffer), channels, rate));
    }
  }

  void PushVideoFrame(const TimeUnit& aStart, const TimeUnit& aDuration) {
    RefPtr frame = VideoData::CreateFromImage(
        gfx::IntSize(1, 1), /*aOffset*/ 0, aStart, aDuration, mImage,
        /*aKeyframe*/ true, /*aTimecode*/ aStart);
    frame->mFrameID = mContainer->NewFrameID();
    mVideoQueue.Push(frame);
  }

  void PushVideoFrames(const TimeUnit& aStart, const TimeUnit& aDuration,
                       uint32_t aCount) {
    TimeUnit t = aStart;
    for (uint32_t i = 0; i < aCount; ++i) {
      PushVideoFrame(t, aDuration);
      t = t + aDuration;
    }
    ProcessPending();
  }

  // 30fps by default, the common case for playback. Tests that care about the
  // rate set it. Audio has no equivalent: it is queued in decoder-sized
  // packets rather than in frames of a fixed duration.
  double mVideoFps = 30.0;
  TimeUnit VideoFrameDuration() const {
    return TimeUnit::FromSeconds(1.0 / mVideoFps);
  }

  // Audio and video of the same length, so neither runs out before the other.
  static constexpr double kSteadyContentSec = 4.0;
  void PushSteadyContent(const TimeUnit& aStart = TimeUnit::Zero()) {
    PushVideoFrames(aStart, VideoFrameDuration(),
                    static_cast<uint32_t>(kSteadyContentSec * mVideoFps));
    PushAudio(aStart, TimeUnit::FromSeconds(kSteadyContentSec));
  }

  // Steps past the transient not-yet-started state after a stream start.
  void DriveCallback(long aFrames) {
    if (!mStream) {
      ADD_FAILURE() << "no audio stream to drive";
      return;
    }
    // A stream built for a seek resume is created and started off this thread,
    // so the stream can exist while it is not yet running, and pumping this
    // thread's queue does not advance the start. Wait on the clock: a count of
    // attempts is not a wait at all, since a machine slow enough to matter
    // exhausts any count in less time than the start needs.
    const TimeStamp deadline = TimeStamp::Now() + TimeDuration::FromSeconds(5);
    while (true) {
      auto r = mStream->ManualDataCallback(aFrames);
      ProcessPending();
      if (r != MockCubebStream::KeepProcessing::InvalidState) {
        return;
      }
      if (TimeStamp::Now() > deadline) {
        ADD_FAILURE() << "audio stream never started";
        return;
      }
      PR_Sleep(PR_MillisecondsToInterval(1));
    }
  }

  // Frames the device asks for per callback. 512 is typical of macOS, 441 of
  // Windows, and Linux is usually larger; most but not all are powers of two.
  // Tests that care about the size set it, the rest take the default.
  long mCallbackFrames = 512;

  // Callbacks are the only thing that advances the clock.
  void AdvanceClock(uint32_t aCallbacks) {
    for (uint32_t i = 0; i < aCallbacks; ++i) {
      DriveCallback(mCallbackFrames);
    }
  }

  // Waits for the sink to hand the compositor a schedule derived from the clock
  // as it now stands. The sink re-derives on its own update timer, so a check
  // made before that arrives would compare an old schedule against a new clock.
  void WaitForRenderedSchedule(const char* aWhen) {
    // ImageContainer bumps this counter whenever the sink replaces the images
    // it holds, so a change means a schedule was handed over rather than
    // merely re-read.
    auto generation = [this] {
      nsTArray<ImageContainer::OwningImage> images;
      uint32_t generation = 0;
      mContainer->GetImageContainer()->GetCurrentImages(&images, &generation);
      return generation;
    };
    const uint32_t before = generation();
    // SpinEventLoopUntil only gives up when the event queue runs dry; while the
    // sink keeps its timer going it would spin forever, and the harness would
    // kill the whole suite after its no-output timeout without saying which
    // assertion was waiting. Bound it here so the failure names itself.
    const TimeStamp deadline = TimeStamp::Now() + TimeDuration::FromSeconds(5);
    bool timedOut = false;
    const bool spun =
        SpinEventLoopUntil("AVSyncTest schedule re-derivation"_ns, [&] {
          if (generation() != before) {
            return true;
          }
          if (TimeStamp::Now() > deadline) {
            timedOut = true;
            return true;
          }
          return false;
        });
    EXPECT_TRUE(spun) << "event processing stopped while waiting " << aWhen;
    EXPECT_FALSE(timedOut)
        << "the sink did not hand the compositor a new schedule " << aWhen;
  }

  // Every image the compositor holds must sit on the line the sink derives
  // from the clock: an image for media time M belongs at t + (M - clock)/rate.
  //
  //   wall
  //    |                          . M2        slope = 1 / rate
  //    |                      .
  //   t +- - - - - - - - -o M1
  //    |             .    :
  //    |         . M0     :
  //    +------------------:----------------- media time
  //                     clock
  //
  // Anchor and slope are both pinned: a superseded clock shifts every frame
  // equally, a wrong rate tilts the line.
  //
  // Rearranged, each image implies the instant the sink anchored on, and that
  // instant must already have passed. Reading the clock here samples a later
  // instant than the sink did, by however long the machine took to get from
  // one to the other, so the implied anchor trails now by an amount that is
  // not ours to predict. A superseded clock moves it the other way, ahead of
  // now by the distance the clock has since advanced, and no correct schedule
  // is anchored in the future:
  //
  //        <---- lag, loosely bounded ----><- lead, tightly bounded
  //   -----+--------------------------------+------------------------> wall
  //      anchor                            now
  //      (fresh)                                    anchor (stale)
  //
  // So the two directions get very different bounds. The tight side is the one
  // that catches the bug, and it no longer has to absorb scheduling noise.
  static constexpr double kMaxAnchorLagSec = 0.250;
  static constexpr double kMaxAnchorLeadSec = 0.002;

  void ExpectScheduleMatchesClock(const char* aWhen) {
    TimeStamp t;
    const TimeUnit clock = mVideoSink->GetPosition(&t);
    const double rate = mVideoSink->PlaybackRate();
    ASSERT_GT(rate, 0.0);

    nsTArray<ImageContainer::OwningImage> images;
    mContainer->GetImageContainer()->GetCurrentImages(&images);
    if (images.IsEmpty()) {
      ADD_FAILURE() << "no frames handed to the compositor " << aWhen;
      return;
    }

    uint32_t checked = 0;
    for (const auto& image : images) {
      if (!image.mMediaTime.IsValid() || image.mMediaTime.IsNegative()) {
        continue;
      }
      const double wanted = (image.mMediaTime - clock).ToSeconds() / rate;
      const double got = (image.mTimeStamp - t).ToSeconds();
      const double lead = got - wanted;
      EXPECT_LE(lead, kMaxAnchorLeadSec)
          << "frame at " << image.mMediaTime.ToSeconds() << "s is scheduled "
          << got * 1000.0 << "ms from now, but a clock of " << clock.ToSeconds()
          << "s at rate " << rate << " calls for " << wanted * 1000.0
          << "ms, so the schedule is anchored " << lead * 1000.0
          << "ms in the future " << aWhen;
      EXPECT_GE(lead, -kMaxAnchorLagSec)
          << "frame at " << image.mMediaTime.ToSeconds() << "s is scheduled "
          << got * 1000.0 << "ms from now, but a clock of " << clock.ToSeconds()
          << "s at rate " << rate << " calls for " << wanted * 1000.0
          << "ms, so the schedule is anchored " << -lead * 1000.0
          << "ms too far back " << aWhen;
      ++checked;
    }
    EXPECT_EQ(size_t(checked), images.Length())
        << "the compositor holds frames with no media time " << aWhen;
  }

  // Consecutive frames must be spaced by their media-time gap over the rate:
  //
  //   media   M0 --dM--> M1 --dM--> M2
  //   wall    T0 --dT--> T1 --dT--> T2        dT == dM / rate
  //
  void ExpectCadenceMatchesRate(const char* aWhen) {
    // Both sides are differences between two images of one schedule, so the
    // instant the check runs cancels and nothing here depends on the machine.
    // That is what lets the bound be this tight.
    constexpr double kCadenceEpsilonSec = 0.002;
    const double rate = mVideoSink->PlaybackRate();
    nsTArray<ImageContainer::OwningImage> images;
    mContainer->GetImageContainer()->GetCurrentImages(&images);
    if (images.Length() < 2) {
      return;
    }
    for (size_t i = 1; i < images.Length(); ++i) {
      if (!images[i].mMediaTime.IsValid() ||
          !images[i - 1].mMediaTime.IsValid()) {
        continue;
      }
      const double wanted =
          (images[i].mMediaTime - images[i - 1].mMediaTime).ToSeconds() / rate;
      const double got =
          (images[i].mTimeStamp - images[i - 1].mTimeStamp).ToSeconds();
      EXPECT_NEAR(got, wanted, kCadenceEpsilonSec)
          << "frames " << images[i - 1].mMediaTime.ToSeconds() << "s and "
          << images[i].mMediaTime.ToSeconds() << "s are " << got * 1000.0
          << "ms apart, but rate " << rate << " calls for " << wanted * 1000.0
          << "ms " << aWhen;
    }
  }

  void ExpectCorrectClockAndCadence(const char* aWhen) {
    ExpectScheduleMatchesClock(aWhen);
    ExpectCadenceMatchesRate(aWhen);
  }

  MediaInfo mInfo;
  nsCOMPtr<nsIThread> mThread;
  std::unique_ptr<MockMediaDecoderOwner> mOwner;
  RefPtr<FrameStatistics> mFrameStats;
  RefPtr<VideoFrameContainer> mContainer;
  RefPtr<Image> mImage;
  MediaQueue<AudioData> mAudioQueue;
  MediaQueue<VideoData> mVideoQueue;
  RefPtr<MockCubeb> mCubeb;

  // Declared between the two so the stream is released, then the context put
  // back, then the mock dropped.
  Maybe<ScopedCubebContext> mCubebContext;

  RefPtr<SmartMockCubebStream> mStream;
  MediaEventListener mInitListener;
  MediaEventListener mVerificationListener;

  // Pre-silence, estimated frequency and discontinuity count, as the mock saw
  // them. Set when the stream stops.
  Maybe<std::tuple<uint64_t, float, uint32_t>> mOutputVerification;

  RefPtr<AudioSinkWrapper> mAudioSink;
  RefPtr<VideoSink> mVideoSink;
};

// The schedule must match the clock from the very first frames handed over.
TEST_F(AVSyncTest, ScheduleMatchesClockAtStart) {
  ENSURE_TEST_TAIL_DISPATCH();
  CreateSink();
  PushSteadyContent();
  Start(TimeUnit::Zero());

  ExpectCorrectClockAndCadence("at the start of playback");
}

// The schedule must be re-derived as the clock advances.
TEST_F(AVSyncTest, ScheduleFollowsAdvancingClock) {
  ENSURE_TEST_TAIL_DISPATCH();
  CreateSink();
  PushSteadyContent();
  Start(TimeUnit::Zero());

  // Re-check over several rounds rather than once, so a schedule that drifts
  // as the clock moves is caught rather than one that is merely right at the
  // start. Eight rounds of four callbacks covers about a second of media.
  for (uint32_t step = 0; step < 8; ++step) {
    SCOPED_TRACE(testing::Message() << "step " << step);
    AdvanceClock(4);
    WaitForRenderedSchedule("as the clock advanced");
    ExpectCorrectClockAndCadence("after the clock advanced");
  }
}

// The other cases check where frames are placed in time. This one checks the
// audio itself reaches the device whole, which is the other half of being in
// sync: a schedule can be perfect while the sound it is lined up against has
// gaps. The queued waveform carries its own position, so the mock can tell.
TEST_F(AVSyncTest, AudioReachesTheDeviceIntact) {
  ENSURE_TEST_TAIL_DISPATCH();
  CreateSink();
  PushSteadyContent();
  Start(TimeUnit::Zero());

  // Enough cycles for the frequency estimate to mean something.
  AdvanceClock(40);

  // Stopping is what makes the mock report what it received.
  mVideoSink->Stop();
  ProcessPending();

  ASSERT_TRUE(mOutputVerification)
  << "the mock reported no output";
  const auto [preSilence, frequency, discontinuities] = *mOutputVerification;
  EXPECT_EQ(static_cast<uint32_t>(frequency), kAudioFrequency)
      << "the device received a " << frequency
      << "Hz waveform, so the audio it played was not the audio queued";
  EXPECT_EQ(discontinuities, 0u)
      << "the audio reached the device with " << discontinuities
      << " breaks, so frames were dropped, repeated or reordered";
}

// A single-frame queue is only the default on Android, but the throttled path
// itself is platform-independent, so it is driven here on every platform: the
// render timer produces each update instead of the compositor holding a future
// schedule. Restricting this to Android would leave that path untested, since
// Android is also where these tests are least reliable to run.
TEST_F(AVSyncTest, ScheduleMatchesClockWithThrottledQueue) {
  ENSURE_TEST_TAIL_DISPATCH();
  CreateSink(/*aOutputLatencyFrames*/ 0, kThrottledQueueSize);
  PushSteadyContent();
  Start(TimeUnit::Zero());

  AdvanceClock(4);
  WaitForRenderedSchedule("with a throttled queue");
  ExpectCorrectClockAndCadence("with a throttled compositor queue");
}

// Variable frame rates are ordinary: screen and camera captures, WebRTC
// sources and containers that carry no fixed rate all deliver frames at
// uneven intervals. Each frame is placed from its own media time, so the
// spacing must follow the content rather than a nominal rate.
TEST_F(AVSyncTest, ScheduleMatchesClockWithVariableFrameDurations) {
  ENSURE_TEST_TAIL_DISPATCH();
  CreateSink();
  TimeUnit t = TimeUnit::Zero();
  // Durations spanning roughly 20fps to 60fps, the range such content uses.
  for (double sec : {0.016, 0.033, 0.050, 0.016, 0.041, 0.025, 0.033, 0.016}) {
    PushVideoFrame(t, TimeUnit::FromSeconds(sec));
    t = t + TimeUnit::FromSeconds(sec);
  }
  PushAudio(TimeUnit::Zero(), TimeUnit::FromSeconds(kSteadyContentSec));
  Start(TimeUnit::Zero());

  ExpectCorrectClockAndCadence("with variable frame durations");
  AdvanceClock(4);
  WaitForRenderedSchedule("with variable frame durations");
  ExpectCorrectClockAndCadence(
      "with variable frame durations after the clock advanced");
}

// Output latency means the speaker lags what the sink has written, so a seek
// resume on such a device is where the clock is most likely to run ahead of
// the sound.
TEST_F(AVSyncTest, ScheduleRebasedAfterSeekResumeOnHighLatencyDevice) {
  ENSURE_TEST_TAIL_DISPATCH();
  CreateSink(/*aOutputLatencyFrames*/ mInfo.mAudio.mRate / 10);
  PushSteadyContent();
  Start(TimeUnit::Zero());
  AdvanceClock(4);

  const TimeUnit target = TimeUnit::FromSeconds(10);
  SeekStop();
  mAudioQueue.Reset();
  mVideoQueue.Reset();
  PushSteadyContent(target);
  Start(target, MediaSink::StartType::SeekResume);

  ExpectCorrectClockAndCadence("after a seek resume on a high-latency device");
}

// Pausing and resuming also rebases the clock.
TEST_F(AVSyncTest, ScheduleRebasedAfterPauseResume) {
  ENSURE_TEST_TAIL_DISPATCH();
  CreateSink();
  PushSteadyContent();
  Start(TimeUnit::Zero());
  AdvanceClock(4);

  mVideoSink->SetPlaying(false);
  ProcessPending();
  EXPECT_FALSE(mVideoSink->IsPlaying());
  mVideoSink->SetPlaying(true);
  ProcessPending();

  WaitForRenderedSchedule("after the resume");
  ExpectCorrectClockAndCadence("after resuming from a pause");
}

// What content does when it assigns video.playbackRate: the sink must
// re-derive an existing schedule against a clock whose rate just changed.
TEST_F(AVSyncTest, ScheduleRebasedAfterRateChange) {
  ENSURE_TEST_TAIL_DISPATCH();
  CreateSink();
  PushSteadyContent();
  Start(TimeUnit::Zero());
  ExpectCorrectClockAndCadence("at the default rate");

  for (double rate : {2.0, 0.5, 4.0, 1.0}) {
    SCOPED_TRACE(testing::Message() << "changed to playbackRate=" << rate);
    mVideoSink->SetPlaybackRate(rate);
    ProcessPending();
    AdvanceClock(2);
    WaitForRenderedSchedule("after the rate change");
    ExpectCorrectClockAndCadence("after a mid-playback rate change");
  }
}

// Muted playback runs on the system clock; the schedule follows it the same.
TEST_F(AVSyncTest, ScheduleMatchesClockWhileMuted) {
  ENSURE_TEST_TAIL_DISPATCH();
  CreateSink();
  PushSteadyContent();
  mVideoSink->SetVolume(0.0);
  Start(TimeUnit::Zero(), MediaSink::StartType::Initial,
        ExpectedAudioStream::No);

  ExpectCorrectClockAndCadence("while muted");
}

// AVSyncTest always starts at the default rate, so it never covers the
// schedule the sink derives when a rate is already set before playback begins;
// its rate-change case only covers changing one mid-playback. Each rate is a
// separate case so a failing one names itself.
class AVSyncRateTest : public AVSyncTest,
                       public ::testing::WithParamInterface<double> {};

TEST_P(AVSyncRateTest, ScheduleMatchesClockAtStartingRate) {
  ENSURE_TEST_TAIL_DISPATCH();
  CreateSink();
  PushSteadyContent();
  mVideoSink->SetPlaybackRate(GetParam());
  Start(TimeUnit::Zero());

  ExpectCorrectClockAndCadence("at a non-default starting rate");
  AdvanceClock(4);
  WaitForRenderedSchedule("at a non-default rate");
  ExpectCorrectClockAndCadence(
      "at a non-default rate after the clock advanced");
}

INSTANTIATE_TEST_SUITE_P(PlaybackRates, AVSyncRateTest,
                         ::testing::Values(0.25, 0.5, 1.0, 1.5, 2.0, 4.0));

// The cases above run at one frame rate. The rate sets both the spacing the
// schedule must produce and how much of a frame the tolerance is worth, so
// the film, broadcast and high-rate cases are each covered.
class AVSyncFrameRateTest : public AVSyncTest,
                            public ::testing::WithParamInterface<double> {};

TEST_P(AVSyncFrameRateTest, ScheduleMatchesClockAtFrameRate) {
  ENSURE_TEST_TAIL_DISPATCH();
  mVideoFps = GetParam();
  CreateSink();
  PushSteadyContent();
  Start(TimeUnit::Zero());

  ExpectCorrectClockAndCadence("at a non-default frame rate");
  AdvanceClock(4);
  WaitForRenderedSchedule("at a non-default frame rate");
  ExpectCorrectClockAndCadence(
      "at a non-default frame rate after the clock advanced");
}

INSTANTIATE_TEST_SUITE_P(FrameRates, AVSyncFrameRateTest,
                         ::testing::Values(24.0, 25.0, 30.0, 50.0, 60.0,
                                           120.0));

// The clock moves in whole callbacks, so the size the device asks for sets how
// coarsely it advances. MockCubeb caps a callback at 1920 frames.
class AVSyncCallbackSizeTest : public AVSyncTest,
                               public ::testing::WithParamInterface<long> {};

TEST_P(AVSyncCallbackSizeTest, ScheduleMatchesClockAtCallbackSize) {
  ENSURE_TEST_TAIL_DISPATCH();
  mCallbackFrames = GetParam();
  CreateSink();
  PushSteadyContent();
  Start(TimeUnit::Zero());

  AdvanceClock(4);
  WaitForRenderedSchedule("at a non-default callback size");
  ExpectCorrectClockAndCadence(
      "at a non-default callback size after the clock advanced");
}

INSTANTIATE_TEST_SUITE_P(CallbackSizes, AVSyncCallbackSizeTest,
                         ::testing::Values(128, 441, 480, 512, 1024, 1920));

// A seek resume rebases the clock the video schedule is derived from. Each
// case runs for both stream-reuse settings, since one keeps the audio stream
// and its baseline across the seek and the other rebuilds them.
class AVSyncSeekTest : public AVSyncTest {
 protected:
  void RunSeekResume() {
    CreateSink();
    PushSteadyContent();
    Start(TimeUnit::Zero());
    AdvanceClock(4);
    WaitForRenderedSchedule("before the seek");
    ExpectCorrectClockAndCadence("before the seek");

    const TimeUnit target = TimeUnit::FromSeconds(10);
    SeekStop();
    mAudioQueue.Reset();
    mVideoQueue.Reset();
    PushSteadyContent(target);
    Start(target, MediaSink::StartType::SeekResume);

    ExpectCorrectClockAndCadence("after the seek resume");
    AdvanceClock(4);
    WaitForRenderedSchedule("after the seek");
    ExpectCorrectClockAndCadence("after the seek resume and further playback");
  }

  // Callback and output latency of one size, so a whole callback stays
  // unplayed. 882 frames is 20ms at 44100Hz and halves exactly.
  static constexpr long kUnplayedFrames = 882;

  TimeUnit RenderedAudio(long aFrames) const {
    return TimeUnit(aFrames, mInfo.mAudio.mRate);
  }

  // Draining aFrames renders exactly that much more audio, nothing else.
  void ExpectDrainingAdvancesClock(long aRemainingLatency, long aFrames,
                                   const char* aWhen) {
    const TimeUnit before = mAudioSink->GetPosition();
    mStream->SetOutputLatencyFrames(aRemainingLatency);
    const TimeUnit after = mAudioSink->GetPosition();
    EXPECT_EQ((after - before).ToMicroseconds(),
              RenderedAudio(aFrames).ToMicroseconds())
        << "draining " << aFrames << " frames moved the clock from "
        << before.ToSeconds() << "s to " << after.ToSeconds() << "s " << aWhen;
  }

  // The checks above hold whatever the clock says. This moves the rendered
  // audio with no new callback and requires the clock to follow it exactly.
  void RunClockFollowsRenderedAudio() {
    CreateSink(kUnplayedFrames);
    PushSteadyContent();
    Start(TimeUnit::Zero());
    AdvanceClock(4);

    // Seek while the device still holds a callback of pre-seek audio.
    const TimeUnit target = TimeUnit::FromSeconds(10);
    SeekStop();
    mAudioQueue.Reset();
    mVideoQueue.Reset();
    PushSteadyContent(target);
    Start(target, MediaSink::StartType::SeekResume);

    // Reach steady post-seek playback: a refilling sink would not be
    // measurable, and the audio must be audible for draining to mean anything.
    for (int i = 0; i < 6; ++i) {
      DriveCallback(kUnplayedFrames);
    }
    ASSERT_GT(mAudioSink->GetPosition().ToMicroseconds(),
              target.ToMicroseconds())
        << "no post-seek audio was rendered, so the sink never resumed";

    // Two halves with no callback between, so only the played amount changes.
    ExpectDrainingAdvancesClock(kUnplayedFrames / 2, kUnplayedFrames / 2,
                                "with half the unplayed audio drained");
    ExpectDrainingAdvancesClock(0, kUnplayedFrames / 2,
                                "with all the unplayed audio drained");
  }
};

TEST_F(AVSyncSeekTest, ScheduleRebasedAfterSeekResumeWithReusedStream) {
  ENSURE_TEST_TAIL_DISPATCH();
  ScopedPrefSetter reuse("media.audio.reuse-stream-on-seek", true);
  RunSeekResume();
}

TEST_F(AVSyncSeekTest, ScheduleRebasedAfterSeekResumeWithFreshStream) {
  ENSURE_TEST_TAIL_DISPATCH();
  ScopedPrefSetter reuse("media.audio.reuse-stream-on-seek", false);
  RunSeekResume();
}

TEST_F(AVSyncSeekTest, ClockFollowsRenderedAudioWithReusedStream) {
  ENSURE_TEST_TAIL_DISPATCH();
  ScopedPrefSetter reuse("media.audio.reuse-stream-on-seek", true);
  RunClockFollowsRenderedAudio();
}

TEST_F(AVSyncSeekTest, ClockFollowsRenderedAudioWithFreshStream) {
  ENSURE_TEST_TAIL_DISPATCH();
  ScopedPrefSetter reuse("media.audio.reuse-stream-on-seek", false);
  RunClockFollowsRenderedAudio();
}

}  // namespace
