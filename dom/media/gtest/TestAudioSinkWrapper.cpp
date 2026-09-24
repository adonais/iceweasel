/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#include <algorithm>

#include "AudioSampleFormat.h"
#include "AudioSink.h"
#include "AudioSinkWrapper.h"
#include "CubebUtils.h"
#include "MediaData.h"
#include "MockCubeb.h"
#include "TimeUnits.h"
#include "gmock/gmock.h"
#include "gtest/gtest-printers.h"
#include "gtest/gtest.h"
#include "mozilla/Preferences.h"
#include "mozilla/SpinEventLoopUntil.h"
#include "mozilla/SyncRunnable.h"
#include "mozilla/gtest/WaitFor.h"
#include "nsThreadManager.h"
#include "nsThreadUtils.h"

using namespace mozilla;

// Build an AudioSinkWrapper whose sink creator draws from aQueue/aInfo. The
// references must outlive the returned wrapper (the tests keep them as locals
// or fixture members that do).
static RefPtr<AudioSinkWrapper> MakeAudioSinkWrapper(
    MediaQueue<AudioData>& aQueue, MediaInfo& aInfo, double aVolume) {
  auto creator = [&aQueue, &aInfo]() {
    return UniquePtr<AudioSink>{new AudioSink(AbstractThread::GetCurrent(),
                                              aQueue, aInfo.mAudio,
                                              /*resistFingerprinting*/ false)};
  };
  return new AudioSinkWrapper(
      AbstractThread::GetCurrent(), aQueue, std::move(creator), aVolume,
      /*playbackRate*/ 1.0, /*preservesPitch*/ true, /*sinkDevice*/ nullptr);
}

// This is a crashtest to check that AudioSinkWrapper::mEndedPromiseHolder is
// not settled twice when sync and async AudioSink initializations race.
TEST(TestAudioSinkWrapper, AsyncInitFailureWithSyncInitSuccess)
{
  MockCubeb* cubeb = new MockCubeb();
  CubebUtils::ForceSetCubebContext(cubeb->AsCubebContext());

  MediaQueue<AudioData> audioQueue;
  MediaInfo info;
  info.EnableAudio();
  // Volume 0.0 so that there is initially no AudioSink.
  RefPtr wrapper = MakeAudioSinkWrapper(audioQueue, info, /*volume*/ 0.0);

  wrapper->Start(media::TimeUnit::Zero(), info);
  // The first AudioSink init occurs on a background thread.  Listen for this,
  // but don't process any events on the current thread so that the
  // AudioSinkWrapper does not yet handle the result of AudioSink
  // initialization.
  RefPtr backgroundQueue =
      nsThreadManager::get().CreateBackgroundTaskQueue(__func__);
  Monitor monitor(__func__);
  bool initDone = false;
  MediaEventListener initListener = cubeb->StreamInitEvent().Connect(
      backgroundQueue, [&](RefPtr<SmartMockCubebStream> aStream) {
        EXPECT_EQ(aStream, nullptr);
        MonitorAutoLock lock(monitor);
        initDone = true;
        lock.Notify();
      });
  cubeb->ForceStreamInitError();
  wrapper->SetVolume(0.5);  // triggers async sink init, which fails
  {
    // Wait for the async init to complete.
    MonitorAutoLock lock(monitor);
    while (!initDone) {
      lock.Wait();
    }
  }
  initListener.Disconnect();
  wrapper->SetPlaying(false);
  // The second AudioSink init is synchronous.
  nsIThread* currentThread = NS_GetCurrentThread();
  RefPtr<SmartMockCubebStream> stream;
  initListener = cubeb->StreamInitEvent().Connect(
      currentThread, [&](RefPtr<SmartMockCubebStream> aStream) {
        stream = std::move(aStream);
      });
  wrapper->SetPlaying(true);  // sync sink init, which succeeds
  // Let AudioSinkWrapper handle the (first) AudioSink initialization failure
  // and allow `stream` to be set.
  NS_ProcessPendingEvents(currentThread);
  initListener.Disconnect();
  cubeb_state state = CUBEB_STATE_STARTED;
  MediaEventListener stateListener = stream->StateEvent().Connect(
      currentThread, [&](cubeb_state aState) { state = aState; });
  // Run AudioSinkWrapper::OnAudioEnded().
  // This test passes if there is no crash.  Bug 1845811.
  audioQueue.Finish();
  SpinEventLoopUntil("stream state change"_ns,
                     [&] { return state != CUBEB_STATE_STARTED; });
  stateListener.Disconnect();
  EXPECT_EQ(state, CUBEB_STATE_DRAINED);
  wrapper->Stop();
  wrapper->Shutdown();
}

// This is a crashtest to check that AudioSinkWrapper::mEndedPromiseHolder is
// not settled twice when the audio ends during async AudioSink initialization.
TEST(TestAudioSinkWrapper, AsyncInitWithEndOfAudio)
{
  MockCubeb* cubeb = new MockCubeb();
  CubebUtils::ForceSetCubebContext(cubeb->AsCubebContext());

  MediaQueue<AudioData> audioQueue;
  MediaInfo info;
  info.EnableAudio();
  // Volume 0.0 so that there is initially no AudioSink.
  RefPtr wrapper = MakeAudioSinkWrapper(audioQueue, info, /*volume*/ 0.0);

  wrapper->Start(media::TimeUnit::Zero(), info);
  // The first AudioSink init occurs on a background thread.  Listen for this,
  // but don't process any events on the current thread so that the
  // AudioSinkWrapper does not yet use the initialized AudioSink.
  RefPtr backgroundQueue =
      nsThreadManager::get().CreateBackgroundTaskQueue(__func__);
  Monitor monitor(__func__);
  RefPtr<SmartMockCubebStream> stream;
  MediaEventListener initListener = cubeb->StreamInitEvent().Connect(
      backgroundQueue, [&](RefPtr<SmartMockCubebStream> aStream) {
        EXPECT_NE(aStream, nullptr);
        MonitorAutoLock lock(monitor);
        stream = std::move(aStream);
        lock.Notify();
      });
  wrapper->SetVolume(0.5);  // triggers async sink init
  {
    // Wait for the async init to complete.
    MonitorAutoLock lock(monitor);
    while (!stream) {
      lock.Wait();
    }
  }
  initListener.Disconnect();
  // Finish the audio before AudioSinkWrapper considers using the initialized
  // AudioSink.
  audioQueue.Finish();
  // Wait for AudioSinkWrapper to destroy the initialized stream.
  // This test passes if there is no crash.  Bug 1846854.
  WaitFor(cubeb->StreamDestroyEvent());
  wrapper->Stop();
  wrapper->Shutdown();
}

