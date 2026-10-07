/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "H265.h"
#include "MatroskaDemuxer.h"
#include "MediaDataDemuxer.h"
#include "MockMediaResource.h"
#include "VideoUtils.h"
#include "WebMDemuxer.h"
#include "gtest/gtest-spi.h"
#include "gtest/gtest.h"
#include "mozilla/MozPromise.h"
#include "mozilla/SharedThreadPool.h"
#include "mozilla/TaskQueue.h"
#include "mozilla/gfx/Types.h"

using namespace mozilla;
using media::TimeUnit;

TEST(WebMDemuxer, HDRMetadata)
{
  RefPtr<MockMediaResource> resource =
      new MockMediaResource("tos-vp9-hdr-cll.webm");
  ASSERT_EQ(NS_OK, resource->Open());

  RefPtr<WebMDemuxer> demuxer = new WebMDemuxer(resource);
  RefPtr<TaskQueue> taskQueue = TaskQueue::Create(
      GetMediaThreadPool(MediaThreadType::SUPERVISOR), "TestWebMDemuxer");

  bool ran = false;
  InvokeAsync(taskQueue, __func__, [demuxer]() { return demuxer->Init(); })
      ->Then(
          taskQueue, __func__,
          [&ran, demuxer, taskQueue]() {
            EXPECT_EQ(demuxer->GetNumberTracks(TrackInfo::kVideoTrack), 1u);

            UniquePtr<TrackInfo> info =
                demuxer->GetTrackInfo(TrackInfo::kVideoTrack, 0);
            ASSERT_TRUE(info != nullptr);
            VideoInfo* videoInfo = info->GetAsVideoInfo();
            ASSERT_TRUE(videoInfo != nullptr);

            ASSERT_TRUE(videoInfo->mHDRMetadata.isSome());
            ASSERT_TRUE(videoInfo->mHDRMetadata->mSmpte2086.isSome());
            const auto& smpte = videoInfo->mHDRMetadata->mSmpte2086.value();

            EXPECT_FLOAT_EQ(smpte.displayPrimaryRed.x, 0.68f);
            EXPECT_FLOAT_EQ(smpte.displayPrimaryRed.y, 0.32f);
            EXPECT_FLOAT_EQ(smpte.displayPrimaryGreen.x, 0.265f);
            EXPECT_FLOAT_EQ(smpte.displayPrimaryGreen.y, 0.69f);
            EXPECT_FLOAT_EQ(smpte.displayPrimaryBlue.x, 0.15f);
            EXPECT_FLOAT_EQ(smpte.displayPrimaryBlue.y, 0.06f);
            EXPECT_FLOAT_EQ(smpte.whitePoint.x, 0.3127f);
            EXPECT_FLOAT_EQ(smpte.whitePoint.y, 0.329f);
            EXPECT_FLOAT_EQ(smpte.maxLuminance, 1000.0f);
            EXPECT_FLOAT_EQ(smpte.minLuminance, 0.0001f);

            ASSERT_TRUE(videoInfo->mHDRMetadata->mContentLightLevel.isSome());
            const auto& cll =
                videoInfo->mHDRMetadata->mContentLightLevel.value();
            EXPECT_EQ(cll.maxContentLightLevel, 1000u);
            EXPECT_EQ(cll.maxFrameAverageLightLevel, 400u);

            ran = true;
            taskQueue->BeginShutdown();
          },
          [taskQueue](const MediaResult& aError) {
            EXPECT_TRUE(false) << "WebMDemuxer::Init() failed";
            taskQueue->BeginShutdown();
          });

  taskQueue->AwaitShutdownAndIdle();
  EXPECT_TRUE(ran);
}

