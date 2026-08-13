/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "ImageContainer.h"
#include "MediaFormatReader.h"
#include "MockDecoderModule.h"
#include "MockMediaDataDemuxer.h"
#include "MockMediaDecoderOwner.h"
#include "PDMFactory.h"
#include "ReaderProxy.h"
#include "TimeUnits.h"
#include "VideoFrameContainer.h"
#include "gtest/gtest.h"
#include "mozilla/Atomics.h"
#include "mozilla/Preferences.h"
#include "mozilla/SpinEventLoopUntil.h"
#include "mozilla/gtest/MozAssertions.h"
#include "mozilla/gtest/WaitFor.h"
#include "nsQueryObject.h"

using namespace mozilla;
using namespace mozilla::layers;

using DecodePromise = MediaDataDecoder::DecodePromise;
using SamplesHolder = MediaTrackDemuxer::SamplesHolder;
using SamplesPromise = MediaTrackDemuxer::SamplesPromise;
using SeekPromise = MediaTrackDemuxer::SeekPromise;
using TrackType = TrackInfo::TrackType;
using media::TimeIntervals;
using media::TimeUnit;
using testing::InSequence;
using testing::MockFunction;
using testing::Return;
using testing::StrEq;

// Shared setup for MediaFormatReader gtests: a single video track backed by a
// MockMediaDataDemuxer/MockMediaTrackDemuxer and a MockDecoderModule. Each test
// sets its own decoder and demux-sample expectations, then calls InitReader().
class TestMediaFormatReader : public ::testing::Test {
 protected:
  void SetUp() override {
    mDataDemuxer = new MockMediaDataDemuxer();
    // VideoInfo::IsValid() needs dimensions.
    mTrackDemuxer =
        new MockMediaTrackDemuxer("video/x-test; width=640; height=360");

    ON_CALL(*mDataDemuxer, GetNumberTracks(TrackType::kVideoTrack))
        .WillByDefault(Return(1));
    ON_CALL(*mDataDemuxer, GetTrackDemuxer)
        .WillByDefault([this](TrackType aType, uint32_t aTrackNumber) {
          EXPECT_EQ(aTrackNumber, 0u);
          EXPECT_EQ(aType, TrackType::kVideoTrack);
          if (!mDemuxerThread) {
            mDemuxerThread = do_QueryObject(AbstractThread::GetCurrent());
          }
          return do_AddRef(mTrackDemuxer);
        });

    mPdm = new MockDecoderModule();
  }

  // Create and initialize the reader and its proxy. Call after the decoder and
  // demux-sample expectations have been set.
  void InitReader() {
    mOwner = std::make_unique<MockMediaDecoderOwner>();
    RefPtr container = new VideoFrameContainer(
        mOwner.get(),
        MakeAndAddRef<ImageContainer>(ImageUsageType::VideoFrameContainer,
#ifdef MOZ_WIDGET_ANDROID
                                      // Work around bug 1922144
                                      ImageContainer::SYNCHRONOUS
#else
                                      ImageContainer::ASYNCHRONOUS
#endif
                                      ));
    MediaFormatReaderInit init;
    init.mVideoFrameContainer = container;
    mReader = new MediaFormatReader(init, mDataDemuxer);
    mProxy = new ReaderProxy(AbstractThread::MainThread(), mReader);
    EXPECT_NS_SUCCEEDED(mReader->Init());
  }

  // Wait enough for the MediaFormatReader to process at least aCount demuxer or
  // decoder operations, if pending.
  void WaitForReaderOperations(int aCount) {
    // AwaitIdle() ensures that no tasks are pending and any task for another
    // thread is already in the other thread's queue, only if dispatch across
    // threads is not via tail dispatch.  Tail dispatch is not used because
    // the demuxer and decoder threads do not support tail dispatch, even
    // though the MediaFormatReader task queue supports tail dispatch.
    // https://searchfox.org/mozilla-central/rev/126697140e711e04a9d95edae537541c3bde89cc/xpcom/threads/AbstractThread.cpp#285-289
    MOZ_ASSERT(!mDemuxerThread->SupportsTailDispatch());
    MOZ_ASSERT(!mDecoderThread->SupportsTailDispatch());
    // Check that the reader thread has dispatched the first request to
    // the demuxer or decoder thread.
    mReader->OwnerThread()->AwaitIdle();
    for (int i = 0; i < aCount; ++i) {
      mDemuxerThread->AwaitIdle();
      mDecoderThread->AwaitIdle();
      mReader->OwnerThread()->AwaitIdle();
    }
  }