// When playback has been advancing on the system clock while the audio stream
// (re)initializes (a seek resume or unmute), the switch to the audio clock must
// re-anchor to the system-clock position, not the audio stream's
// still-near-zero PLAYED position. Otherwise the reported position regresses by
// the cubeb output latency and the resume is observed about one position-update
// cycle late.
TEST(TestAudioSinkWrapper, ClockDoesNotRegressAtAudioStreamHandoff)
{
  MockCubeb* cubeb = new MockCubeb(MockCubeb::RunningMode::Manual);
  CubebUtils::ForceSetCubebContext(cubeb->AsCubebContext());

  MediaQueue<AudioData> audioQueue;
  MediaInfo info;
  info.EnableAudio();
  auto audioSinkCreator = [&]() {
    return UniquePtr<AudioSink>{new AudioSink(AbstractThread::GetCurrent(),
                                              audioQueue, info.mAudio,
                                              /*resistFingerprinting*/ false)};
  };
  // Start muted so there is initially no AudioSink and playback runs on the
  // system clock.
  RefPtr wrapper = new AudioSinkWrapper(
      AbstractThread::GetCurrent(), audioQueue, std::move(audioSinkCreator),
      /*initialVolume*/ 0.0, /*playbackRate*/ 1.0, /*preservesPitch*/ true,
      /*sinkDevice*/ nullptr);

  // Enough audio that the stream does not immediately drain.
  AlignedAudioBuffer samples(info.mAudio.mRate * info.mAudio.mChannels);
  RefPtr audio =
      new AudioData(/*aOffset*/ 0, media::TimeUnit::Zero(), std::move(samples),
                    info.mAudio.mChannels, info.mAudio.mRate);
  audioQueue.Push(audio);

  // Start() begins playback (sets the clock); the wrapper is muted, so there is
  // no AudioSink yet and playback runs on the system clock.
  wrapper->Start(media::TimeUnit::Zero(), info);
  // Sample once so the clock source latches to the system clock.
  wrapper->GetPosition();

  // Unmute: triggers asynchronous AudioSink init. With a manual MockCubeb the
  // data callback does not run until we drive it, so the stream's played
  // position stays at zero.
  auto initPromise = TakeN(cubeb->StreamInitEvent(), 1);
  wrapper->SetVolume(1.0);
  auto [stream] = WaitFor(initPromise).unwrap()[0];

  // Advance real time so the system clock moves clearly ahead of the
  // not-yet-played audio.
  const TimeDuration kAdvance = TimeDuration::FromMilliseconds(60);
  PR_Sleep(PR_MillisecondsToInterval(60));

  // Drive the audio callback once: the audio stream is now considered running,
  // but it has played almost nothing, so its played position is still near
  // zero.
  stream->ManualDataCallback(1);

  // The handoff to the audio clock must report the system-clock position, not
  // the audio's still-near-zero played position. The system clock advanced by
  // kAdvance (60 ms) while the stream played almost nothing, so a correct
  // handoff reports about 60 ms and the regression reports about 0 ms. The 0.04
  // s (40 ms) threshold sits well above the near-zero played position and well
  // below the 60 ms system clock, so it cleanly separates the two outcomes
  // while leaving margin for scheduling jitter in the sleep above.
  media::TimeUnit pos = wrapper->GetPosition();
  EXPECT_GE(pos.ToSeconds(), 0.04)
      << "clock regressed to the audio played position at the handoff (got "
      << pos.ToSeconds() << "s, expected to track the "
      << kAdvance.ToMilliseconds() << "ms system clock)";

  wrapper->Stop();
  wrapper->Shutdown();
}

// Whether a test enables the seek stream-reuse preference.
enum class ReuseStream { Enabled, Disabled };

// Fixture for the audio-stream seek-reuse tests. Each test calls
// CreateWrapper() to set up a MockCubeb, the reuse pref, a wrapper, and the
// stream init/destroy counters, then drives seeks through the
// SeekStop()/Start() helpers. The playback-clock situations covered here are
// described in dom/media/docs/AudioSinkWrapper.md; keep both in sync.
class AudioSinkWrapperReuseTest : public ::testing::Test {
 protected:
  void SetUp() override {
    mInfo.EnableAudio();
    mThread = NS_GetCurrentThread();
  }

  // Stop and shut the wrapper down after each test.
  void TearDown() override {
    mInitListener.DisconnectIfExists();
    mDestroyListener.DisconnectIfExists();
    if (mWrapper && !mWrapperShutDown) {
      mWrapper->Stop();
      mWrapper->Shutdown();
      ProcessPending();
      mWrapperShutDown = true;
    }
  }

  void CreateWrapper(
      ReuseStream aReuse = ReuseStream::Enabled,
      MockCubeb::RunningMode aMode = MockCubeb::RunningMode::Automatic) {
    mCubeb = new MockCubeb(aMode);
    CubebUtils::ForceSetCubebContext(mCubeb->AsCubebContext());
    Preferences::SetBool("media.audio.reuse-stream-on-seek",
                         aReuse == ReuseStream::Enabled);
    mWrapper = MakeAudioSinkWrapper(mAudioQueue, mInfo, /*volume*/ 1.0);
    mInitListener = mCubeb->StreamInitEvent().Connect(
        mThread, [this](RefPtr<SmartMockCubebStream> aStream) {
          ++mInits;
          mStream = std::move(aStream);
        });
    mDestroyListener = mCubeb->StreamDestroyEvent().Connect(
        mThread, [this](RefPtr<SmartMockCubebStream>) { ++mDestroys; });
  }

  void ProcessPending() { NS_ProcessPendingEvents(mThread); }

  // Start or resume playback at aTime, then drain pending events.
  void Start(const media::TimeUnit& aTime,
             MediaSink::StartType aStartType = MediaSink::StartType::Initial) {
    mWrapper->Start(aTime, mInfo, aStartType);
    ProcessPending();
  }

  // Simulate the stop half of a seek: the pause and the stop both carry the
  // seek reason.
  void SeekStop() {
    mWrapper->SetPlaying(false, MediaSink::StopReason::Seeking);
    mWrapper->Stop(MediaSink::StopReason::Seeking);
    ProcessPending();
  }

  // Frames pushed for a full pre- or post-seek audio buffer.
  static constexpr uint32_t kBufferFrames = 2048;
  // Sample values that distinguish pre-seek audio from post-seek audio.
  static constexpr AudioDataValue kPreSeekDataValue = 0.5f;
  static constexpr AudioDataValue kPostSeekDataValue = 0.25f;

