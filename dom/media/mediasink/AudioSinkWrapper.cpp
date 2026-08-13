/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "AudioSinkWrapper.h"

#include "AudioDeviceInfo.h"
#include "AudioSink.h"
#include "VideoUtils.h"
#include "mozilla/Logging.h"
#include "mozilla/StaticPrefs_media.h"
#include "nsPrintfCString.h"
#include "nsThreadManager.h"

mozilla::LazyLogModule gAudioSinkWrapperLog("AudioSinkWrapper");
#define LOG(...) \
  MOZ_LOG_FMT(gAudioSinkWrapperLog, mozilla::LogLevel::Debug, __VA_ARGS__);
#define LOGV(...) \
  MOZ_LOG_FMT(gAudioSinkWrapperLog, mozilla::LogLevel::Verbose, __VA_ARGS__);

namespace mozilla {

using media::TimeUnit;

AudioSinkWrapper::~AudioSinkWrapper() = default;

void AudioSinkWrapper::DiscardStashedAudioSink() {
  AssertOwnerThread();
  if (mStashedAudioSink) {
    LOG("{}: AudioSinkWrapper::DiscardStashedAudioSink: shutting down stashed "
        "sink",
        fmt::ptr(this));
    mStashedAudioSink->ShutDown();
    mStashedAudioSink = nullptr;
  }
}

void AudioSinkWrapper::Shutdown() {
  AssertOwnerThread();
  MOZ_ASSERT(!mIsStarted, "Must be called after playback stopped.");
  DiscardStashedAudioSink();
  mSinkCreator = nullptr;
  // Ensure that async init tasks complete while the MDSM TaskQueue is still
  // available to resolve pending promises.
  mAsyncInitTaskQueue->AwaitIdle();
}

/* static */
already_AddRefed<TaskQueue> AudioSinkWrapper::CreateAsyncInitTaskQueue() {
  return nsThreadManager::get().CreateBackgroundTaskQueue("AsyncAudioSinkInit");
}

RefPtr<MediaSink::EndedPromise> AudioSinkWrapper::OnEnded(TrackType aType) {
  AssertOwnerThread();
  MOZ_ASSERT(mIsStarted, "Must be called after playback starts.");
  if (aType == TrackInfo::kAudioTrack) {
    return mEndedPromise;
  }
  return nullptr;
}

TimeUnit AudioSinkWrapper::GetEndTime(TrackType aType) const {
  AssertOwnerThread();
  MOZ_ASSERT(mIsStarted, "Must be called after playback starts.");
  if (aType != TrackInfo::kAudioTrack) {
    return TimeUnit::Zero();
  }

  if (mAudioSink && mAudioSink->AudioStreamCallbackStarted()) {
    auto time = mAudioSink->GetEndTime();
    LOGV("{}: GetEndTime return {} from sink", fmt::ptr(this),
         time.ToSeconds());
    return time;
  }

  RefPtr<const AudioData> audio = mAudioQueue.PeekBack();
  if (audio) {
    LOGV("{}: GetEndTime return {} from queue", fmt::ptr(this),
         audio->GetEndTime().ToSeconds());
    return audio->GetEndTime();
  }

  LOGV("{}: GetEndTime return {} from last packet", fmt::ptr(this),
       mLastPacketEndTime.ToSeconds());
  return mLastPacketEndTime;
}

TimeUnit AudioSinkWrapper::GetSystemClockPosition(TimeStamp aNow) const {
  AssertOwnerThread();
  MOZ_ASSERT(!mClockStartTime.IsNull());
  // Time elapsed since we started playing.
  double delta = (aNow - mClockStartTime).ToSeconds();
  // Take playback rate into account.
  return mPositionAtClockStart +
         TimeUnit::FromSeconds(delta * mParams.mPlaybackRate);
}

bool AudioSinkWrapper::IsMuted() const {
  AssertOwnerThread();
  return mParams.mVolume == 0.0;
}

TimeUnit AudioSinkWrapper::PositionFromAudioSink(TimeStamp aNow) {
  AssertOwnerThread();
  MOZ_ASSERT(mAudioSink);
  TimeUnit audioPos = mAudioSink->GetPosition();
  TimeUnit systemPos =
      mClockStartTime.IsNull() ? audioPos : GetSystemClockPosition(aNow);
  LOGV("{}: PositionFromAudioSink (audioPos {} sysPos {})", fmt::ptr(this),
       audioPos.ToSeconds(), systemPos.ToSeconds());

  // A seek resume follows the cubeb's stream's own position, which accounts for
  // the output device's latency and so reports what has actually been heard;
  // the reported clock never runs ahead of the audible audio. Pause the clock
  // until the callback is running, then let the audio clock drive.
  if (mClockPausedDuringSeek) {
    LOGV("{}: Following the audio stream from the seek target {}",
         fmt::ptr(this), audioPos.ToSeconds());
    if (mAudioSink->AudioStreamCallbackStarted()) {
      mClockPausedDuringSeek = false;
      LOG("{}: Seek-resume clock caught up; audio stream now driving at {}",
          fmt::ptr(this), audioPos.ToSeconds());
    }
    mLastClockSource = ClockSource::AudioStream;
    return audioPos;
  }

  // The sink was created while the system clock already drove playback on an
  // unmute, so the stream callback has not started and its played position is
  // still at the start; adopting it now would freeze the clock until cubeb pull
  // audio. Advance on the system clock, keeping the sink start time and
  // decoded-audio queue aligned to it, until the callback runs; this is bounded
  // by cubeb init, so it cannot hang if the device clock is slower than the
  // wall clock.
  if (mLastClockSource == ClockSource::SystemClock &&
      !mAudioSink->AudioStreamCallbackStarted()) {
    mAudioSink->UpdateStartTime(systemPos);
    DropAudioPacketsIfNeeded(systemPos);
    LOGV(
        "{}: Getting position from the system clock, due to the audio stream "
        "not having started yet {}",
        fmt::ptr(this), systemPos.ToSeconds());
    mLastClockSource = ClockSource::SystemClock;
    return systemPos;
  }

  // The handoff: the first position query after the stream callback started
  // while the system clock was driving. Re-anchor the stream start time to the
  // current system clock so the reported position continues from real time. The
  // position is sampled on a ~40ms cadence, so the system clock has advanced a
  // cycle past the last alignment while the just-started stream has played
  // almost nothing; latching to its raw played position would regress the clock
  // by about one cycle. An initial start uses the audio clock directly and does
  // not reach here.
  if (mLastClockSource == ClockSource::SystemClock &&
      !mClockStartTime.IsNull()) {
    mAudioSink->UpdateStartTime(systemPos);
    audioPos = mAudioSink->GetPosition();
    LOG("{}: Re-anchored the audio sink start time to the system clock {}",
        fmt::ptr(this), audioPos.ToSeconds());
  }
  LOGV("{}: Getting position from the Audio Sink {}", fmt::ptr(this),
       audioPos.ToSeconds());
  mLastClockSource = ClockSource::AudioStream;
  return audioPos;
}

TimeUnit AudioSinkWrapper::GetPosition(TimeStamp* aTimeStamp) {
  AssertOwnerThread();
  MOZ_ASSERT(mIsStarted, "Must be called after playback starts.");

  TimeUnit pos;
  TimeStamp t = TimeStamp::Now();

  if (mAudioSink) {
    pos = PositionFromAudioSink(t);
  } else if (!mClockStartTime.IsNull() && mClockPausedDuringSeek &&
             mAsyncCreateCount > 0) {
    // Sink still initializing: hold at the seek target instead of advancing on
    // the system clock, so the clock does not run ahead of the audio that
    // resumes at the target.
    pos = mPositionAtClockStart;
    LOGV("{}: Holding at the seek target while the sink initializes {}",
         fmt::ptr(this), pos.ToSeconds());
    mLastClockSource = ClockSource::SystemClock;
  } else if (!mClockStartTime.IsNull()) {
    // Calculate playback position using system clock if we are still playing,
    // but not rendering the audio, because this audio sink is muted.
    pos = GetSystemClockPosition(t);
    LOGV("{}: Getting position from the system clock {}", fmt::ptr(this),
         pos.ToSeconds());
    // Playback is advancing on the system clock with no audio sink, because the
    // media is muted or has no audio track. Any pending seek-resume hold no
    // longer applies.
    mClockPausedDuringSeek = false;
    if (mAudioQueue.GetSize() > 0) {
      // Audio track, but it won't be dequeued.  Discard packets
      // that are behind the current media time, to keep the queue size under
      // control.
      DropAudioPacketsIfNeeded(pos);
    }
    // Without an AudioSink, it's necessary to manually check if the audio has
    // "ended", meaning that all the audio packets have been consumed,
    // to resolve the ended promise.
    if (CheckIfEnded()) {
      MOZ_ASSERT(!mAudioSink);
      mEndedPromiseHolder.ResolveIfExists(true, __func__);
    }
    mLastClockSource = ClockSource::SystemClock;

    if (!mAudioSink && mAsyncCreateCount == 0 && NeedAudioSink() &&
        t > mRetrySinkTime) {
      MaybeAsyncCreateAudioSink(mAudioDevice);
    }
  } else {
    // Return how long we've played if we are not playing.
    pos = mPositionAtClockStart;
    LOGV("{}: Getting static position, not playing {}", fmt::ptr(this),
         pos.ToSeconds());
    mLastClockSource = ClockSource::Paused;
  }

  if (aTimeStamp) {
    *aTimeStamp = t;
  }

  return pos;
}

bool AudioSinkWrapper::CheckIfEnded() const {
  return mAudioQueue.IsFinished() && mAudioQueue.GetSize() == 0u;
}

bool AudioSinkWrapper::HasUnplayedFrames(TrackType aType) const {
  AssertOwnerThread();
  return mAudioSink ? mAudioSink->HasUnplayedFrames() : false;
}

media::TimeUnit AudioSinkWrapper::UnplayedDuration(TrackType aType) const {
  AssertOwnerThread();
  return mAudioSink ? mAudioSink->UnplayedDuration() : media::TimeUnit::Zero();
}

void AudioSinkWrapper::DropAudioPacketsIfNeeded(
    const TimeUnit& aMediaPosition) {
  RefPtr<AudioData> audio = mAudioQueue.PeekFront();
  uint32_t dropped = 0;
  while (audio && audio->GetEndTime() < aMediaPosition) {
    // drop this packet, try the next one
    audio = mAudioQueue.PopFront();
    dropped++;
    if (audio) {
      mLastPacketEndTime = audio->GetEndTime();
      LOGV(
          "Dropping audio packets: media position: {}, "
          "packet dropped: [{}, {}] ({} so far).\n",
          aMediaPosition.ToSeconds(), audio->mTime.ToSeconds(),
          (audio->GetEndTime()).ToSeconds(), dropped);
    }
    audio = mAudioQueue.PeekFront();
  }
}

void AudioSinkWrapper::OnMuted(bool aMuted) {
  AssertOwnerThread();
  LOG("{}: AudioSinkWrapper::OnMuted({})", fmt::ptr(this),
      aMuted ? "true" : "false");
  // Nothing to do
  if (mAudioEnded) {
    LOG("{}: AudioSinkWrapper::OnMuted, but no audio track", fmt::ptr(this));
    return;
  }
  if (aMuted) {
    if (mAudioSink) {
      LOG("AudioSinkWrapper muted, shutting down AudioStream.");
      ShutDownAudioSink();
    }
  } else {
    LOG("{}: AudioSinkWrapper unmuted, maybe re-creating an AudioStream.",
        fmt::ptr(this));
    MaybeAsyncCreateAudioSink(mAudioDevice);
  }
}

void AudioSinkWrapper::SetVolume(double aVolume) {
  AssertOwnerThread();

  bool wasMuted = mParams.mVolume == 0;
  bool nowMuted = aVolume == 0.;
  mParams.mVolume = aVolume;

  if (!wasMuted && nowMuted) {
    OnMuted(true);
  } else if (wasMuted && !nowMuted) {
    OnMuted(false);
  }

  if (mAudioSink) {
    mAudioSink->SetVolume(aVolume);
  }
}

void AudioSinkWrapper::SetStreamName(const nsAString& aStreamName) {
  AssertOwnerThread();
  if (mAudioSink) {
    mAudioSink->SetStreamName(aStreamName);
  }
}

void AudioSinkWrapper::SetPlaybackRate(double aPlaybackRate) {
  AssertOwnerThread();
  if (mAudioSink) {
    // Pass the playback rate to the audio sink. The underlying AudioStream
    // will handle playback rate changes and report correct audio position.
    mAudioSink->SetPlaybackRate(aPlaybackRate);
  } else if (!mClockStartTime.IsNull()) {
    // Adjust playback duration and start time when we are still playing.
    TimeStamp now = TimeStamp::Now();
    mPositionAtClockStart = GetSystemClockPosition(now);
    mClockStartTime = now;
  }
  // mParams.mPlaybackRate affects GetSystemClockPosition(). It should be
  // updated after the calls to GetSystemClockPosition();
  mParams.mPlaybackRate = aPlaybackRate;

  // Do nothing when not playing. Changes in playback rate will be taken into
  // account by GetSystemClockPosition().
}

void AudioSinkWrapper::SetPreservesPitch(bool aPreservesPitch) {
  AssertOwnerThread();
  mParams.mPreservesPitch = aPreservesPitch;
  if (mAudioSink) {
    mAudioSink->SetPreservesPitch(aPreservesPitch);
  }
}

void AudioSinkWrapper::SetPlaying(bool aPlaying, StopReason aReason) {
  AssertOwnerThread();
  LOG("{}: AudioSinkWrapper::SetPlaying {} (reason: {})", fmt::ptr(this),
      aPlaying ? "true" : "false",
      aReason == StopReason::Seeking ? "seeking" : "regular");

  // Resume/pause matters only when playback started.
  if (!mIsStarted) {
    return;
  }

  if (mAudioSink) {
    if (!aPlaying) {
      // A seek pause keeps the backend running so the following stop/start can
      // reuse the stream; any other pause stops the backend. This is decided
      // before pausing, because once the sink is paused it is too late to keep
      // the backend alive.
      const bool keepRunning = aReason == StopReason::Seeking &&
                               mReuseStreamOnSeek && !mAudioSink->IsErrored();
      mAudioSink->SetStreamKeepRunning(keepRunning);
    }
    mAudioSink->SetPlaying(aPlaying);
  }

  if (aPlaying) {
    MOZ_ASSERT(mClockStartTime.IsNull());
    TimeUnit switchTime = GetPosition();
    mClockStartTime = TimeStamp::Now();
    if (!mAudioSink && NeedAudioSink()) {
      LOG("{}: AudioSinkWrapper::SetPlaying : starting an AudioSink",
          fmt::ptr(this));
      DropAudioPacketsIfNeeded(switchTime);
      SyncCreateAudioSink(switchTime);
    }
  } else {
    // Remember how long we've played.
    mPositionAtClockStart = GetPosition();
    // mClockStartTime must be updated later since GetPosition()
    // depends on the value of mClockStartTime.
    mClockStartTime = TimeStamp();
  }
}

RefPtr<GenericPromise> AudioSinkWrapper::SetAudioDevice(
    RefPtr<AudioDeviceInfo> aDevice) {
  return MaybeAsyncCreateAudioSink(std::move(aDevice));
}

double AudioSinkWrapper::PlaybackRate() const {
  AssertOwnerThread();
  return mParams.mPlaybackRate;
}

nsresult AudioSinkWrapper::Start(const TimeUnit& aStartTime,
                                 const MediaInfo& aInfo, StartType aStartType) {
  LOG("{}: AudioSinkWrapper::Start(startTime={}, startType={})", fmt::ptr(this),
      aStartTime.ToSeconds(), MediaSink::EnumValueToString(aStartType));
  AssertOwnerThread();
  MOZ_ASSERT(!mIsStarted, "playback already started.");

  mIsStarted = true;
  mPositionAtClockStart = aStartTime;
  mClockStartTime = TimeStamp::Now();
  mAudioEnded = IsAudioSourceEnded(aInfo);
  mLastPacketEndTime = TimeUnit::Zero();
  // A seek resume, whether it reuses the stashed stream or creates a fresh one,
  // must follow the audio stream, which accounts for device latency, rather
  // than the system clock; both paths key off this.
  mClockPausedDuringSeek = aStartType == StartType::SeekResume;

  if (mAudioEnded) {
    // Resolve promise if we start playback at the end position of the audio.
    mEndedPromise =
        aInfo.HasAudio()
            ? MediaSink::EndedPromise::CreateAndResolve(true, __func__)
            : nullptr;
    return NS_OK;
  }

  mEndedPromise = mEndedPromiseHolder.Ensure(__func__);
  if (!NeedAudioSink()) {
    // A sink stashed for reuse is no longer wanted, for instance because
    // playback was muted; discard it.
    DiscardStashedAudioSink();
    return NS_OK;
  }
  if (mStashedAudioSink) {
    // A stream that errored or drained during the enlarged keep-running window,
    // for instance a seek issued near end-of-stream, cannot be resumed: the
    // audio backend has stopped and will issue no further callbacks, so reusing
    // it would hang with audio never playing and the ended promise never
    // settling. Discard it and create a fresh sink instead.
    if (mStashedAudioSink->IsErrored() ||
        mStashedAudioSink->IsStreamDrained()) {
      LOG("{}: stashed stream unusable (errored={}, drained={}), discarding it",
          fmt::ptr(this), mStashedAudioSink->IsErrored(),
          mStashedAudioSink->IsStreamDrained());
      DiscardStashedAudioSink();
    } else if (NS_SUCCEEDED(ResumeStashedAudioSink(aStartTime))) {
      return NS_OK;
    }
    // Reuse failed because the stream died during the resume; the sink has been
    // torn down, so fall through to create a fresh one below.
    LOG("{}: reuse failed, creating a fresh audio sink", fmt::ptr(this));
  }
  // With no stashed stream to reuse (stream reuse disabled on this platform, or
  // the stashed stream was discarded above), fall back to asynchronous init on
  // a seek resume: cubeb stream init can take tens of milliseconds
  // (CoreAudio/AudioUnit on macOS) and doing it synchronously here stalls the
  // state machine thread, delaying the playback clock and the resume. Instead,
  // return immediately; the reported position holds at the seek target until
  // the audio stream produces, then follows it. Initial playback start stays
  // synchronous.
  if (aStartType == StartType::SeekResume) {
    LOG("{}: AudioSinkWrapper::Start, async audio sink init for seek resume",
        fmt::ptr(this));
    MaybeAsyncCreateAudioSink(mAudioDevice);
    return NS_OK;
  }
  return SyncCreateAudioSink(aStartTime);
}

bool AudioSinkWrapper::NeedAudioSink() {
  // An AudioSink is needed if unmuted, playing, and not ended.  The not-ended
  // check also avoids creating an AudioSink when there is no audio track.
  return !IsMuted() && IsPlaying() && !mEndedPromiseHolder.IsEmpty();
}

void AudioSinkWrapper::StartAudioSink(UniquePtr<AudioSink> aAudioSink,
                                      const TimeUnit& aStartTime) {
  AssertOwnerThread();
  MOZ_ASSERT(!mAudioSink);
  mAudioSink = std::move(aAudioSink);
  mAudioSink->Start(mParams, aStartTime)
      ->Then(mOwnerThread.GetEventTarget(), __func__, this,
             &AudioSinkWrapper::OnAudioEnded)
      ->Track(mAudioSinkEndedRequest);
}

void AudioSinkWrapper::ShutDownAudioSink() {
  AssertOwnerThread();
  mAudioSinkEndedRequest.DisconnectIfExists();
  if (IsPlaying()) {
    mPositionAtClockStart = mAudioSink->GetPosition();
    mClockStartTime = TimeStamp::Now();
  }
  mAudioSink->ShutDown();
  mLastPacketEndTime = mAudioSink->GetEndTime();
  mAudioSink = nullptr;
}

RefPtr<GenericPromise> AudioSinkWrapper::MaybeAsyncCreateAudioSink(
    RefPtr<AudioDeviceInfo> aDevice) {
  AssertOwnerThread();
  UniquePtr<AudioSink> audioSink;
  if (NeedAudioSink() && (!mAudioSink || aDevice != mAudioDevice)) {
    LOG("{}: AudioSinkWrapper::MaybeAsyncCreateAudioSink: AudioSink needed",
        fmt::ptr(this));
    if (mAudioSink) {
      ShutDownAudioSink();
    }
    audioSink = mSinkCreator();
  } else {
    LOG("{}: AudioSinkWrapper::MaybeAsyncCreateAudioSink: no AudioSink change",
        fmt::ptr(this));
    // Bounce off the background thread to keep promise resolution in order.
  }
  mAudioDevice = std::move(aDevice);
  ++mAsyncCreateCount;
  using Promise =
      MozPromise<UniquePtr<AudioSink>, nsresult, /* IsExclusive = */ true>;
  return InvokeAsync(
             mAsyncInitTaskQueue,
             "MaybeAsyncCreateAudioSink (Async part: initialization)",
             [self = RefPtr<AudioSinkWrapper>(this),
              audioSink{std::move(audioSink)}, audioDevice = mAudioDevice,
              myDispatchSeq = ++mAsyncDispatchSeq, this]() mutable {
               if (!audioSink || mAsyncDispatchSeq != myDispatchSeq) {
                 // No sink needed, or a newer dispatch superseded us.
                 return Promise::CreateAndResolve(nullptr, __func__);
               }

               LOG("AudioSink initialization on background thread");
               // This can take about 200ms, e.g. on Windows, we don't
               // want to do it on the MDSM thread, because it would
               // make the clock not update for that amount of time, and
               // the video would therefore not update. The Start() call
               // is very cheap on the other hand, we can do it from the
               // MDSM thread.
               nsresult rv = audioSink->InitializeAudioStream(
                   audioDevice, AudioSink::InitializationType::UNMUTING);
               if (NS_FAILED(rv)) {
                 LOG("Async AudioSink initialization failed");
                 return Promise::CreateAndReject(rv, __func__);
               }
               return Promise::CreateAndResolve(std::move(audioSink), __func__);
             })
      ->Then(
          mOwnerThread.GetEventTarget(),
          "MaybeAsyncCreateAudioSink (Async part: start from MDSM thread)",
          [self = RefPtr<AudioSinkWrapper>(this), audioDevice = mAudioDevice,
           this](Promise::ResolveOrRejectValue&& aValue) mutable {
            LOG("AudioSink async init done, back on MDSM thread");
            --mAsyncCreateCount;
            UniquePtr<AudioSink> audioSink;
            if (aValue.IsResolve()) {
              audioSink = std::move(aValue.ResolveValue());
            }
            // It's possible that the newly created AudioSink isn't needed at
            // this point, in some cases:
            // 1. An AudioSink was created synchronously while this
            // AudioSink was initialized asynchronously, bail out here. This
            // happens when seeking (which does a synchronous initialization)
            // right after unmuting.  mEndedPromiseHolder is managed by the
            // other AudioSink, so don't touch it here.
            // 2. The media element was muted while the async initialization
            // was happening.
            // 3. The AudioSinkWrapper was paused or stopped during
            // asynchronous initialization.
            // 4. The audio has ended during asynchronous initialization.
            // 5. A change to a potentially different sink device is pending.
            if (mAudioSink || !NeedAudioSink() || audioDevice != mAudioDevice) {
              LOG("AudioSink async initialization isn't needed.");
              if (audioSink) {
                LOG("Shutting down unneeded AudioSink.");
                audioSink->ShutDown();
              }
              return GenericPromise::CreateAndResolve(true, __func__);
            }

            if (aValue.IsReject()) {
              if (audioDevice) {
                // Device will be started when available again.
                ScheduleRetrySink();
              } else {
                // Default device not available.  Report error.
                MOZ_ASSERT(!mAudioSink);
                mEndedPromiseHolder.RejectIfExists(aValue.RejectValue(),
                                                   __func__);
              }
              return GenericPromise::CreateAndResolve(true, __func__);
            }

            if (!audioSink) {
              // No-op because either an existing AudioSink was suitable or no
              // AudioSink was needed when MaybeAsyncCreateAudioSink() set up
              // this task.  We now need a new AudioSink, but that will be
              // handled by another task, either already pending or a delayed
              // retry task yet to be created by GetPosition().
              return GenericPromise::CreateAndResolve(true, __func__);
            }

            MOZ_ASSERT(!mAudioSink);
            // Avoiding the side effects of GetPosition() creating another
            // sink another AudioSink and resolving mEndedPromiseHolder, which
            // the new audioSink will now manage.
            TimeUnit startTime;
            if (mClockPausedDuringSeek) {
              // Anchor the sink at the seek target and keep all post-seek
              // audio, so playback resumes from the target and GetPosition
              // follows the audio from there.
              startTime = mPositionAtClockStart;
              LOG("{}: AudioSink async start at the seek target {}",
                  fmt::ptr(this), startTime.ToSeconds());
            } else {
              startTime = GetSystemClockPosition(TimeStamp::Now());
              DropAudioPacketsIfNeeded(startTime);
              mLastClockSource = ClockSource::SystemClock;
              LOG("{}: AudioSink async start at the system clock {}",
                  fmt::ptr(this), startTime.ToSeconds());
            }

            StartAudioSink(std::move(audioSink), startTime);
            return GenericPromise::CreateAndResolve(true, __func__);
          });
}

nsresult AudioSinkWrapper::ResumeStashedAudioSink(const TimeUnit& aStartTime) {
  AssertOwnerThread();
  MOZ_ASSERT(mStashedAudioSink);
  MOZ_ASSERT(!mAudioSink);
  MOZ_ASSERT(!mAudioSinkEndedRequest.Exists(),
             "ended-promise consumer must be disconnected before reuse");
  LOG("{}: AudioSinkWrapper::ResumeStashedAudioSink({})", fmt::ptr(this),
      aStartTime.ToSeconds());

  // ResetForReuse rebases the still-running stream to the seek target, and
  // Start() set mClockPausedDuringSeek, so GetPosition follows the audio
  // stream from the target like the recreate path.
  mAudioSink = std::move(mStashedAudioSink);
  RefPtr<MediaSink::EndedPromise> ended =
      mAudioSink->ResetForReuse(mParams, aStartTime);
  // The stream can error or drain in the narrow window between Start()'s health
  // check and the rebase above, for instance a seek landing right at end of
  // stream. A dead stream will not play the post-seek audio and hands back an
  // ended promise that never settles, so tear it down and let the caller create
  // a fresh sink instead.
  if (mAudioSink->IsErrored() || mAudioSink->IsStreamDrained()) {
    LOG("{}: stashed stream died during resume, recreating instead of reusing",
        fmt::ptr(this));
    ShutDownAudioSink();
    return NS_ERROR_FAILURE;
  }
  ended
      ->Then(mOwnerThread.GetEventTarget(), __func__, this,
             &AudioSinkWrapper::OnAudioEnded)
      ->Track(mAudioSinkEndedRequest);
  // Allow normal pause again now that the resume is done. This is safe to clear
  // here because the whole resume runs synchronously on the owner thread, so no
  // seek can interleave; a later seek re-arms keep-running when it pauses for
  // that seek.
  mAudioSink->SetStreamKeepRunning(false);
  return NS_OK;
}

nsresult AudioSinkWrapper::SyncCreateAudioSink(const TimeUnit& aStartTime) {
  AssertOwnerThread();
  MOZ_ASSERT(!mAudioSink);
  MOZ_ASSERT(!mAudioSinkEndedRequest.Exists());

  LOG("{}: AudioSinkWrapper::SyncCreateAudioSink({})", fmt::ptr(this),
      aStartTime.ToSeconds());

  UniquePtr<AudioSink> audioSink = mSinkCreator();
  nsresult rv = audioSink->InitializeAudioStream(
      mAudioDevice, AudioSink::InitializationType::INITIAL);
  if (NS_FAILED(rv)) {
    LOG("Sync AudioSinkWrapper initialization failed");
    // If a specific device has been specified through setSinkId()
    // the sink is started after the device becomes available again.
    if (mAudioDevice) {
      ScheduleRetrySink();
      return NS_OK;
    }
    // If a default output device is not available, the system may not support
    // audio output.  Report an error so that playback can be aborted if there
    // is no video.
    mEndedPromiseHolder.RejectIfExists(rv, __func__);
    return rv;
  }
  StartAudioSink(std::move(audioSink), aStartTime);

  return NS_OK;
}

void AudioSinkWrapper::ScheduleRetrySink() {
  mRetrySinkTime =
      TimeStamp::Now() + TimeDuration::FromMilliseconds(
                             StaticPrefs::media_audio_device_retry_ms());
}

bool AudioSinkWrapper::IsAudioSourceEnded(const MediaInfo& aInfo) const {
  // no audio or empty audio queue which won't get data anymore is equivalent to
  // audio ended
  return !aInfo.HasAudio() ||
         (mAudioQueue.IsFinished() && mAudioQueue.GetSize() == 0u);
}

void AudioSinkWrapper::Stop(StopReason aReason) {
  AssertOwnerThread();
  MOZ_ASSERT(mIsStarted, "playback not started.");

  LOG("{}: AudioSinkWrapper::Stop", fmt::ptr(this));

  mIsStarted = false;
  mClockStartTime = TimeStamp();
  mPositionAtClockStart = TimeUnit::Invalid();
  mAudioEnded = true;
  mClockPausedDuringSeek = false;
  if (mAudioSink) {
    if (aReason == StopReason::Seeking && mReuseStreamOnSeek &&
        !mAudioSink->IsErrored() && !mAudioSink->IsStreamDrained()) {
      // Keep the sink and its still-running audio stream alive so the next
      // start can reset and reuse them instead of paying for a destroy +
      // recreate.
      LOG("{}: stashing AudioSink for seek reuse", fmt::ptr(this));
      mAudioSinkEndedRequest.DisconnectIfExists();
      mAudioSink->PrepareForReuse();
      mStashedAudioSink = std::move(mAudioSink);
    } else {
      ShutDownAudioSink();
    }
  }

  mEndedPromiseHolder.ResolveIfExists(true, __func__);
  mEndedPromise = nullptr;
}

bool AudioSinkWrapper::IsStarted() const {
  AssertOwnerThread();
  return mIsStarted;
}

bool AudioSinkWrapper::IsPlaying() const {
  AssertOwnerThread();
  MOZ_ASSERT(mClockStartTime.IsNull() || IsStarted());
  return !mClockStartTime.IsNull();
}

void AudioSinkWrapper::OnAudioEnded(
    const EndedPromise::ResolveOrRejectValue& aValue) {
  AssertOwnerThread();
  // This callback on mAudioSinkEndedRequest should have been disconnected if
  // mEndedPromiseHolder has been settled.
  MOZ_ASSERT(!mEndedPromiseHolder.IsEmpty());
  LOG("{}: AudioSinkWrapper::OnAudioEnded {}", fmt::ptr(this),
      aValue.IsResolve());
  mAudioSinkEndedRequest.Complete();
  ShutDownAudioSink();
  // System time is now used for the clock as video may not have ended.
  if (aValue.IsResolve()) {
    mAudioEnded = true;
    mEndedPromiseHolder.Resolve(aValue.ResolveValue(), __func__);
    return;
  }
  if (mAudioDevice) {
    ScheduleRetrySink();  // Device will be restarted when available again.
    return;
  }
  // Default device not available.  Report error.
  mEndedPromiseHolder.Reject(aValue.RejectValue(), __func__);
}

void AudioSinkWrapper::GetDebugInfo(dom::MediaSinkDebugInfo& aInfo) {
  AssertOwnerThread();
  aInfo.mAudioSinkWrapper.mIsPlaying = IsPlaying();
  aInfo.mAudioSinkWrapper.mIsStarted = IsStarted();
  aInfo.mAudioSinkWrapper.mAudioEnded = mAudioEnded;
  if (mAudioSink) {
    mAudioSink->GetDebugInfo(aInfo);
  }
}

}  // namespace mozilla

#undef LOG
#undef LOGV