  // Expect a video decoder whose priming drain after the internal seek fails
  // with a non-fatal error, driving the decode-error recovery skip.
  void ExpectDecoderWithFailingPrimingDrain() {
    EXPECT_CALL(*mPdm, CreateVideoDecoder)
        .Times(testing::AnyNumber())
        .WillRepeatedly([this](const CreateDecoderParams& aParams) {
          mVideoDecoder = new MockVideoDataDecoder(aParams);
          InSequence s;
          EXPECT_CALL(*mVideoDecoder, Drain).WillOnce([this] {
            return mVideoDecoder->DummyMediaDataDecoder::Drain();
          });
          EXPECT_CALL(*mVideoDecoder, Drain).Times(1);
          EXPECT_CALL(*mVideoDecoder, Drain).WillOnce([] {
            return DecodePromise::CreateAndReject(
                NS_ERROR_DOM_MEDIA_NEED_NEW_DECODER, __func__);
          });
          // The mock decoder holds decoded frames back until this many are
          // queued, modelling decode-reorder (DPB) latency, so decoded output
          // emerges through the drain path this test drives rather than
          // directly from Decode(). The value only needs to exceed the number
          // of samples fed before the first drain; 8 matches the sibling
          // internal-seek test.
          mVideoDecoder->SetLatencyFrameCount(8);
          return do_AddRef(mVideoDecoder);
        });
  }

  // Expect the demux sequence that walks the reader to an internal seek that
  // re-primes the decoder. A couple of samples are decoded first so the reader
  // is unambiguously past its first-frame state (mFirstFrameTime cleared); that
  // is what makes the later non-fatal decode error take the skip-to-keyframe
  // recovery path rather than an internal seek. A single decoded frame would
  // clear that state too; two keeps this structurally identical to the sibling
  // WaitingForDemuxAfterInternalSeek test.
  void ExpectDemuxReachingInternalSeekPriming() {
    InSequence s;
    EXPECT_CALL(*mTrackDemuxer, MockGetSamples).Times(2).WillRepeatedly([this] {
      RefPtr sample = new MediaRawData;
      sample->mTime = TimeUnit(mDecodedSampleCount, 30);
      ++mDecodedSampleCount;
      RefPtr<SamplesHolder> samples = new SamplesHolder;
      samples->AppendSample(std::move(sample));
      return SamplesPromise::CreateAndResolve(samples, __func__);
    });
    EXPECT_CALL(*mTrackDemuxer, MockGetSamples).WillOnce([] {
      return SamplesPromise::CreateAndReject(
          NS_ERROR_DOM_MEDIA_WAITING_FOR_DATA, __func__);
    });
    EXPECT_CALL(*mTrackDemuxer, Seek).WillOnce([this](const TimeUnit&) {
      EXPECT_NS_SUCCEEDED(mReader->OwnerThread()->Dispatch(
          NewRunnableMethod("NotifyDataArrived", mReader.get(),
                            &MediaFormatReader::NotifyDataArrived)));
      return SeekPromise::CreateAndResolve(TimeUnit::Zero(), __func__);
    });
    EXPECT_CALL(*mTrackDemuxer, MockGetSamples).WillOnce([] {
      RefPtr sample = new MediaRawData;
      sample->mTime = TimeUnit(0, 30);
      RefPtr<SamplesHolder> samples = new SamplesHolder;
      samples->AppendSample(std::move(sample));
      return SamplesPromise::CreateAndResolve(samples, __func__);
    });
    EXPECT_CALL(*mTrackDemuxer, MockGetSamples).WillRepeatedly([] {
      return SamplesPromise::CreateAndReject(
          NS_ERROR_DOM_MEDIA_WAITING_FOR_DATA, __func__);
    });
  }

  // Read metadata, decode the first two frames, and consume up to the first
  // WAITING_FOR_DATA rejection that begins the internal-seek re-priming.
  void ReachInternalSeekPriming() {
    (void)WaitForResolve(mProxy->ReadMetadata());
    for (int i = 0; i < 2; ++i) {
      (void)WaitForResolve(mProxy->RequestVideoData(TimeUnit(), false));
    }
    MediaResult result =
        WaitForReject(mProxy->RequestVideoData(TimeUnit(), false));
    EXPECT_EQ(result.Code(), NS_ERROR_DOM_MEDIA_WAITING_FOR_DATA);
  }