  // Frames requested per manual data callback, kept under the mock's
  // per-callback frame cap so a callback is never rejected.
  static constexpr long kCallbackFrames = 512;
  // The mock device's output latency, the amount by which its play cursor
  // trails its write cursor.
  uint32_t OutputLatencyFrames() const { return mInfo.mAudio.mRate / 10; }
  // Upper bound on callbacks used to drain a buffer, so a test cannot loop
  // forever if the stream stops producing output early.
  static constexpr int kMaxDrainCallbacks = 64;
  // Upper bound on retries while a freshly started stream is still hopping to
  // the cubeb operation thread and reporting a not-yet-started state.
  static constexpr int kMaxStartRetries = 100;

  // Maximum the reported clock may lead the audible audio before it counts as a
  // desync. Large enough to absorb scheduling jitter from the tests' wall-clock
  // sleeps, small enough to still catch a real lead.
  static constexpr double kClockLeadToleranceSec = 0.04;
  // Contiguous post-seek buffers queued so callbacks driven after a resume do
  // not underrun the ring buffer.
  static constexpr uint32_t kPostSeekPackets = 8;
  // Real time to wait so the system clock measurably advances past the seek
  // target; must exceed kClockLeadToleranceSec so a wrongly advancing clock is
  // caught.
  static constexpr uint32_t kClockAdvanceSleepMs = 150;

  // Enqueue aFrames of constant-valued audio at aStart.
  void PushAudio(const media::TimeUnit& aStart, uint32_t aFrames,
                 AudioDataValue aValue) {
    const uint32_t channels = mInfo.mAudio.mChannels;
    AlignedAudioBuffer buffer(aFrames * channels);
    for (uint32_t i = 0; i < buffer.Length(); ++i) {
      buffer[i] = aValue;
    }
    mAudioQueue.Push(new AudioData(0, aStart, std::move(buffer), channels,
                                   mInfo.mAudio.mRate));
  }

  // Drive one manual data callback for aFrames, stepping past any transient
  // not-yet-started state as the stream start hops to the cubeb operation
  // thread. aFrames must stay under the mock's per-callback frame cap. Drains
  // the owner-thread event queue before returning, so callers observe settled
  // state (frame/state-event listeners) without a trailing ProcessPending().
  MockCubebStream::KeepProcessing DriveCallback(long aFrames) {
    for (int i = 0; i < kMaxStartRetries; ++i) {
      auto r = mStream->ManualDataCallback(aFrames);
      if (r != MockCubebStream::KeepProcessing::InvalidState) {
        ProcessPending();
        return r;
      }
      ProcessPending();
    }
    return MockCubebStream::KeepProcessing::InvalidState;
  }

  // Move the recorded output out of the stream, clearing it, and return it by
  // value. Calling this as a bare statement still clears the recording, whereas
  // discarding TakeRecordedOutput()'s rvalue reference directly would not.
  nsTArray<AudioDataValue> TakeRecorded() {
    return mStream->TakeRecordedOutput();
  }

  // Drive callbacks until aExpectedSamples interleaved samples have been
  // recorded, or the stream stops early through underrun or error, and return
  // everything played. A large buffer is drained across several callbacks.
  // Over-dropping shows up as a short return from an early underrun;
  // under-dropping shows up as stale sample values in the returned data.
  nsTArray<AudioDataValue> DrainRecordedOutput(uint32_t aExpectedSamples) {
    nsTArray<AudioDataValue> played;
    for (int i = 0;
         i < kMaxDrainCallbacks && played.Length() < aExpectedSamples; ++i) {
      auto r = DriveCallback(kCallbackFrames);
      played.AppendElements(TakeRecorded());
      if (r != MockCubebStream::KeepProcessing::Yes) {
        break;
      }
    }
    return played;
  }

  void ResumeWithData(uint32_t aFrames, AudioDataValue aValue,
                      const media::TimeUnit& aTarget) {
    mAudioQueue.Reset();
    PushAudio(aTarget, aFrames, aValue);
    Start(aTarget, MediaSink::StartType::SeekResume);
  }

  // Seek with reuse: stop, reset the decode queue as the decoder would across a
  // seek, then queue aPostFrames of post-seek audio at aTarget and resume.
  void SeekAndSupplyPostSeekAudio(uint32_t aPostFrames, AudioDataValue aValue,
                                  const media::TimeUnit& aTarget) {
    SeekStop();
    ResumeWithData(aPostFrames, aValue, aTarget);
  }

  nsTArray<AudioDataValue> PlayAudioFromStart(uint32_t aFrames,
                                              long aPlayFrames,
                                              AudioDataValue aValue) {
    PushAudio(media::TimeUnit::Zero(), aFrames, aValue);
    Start(media::TimeUnit::Zero());
    MOZ_RELEASE_ASSERT(mStream);
    mStream->SetOutputRecordingEnabled(true);
    DriveCallback(aPlayFrames);
    return TakeRecorded();
  }

  // Arrange a reused seek: start with aPreFrames of pre-seek audio, play
  // aPlayFrames of it so the remainder stays queued as stale, then seek and
  // queue aPostFrames of post-seek audio at aTarget. Output recording is
  // enabled so callers can assert on the exact samples played; the pre-seek
  // samples that played are returned.
  nsTArray<AudioDataValue> PlayPreSeekThenSeek(uint32_t aPreFrames,
                                               long aPlayFrames,
                                               AudioDataValue aPreValue,
                                               uint32_t aPostFrames,
                                               AudioDataValue aPostValue,
                                               const media::TimeUnit& aTarget) {
    nsTArray<AudioDataValue> prePlayed =
        PlayAudioFromStart(aPreFrames, aPlayFrames, aPreValue);
    SeekAndSupplyPostSeekAudio(aPostFrames, aPostValue, aTarget);
    return prePlayed;
  }

  static size_t SamplesMatchingNum(const nsTArray<AudioDataValue>& aSamples,
                                   AudioDataValue aValue) {
    return static_cast<size_t>(
        std::count(aSamples.begin(), aSamples.end(), aValue));
  }

  static size_t AudibleSamplesNum(const nsTArray<AudioDataValue>& aSamples) {
    return aSamples.Length() -
           SamplesMatchingNum(aSamples, static_cast<AudioDataValue>(0));
  }

  // Fails if the reported clock is ahead of the audible audio. The small
  // tolerance absorbs scheduling jitter from the tests' wall-clock sleeps; a
  // genuine desync is far larger than one position-update cycle.
  void ExpectClockNotAhead(const media::TimeUnit& aReported,
                           const media::TimeUnit& aAudiblePosition,
                           const char* aWhen) {
    EXPECT_LE((aReported - aAudiblePosition).ToSeconds(),
              kClockLeadToleranceSec)
        << "reported clock leads the audible audio " << aWhen
        << ": reported=" << aReported.ToSeconds()
        << " audible=" << aAudiblePosition.ToSeconds();
  }