// Generated with open GOP so non-first keyframes are CRA_NUT, not IDR:
//   ffmpeg -f lavfi -i testsrc=duration=4:size=128x96:rate=30
//     -c:v libx265 -x265-params keyint=30:min-keyint=30:open-gop=1:info=0
//     -an test_hevc_open_gop.mkv
// Mirrors MP4Demuxer SeekHEVC: sample 1 is IDR_N_LP; later sync samples are
// CRA_NUT. Bug 2006226: MatroskaDemuxer must treat CRA/BLA as keyframes so
// seeking lands on a decodable frame instead of running to EOS.
TEST(MatroskaDemuxer, SeekHEVC)
{
  RefPtr<MockMediaResource> resource =
      new MockMediaResource("test_hevc_open_gop.mkv");
  ASSERT_EQ(NS_OK, resource->Open());

  RefPtr<MatroskaDemuxer> demuxer = new MatroskaDemuxer(resource);
  RefPtr<TaskQueue> taskQueue = TaskQueue::Create(
      GetMediaThreadPool(MediaThreadType::SUPERVISOR), "TestWebMDemuxer");

  // Seek past the first GOP. The nearest sync point is a CRA_NUT.
  // Each platform uses a different subset of the locals below: Mac records
  // the seek outcome for EXPECT_NONFATAL_FAILURE while other platforms
  // assert inline. Captures unused on a given platform are explicitly
  // consumed with (void) in that platform's branch, as [[maybe_unused]]
  // cannot be applied to lambda captures.
  const TimeUnit seekTime = TimeUnit::FromSeconds(2.0);

  bool ran = false;
  // VideoToolbox can only start from IDR, so the demuxer only marks IDR
  // frames as keyframes on macOS, mirroring MP4Demuxer. Falling back to
  // the preceding IDR when seeking to a CRA is not implemented yet, so
  // this seek currently fails on Mac. Record the outcome and assert it
  // as an expected failure: once the fallback exists this will go red,
  // at which point remove the annotation and assert the IDR fallback
  // (see MP4Demuxer.SeekHEVC for the equivalent Apple expectations).
  bool seekSucceeded = false;
  bool firstKeyframe = false;
  InvokeAsync(taskQueue, __func__, [demuxer]() { return demuxer->Init(); })
      ->Then(
          taskQueue, __func__,
          [demuxer, taskQueue, seekTime, &ran, &seekSucceeded,
           &firstKeyframe]() {
            EXPECT_EQ(demuxer->GetNumberTracks(TrackInfo::kVideoTrack), 1u);
            RefPtr<MediaTrackDemuxer> videoTrack =
                demuxer->GetTrackDemuxer(TrackInfo::kVideoTrack, 0);
            videoTrack->Seek(seekTime)->Then(
                taskQueue, __func__,
                [videoTrack, taskQueue, seekTime, &seekSucceeded,
                 &firstKeyframe, &ran](TimeUnit aActualTime) {
#ifdef MOZ_APPLEMEDIA
                  // `seekTime` and `ran` are only asserted on other
                  // platforms below.
                  (void)seekTime;
                  (void)ran;
                  videoTrack->GetSamples()->Then(
                      taskQueue, __func__,
                      [taskQueue, aActualTime, &seekSucceeded, &firstKeyframe](
                          RefPtr<MediaTrackDemuxer::SamplesHolder> aSamples) {
                        if (!aSamples->GetSamples().IsEmpty()) {
                          RefPtr<MediaRawData> first =
                              aSamples->GetSamples()[0];
                          seekSucceeded = true;
                          firstKeyframe =
                              first->mKeyframe && first->mTime == aActualTime;
                        }
                        taskQueue->BeginShutdown();
                      },
                      [taskQueue](const MediaResult&) {
                        taskQueue->BeginShutdown();
                      });
#else
                  // `seekSucceeded` and `firstKeyframe` are only recorded
                  // on Mac above.
                  (void)seekSucceeded;
                  (void)firstKeyframe;
                  EXPECT_LE(aActualTime, seekTime);
                  videoTrack->GetSamples()->Then(
                      taskQueue, __func__,
                      [taskQueue, aActualTime, &ran](
                          RefPtr<MediaTrackDemuxer::SamplesHolder> aSamples) {
                        EXPECT_GT(aSamples->GetSamples().Length(), 0u);
                        RefPtr<MediaRawData> first = aSamples->GetSamples()[0];
                        EXPECT_TRUE(first->mKeyframe);
                        EXPECT_EQ(first->mTime, aActualTime);
                        ran = true;
                        taskQueue->BeginShutdown();
                      },
                      [taskQueue](const MediaResult&) {
                        EXPECT_TRUE(false) << "GetSamples failed after seek";
                        taskQueue->BeginShutdown();
                      });
#endif
                },
                [taskQueue](const MediaResult&) {
#ifndef MOZ_APPLEMEDIA
                  EXPECT_TRUE(false) << "Seek failed";
#endif
                  taskQueue->BeginShutdown();
                });
          },
          [taskQueue](const MediaResult&) {
            EXPECT_TRUE(false) << "MatroskaDemuxer::Init() failed";
            taskQueue->BeginShutdown();
          });

  taskQueue->AwaitShutdownAndIdle();
#ifdef MOZ_APPLEMEDIA
  EXPECT_NONFATAL_FAILURE(
      EXPECT_TRUE(seekSucceeded && firstKeyframe)
          << "Mac CRA seek should succeed with IDR fallback",
      "Mac CRA seek should succeed");
#else
  EXPECT_TRUE(ran);
#endif
}

