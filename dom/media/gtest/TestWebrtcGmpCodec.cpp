/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "WebrtcGmpVideoCodec.h"
#include "api/video/i420_buffer.h"
#include "gmock/gmock.h"
#include "gtest/gtest.h"
#include "media/base/media_constants.h"
#include "mozilla/gtest/WaitFor.h"

using testing::_;
using testing::AtLeast;
using testing::Eq;
using testing::Ge;
using testing::Gt;
using testing::InSequence;
using testing::Property;
using testing::Test;

namespace mozilla {

struct TestWebrtcGmpVideoEncoder : public Test {
  nsCOMPtr<nsIThread> mGmpThread;
  RefPtr<WebrtcGmpVideoEncoder> mEncoder;
  webrtc::VideoCodec mCodecSettings;
  webrtc::VideoEncoder::Settings mSettings = {
      webrtc::VideoEncoder::Capabilities(/*loss_notification=*/true),
      /*number_of_cores=*/1, /*max_payload_size=*/0};

  void SetUp() override {
    mEncoder = MakeRefPtr<WebrtcGmpVideoEncoder>(
        webrtc::SdpVideoFormat(webrtc::kH264CodecName), "dummy");
    mCodecSettings.codecType = webrtc::VideoCodecType::kVideoCodecH264;
    mCodecSettings.numberOfSimulcastStreams = 1;
    mCodecSettings.simulcastStream[0].active = true;
    mCodecSettings.simulcastStream[0].numberOfTemporalLayers = 1;
    mCodecSettings.width = 640;
    mCodecSettings.height = 480;
    mCodecSettings.maxFramerate = 60;
    mCodecSettings.minBitrate = 50;
    mCodecSettings.startBitrate = 200;
    mCodecSettings.maxBitrate = 1000;

    nsCOMPtr<mozIGeckoMediaPluginService> mps =
        do_GetService("@mozilla.org/gecko-media-plugin-service;1");
    ASSERT_TRUE(mps);
    mps->GetThread(getter_AddRefs(mGmpThread));
    ASSERT_TRUE(mGmpThread);
  }

  // Dropping the last RefPtr does not destroy the encoder: it and
  // GMPVideoEncoderParent hold refs on each other, and only Shutdown() breaks
  // that cycle. Shutdown() also clears the encode-complete callback. The mock
  // it points at died with the test body, so the pointer would otherwise stay
  // dangling for the rest of the process.
  void TearDown() override {
    mEncoder->Shutdown();
    mEncoder = nullptr;
  }