  // While no audio is audible the clock is held, so it must stay exactly at
  // aTarget, not merely avoid running ahead.
  void ExpectClockHeldAt(const media::TimeUnit& aReported,
                         const media::TimeUnit& aTarget, const char* aWhen) {
    EXPECT_EQ(aReported.ToMicroseconds(), aTarget.ToMicroseconds())
        << "reported clock did not hold at the seek target " << aWhen
        << ": reported=" << aReported.ToSeconds()
        << " target=" << aTarget.ToSeconds();
  }

  // Play from time 0 until the device is holding a full output-latency window
  // of unplayed audio. Driving a single callback is not enough: the unplayed
  // amount at a seek taken from here would be one callback rather than the
  // latency, which is too small to distinguish a clock that reports written
  // audio from one that reports audible audio.
  void PlayFromZeroToSteadyState() {
    const uint32_t rate = mInfo.mAudio.mRate;
    const int preSeekCallbacks =
        static_cast<int>(OutputLatencyFrames() / kCallbackFrames) + 1;
    const uint32_t framesNeeded =
        static_cast<uint32_t>(preSeekCallbacks * kCallbackFrames);
    const uint32_t buffers = (framesNeeded + kBufferFrames - 1) / kBufferFrames;
    for (uint32_t i = 0; i < buffers; ++i) {
      PushAudio(
          media::TimeUnit(CheckedInt64(static_cast<int64_t>(i)) * kBufferFrames,
                          rate),
          kBufferFrames, kPreSeekDataValue);
    }
    Start(media::TimeUnit::Zero());
    for (int i = 0; i < preSeekCallbacks; ++i) {
      ASSERT_EQ(DriveCallback(kCallbackFrames),
                MockCubebStream::KeepProcessing::Yes);
    }
  }

  // Seek, then resume playback at aTarget with post-seek audio queued.
  void SeekAndResumeAt(const media::TimeUnit& aTarget) {
    SeekStop();
    mAudioQueue.Reset();
    // Queue enough contiguous post-seek buffers to feed the callbacks driven
    // later without underrunning the ring buffer.
    for (uint32_t i = 0; i < kPostSeekPackets; ++i) {
      PushAudio(
          aTarget + media::TimeUnit(
                        CheckedInt64(static_cast<int64_t>(i)) * kBufferFrames,
                        mInfo.mAudio.mRate),
          kBufferFrames, kPostSeekDataValue);
    }
    mWrapper->Start(aTarget, mInfo, MediaSink::StartType::SeekResume);
    // Drain the owner-thread work the resume dispatches: the stash reuse, or
    // the start of async sink creation.
    ProcessPending();
  }

  // While no audio is audible yet, the reported clock must stay put at aTarget,
  // not run ahead on the system clock. The sleeps let real wall-clock time pass
  // across the resume window: a clock wrongly following the system clock would
  // lead the target by that elapsed time, while the correct clock, following
  // the not-yet-audible audio stream, stays at the target.
  void ExpectClockHoldsAtTargetWhileSilent(const media::TimeUnit& aTarget,
                                           ReuseStream aReuse) {
    if (aReuse == ReuseStream::Disabled) {
      // Fresh stream still initializing: no sink exists yet.
      PR_Sleep(PR_MillisecondsToInterval(kClockAdvanceSleepMs));
      ExpectClockHeldAt(mWrapper->GetPosition(), aTarget, "during async init");
      // The recreated stream's async init hops to a background thread; wait for
      // the second stream to appear, then drain.
      SpinEventLoopUntil("post-seek stream init"_ns,
                         [this] { return mInits == 2; });
      ProcessPending();
    }
    // Sink exists, but no callback has produced audio yet.
    PR_Sleep(PR_MillisecondsToInterval(kClockAdvanceSleepMs));
    ExpectClockHeldAt(mWrapper->GetPosition(), aTarget,
                      "across the resume gap");
  }

  // Once post-seek audio plays, the reported clock advances but never leads the
  // audible audio: it stays at or behind the most recently written audio, since
  // the play cursor can only trail the write cursor. Callbacks are paced in
  // real time so the play cursor climbs out of the device-latency window.
  void ExpectClockFollowsAudioOncePlaying(const media::TimeUnit& aTarget) {
    const uint32_t rate = mInfo.mAudio.mRate;
    // Drive enough callbacks that the play cursor clears the output-latency
    // window and settles into steady state.
    const int steadyStateCallbacks =
        static_cast<int>(OutputLatencyFrames() / kCallbackFrames) + 5;
    int64_t framesFed = 0;
    for (int i = 0; i < steadyStateCallbacks; ++i) {
      ASSERT_EQ(DriveCallback(kCallbackFrames),
                MockCubebStream::KeepProcessing::Yes);
      framesFed += kCallbackFrames;
      if (framesFed < static_cast<int64_t>(OutputLatencyFrames())) {
        // The device is still draining the carried window, so none of the
        // post-seek audio is audible yet and the clock must hold exactly at the
        // target rather than creep forward with the frames written.
        ExpectClockHeldAt(mWrapper->GetPosition(), aTarget,
                          "while the carried window drains");
      }
      // Pace callbacks at the rate a real device consumes them so wall-clock
      // time advances in step with the frames fed; a clock that wrongly sampled
      // the system clock would then be caught leading the audible audio.
      const uint32_t sleepMsPerCallback = 1000 * kCallbackFrames / rate;
      PR_Sleep(PR_MillisecondsToInterval(sleepMsPerCallback));
    }

    // The audible position: the play cursor, which trails the write cursor by
    // the output latency.
    const int64_t audibleFrames =
        framesFed - static_cast<int64_t>(OutputLatencyFrames());
    const media::TimeUnit audiblePosition =
        aTarget + media::TimeUnit(CheckedInt64(audibleFrames), rate);

    // Upper bound: the clock may not lead the audible audio. Bounding it by
    // everything written instead would leave a whole output-latency window of
    // slack, which is wide enough for a clock reporting written-but-unheard
    // audio to pass.
    ExpectClockNotAhead(mWrapper->GetPosition(), audiblePosition,
                        "in steady state");

    // Lower bound: the clock must have caught up to the audible audio, proving
    // the hold released and the clock now tracks the audio rather than staying
    // frozen at the target.
    EXPECT_GE(mWrapper->GetPosition().ToSeconds(),
              audiblePosition.ToSeconds() - kClockLeadToleranceSec)
        << "reported clock lags the audible audio in steady state: reported="
        << mWrapper->GetPosition().ToSeconds()
        << " audible=" << audiblePosition.ToSeconds();
  }