  RefPtr<MockMediaDataDemuxer> mDataDemuxer;
  RefPtr<MockMediaTrackDemuxer> mTrackDemuxer;
  RefPtr<MockDecoderModule> mPdm;
  std::unique_ptr<MockMediaDecoderOwner> mOwner;
  RefPtr<MediaFormatReader> mReader;
  RefPtr<ReaderProxy> mProxy;
  // Thread scheduling provides ordering for thread initializations before
  // their first read.
  RefPtr<TaskQueue> mDemuxerThread;
  RefPtr<TaskQueue> mDecoderThread;
  RefPtr<MockVideoDataDecoder> mVideoDecoder;
  int mDecodedSampleCount = 0;
};

TEST_F(TestMediaFormatReader, WaitingForDemuxAfterInternalSeek) {
  PDMFactory::AutoForcePDM autoForcePDM(mPdm);
  RefPtr<MockVideoDataDecoder> decoder;
  MozPromiseHolder<DecodePromise> drainPromise;
  EXPECT_CALL(*mPdm, CreateVideoDecoder)
      .WillOnce([&](const CreateDecoderParams& aParams) {
        decoder = new MockVideoDataDecoder(aParams);
        InSequence s;
        // The first drain requires two calls: one to fetch the frames...
        EXPECT_CALL(*decoder, Drain).WillOnce([&] {
          MOZ_ASSERT(!mDecoderThread);
          mDecoderThread = do_QueryObject(AbstractThread::GetCurrent());
          return decoder->DummyMediaDataDecoder::Drain();
        });
        // ... and a second to confirm that no more frames are remaining.
        EXPECT_CALL(*decoder, Drain).Times(1);
        // Delay responding to the second drain request until testing is done.
        EXPECT_CALL(*decoder, Drain).WillOnce([&] {
          return drainPromise.Ensure(__func__);
        });
        decoder->SetLatencyFrameCount(8);
        return do_AddRef(decoder);
      });

  MockFunction<void(const char* name)> checkpoint;
  {
    InSequence s;

    EXPECT_CALL(*mTrackDemuxer, MockGetSamples).Times(2).WillRepeatedly([]() {
      static int count = 0;
      RefPtr sample = new MediaRawData;
      sample->mTime = TimeUnit(count, 30);
      ++count;
      RefPtr<SamplesHolder> samples = new SamplesHolder;
      samples->AppendSample(std::move(sample));
      return SamplesPromise::CreateAndResolve(samples, __func__);
    });
    EXPECT_CALL(*mTrackDemuxer, MockGetSamples).WillOnce([]() {
      return SamplesPromise::CreateAndReject(
          NS_ERROR_DOM_MEDIA_WAITING_FOR_DATA, __func__);
    });
    EXPECT_CALL(*mTrackDemuxer, Seek).WillOnce([&](const TimeUnit& aTime) {
      // Reset mWaitingForDataStartTime so that OnDemuxFailed() calls
      // RequestDrain().
      EXPECT_NS_SUCCEEDED(mReader->OwnerThread()->Dispatch(
          NewRunnableMethod("NotifyDataArrived", mReader.get(),
                            &MediaFormatReader::NotifyDataArrived)));
      return SeekPromise::CreateAndResolve(TimeUnit::Zero(), __func__);
    });
    EXPECT_CALL(*mTrackDemuxer, MockGetSamples).WillOnce([]() {
      RefPtr sample = new MediaRawData;
      // Time is zero after the seek.
      sample->mTime = TimeUnit(0, 30);
      RefPtr<SamplesHolder> samples = new SamplesHolder;
      samples->AppendSample(std::move(sample));
      return SamplesPromise::CreateAndResolve(samples, __func__);
    });
    EXPECT_CALL(*mTrackDemuxer, MockGetSamples).WillOnce([]() {
      return SamplesPromise::CreateAndReject(
          NS_ERROR_DOM_MEDIA_WAITING_FOR_DATA, __func__);
    });
    EXPECT_CALL(checkpoint, Call(StrEq("Internal seek waiting for data")));

    EXPECT_CALL(*mTrackDemuxer, MockGetSamples).WillRepeatedly([]() {
      return SamplesPromise::CreateAndReject(
          NS_ERROR_DOM_MEDIA_WAITING_FOR_DATA, __func__);
    });
  }

  InitReader();

  // ReadMetadata() to init demuxer.
  (void)WaitForResolve(mProxy->ReadMetadata());
  // Two samples are provided by the demuxer, but the third demux request is
  // rejected.  The first drain provides two decoded samples.
  for (int i = 0; i < 2; ++i) {
    (void)WaitForResolve(mProxy->RequestVideoData(TimeUnit(), false));
  }
  // A third sample is not available.
  MediaResult result =
      WaitForReject(mProxy->RequestVideoData(TimeUnit(), false));
  EXPECT_EQ(result.Code(), NS_ERROR_DOM_MEDIA_WAITING_FOR_DATA);
  // The first drain is complete.  Wait for the internal seek to begin
  // re-priming the decoder, for NotifyDataArrived to be processed by the
  // demuxer, for a successful demux, for a decode, and for a failed demux.
  // Demux failure triggers a drain.  This drain is not beneficial or
  // necessary because no samples are available for the current playback
  // position, but MediaFormatReader repeats the drain process because of the
  // NotifyDataArrived triggered by the mock Seek().
  WaitForReaderOperations(5);

  checkpoint.Call("Internal seek waiting for data");
  MOZ_ASSERT(!drainPromise.IsEmpty());
  // Request more data to check that this does not clear the status of the
  // in-progress drain, as in step 5 of
  // https://bugzilla.mozilla.org/show_bug.cgi?id=1941164#c6
  // At the time of writing, without bug 1941164, MediaFormatReader does not
  // reject this promise until the drain completes.  However, the promise
  // could sensibly be rejected earlier because the failed demux has indicated
  // that video data is not available for the current playback position.
  (void)mProxy->RequestVideoData(TimeUnit(), false);
  // Trigger another Update() to check that another drain does not start.
  EXPECT_NS_SUCCEEDED(mReader->OwnerThread()->Dispatch(
      NewRunnableMethod("NotifyDataArrived", mReader.get(),
                        &MediaFormatReader::NotifyDataArrived)));
  // Wait for NotifyDataArrived to be processed by the demuxer and for another
  // demux request to complete.
  WaitForReaderOperations(2);
  // Clean up.
  WaitForResolve(mProxy->Shutdown());
  drainPromise.Reject(NS_ERROR_ILLEGAL_DURING_SHUTDOWN, __func__);
}