  // Connect before starting the init: MediaEventSource does not replay, and a
  // warm plugin finishes the init on the GMP thread before this thread would
  // get a chance to subscribe.
  void InitEncodeAndWait() {
    auto init = TakeN(*mEncoder->InitPluginEvent(), 1);
    EXPECT_EQ(mEncoder->InitEncode(&mCodecSettings, mSettings),
              WEBRTC_VIDEO_CODEC_OK);
    (void)WaitFor(init);
  }
};

struct MockEncodedImageCallback : public webrtc::EncodedImageCallback {
  MOCK_METHOD(Result, OnEncodedImage,
              (const webrtc::EncodedImage&, const webrtc::CodecSpecificInfo*),
              (override));
  MOCK_METHOD(void, OnFrameDropped, (uint32_t, int, bool), (override));
};

auto CreateBlackFrame(int width, int height) {
  auto buffer = webrtc::I420Buffer::Create(width, height);
  webrtc::I420Buffer::SetBlack(buffer.get());
  return buffer;
}

TEST_F(TestWebrtcGmpVideoEncoder, EmptyLifecycle) {}

TEST_F(TestWebrtcGmpVideoEncoder, InitEncode) { InitEncodeAndWait(); }

TEST_F(TestWebrtcGmpVideoEncoder, Encode) {
  using Result = webrtc::EncodedImageCallback::Result;
  InitEncodeAndWait();

  MozPromiseHolder<GenericPromise> doneHolder;
  RefPtr donePromise = doneHolder.Ensure(__func__);
  MockEncodedImageCallback callback;
  constexpr uint32_t rtp_time = 55;
  EXPECT_CALL(
      callback,
      OnEncodedImage(
          Property(&webrtc::EncodedImage::RtpTimestamp, Eq(rtp_time)), _))
      .WillOnce([&] {
        doneHolder.Resolve(true, "TestWebrtcGmpVideoEncoder::Encode");
        return Result(Result::OK);
      });
  mEncoder->RegisterEncodeCompleteCallback(&callback);
  std::vector<webrtc::VideoFrameType> types = {
      webrtc::VideoFrameType::kVideoFrameKey};
  EXPECT_EQ(
      mEncoder->Encode(webrtc::VideoFrame::Builder()
                           .set_rtp_timestamp(rtp_time)
                           .set_video_frame_buffer(CreateBlackFrame(
                               mCodecSettings.width, mCodecSettings.height))
                           .build(),
                       &types),
      WEBRTC_VIDEO_CODEC_OK);
  EXPECT_EQ(WaitForResolve(donePromise), true);
}

TEST_F(TestWebrtcGmpVideoEncoder, BackPressure) {
  using Result = webrtc::EncodedImageCallback::Result;
  InitEncodeAndWait();

  MozPromiseHolder<GenericPromise> doneHolder;
  RefPtr donePromise = doneHolder.Ensure(__func__);
  MockEncodedImageCallback callback;
  constexpr uint32_t rtpTime = 55;
  constexpr size_t iterations = 1000;
  Atomic<uint32_t> lastRtpTime{};
  Atomic<size_t> eventCount{};
  const auto countIteration = [&] {
    size_t c = ++eventCount;
    EXPECT_LE(c, iterations);
    if (c == iterations) {
      doneHolder.Resolve(true, "TestWebrtcGmpVideoEncoder::BackPressure");
    }
  };
  EXPECT_CALL(
      callback,
      OnEncodedImage(
          Property(&webrtc::EncodedImage::RtpTimestamp,
                   testing::AllOf(Ge(rtpTime), Gt<uint32_t>(lastRtpTime))),
          _))
      .Times(AtLeast(1))
      .WillRepeatedly([&](const auto& aImage, const auto*) {
        lastRtpTime = aImage.RtpTimestamp();
        countIteration();
        return Result(Result::OK);
      });
  EXPECT_CALL(callback, OnFrameDropped(_, /* spatial_id = */ 0,
                                       /* is_end_of_temporal_unit = */ true))
      .Times(AtLeast(iterations / 10))
      .WillRepeatedly(countIteration);
  mEncoder->RegisterEncodeCompleteCallback(&callback);
  std::vector<webrtc::VideoFrameType> types = {
      webrtc::VideoFrameType::kVideoFrameKey};
  EXPECT_EQ(
      mEncoder->Encode(webrtc::VideoFrame::Builder()
                           .set_rtp_timestamp(rtpTime)
                           .set_video_frame_buffer(CreateBlackFrame(
                               mCodecSettings.width, mCodecSettings.height))
                           .build(),
                       &types),
      WEBRTC_VIDEO_CODEC_OK);
  for (size_t i = 1; i < iterations; ++i) {
    mEncoder->Encode(webrtc::VideoFrame::Builder()
                         .set_rtp_timestamp(rtpTime + i)
                         .set_video_frame_buffer(CreateBlackFrame(
                             mCodecSettings.width, mCodecSettings.height))
                         .build(),
                     &types);
  }
  EXPECT_EQ(WaitForResolve(donePromise), true);
  EXPECT_EQ(eventCount, iterations);
}

TEST_F(TestWebrtcGmpVideoEncoder, ReUse) {
  using Result = webrtc::EncodedImageCallback::Result;
  InitEncodeAndWait();

  MozPromiseHolder<GenericPromise> doneHolder;
  RefPtr donePromise = doneHolder.Ensure(__func__);
  MockEncodedImageCallback callback;
  constexpr uint32_t rtpTime = 55;
  constexpr uint32_t rtpTime2 = rtpTime * 2;
  EXPECT_CALL(callback,
              OnEncodedImage(
                  Property(&webrtc::EncodedImage::RtpTimestamp, rtpTime2), _))
      .WillOnce([&] {
        doneHolder.Resolve(true, "TestWebrtcGmpVideoEncoder::ReUse");
        return Result(Result::OK);
      });
  mEncoder->RegisterEncodeCompleteCallback(&callback);

  // Block the GMP thread until after Shutdown() as to avoid racing between the
  // first encoded callback and the Shutdown() call.
  Monitor mon(__func__);
  bool block = true;
  MOZ_ALWAYS_SUCCEEDS(
      mGmpThread->Dispatch(NS_NewRunnableFunction(__func__, [&] {
        MonitorAutoLock lock(mon);
        while (block) {
          lock.Wait();
        }
      })));
  std::vector<webrtc::VideoFrameType> types = {
      webrtc::VideoFrameType::kVideoFrameKey};
  EXPECT_EQ(
      mEncoder->Encode(webrtc::VideoFrame::Builder()
                           .set_rtp_timestamp(rtpTime)
                           .set_video_frame_buffer(CreateBlackFrame(
                               mCodecSettings.width, mCodecSettings.height))
                           .build(),
                       &types),
      WEBRTC_VIDEO_CODEC_OK);

  // Shutdown mid-encode, then re-init and encode again.
  mEncoder->Shutdown();
  {
    MonitorAutoLock lock(mon);
    block = false;
    lock.Notify();
  }
  InitEncodeAndWait();
  mEncoder->RegisterEncodeCompleteCallback(&callback);

  EXPECT_EQ(
      mEncoder->Encode(webrtc::VideoFrame::Builder()
                           .set_rtp_timestamp(rtpTime2)
                           .set_video_frame_buffer(CreateBlackFrame(
                               mCodecSettings.width, mCodecSettings.height))
                           .build(),
                       &types),
      WEBRTC_VIDEO_CODEC_OK);
  EXPECT_EQ(WaitForResolve(donePromise), true);
}

TEST_F(TestWebrtcGmpVideoEncoder, TrackedFrameDrops) {
  using Result = webrtc::EncodedImageCallback::Result;
  // Tell the fakeopenh264 plugin to drop some allocated input frames without
  // telling us. It will drop every fifth input frame. This shall get tracked
  // as frame drops.
  mCodecSettings.SetFrameDropEnabled(true);
  InitEncodeAndWait();

  Monitor m(__func__);
  size_t numEvents = 0;
  const auto handleEvent = ([&] {
    MonitorAutoLock lock(m);
    ++numEvents;
    lock.Notify();
  });
  MockEncodedImageCallback callback;
  {
    InSequence s;
    EXPECT_CALL(callback, OnEncodedImage(_, _)).Times(4).WillRepeatedly([&] {
      handleEvent();
      return Result(Result::OK);
    });
    EXPECT_CALL(callback, OnFrameDropped(_, /* spatial_id = */ 0,
                                         /* is_end_of_temporal_unit = */ true))
        .WillOnce(handleEvent);
  }
  mEncoder->RegisterEncodeCompleteCallback(&callback);

  constexpr uint32_t ntpTime = 55;
  std::vector<webrtc::VideoFrameType> types = {
      webrtc::VideoFrameType::kVideoFrameKey};
  for (uint8_t i = 0; i < 5; ++i) {
    EXPECT_EQ(
        mEncoder->Encode(webrtc::VideoFrame::Builder()
                             .set_ntp_time_ms(ntpTime * (i + 1))
                             .set_video_frame_buffer(CreateBlackFrame(
                                 mCodecSettings.width, mCodecSettings.height))
                             .build(),
                         &types),
        WEBRTC_VIDEO_CODEC_OK);
    MonitorAutoLock lock(m);
    while (numEvents <= i) {
      lock.Wait();
    }
  }
}

static void ExpectStrippedBytes(const nsTArray<uint8_t>& aActual,
                                std::initializer_list<uint8_t> aExpected) {
  ASSERT_EQ(aActual.Length(), aExpected.size());
  size_t i = 0;
  for (uint8_t expected : aExpected) {
    EXPECT_EQ(aActual[i], expected) << "mismatch at byte " << i;
    ++i;
  }
}

// AUD first, then an IDR that uses a 3-byte start code. The AUD is removed and
// the now-first NALU is normalized to a 4-byte start code so the GMP packaging
// stays valid.
TEST(TestWebrtcAudStrip, AudFirstThreeByteIdr)
{
  const uint8_t input[] = {
      0, 0, 0, 1,    0x09, 0x10,  // AUD, 4-byte start code
      0, 0, 1, 0x65, 0xAA, 0xBB,  // IDR slice, 3-byte start code
  };
  nsTArray<uint8_t> out;
  EXPECT_TRUE(StripH264AccessUnitDelimiters(input, sizeof(input), out));
  ExpectStrippedBytes(out, {0, 0, 0, 1, 0x65, 0xAA, 0xBB});
}

// AUD last, as GeForce NOW sends it. The trailing AUD is removed; the leading
// NALUs keep their original start codes.
TEST(TestWebrtcAudStrip, AudLast)
{
  const uint8_t input[] = {
      0, 0, 0, 1,    0x67, 0x21, 0x22,  // SPS, 4-byte start code
      0, 0, 1, 0x68, 0x23,              // PPS, 3-byte start code
      0, 0, 1, 0x65, 0x24, 0x25,        // IDR, 3-byte start code
      0, 0, 1, 0x09, 0x10,              // AUD, 3-byte start code
  };
  nsTArray<uint8_t> out;
  EXPECT_TRUE(StripH264AccessUnitDelimiters(input, sizeof(input), out));
  ExpectStrippedBytes(out, {
                               0,
                               0,
                               0,
                               1,
                               0x67,
                               0x21,
                               0x22,  // SPS
                               0,
                               0,
                               1,
                               0x68,
                               0x23,  // PPS
                               0,
                               0,
                               1,
                               0x65,
                               0x24,
                               0x25,  // IDR
                           });
}

// Only an AUD present: the helper yields an empty buffer, which Decode_g treats
// as a benign frame drop.
TEST(TestWebrtcAudStrip, AudOnly)
{
  const uint8_t input[] = {0, 0, 0, 1, 0x09, 0x10};
  nsTArray<uint8_t> out;
  EXPECT_TRUE(StripH264AccessUnitDelimiters(input, sizeof(input), out));
  EXPECT_TRUE(out.IsEmpty());
}

// A trailing (empty) start code must not cause an out-of-bounds read.
TEST(TestWebrtcAudStrip, AudPlusTrailingEmptyStartCode)
{
  const uint8_t input[] = {
      0, 0, 0, 1,    0x41, 0x26,  // non-IDR slice, 4-byte start code
      0, 0, 1, 0x09, 0x10,        // AUD, 3-byte start code
      0, 0, 1,                    // trailing start code, no payload
  };
  nsTArray<uint8_t> out;
  EXPECT_TRUE(StripH264AccessUnitDelimiters(input, sizeof(input), out));
  ExpectStrippedBytes(out, {0, 0, 0, 1, 0x41, 0x26});
}

// No AUD: returns false and leaves the output empty, avoiding a copy.
TEST(TestWebrtcAudStrip, NoAud)
{
  const uint8_t input[] = {
      0, 0, 0, 1,    0x67, 0x21,  // SPS
      0, 0, 1, 0x65, 0x24,        // IDR
  };
  nsTArray<uint8_t> out;
  EXPECT_FALSE(StripH264AccessUnitDelimiters(input, sizeof(input), out));
  EXPECT_TRUE(out.IsEmpty());
}

// No AUD, plus a trailing empty start code: exercises the empty-NALU guard in
// the initial scan loop (the AUD-present cases stop scanning before reaching
// it).
TEST(TestWebrtcAudStrip, NoAudTrailingEmptyStartCode)
{
  const uint8_t input[] = {
      0, 0, 0, 1, 0x41, 0x26,  // non-IDR slice, 4-byte start code
      0, 0, 1,                 // trailing start code, no payload
  };
  nsTArray<uint8_t> out;
  EXPECT_FALSE(StripH264AccessUnitDelimiters(input, sizeof(input), out));
  EXPECT_TRUE(out.IsEmpty());
}

// AUD first plus SPS/PPS/slice: all non-AUD NALUs are preserved in order.
TEST(TestWebrtcAudStrip, AudFirstPreservesOtherNalus)
{
  const uint8_t input[] = {
      0, 0, 0, 1,    0x09, 0x10,  // AUD, 4-byte start code
      0, 0, 0, 1,    0x67, 0x21,  // SPS, 4-byte start code
      0, 0, 1, 0x68, 0x23,        // PPS, 3-byte start code
      0, 0, 1, 0x65, 0x24,        // IDR, 3-byte start code
  };
  nsTArray<uint8_t> out;
  EXPECT_TRUE(StripH264AccessUnitDelimiters(input, sizeof(input), out));
  ExpectStrippedBytes(out, {
                               0,
                               0,
                               0,
                               1,
                               0x67,
                               0x21,  // SPS
                               0,
                               0,
                               1,
                               0x68,
                               0x23,  // PPS
                               0,
                               0,
                               1,
                               0x65,
                               0x24,  // IDR
                           });
}
}  // namespace mozilla