  // Begin a seek resume while muted: no audio sink is created, so playback runs
  // on the system clock, as when a muted element is seeked.
  void StartMutedSeekResume(const media::TimeUnit& aTarget) {
    PushAudio(aTarget, kBufferFrames, kPostSeekDataValue);
    mWrapper->SetVolume(0.0);
    mWrapper->Start(aTarget, mInfo, MediaSink::StartType::SeekResume);
    ProcessPending();
  }

  // Let real wall-clock time pass so the muted system clock advances past the
  // seek target, and return the reported position at that point.
  media::TimeUnit AdvanceMutedSystemClockPastTarget(
      const media::TimeUnit& aTarget) {
    PR_Sleep(PR_MillisecondsToInterval(kClockAdvanceSleepMs));
    const media::TimeUnit pos = mWrapper->GetPosition();
    EXPECT_GT(pos.ToSeconds(), aTarget.ToSeconds())
        << "system clock should advance past the seek target while muted";
    return pos;
  }

  // Unmute and assert the reported clock does not regress below aBefore.
  // Unmuting begins asynchronous sink creation, so no sink exists yet when the
  // position is read; a stale seek-resume hold would surface here.
  void ExpectUnmuteDoesNotRegressClock(const media::TimeUnit& aBefore) {
    mWrapper->SetVolume(1.0);
    EXPECT_GE(mWrapper->GetPosition().ToSeconds(), aBefore.ToSeconds())
        << "clock regressed on unmute after a muted seek resume";
  }

  void RunSeekResumeClockFollowsAudible(ReuseStream aReuse);
  void RunMutedSeekResumeThenUnmuteDoesNotRegress();
  void RunReuseAcrossSeek(ReuseStream aReuse);

  MockCubeb* mCubeb = nullptr;
  nsIThread* mThread = nullptr;
  MediaQueue<AudioData> mAudioQueue;
  MediaInfo mInfo;
  RefPtr<AudioSinkWrapper> mWrapper;
  RefPtr<SmartMockCubebStream> mStream;
  int mInits = 0;
  int mDestroys = 0;
  MediaEventListener mInitListener;
  MediaEventListener mDestroyListener;
  bool mWrapperShutDown = false;
};

// With stream reuse enabled, a seek keeps the audio stream alive and reuses it
// across the stop/start cycle; with reuse disabled, the stream is torn down and
// recreated.
void AudioSinkWrapperReuseTest::RunReuseAcrossSeek(ReuseStream aReuse) {
  const bool reuse = aReuse == ReuseStream::Enabled;
  CreateWrapper(aReuse);

  // Initial start creates and starts one cubeb stream.
  Start(media::TimeUnit::Zero());
  EXPECT_EQ(mInits, 1);
  EXPECT_EQ(mDestroys, 0);

  // Simulate a seek: the pause and the stop both carry the seek reason, then
  // the sink restarts once decoding reaches the target.
  SeekStop();
  if (reuse) {
    EXPECT_EQ(mDestroys, 0) << "stream should be stashed, not destroyed";
  } else {
    EXPECT_EQ(mDestroys, 1) << "stream should be destroyed when reuse is off";
  }

  Start(media::TimeUnit::FromSeconds(10));
  if (reuse) {
    EXPECT_EQ(mInits, 1) << "stream should be reused, not recreated";
    EXPECT_EQ(mDestroys, 0);
  } else {
    EXPECT_EQ(mInits, 2) << "a new stream should be created when reuse is off";
  }
}

TEST_F(AudioSinkWrapperReuseTest, StreamReusedAcrossSeek) {
  RunReuseAcrossSeek(ReuseStream::Enabled);
}

TEST_F(AudioSinkWrapperReuseTest, StreamRecreatedAcrossSeekWhenReuseDisabled) {
  RunReuseAcrossSeek(ReuseStream::Disabled);
}

// A sink stashed for seek reuse but never resumed, because shutdown happens
// first, must be torn down, not leaked.
TEST_F(AudioSinkWrapperReuseTest, StashedSinkDiscardedOnShutdown) {
  CreateWrapper();
  Start(media::TimeUnit::Zero());
  EXPECT_EQ(mInits, 1);

  // Seek with reuse enabled and stop, so the sink is stashed with its stream
  // kept alive.
  SeekStop();
  EXPECT_EQ(mDestroys, 0) << "stream should be stashed, not destroyed";

  // Shut down instead of resuming.
  mWrapper->Shutdown();
  ProcessPending();
  EXPECT_EQ(mDestroys, 1) << "stashed stream must be destroyed on shutdown";
  mWrapperShutDown = true;
}

// A stream that fails or reaches end-of-stream while stashed for reuse cannot
// be resumed, so the next start must recreate it rather than reuse a dead
// stream that would otherwise hang. An induced error stands in for the
// end-of-stream case, which reaches the same reuse guard.
TEST_F(AudioSinkWrapperReuseTest, DeadStreamWhileStashedIsRecreatedNotReused) {
  CreateWrapper();
  Start(media::TimeUnit::Zero());
  EXPECT_EQ(mInits, 1);
  ASSERT_TRUE(mStream);

  // Seek with reuse: the stream is stashed and kept running, not destroyed.
  SeekStop();
  EXPECT_EQ(mDestroys, 0) << "stream should be stashed, not destroyed";

  // The stashed stream dies before the resume.
  cubeb_state state = CUBEB_STATE_STARTED;
  MediaEventListener stateListener = mStream->StateEvent().Connect(
      mThread, [&](cubeb_state aState) { state = aState; });
  mStream->ForceError();
  SpinEventLoopUntil("stashed stream error"_ns,
                     [&] { return state == CUBEB_STATE_ERROR; });
  stateListener.Disconnect();

  // Resuming must recreate rather than reuse the dead stream.
  Start(media::TimeUnit::FromSeconds(10));
  EXPECT_EQ(mDestroys, 1) << "dead stashed stream should be discarded";
  EXPECT_EQ(mInits, 2) << "a fresh stream should be created, not the dead one";
}