// A skip-to-next-keyframe started by the decode-error recovery path has no
// pending video promise, so a later frame request that also wants to skip must
// not start a second skip on the still-live skip request.
TEST_F(TestMediaFormatReader, VideoSkipDoesNotReenterAcrossErrorRecovery) {
  PDMFactory::AutoForcePDM autoForcePDM(mPdm);
  // Set up a reader whose decode-error recovery skips to the next keyframe. A
  // keyframe ahead of position zero means a plain frame request does not skip
  // while the recovery path and an explicit next-keyframe request do; each
  // started skip is held in flight and counted; the priming drain fails so
  // recovery is reached.
  MozPromiseHolder<MediaTrackDemuxer::SkipAccessPointPromise> skipPromise;
  Atomic<int> skipCount{0};
  ON_CALL(*mTrackDemuxer, GetNextRandomAccessPoint)
      .WillByDefault([](TimeUnit* aTime) {
        *aTime = TimeUnit(10, 30);
        return NS_OK;
      });
  ON_CALL(*mTrackDemuxer, SkipToNextRandomAccessPoint)
      .WillByDefault([&](const TimeUnit&) {
        ++skipCount;
        return skipPromise.Ensure(__func__);
      });
  ExpectDecoderWithFailingPrimingDrain();
  ExpectDemuxReachingInternalSeekPriming();
  InitReader();

  // Drive the reader until the failing priming drain has started a recovery
  // skip that has no pending frame request.
  ReachInternalSeekPriming();
  SpinEventLoopUntil("recovery skip started"_ns,
                     [&]() { return skipCount >= 1; });

  // A frame request that also wants to skip must not start a second skip while
  // the recovery skip is still in flight.
  RefPtr pending = mProxy->RequestVideoData(TimeUnit(), true);
  mReader->OwnerThread()->AwaitIdle();
  EXPECT_EQ(static_cast<int>(skipCount), 1);

  // Complete the in-flight skip on the demuxer thread, where the skip promise
  // is created and would be resolved in production, so the deferred request is
  // serviced without touching the promise holder across threads.
  EXPECT_NS_SUCCEEDED(
      mDemuxerThread->Dispatch(NS_NewRunnableFunction("CompleteVideoSkip", [&] {
        skipPromise.Reject(MediaTrackDemuxer::SkipFailureHolder(
                               NS_ERROR_DOM_MEDIA_CANCELED, 0),
                           __func__);
      })));
  MediaResult pendingResult = WaitForReject(pending);
  EXPECT_EQ(pendingResult.Code(), NS_ERROR_DOM_MEDIA_CANCELED);

  WaitForResolve(mProxy->Shutdown());
}