// Bug 2000420: ReadMetadata for AAC-in-Matroska must not scan the whole
// file to count frames (startup would stall until everything is
// downloaded). Init output_aac.mkv and assert the frame count is left at
// its default 0 instead of the exact total, then demuxes audio normally.
TEST(MatroskaDemuxer, AACFrameCountNotParsed)
{
  RefPtr<MockMediaResource> resource = new MockMediaResource("output_aac.mkv");
  ASSERT_EQ(NS_OK, resource->Open());

  RefPtr<MatroskaDemuxer> demuxer = new MatroskaDemuxer(resource);
  RefPtr<TaskQueue> taskQueue = TaskQueue::Create(
      GetMediaThreadPool(MediaThreadType::SUPERVISOR), "TestWebMDemuxer");

  bool ran = false;
  InvokeAsync(taskQueue, __func__, [demuxer]() { return demuxer->Init(); })
      ->Then(
          taskQueue, __func__,
          [demuxer, taskQueue, &ran]() {
            EXPECT_EQ(demuxer->GetNumberTracks(TrackInfo::kAudioTrack), 1u);
            UniquePtr<TrackInfo> info =
                demuxer->GetTrackInfo(TrackInfo::kAudioTrack, 0);
            ASSERT_TRUE(info);
            AudioInfo* audioInfo = info->GetAsAudioInfo();
            ASSERT_TRUE(audioInfo);
            EXPECT_TRUE(audioInfo->mMimeType.EqualsLiteral("audio/mp4a-latm"));
            ASSERT_TRUE(
                audioInfo->mCodecSpecificConfig.is<AacCodecSpecificData>());
            // The exact total must not be computed; it stays unset.
            EXPECT_TRUE(
                audioInfo->mCodecSpecificConfig.as<AacCodecSpecificData>()
                    .mMediaFrameCount.isNothing());
            RefPtr<MediaTrackDemuxer> audioTrack =
                demuxer->GetTrackDemuxer(TrackInfo::kAudioTrack, 0);
            audioTrack->GetSamples()->Then(
                taskQueue, __func__,
                [taskQueue,
                 &ran](RefPtr<MediaTrackDemuxer::SamplesHolder> aHolder) {
                  EXPECT_GT(aHolder->GetSamples().Length(), 0u);
                  ran = true;
                  taskQueue->BeginShutdown();
                },
                [taskQueue](const MediaResult&) {
                  EXPECT_TRUE(false) << "GetSamples failed";
                  taskQueue->BeginShutdown();
                });
          },
          [taskQueue](const MediaResult&) {
            EXPECT_TRUE(false) << "MatroskaDemuxer::Init() failed";
            taskQueue->BeginShutdown();
          });

  taskQueue->AwaitShutdownAndIdle();
  EXPECT_TRUE(ran);
}