// A seek stashes the sink with its cubeb stream still running, so the callback
// keeps consuming the ring buffer while the sink is stopped. What is left there
// is audio from the position being left behind, so nothing but silence may
// reach the backend until the seek resumes, and the resume must still reuse the
// stream and play the post-seek audio in full.
TEST_F(AudioSinkWrapperReuseTest, OnlySilenceAudioOutputDuringSeeking) {
  CreateWrapper(ReuseStream::Enabled, MockCubeb::RunningMode::Manual);
  const uint32_t channels = mInfo.mAudio.mChannels;
  const media::TimeUnit target = media::TimeUnit::FromSeconds(10);
  // Cover everything still queued when the seek starts, plus one callback past
  // it so the underrun after the drop is exercised. With this fixture's values:
  // 2048 frames pushed, 512 played before the seek, leaving 1536 queued, which
  // is 3 callbacks of 512, plus 1 = 4 callbacks, so 4 * 512 * 2 channels =
  // 4096 samples are expected out of the gap.
  const uint32_t queuedAtSeek = kBufferFrames - kCallbackFrames;
  const int seekGapCallbacks =
      static_cast<int>(queuedAtSeek / kCallbackFrames) + 1;
  const uint32_t gapSamples = seekGapCallbacks * kCallbackFrames * channels;

  // Play audio before seeking; every sample out must be the pre-seek value.
  nsTArray<AudioDataValue> prePlayed =
      PlayAudioFromStart(kBufferFrames, kCallbackFrames, kPreSeekDataValue);
  ASSERT_GT(prePlayed.Length(), 0u);
  EXPECT_EQ(SamplesMatchingNum(prePlayed, kPreSeekDataValue),
            prePlayed.Length())
      << "audio before the seek must play normally";

  // Start seeking. The stream is stashed and keeps running, so from here it
  // must output only silence. Callbacks are driven manually, so none lands
  // between the seek pause and the seek stop.
  SeekStop();
  EXPECT_EQ(mDestroys, 0) << "stream should be stashed and kept running";

  nsTArray<AudioDataValue> gapPlayed = DrainRecordedOutput(gapSamples);
  EXPECT_EQ(gapPlayed.Length(), gapSamples)
      << "the stashed stream must keep producing across the seek, rather than "
         "draining once its buffer is emptied";
  EXPECT_EQ(AudibleSamplesNum(gapPlayed), 0u)
      << "a sink stopped for a seek must output silence, not the pre-seek "
         "audio still queued in it";

  // Seek finished. The stream must be reused, and the silent gap must not have
  // counted as played audio, so the clock resumes at the target.
  ResumeWithData(kBufferFrames, kPostSeekDataValue, target);
  EXPECT_EQ(mInits, 1) << "stream should be reused, not recreated";
  EXPECT_EQ(mDestroys, 0);
  ExpectClockHeldAt(mWrapper->GetPosition(), target, "after the seek gap");

  // Only post-seek audio may play now: no stale pre-seek data, and no silence.
  nsTArray<AudioDataValue> postPlayed =
      DrainRecordedOutput(kBufferFrames * channels);
  EXPECT_EQ(postPlayed.Length(), kBufferFrames * channels)
      << "the whole post-seek buffer must play";
  EXPECT_EQ(SamplesMatchingNum(postPlayed, kPostSeekDataValue),
            postPlayed.Length())
      << "only post-seek audio may play after the resume";
}

// Emptying the ring buffer for the seek must not be mistaken for the source
// ending. When the audio queue has already finished, as it has for a seek
// issued near the end of the stream, the deliberately starved stream must stay
// alive and still be reused on resume instead of draining and forcing a new
// one.
TEST_F(AudioSinkWrapperReuseTest, SeekWithFinishedAudioQueueStillReusesStream) {
  CreateWrapper(ReuseStream::Enabled, MockCubeb::RunningMode::Manual);
  const uint32_t channels = mInfo.mAudio.mChannels;
  const media::TimeUnit target = media::TimeUnit::FromSeconds(1);
  const uint32_t gapSamples = 2 * kCallbackFrames * channels;

  // Play audio before seeking, then finish the decode queue so the sink treats
  // its processed queue as finished while the ring buffer still holds the rest
  // of the pre-seek audio. This is the state a seek near end of stream begins
  // from, and the state that ends the stream as soon as the buffer empties.
  PlayAudioFromStart(kBufferFrames, kCallbackFrames, kPreSeekDataValue);
  mAudioQueue.Finish();
  ProcessPending();

  // Start seeking; the deliberately starved stream must stay alive and silent.
  SeekStop();
  EXPECT_EQ(mDestroys, 0) << "stream should be stashed, not destroyed";

  nsTArray<AudioDataValue> gapPlayed = DrainRecordedOutput(gapSamples);
  EXPECT_EQ(gapPlayed.Length(), gapSamples)
      << "the starved stream must keep producing rather than draining";
  EXPECT_EQ(AudibleSamplesNum(gapPlayed), 0u) << "the seek gap must be silent";

  // Seek finished; the stream must be reused despite the finished queue.
  ResumeWithData(kBufferFrames, kPostSeekDataValue, target);
  EXPECT_EQ(mInits, 1) << "a finished queue must not cost the stream reuse";
  EXPECT_EQ(mDestroys, 0);

  // Keeping the stream alive across the seek must be temporary. The resume
  // refilled the decode queue, which cleared the finished state, so finish it a
  // second time and play the rest out: the stream still has to reach its normal
  // end. A sink left in the stopped-for-seek state would never report the
  // source as ended, so the stream would never drain and playback would hang
  // here at end of media.
  bool drained = false;
  MediaEventListener stateListener =
      mStream->StateEvent().Connect(mThread, [&](cubeb_state aState) {
        drained = drained || aState == CUBEB_STATE_DRAINED;
      });
  mAudioQueue.Finish();
  ProcessPending();
  DrainRecordedOutput(kBufferFrames * channels);
  DriveCallback(kCallbackFrames);
  stateListener.Disconnect();
  EXPECT_TRUE(drained)
      << "the stream must still end once the post-seek audio is exhausted";
}

// A seek that reuses the stream must drop the stale pre-seek audio still queued
// in the sink and play the post-seek audio, and the clock must be rebased to
// the seek target. Driven with a manual data callback so the exact played
// samples and reported position are deterministic.
TEST_F(AudioSinkWrapperReuseTest,
       StreamReuseAcrossSeekDiscardsStaleAudioAndRebases) {
  CreateWrapper(ReuseStream::Enabled, MockCubeb::RunningMode::Manual);
  const media::TimeUnit target = media::TimeUnit::FromSeconds(10);

  nsTArray<AudioDataValue> prePlayed =
      PlayPreSeekThenSeek(kBufferFrames, kCallbackFrames, kPreSeekDataValue,
                          kBufferFrames, kPostSeekDataValue, target);
  ASSERT_GT(prePlayed.Length(), 0u);
  EXPECT_NEAR(prePlayed[prePlayed.Length() - 1], kPreSeekDataValue, 0.01f)
      << "pre-seek audio plays its own samples";
  EXPECT_EQ(mDestroys, 0) << "stream should be reused, not recreated";

  // The stale pre-seek audio still queued in the sink must be dropped, so only
  // post-seek samples reach the backend.
  EXPECT_EQ(DriveCallback(kCallbackFrames),
            MockCubebStream::KeepProcessing::Yes);
  ProcessPending();
  nsTArray<AudioDataValue> postPlayed = TakeRecorded();
  ASSERT_GT(postPlayed.Length(), 0u);
  for (AudioDataValue s : postPlayed) {
    EXPECT_NEAR(s, kPostSeekDataValue, 0.01f)
        << "reused stream must play post-seek audio, not stale pre-seek audio";
  }

  // The clock is rebased to the seek target.
  double pos = mWrapper->GetPosition().ToSeconds();
  EXPECT_GE(pos, 10.0) << "clock rebased to the seek target";
  EXPECT_LT(pos, 11.0) << "position advances from the target, not replayed";
}

// The reuse discard must drop exactly the stale pre-seek samples: no stale
// audio may leak and no post-seek audio may be swallowed. Pushing known amounts
// and draining the whole post-seek buffer pins both directions: leaked stale
// audio shows up as wrong sample values, swallowed post-seek audio as a short
// played count.
TEST_F(AudioSinkWrapperReuseTest, SeekReuseDiscardsExactStaleSampleCount) {
  CreateWrapper(ReuseStream::Enabled, MockCubeb::RunningMode::Manual);
  const uint32_t channels = mInfo.mAudio.mChannels;
  const media::TimeUnit target = media::TimeUnit::FromSeconds(10);

  PlayPreSeekThenSeek(kBufferFrames, kCallbackFrames, kPreSeekDataValue,
                      kBufferFrames, kPostSeekDataValue, target);

  nsTArray<AudioDataValue> postPlayed =
      DrainRecordedOutput(kBufferFrames * channels);
  EXPECT_EQ(postPlayed.Length(), kBufferFrames * channels)
      << "exactly the post-seek audio must play: fewer means post-seek was "
         "over-dropped, more means stale audio leaked";
  for (AudioDataValue s : postPlayed) {
    EXPECT_NEAR(s, kPostSeekDataValue, 0.01f)
        << "no stale pre-seek sample may play";
  }
}

// When the sink has no stale audio queued at the seek, because everything
// pushed was already played, the discard boundary equals the played count and
// the discard must be a no-op: the post-seek audio plays from its first sample.
TEST_F(AudioSinkWrapperReuseTest, SeekReuseWithNoStaleQueuedPlaysImmediately) {
  CreateWrapper(ReuseStream::Enabled, MockCubeb::RunningMode::Manual);
  const uint32_t channels = mInfo.mAudio.mChannels;
  const media::TimeUnit target = media::TimeUnit::FromSeconds(10);
  // A single callback's worth of audio, so playing one callback drains it all.
  const uint32_t bufferFrames = kCallbackFrames;

  // Play the entire pre-seek buffer, so nothing is left queued as stale.
  PlayPreSeekThenSeek(bufferFrames, bufferFrames, kPreSeekDataValue,
                      bufferFrames, kPostSeekDataValue, target);

  nsTArray<AudioDataValue> postPlayed =
      DrainRecordedOutput(bufferFrames * channels);
  EXPECT_EQ(postPlayed.Length(), bufferFrames * channels)
      << "no post-seek audio should be dropped when nothing was stale";
  for (AudioDataValue s : postPlayed) {
    EXPECT_NEAR(s, kPostSeekDataValue, 0.01f)
        << "post-seek audio plays from the start";
  }
}

// Two seeks in a row must each drop only their own generation of stale audio.
// The discard boundary is a monotonic lifetime total, so the second reuse must
// advance it past the first and drop the second batch of stale frames without
// replaying either generation of stale audio.
TEST_F(AudioSinkWrapperReuseTest, ConsecutiveSeekReusesEachDiscardStaleAudio) {
  CreateWrapper(ReuseStream::Enabled, MockCubeb::RunningMode::Manual);
  const uint32_t channels = mInfo.mAudio.mChannels;
  // A distinct value for the third generation of audio; the first two reuse the
  // shared pre/post-seek values.
  const AudioDataValue kThirdDataValue = 0.75f;

  // First seek: play part of the first-generation audio, then reuse with
  // second-generation audio queued.
  PlayPreSeekThenSeek(kBufferFrames, kCallbackFrames, kPreSeekDataValue,
                      kBufferFrames, kPostSeekDataValue,
                      media::TimeUnit::FromSeconds(10));

  // Play part of the second generation; the first-generation stale frames must
  // be dropped, never played.
  EXPECT_EQ(DriveCallback(kCallbackFrames),
            MockCubebStream::KeepProcessing::Yes);
  ProcessPending();
  nsTArray<AudioDataValue> firstReuse = TakeRecorded();
  ASSERT_GT(firstReuse.Length(), 0u);
  for (AudioDataValue s : firstReuse) {
    EXPECT_NEAR(s, kPostSeekDataValue, 0.01f)
        << "first reuse must not replay stale audio";
  }

  // Second seek: the leftover second-generation frames are now stale. Reuse
  // again with third-generation audio and drain it fully. Only third-generation
  // audio may play.
  SeekAndSupplyPostSeekAudio(kBufferFrames, kThirdDataValue,
                             media::TimeUnit::FromSeconds(20));
  nsTArray<AudioDataValue> secondReuse =
      DrainRecordedOutput(kBufferFrames * channels);
  EXPECT_EQ(secondReuse.Length(), kBufferFrames * channels)
      << "second reuse must play all of the third-generation audio";
  for (AudioDataValue s : secondReuse) {
    EXPECT_NEAR(s, kThirdDataValue, 0.01f)
        << "second reuse must drop both earlier generations of stale audio";
  }
}

// A sink stashed for reuse must be discarded, not reused, when the resume no
// longer needs an audio sink, for instance because playback was muted during
// the seek.
TEST_F(AudioSinkWrapperReuseTest, StashedSinkDiscardedWhenNotNeededOnResume) {
  CreateWrapper();
  Start(media::TimeUnit::Zero());
  EXPECT_EQ(mInits, 1);

  // Seek: the stream is stashed.
  SeekStop();
  EXPECT_EQ(mDestroys, 0) << "stream should be stashed, not destroyed";

  // Muting removes the need for an audio sink, so the resume must discard the
  // stashed sink and must not create a new one.
  mWrapper->SetVolume(0.0);
  Start(media::TimeUnit::FromSeconds(10));
  EXPECT_EQ(mDestroys, 1) << "stashed sink should be discarded when not needed";
  EXPECT_EQ(mInits, 1) << "no new sink should be created while muted";
}

// Two seeks in a row must each reuse the stream. Each resume clears
// keep-running, so this checks that the next seek's pause re-arms it and the
// stream is reused again rather than recreated.
TEST_F(AudioSinkWrapperReuseTest, ConsecutiveSeeksReuseStream) {
  CreateWrapper();
  Start(media::TimeUnit::Zero());
  EXPECT_EQ(mInits, 1);

  for (int i = 1; i <= 2; ++i) {
    SeekStop();
    EXPECT_EQ(mDestroys, 0) << "seek " << i << " should stash, not destroy";

    Start(media::TimeUnit::FromSeconds(i));
    EXPECT_EQ(mInits, 1) << "seek " << i << " should reuse the stream";
    EXPECT_EQ(mDestroys, 0)
        << "seek " << i << " should not recreate the stream";
  }
}

// Pausing, seeking while paused, then resuming to play must keep the audio
// stream's playing state consistent, so a later pause does not stop an
// already-stopped stream. Consistency is checked implicitly: the trailing
// pause/resume/pause runs through AudioStream::Pause()/Resume(), which assert
// mState != STOPPED ("Already Pause()ed.") and mState != STARTED ("Already
// Start()ed.") on the non-keep-running path. If the paused-seek reuse left the
// logical playing state out of sync with the physical stream, one of those
// MOZ_ASSERTs would fire; the test passing without crashing is the check.
TEST_F(AudioSinkWrapperReuseTest, PauseAfterPausedSeekReuse) {
  CreateWrapper();
  Start(media::TimeUnit::Zero());
  EXPECT_EQ(mInits, 1);

  // Pause playback, then seek while still paused with reuse on.
  mWrapper->SetPlaying(false);
  SeekStop();
  EXPECT_EQ(mDestroys, 0) << "stream should be stashed, not destroyed";

  // Resume to the seek target and play again.
  Start(media::TimeUnit::FromSeconds(10));
  EXPECT_EQ(mInits, 1) << "stream should be reused, not recreated";

  // A later pause/resume cycle must remain consistent: these calls reach
  // AudioStream::Pause()/Resume(), whose MOZ_ASSERTs on mState would trip if
  // the reuse had left the logical playing state stale.
  mWrapper->SetPlaying(false);
  mWrapper->SetPlaying(true);
  mWrapper->SetPlaying(false);
  ProcessPending();
}

// A seek resume must never let the reported clock lead the audible audio,
// because the audio stream's position accounts for output-device latency and
// the system clock does not. Shared by both seek-resume paths, a freshly
// created stream and a reused stream. For example, seeking to 10s on a device
// with 100ms of output latency:
//   1. while the speakers are still silent, the clock holds at 10s;
//   2. once audio plays, the clock advances but stays at or behind what has
//      been written, never leading it.
void AudioSinkWrapperReuseTest::RunSeekResumeClockFollowsAudible(
    ReuseStream aReuse) {
  // Model a device whose play cursor lags the write cursor by its output
  // latency, so audio becomes audible only after a delay.
  mCubeb->SetDefaultOutputLatencyFrames(OutputLatencyFrames());
  const media::TimeUnit target = media::TimeUnit::FromSeconds(10);

  ASSERT_NO_FATAL_FAILURE(PlayFromZeroToSteadyState());
  SeekAndResumeAt(target);
  ExpectClockHoldsAtTargetWhileSilent(target, aReuse);
  ASSERT_NO_FATAL_FAILURE(ExpectClockFollowsAudioOncePlaying(target));
}

TEST_F(AudioSinkWrapperReuseTest, SeekResumeClockFollowsAudibleFreshStream) {
  CreateWrapper(ReuseStream::Disabled, MockCubeb::RunningMode::Manual);
  RunSeekResumeClockFollowsAudible(ReuseStream::Disabled);
}

TEST_F(AudioSinkWrapperReuseTest, SeekResumeClockFollowsAudibleReusedStream) {
  CreateWrapper(ReuseStream::Enabled, MockCubeb::RunningMode::Manual);
  RunSeekResumeClockFollowsAudible(ReuseStream::Enabled);
}

// A pause before the seek stops the backend, discarding its queued audio.
// Waiting for audio that will never play would leave the clock an
// output-latency window behind for the rest of playback.
TEST_F(AudioSinkWrapperReuseTest, SeekResumeAfterPauseIgnoresDiscardedAudio) {
  CreateWrapper(ReuseStream::Enabled, MockCubeb::RunningMode::Manual);
  mCubeb->SetDefaultOutputLatencyFrames(OutputLatencyFrames());
  const media::TimeUnit target = media::TimeUnit::FromSeconds(10);

  ASSERT_NO_FATAL_FAILURE(PlayFromZeroToSteadyState());

  // Pause first, so the seek resume restarts a stopped backend rather than
  // taking over a running one.
  mWrapper->SetPlaying(false);
  SeekAndResumeAt(target);

  EXPECT_EQ(mInits, 1) << "the stream must be reused, not recreated";
  EXPECT_EQ(mDestroys, 0) << "the stream must be reused, not recreated";

  ASSERT_EQ(DriveCallback(kCallbackFrames),
            MockCubebStream::KeepProcessing::Yes);
  const media::TimeUnit expected =
      target +
      media::TimeUnit(CheckedInt64(kCallbackFrames), mInfo.mAudio.mRate);
  // The frame history converts frames to microseconds with integer division, so
  // allow the one microsecond that truncation costs.
  EXPECT_NEAR(mWrapper->GetPosition().ToMicroseconds(),
              expected.ToMicroseconds(), 1)
      << "the clock advances by exactly the post-seek callback rather than "
         "waiting out audio the backend had already discarded";
}

// A seek resume that begins while muted has no audio sink, so playback advances
// on the system clock past the seek target, as when a muted element is seeked.
// A later unmute must take the normal system-clock handoff, not snap the
// reported position back to the stale seek target: the media clock may only
// ever move forwards. For example, a muted element resumes at 10s and plays on,
// then unmutes:
//   1. while muted the clock advances past 10s on the system clock;
//   2. on unmute the clock stays at that advanced position and keeps moving
//      forward, never snapping back to 10s.
// Run for both reuse-pref values, since while muted there is no sink to reuse
// and the behaviour must match either way.
void AudioSinkWrapperReuseTest::RunMutedSeekResumeThenUnmuteDoesNotRegress() {
  const media::TimeUnit target = media::TimeUnit::FromSeconds(10);
  StartMutedSeekResume(target);
  const media::TimeUnit beforeUnmute =
      AdvanceMutedSystemClockPastTarget(target);
  ExpectUnmuteDoesNotRegressClock(beforeUnmute);
}

TEST_F(AudioSinkWrapperReuseTest, MutedSeekResumeThenUnmuteFreshStream) {
  CreateWrapper(ReuseStream::Disabled);
  RunMutedSeekResumeThenUnmuteDoesNotRegress();
}

TEST_F(AudioSinkWrapperReuseTest, MutedSeekResumeThenUnmuteReusedStream) {
  CreateWrapper(ReuseStream::Enabled);
  RunMutedSeekResumeThenUnmuteDoesNotRegress();
}
