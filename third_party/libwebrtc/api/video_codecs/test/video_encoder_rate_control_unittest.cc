/*
 *  Copyright (c) 2026 The WebRTC project authors. All Rights Reserved.
 *
 *  Use of this source code is governed by a BSD-style license
 *  that can be found in the LICENSE file in the root of the source
 *  tree. An additional intellectual property rights grant can be found
 *  in the file PATENTS.  All contributing project authors may
 *  be found in the AUTHORS file in the root of the source tree.
 */

#include <algorithm>
#include <cstddef>
#include <cstdint>
#include <deque>
#include <memory>
#include <optional>
#include <string>
#include <tuple>
#include <utility>
#include <vector>

#include "api/environment/environment.h"
#include "api/media_stream_interface.h"
#include "api/scoped_refptr.h"
#include "api/test/create_frame_generator.h"
#include "api/test/frame_generator_interface.h"
#include "api/units/data_rate.h"
#include "api/units/data_size.h"
#include "api/units/frequency.h"
#include "api/units/time_delta.h"
#include "api/units/timestamp.h"
#include "api/video/i420_buffer.h"
#include "api/video/resolution.h"
#include "api/video/video_frame.h"
#include "api/video/video_frame_buffer.h"
#include "api/video_codecs/libaom_av1_encoder_factory.h"
#include "api/video_codecs/test/video_codec_test_utils.h"
#include "api/video_codecs/video_decoder_factory.h"
#include "api/video_codecs/video_encoder_builders.h"
#include "api/video_codecs/video_encoder_builders_for_test.h"
#include "api/video_codecs/video_encoder_factory_interface.h"
#include "api/video_codecs/video_encoder_interface.h"
#include "api/video_codecs/video_encoding_general.h"
#include "rtc_base/checks.h"
#include "rtc_base/logging.h"
#include "test/create_test_environment.h"
#include "test/gmock.h"
#include "test/gtest.h"
#include "test/qp_parser_for_test.h"
#include "test/testsupport/file_utils.h"
#include "test/testsupport/frame_reader.h"
#include "test/testsupport/pendulum_frame_generator.h"
#include "test/testsupport/switching_frame_reader.h"
#include "test/time_controller/simulated_time_controller.h"

// This file contains tests evaluating the rate control requirements in
// `api/video_codecs/g3doc/video_encoder_api_v2.md`.
// These are not meant to be exhaustive and are not intended for continuous
// performance testing. See e.g. test/video_codec_tester.h for such purposes.

namespace webrtc {
namespace {

// Tracks accumulated data sizes and duration for actual encoded bytes and ideal
// CBR bytes.
struct AccumulatedData {
  DataSize actual = DataSize::Zero();
  DataSize ideal = DataSize::Zero();
  TimeDelta duration = TimeDelta::Zero();
  std::optional<double> psnr;

  void Add(const AccumulatedData& other) {
    actual += other.actual;
    ideal += other.ideal;
    duration += other.duration;
  }

  void Subtract(const AccumulatedData& other) {
    actual -= other.actual;
    ideal -= other.ideal;
    duration -= other.duration;
  }

  double deviation_pct() const { return 100.0 * (actual / ideal - 1.0); }
};

class VideoEncoderRateControlTestBase : public ::testing::Test {
 protected:
  VideoEncoderRateControlTestBase() = default;

  bool SupportsCbr() const {
    VideoEncoderFactoryInterface::Capabilities capabilities =
        encoder_factory_->GetEncoderCapabilities();
    const std::vector<VideoEncoderFactoryInterface::RateControlMode>& rc_modes =
        capabilities.bitrate_control().rc_modes();
    return std::find(rc_modes.begin(), rc_modes.end(),
                     VideoEncoderFactoryInterface::RateControlMode::kCbr) !=
           rc_modes.end();
  }

  // TestDecoder is only needed in order to produce PSNR.
  void EnableDecoder() {
    decoder_factory_ = CreateTestDecoderFactory();
    test_decoder_ = std::make_unique<TestDecoder>(
        env_, decoder_factory_.get(), encoder_factory_->CodecName());
    RTC_CHECK(test_decoder_->IsSupported());
  }

  void SetUpCbrEncoder(Resolution resolution) {
    ASSERT_TRUE(SupportsCbr());

    VideoEncoderFactoryInterface::StaticEncoderSettings static_settings =
        StaticEncoderSettingsBuilder()
            .MaxEncodeDimensions(resolution)
            .EncodingFormat({.sub_sampling = EncodingFormat::SubSampling::k420,
                             .bit_depth = 8})
            .CbrRcMode(TimeDelta::Millis(1000), TimeDelta::Millis(600))
            .MaxNumberOfThreads(1)
            .Build();

    encoder_ = encoder_factory_->CreateEncoder(static_settings, {});
    RTC_CHECK(encoder_ != nullptr);
    frame_generator_ = CreateFrameGenerator();
    RTC_CHECK(frame_generator_ != nullptr);
    current_timestamp_ = Timestamp::Zero();
    is_first_frame_ = true;
    test_decoder_.reset();
    decoder_factory_.reset();
    encoded_frames_.clear();
  }

  void SetFrameGenerator(
      std::unique_ptr<test::FrameGeneratorInterface> frame_generator) {
    RTC_CHECK(frame_generator != nullptr);
    frame_generator_ = std::move(frame_generator);
  }

  // Parameters for encoding a sequence of frames in rate control tests.
  struct EncodeSettings {
    int num_frames = 0;
    DataRate target_bitrate = DataRate::Zero();
    // Time interval between the start of successive frames.
    TimeDelta frame_interval = TimeDelta::Zero();
    // Nominal frame duration reported to the CBR rate controller. If
    // omitted, defaults to `frame_interval`.
    std::optional<TimeDelta> frame_duration;
    Resolution resolution;
    VideoTrackInterface::ContentHint content_hint =
        VideoTrackInterface::ContentHint::kNone;
    // When true, repeats the same image buffer instead of generating new
    // frames.
    bool repeat_frame = false;
  };

  void Encode(const EncodeSettings& settings) {
    TimeDelta frame_duration =
        settings.frame_duration.value_or(settings.frame_interval);
    VideoEncoderInterface::FrameEncodeSettings::Cbr cbr_settings{
        .duration = frame_duration,
        .target_bitrate = settings.target_bitrate,
    };

    scoped_refptr<VideoFrameBuffer> frame;
    for (int i = 0; i < settings.num_frames; ++i) {
      if (frame == nullptr || !settings.repeat_frame) {
        test::FrameGeneratorInterface::VideoFrameData frame_data =
            frame_generator_->NextFrame();
        ASSERT_TRUE(frame_data.buffer != nullptr);
        if (frame_data.buffer->width() == settings.resolution.width &&
            frame_data.buffer->height() == settings.resolution.height) {
          frame = frame_data.buffer;
        } else {
          scoped_refptr<I420Buffer> scaled_buffer = I420Buffer::Create(
              settings.resolution.width, settings.resolution.height);
          scaled_buffer->ScaleFrom(*frame_data.buffer->ToI420());
          frame = scaled_buffer;
        }
      }

      EncOut out;
      TemporalUnitSettings tu_settings(settings.content_hint,
                                       current_timestamp_);
      if (is_first_frame_) {
        encoder_->Encode(frame, tu_settings,
                         ToVec({Fb().Res(settings.resolution)
                                    .Upd(0)
                                    .Key()
                                    .Cbr(cbr_settings)
                                    .Out(out)}));
        is_first_frame_ = false;
      } else {
        encoder_->Encode(frame, tu_settings,
                         ToVec({Fb().Res(settings.resolution)
                                    .Ref({0})
                                    .Upd(0)
                                    .Delta()
                                    .Cbr(cbr_settings)
                                    .Out(out)}));
      }

      ASSERT_THAT(out, HasBitstreamAndMetaData());
      std::optional<double> psnr;
      if (test_decoder_ != nullptr) {
        VideoFrame decoded = test_decoder_->Decode(out.bitstream);
        psnr = Psnr(frame->ToI420(), decoded);
      }

      encoded_frames_.push_back(
          {.actual = DataSize::Bytes(out.bitstream.size()),
           .ideal = settings.target_bitrate * frame_duration,
           .duration = frame_duration,
           .psnr = psnr});
      current_timestamp_ += settings.frame_interval;
      time_controller_.AdvanceTime(settings.frame_interval);
    }
  }

  void VerifyTotalDeviation(double max_deviation_pct) {
    AccumulatedData total;
    for (const auto& frame : encoded_frames_) {
      total.Add(frame);
    }
    double total_deviation_pct = total.deviation_pct();
    RTC_LOG(LS_VERBOSE) << "total_bytes=" << total.actual.bytes()
                        << " optimal=" << total.ideal.bytes()
                        << " deviation=" << total_deviation_pct << "%";
    EXPECT_NEAR(total_deviation_pct, 0.0, max_deviation_pct)
        << "Bitrate deviation " << total_deviation_pct
        << "% exceeded tolerance " << max_deviation_pct
        << "% (actual: " << total.actual.bytes()
        << " bytes, target: " << total.ideal.bytes() << " bytes)";
  }

  void VerifyFrameBasedSlidingWindowBitrateDeviation(
      int window_frames,
      double min_allowed_dev_pct,
      double max_allowed_dev_pct) {
    AccumulatedData window_data;
    std::deque<AccumulatedData> window;
    std::optional<double> max_window_dev_pct;
    std::optional<double> min_window_dev_pct;

    for (const auto& frame : encoded_frames_) {
      window.push_back(frame);
      window_data.Add(frame);

      if (window.size() > static_cast<size_t>(window_frames)) {
        window_data.Subtract(window.front());
        window.pop_front();
      }

      if (window.size() == static_cast<size_t>(window_frames)) {
        double window_dev_pct = window_data.deviation_pct();
        if (!max_window_dev_pct || window_dev_pct > *max_window_dev_pct) {
          max_window_dev_pct = window_dev_pct;
        }
        if (!min_window_dev_pct || window_dev_pct < *min_window_dev_pct) {
          min_window_dev_pct = window_dev_pct;
        }
      }
    }

    ASSERT_TRUE(min_window_dev_pct.has_value());
    ASSERT_TRUE(max_window_dev_pct.has_value());

    RTC_LOG(LS_VERBOSE) << "sliding " << window_frames
                        << "-frame window deviation range: ["
                        << *min_window_dev_pct << "%, " << *max_window_dev_pct
                        << "%]";

    EXPECT_GE(*min_window_dev_pct, min_allowed_dev_pct);
    EXPECT_LE(*max_window_dev_pct, max_allowed_dev_pct);
  }

  void VerifyTimeBasedSlidingWindowBitrateDeviation(
      TimeDelta window_duration,
      std::optional<double> min_allowed_dev_pct,
      double max_allowed_dev_pct) {
    AccumulatedData window_data;
    std::deque<AccumulatedData> window;
    std::optional<double> max_window_dev_pct;
    std::optional<double> min_window_dev_pct;

    for (const auto& frame : encoded_frames_) {
      window.push_back(frame);
      window_data.Add(frame);

      while (window_data.duration >= window_duration) {
        double window_dev_pct = window_data.deviation_pct();
        if (!max_window_dev_pct || window_dev_pct > *max_window_dev_pct) {
          max_window_dev_pct = window_dev_pct;
        }
        if (!min_window_dev_pct || window_dev_pct < *min_window_dev_pct) {
          min_window_dev_pct = window_dev_pct;
        }

        window_data.Subtract(window.front());
        window.pop_front();
      }
    }

    ASSERT_TRUE(min_window_dev_pct.has_value());
    ASSERT_TRUE(max_window_dev_pct.has_value());

    RTC_LOG(LS_VERBOSE) << "sliding " << window_duration.seconds()
                        << "s window deviation range: [" << *min_window_dev_pct
                        << "%, " << *max_window_dev_pct << "%]";

    if (min_allowed_dev_pct.has_value()) {
      EXPECT_GE(*min_window_dev_pct, *min_allowed_dev_pct);
    }
    EXPECT_LE(*max_window_dev_pct, max_allowed_dev_pct);
  }

  GlobalSimulatedTimeController time_controller_{Timestamp::Zero()};
  Environment env_{CreateTestEnvironment({.time = &time_controller_})};
  std::unique_ptr<VideoEncoderFactoryInterface> encoder_factory_;
  std::unique_ptr<VideoEncoderInterface> encoder_;
  std::unique_ptr<VideoDecoderFactory> decoder_factory_;
  std::unique_ptr<TestDecoder> test_decoder_;
  std::unique_ptr<test::FrameGeneratorInterface> frame_generator_;
  std::vector<AccumulatedData> encoded_frames_;
  Timestamp current_timestamp_ = Timestamp::Zero();
  bool is_first_frame_ = true;
};

class VideoEncoderRateControlTest
    : public VideoEncoderRateControlTestBase,
      public ::testing::WithParamInterface<FactoryCreator> {
 protected:
  void SetUp() override { encoder_factory_ = GetParam()(); }
};

TEST_P(VideoEncoderRateControlTest, ConstantQpMatchesBitstreamAndEncoderQp) {
  VideoEncoderFactoryInterface::Capabilities capabilities =
      encoder_factory_->GetEncoderCapabilities();
  const std::vector<VideoEncoderFactoryInterface::RateControlMode>& rc_modes =
      capabilities.bitrate_control().rc_modes();
  if (std::find(rc_modes.begin(), rc_modes.end(),
                VideoEncoderFactoryInterface::RateControlMode::kCqp) ==
      rc_modes.end()) {
    GTEST_SKIP() << "Encoder does not support CQP mode.";
  }

  int min_qp = capabilities.bitrate_control().min_qp();
  int max_qp = capabilities.bitrate_control().max_qp();

  VideoEncoderFactoryInterface::StaticEncoderSettings static_settings =
      StaticEncoderSettingsBuilder()
          .MaxEncodeDimensions(kDefaultResolution)
          .EncodingFormat({.sub_sampling = EncodingFormat::SubSampling::k420,
                           .bit_depth = 8})
          .CqpRcMode()
          .MaxNumberOfThreads(1)
          .Build();

  QpParserForTest qp_parser;
  std::unique_ptr<test::FrameGeneratorInterface> frame_generator =
      CreateFrameGenerator();
  std::unique_ptr<VideoEncoderInterface> enc =
      encoder_factory_->CreateEncoder(static_settings, {});
  ASSERT_NE(enc, nullptr);

  int64_t timestamp_ms = 0;
  bool is_first_frame = true;

  for (int qp = min_qp; qp <= max_qp; ++qp) {
    scoped_refptr<VideoFrameBuffer> frame = frame_generator->NextFrame().buffer;
    EncOut out;
    if (is_first_frame) {
      enc->Encode(
          frame, TemporalUnitSettings(Timestamp::Millis(timestamp_ms)),
          ToVec({Fb().Cqp(qp).Res(kDefaultResolution).Upd(0).Key().Out(out)}));
      is_first_frame = false;
    } else {
      enc->Encode(
          frame, TemporalUnitSettings(Timestamp::Millis(timestamp_ms)),
          ToVec(
              {Fb().Cqp(qp).Res(kDefaultResolution).Ref({0}).Upd(0).Out(out)}));
    }
    timestamp_ms += 100;

    ASSERT_THAT(out, HasBitstreamAndMetaData());
    const EncodedData& ed = std::get<EncodedData>(out.res);
    // libaom quantizer resolution has step 4 across the 0-255 qindex range.
    EXPECT_NEAR(ed.encoded_qp, qp, 4);

    std::optional<uint32_t> parsed_qp = qp_parser.Parse(
        encoder_factory_->CodecName(), /*spatial_idx=*/0, out.bitstream);
    ASSERT_TRUE(parsed_qp.has_value())
        << "Failed to parse QP from bitstream for codec "
        << encoder_factory_->CodecName() << " at target QP " << qp;
    EXPECT_EQ(*parsed_qp, static_cast<uint32_t>(ed.encoded_qp));
  }
}

constexpr Resolution kQvgaResolution = {.width = 320, .height = 180};
constexpr Resolution kVgaResolution = {.width = 640, .height = 360};
constexpr Resolution kHdResolution = {.width = 1280, .height = 720};

struct FixedBitrateTestParams {
  std::string name;
  Resolution resolution;
  DataRate target_bitrate;
  TimeDelta duration;
  double max_deviation_pct;
};

class FixedBitrateRateControlTest
    : public VideoEncoderRateControlTestBase,
      public ::testing::WithParamInterface<
          std::tuple<FactoryCreator, FixedBitrateTestParams>> {
 protected:
  void SetUp() override { encoder_factory_ = std::get<0>(GetParam())(); }
};

TEST_P(FixedBitrateRateControlTest, AdheresToTargetBitrate) {
  if (!SupportsCbr()) {
    GTEST_SKIP() << "Encoder does not support CBR mode.";
  }
  const FixedBitrateTestParams& params = std::get<1>(GetParam());
  SetUpCbrEncoder(params.resolution);

  constexpr TimeDelta kFrameInterval = 1 / Frequency::Hertz(30);
  const int num_frames =
      (params.duration.us() + kFrameInterval.us() / 2) / kFrameInterval.us();

  Encode({.num_frames = num_frames,
          .target_bitrate = params.target_bitrate,
          .frame_interval = kFrameInterval,
          .resolution = params.resolution});
  VerifyTotalDeviation(params.max_deviation_pct);
}

// Verifies that dynamically changing the bitrate target follows the target
// within reasonable bounds, evaluated over a 2-second sliding window and
// overall accumulated bytes.
TEST_P(VideoEncoderRateControlTest, ChangingBitrateTargetVga) {
  if (!SupportsCbr()) {
    GTEST_SKIP() << "Encoder does not support CBR mode.";
  }
  SetUpCbrEncoder(kVgaResolution);

  constexpr TimeDelta kFrameInterval = 1 / Frequency::Hertz(30);
  constexpr int kWindowFrames = 60;  // 2-second sliding window (30 fps).

  // 1. 500 kbps for 2s (60 frames).
  Encode({.num_frames = 60,
          .target_bitrate = DataRate::KilobitsPerSec(500),
          .frame_interval = kFrameInterval,
          .resolution = kVgaResolution});
  // 2. Drop to 100 kbps for 1s (30 frames).
  Encode({.num_frames = 30,
          .target_bitrate = DataRate::KilobitsPerSec(100),
          .frame_interval = kFrameInterval,
          .resolution = kVgaResolution});
  // 3. Increase by 50 kbps every 200 ms (6 frames) until reaching 500 kbps.
  for (int rate_kbps = 150; rate_kbps < 500; rate_kbps += 50) {
    Encode({.num_frames = 6,
            .target_bitrate = DataRate::KilobitsPerSec(rate_kbps),
            .frame_interval = kFrameInterval,
            .resolution = kVgaResolution});
  }
  // 4. Stay at 500 kbps for 1s (30 frames).
  Encode({.num_frames = 30,
          .target_bitrate = DataRate::KilobitsPerSec(500),
          .frame_interval = kFrameInterval,
          .resolution = kVgaResolution});

  // (1) Check that deviation from optimal behavior over any 2-second sliding
  // window does not exceed 20%.
  VerifyFrameBasedSlidingWindowBitrateDeviation(kWindowFrames,
                                                /*min_allowed_dev_pct=*/-20.0,
                                                /*max_allowed_dev_pct=*/20.0);

  // (2) Check that the sum of bytes sent is within 5% of the optimal behavior.
  VerifyTotalDeviation(/*max_deviation_pct=*/5.0);
}

// Verifies that the CBR targets are adhered to even when input frame rate
// changes. Evaluated over a 2-second sliding window and overall accumulated
// bytes.
TEST_P(VideoEncoderRateControlTest, ChangingFramerateVga) {
  if (!SupportsCbr()) {
    GTEST_SKIP() << "Encoder does not support CBR mode.";
  }
  SetUpCbrEncoder(kVgaResolution);

  constexpr DataRate kTargetBitrate = DataRate::KilobitsPerSec(500);

  auto encode_segment = [&](Frequency framerate, TimeDelta duration) {
    TimeDelta frame_interval = 1 / framerate;
    int num_frames =
        (duration.us() + frame_interval.us() / 2) / frame_interval.us();
    Encode({.num_frames = num_frames,
            .target_bitrate = kTargetBitrate,
            .frame_interval = frame_interval,
            .resolution = kVgaResolution});
  };

  // 1. 30 fps for 2s.
  encode_segment(Frequency::Hertz(30), TimeDelta::Seconds(2));
  // 2. Drop to 10 fps for 1s.
  encode_segment(Frequency::Hertz(10), TimeDelta::Seconds(1));
  // 3. Step up gradually back to 30 fps (15 fps, 20 fps, 25 fps for 200ms
  // each).
  encode_segment(Frequency::Hertz(15), TimeDelta::Millis(200));
  encode_segment(Frequency::Hertz(20), TimeDelta::Millis(200));
  encode_segment(Frequency::Hertz(25), TimeDelta::Millis(200));
  // 4. Stay at 30 fps for 2s.
  encode_segment(Frequency::Hertz(30), TimeDelta::Seconds(2));

  // (1) Check that deviation from optimal behavior over any 1-second sliding
  // window does not exceed 20%.
  VerifyTimeBasedSlidingWindowBitrateDeviation(TimeDelta::Seconds(1),
                                               /*min_allowed_dev_pct=*/-20.0,
                                               /*max_allowed_dev_pct=*/20.0);

  // (2) Check that the sum of bytes sent is within 5% of the optimal behavior.
  VerifyTotalDeviation(/*max_deviation_pct=*/5.0);
}

// Verifies that the encoder adheres to CBR target bitrate when the video input
// periodically switches between different camera views every 5 seconds.
TEST_P(VideoEncoderRateControlTest, CameraSwitchingHd) {
  if (!SupportsCbr()) {
    GTEST_SKIP() << "Encoder does not support CBR mode.";
  }

  constexpr Resolution kResolution = kHdResolution;
  constexpr Frequency kFramerate = Frequency::Hertz(30);
  constexpr TimeDelta kFrameInterval = 1 / kFramerate;
  constexpr DataRate kTargetBitrate = DataRate::KilobitsPerSec(2000);
  constexpr TimeDelta kDuration = TimeDelta::Seconds(30);
  constexpr TimeDelta kSwitchInterval = TimeDelta::Seconds(5);
  const int num_frames =
      (kDuration.us() + kFrameInterval.us() / 2) / kFrameInterval.us();

  const std::vector<std::string> clip_paths = {
      test::ResourcePath("ConferenceMotion_1280_720_50", "yuv"),
      test::ResourcePath("FourPeople_1280x720_30", "yuv"),
      test::ResourcePath("reference_less_video_test_file", "y4m"),
  };

  std::unique_ptr<test::FrameGeneratorInterface> generator =
      test::CreateSwitchingFrameGenerator(
          clip_paths,
          {.width = static_cast<size_t>(kResolution.width),
           .height = static_cast<size_t>(kResolution.height)},
          kFramerate.hertz(), kSwitchInterval,
          test::YuvFrameReaderImpl::RepeatMode::kPingPong);

  SetUpCbrEncoder(kResolution);
  SetFrameGenerator(std::move(generator));
  Encode({.num_frames = num_frames,
          .target_bitrate = kTargetBitrate,
          .frame_interval = kFrameInterval,
          .resolution = kResolution});

  VerifyTotalDeviation(/*max_deviation_pct=*/5.0);
}

// Verified that the encoder adheres to CBR target bitrate when the video input
// has very high complexity both in terms of motion and high frequency detail.
TEST_P(VideoEncoderRateControlTest, SyntheticChaoticMotionStressHd) {
  constexpr Resolution kResolution = {.width = 1280, .height = 720};
  constexpr Frequency kFramerate = Frequency::Hertz(30);
  constexpr TimeDelta kFrameInterval = 1 / kFramerate;
  constexpr DataRate kTargetBitrate = DataRate::KilobitsPerSec(2000);
  constexpr TimeDelta kDuration = TimeDelta::Seconds(10);
  const int num_frames =
      (kDuration.us() + kFrameInterval.us() / 2) / kFrameInterval.us();

  test::PendulumFrameGenerator::Config config;
  config.target_resolution = {
      .width = static_cast<size_t>(kResolution.width),
      .height = static_cast<size_t>(kResolution.height)};
  config.fps = kFramerate.hertz();
  config.min_zoom = 1.2;
  config.max_zoom = 3.0;
  config.zoom_speed = 0.3;
  config.noise_level = 20;

  SetUpCbrEncoder(kResolution);
  SetFrameGenerator(std::make_unique<test::PendulumFrameGenerator>(config));
  Encode({.num_frames = num_frames,
          .target_bitrate = kTargetBitrate,
          .frame_interval = kFrameInterval,
          .resolution = kResolution});

  VerifyTotalDeviation(/*max_deviation_pct=*/5.0);
}

// TODO(bugs.webrtc.org/496266459): Add temporal/spatial layer allocation test.

// Verifies that the encoder behaves well in screenshare scenarios with mostly
// static content combined with intermittent slide changes at high resolution.
TEST_P(VideoEncoderRateControlTest, ScreenshareSlideChangesFullHd) {
  if (!SupportsCbr()) {
    GTEST_SKIP() << "Encoder does not support CBR mode.";
  }

  constexpr Resolution kFullHdResolution = {.width = 1920, .height = 1080};
  constexpr Resolution kResolution = kFullHdResolution;
  constexpr Frequency kFramerate = Frequency::Hertz(30);
  constexpr TimeDelta kFrameInterval = 1 / kFramerate;
  constexpr DataRate kTargetBitrate = DataRate::KilobitsPerSec(2500);
  constexpr TimeDelta kSlideDuration = TimeDelta::Seconds(2);
  constexpr TimeDelta kTotalDuration = TimeDelta::Seconds(6);
  const int num_frames =
      (kTotalDuration.us() + kFrameInterval.us() / 2) / kFrameInterval.us();
  const int frames_per_slide =
      (kSlideDuration.us() + kFrameInterval.us() / 2) / kFrameInterval.us();

  const std::vector<std::string> slides = {
      test::ResourcePath("web_screenshot_1850_1110", "yuv"),
      test::ResourcePath("presentation_1850_1110", "yuv"),
      test::ResourcePath("difficult_photo_1850_1110", "yuv"),
  };
  std::unique_ptr<test::FrameGeneratorInterface> slide_generator =
      test::CreateFromYuvFileFrameGenerator(slides, /*width=*/1850,
                                            /*height=*/1110, frames_per_slide);

  SetUpCbrEncoder(kResolution);
  EnableDecoder();
  SetFrameGenerator(std::move(slide_generator));

  AccumulatedData total;
  double sum_delta_psnr = 0.0;
  int delta_count = 0;
  for (int i = 0; i < num_frames; ++i) {
    Encode({.num_frames = 1,
            .target_bitrate = kTargetBitrate,
            .frame_interval = kFrameInterval,
            .resolution = kResolution,
            .content_hint = VideoTrackInterface::ContentHint::kDetailed});
    size_t frame_idx = encoded_frames_.size() - 1;
    DataSize size = encoded_frames_[frame_idx].actual;
    int offset_in_slide = i % frames_per_slide;
    if (offset_in_slide == 0) {
      // Transition frame to a new slide.
      EXPECT_GT(size.bytes(), 0);
      EXPECT_LE(size, kTargetBitrate * TimeDelta::Millis(575));
    } else {
      // Delta frames during static hold or refinement.
      EXPECT_LE(size, kTargetBitrate * TimeDelta::Millis(330));
      if (encoded_frames_[frame_idx].psnr.has_value()) {
        sum_delta_psnr += *encoded_frames_[frame_idx].psnr;
        ++delta_count;
      }
    }
    total.Add(encoded_frames_[frame_idx]);
  }

  // Total bytes should stay safely within the allocated CBR channel budget.
  EXPECT_GT(total.actual.bytes(), 0);
  EXPECT_LE(total.actual, total.ideal * 1.05);

  // Quality must remain high during static slide periods despite low bitrate.
  ASSERT_GT(delta_count, 0);
  EXPECT_GT(sum_delta_psnr / delta_count, 40.0);
}

// Verifies that the encoder adheres to CBR targets during screenshare scrolling
// with alternating scrolling and paused intervals.
TEST_P(VideoEncoderRateControlTest, ScreenshareScrollingHd) {
  if (!SupportsCbr()) {
    GTEST_SKIP() << "Encoder does not support CBR mode.";
  }

  constexpr Resolution kResolution = kHdResolution;
  constexpr Frequency kFramerate = Frequency::Hertz(30);
  constexpr TimeDelta kFrameInterval = 1 / kFramerate;
  constexpr DataRate kTargetBitrate = DataRate::KilobitsPerSec(2000);
  constexpr TimeDelta kScrollDuration = TimeDelta::Seconds(2);
  constexpr TimeDelta kPauseDuration = TimeDelta::Seconds(1);
  constexpr TimeDelta kTotalDuration = TimeDelta::Seconds(6);
  const int num_frames =
      (kTotalDuration.us() + kFrameInterval.us() / 2) / kFrameInterval.us();

  const std::vector<std::string> slides = {
      test::ResourcePath("difficult_photo_1850_1110", "yuv"),
      test::ResourcePath("web_screenshot_1850_1110", "yuv"),
  };

  std::unique_ptr<test::FrameGeneratorInterface> scroll_generator =
      test::CreateScrollingInputFromYuvFilesFrameGenerator(
          &env_.clock(), slides, /*source_width=*/1850,
          /*source_height=*/1110, kResolution.width, kResolution.height,
          kScrollDuration.ms(), kPauseDuration.ms());

  SetUpCbrEncoder(kResolution);
  EnableDecoder();
  SetFrameGenerator(std::move(scroll_generator));
  Encode({.num_frames = num_frames,
          .target_bitrate = kTargetBitrate,
          .frame_interval = kFrameInterval,
          .resolution = kResolution,
          .content_hint = VideoTrackInterface::ContentHint::kDetailed});

  // During screenshare scrolling, bitrate undershoot during pause intervals is
  // expected and allowed; only verify that overshoot is bounded.
  VerifyTimeBasedSlidingWindowBitrateDeviation(
      TimeDelta::Seconds(3),
      /*min_allowed_dev_pct=*/std::nullopt,
      /*max_allowed_dev_pct=*/20.0);

  AccumulatedData total;
  std::optional<double> min_pause_psnr;
  double sum_pause_psnr = 0.0;
  int pause_count = 0;
  // 60 frames scroll (2s), 30 frames pause (1s), repeated.
  for (size_t i = 0; i < encoded_frames_.size(); ++i) {
    total.Add(encoded_frames_[i]);
    int mod = i % 90;
    if (mod >= 60 && encoded_frames_[i].psnr.has_value()) {
      double p = *encoded_frames_[i].psnr;
      min_pause_psnr = min_pause_psnr ? std::min(*min_pause_psnr, p) : p;
      sum_pause_psnr += p;
      ++pause_count;
    }
  }

  // Total bytes should stay safely within the allocated CBR channel budget.
  EXPECT_GT(total.actual.bytes(), 0);
  EXPECT_LE(total.actual, total.ideal * 1.05);

  // Quality must not dip when bitrate drops during pauses.
  ASSERT_TRUE(min_pause_psnr.has_value());
  EXPECT_GT(*min_pause_psnr, 33.0);
  EXPECT_GT(sum_pause_psnr / pause_count, 40.0);
}

// Verifies that the rate controller behaves well when entering "Zero-Hz" mode
// (where static frames are encoded at 1 Hz repeat rate while each frame's
// encoded CBR duration remains 1/target_fps) and subsequent resumption of
// regular motion.
TEST_P(VideoEncoderRateControlTest, ScreenshareZeroHzHd) {
  if (!SupportsCbr()) {
    GTEST_SKIP() << "Encoder does not support CBR mode.";
  }

  constexpr Resolution kResolution = kHdResolution;
  constexpr Frequency kFramerate = Frequency::Hertz(30);
  constexpr TimeDelta kFrameInterval = 1 / kFramerate;
  constexpr DataRate kTargetBitrate = DataRate::KilobitsPerSec(1500);

  SetUpCbrEncoder(kResolution);
  EnableDecoder();
  SetFrameGenerator(test::CreateFromYuvFileFrameGenerator(
      {test::ResourcePath("FourPeople_1280x720_30", "yuv")}, kResolution.width,
      kResolution.height, /*frame_repeat_count=*/1));

  // Phase 1: 2 seconds of normal 30 fps motion.
  constexpr int kPhase1Frames = 60;
  Encode({.num_frames = kPhase1Frames,
          .target_bitrate = kTargetBitrate,
          .frame_interval = kFrameInterval,
          .resolution = kResolution,
          .content_hint = VideoTrackInterface::ContentHint::kDetailed});

  // Phase 2: Enter Zero-Hz mode. We hold a static frame and encode at 1 Hz
  // (timestamp advances by 1s), but CBR duration is still 1/target_fps
  // (33.3ms).
  constexpr int kZeroHzFrames = 3;
  constexpr TimeDelta kZeroHzRepeatPeriod = TimeDelta::Seconds(1);

  size_t phase2_start_idx = encoded_frames_.size();
  Encode({
      .num_frames = kZeroHzFrames,
      .target_bitrate = kTargetBitrate,
      .frame_interval = kZeroHzRepeatPeriod,
      .frame_duration = kFrameInterval,
      .resolution = kResolution,
      .content_hint = VideoTrackInterface::ContentHint::kDetailed,
      .repeat_frame = true,
  });

  for (size_t i = phase2_start_idx; i < phase2_start_idx + kZeroHzFrames; ++i) {
    // Each 1 Hz frame must not burst to fill the entire 1-second gap; its ideal
    // CBR allocation is 1 nominal frame duration (target_bitrate *
    // kFrameInterval).
    EXPECT_LE(encoded_frames_[i].actual,
              kTargetBitrate * kFrameInterval * 125 / 100);
    // Quality must remain high for static repeat frames.
    ASSERT_TRUE(encoded_frames_[i].psnr.has_value());
    EXPECT_GT(*encoded_frames_[i].psnr, 40.0);
  }

  // Phase 3: Resume motion at 30 fps for 3 seconds.
  constexpr int kPhase3Frames = 90;
  Encode({.num_frames = kPhase3Frames,
          .target_bitrate = kTargetBitrate,
          .frame_interval = kFrameInterval,
          .resolution = kResolution,
          .content_hint = VideoTrackInterface::ContentHint::kDetailed});

  // Verify that the encoder survived Zero-Hz and after resuming motion,
  // the Phase 3 frames converge to the target bitrate.
  AccumulatedData phase3_total;
  for (size_t i = phase2_start_idx + kZeroHzFrames; i < encoded_frames_.size();
       ++i) {
    phase3_total.Add(encoded_frames_[i]);
  }
  RTC_LOG(LS_VERBOSE) << "Phase 3 total deviation: "
                      << phase3_total.deviation_pct()
                      << "% (actual=" << phase3_total.actual.bytes()
                      << " bytes, ideal=" << phase3_total.ideal.bytes()
                      << " bytes)";
  EXPECT_NEAR(phase3_total.deviation_pct(), 0.0, 5.0);
}

std::unique_ptr<VideoEncoderFactoryInterface> CreateLibaomAv1EncoderFactory() {
  return std::make_unique<LibaomAv1EncoderFactory>();
}

INSTANTIATE_TEST_SUITE_P(LibaomAv1,
                         VideoEncoderRateControlTest,
                         ::testing::Values(CreateLibaomAv1EncoderFactory));

const FixedBitrateTestParams kFixedBitrateConfigs[] = {
    {"VgaNormalBitrate", kVgaResolution, DataRate::KilobitsPerSec(500),
     TimeDelta::Seconds(5), 5.0},
    {"VgaLowBitrate", kVgaResolution, DataRate::KilobitsPerSec(100),
     TimeDelta::Seconds(10), 5.0},
    {"VgaHighBitrate", kVgaResolution, DataRate::KilobitsPerSec(1500),
     TimeDelta::Seconds(5), 5.0},
    {"QvgaNormalBitrate", kQvgaResolution, DataRate::KilobitsPerSec(125),
     TimeDelta::Seconds(5), 6.0},
    {"QvgaLowBitrate", kQvgaResolution, DataRate::KilobitsPerSec(25),
     TimeDelta::Seconds(10), 10.0},
    {"QvgaHighBitrate", kQvgaResolution, DataRate::KilobitsPerSec(375),
     TimeDelta::Seconds(5), 5.0},
    {"HdNormalBitrate", kHdResolution, DataRate::KilobitsPerSec(2000),
     TimeDelta::Seconds(5), 5.0},
    {"HdLowBitrate", kHdResolution, DataRate::KilobitsPerSec(400),
     TimeDelta::Seconds(10), 5.0},
    {"HdHighBitrate", kHdResolution, DataRate::KilobitsPerSec(6000),
     TimeDelta::Seconds(5), 5.0},
};

std::string FixedBitrateTestName(
    const ::testing::TestParamInfo<
        std::tuple<FactoryCreator, FixedBitrateTestParams>>& info) {
  return std::get<1>(info.param).name;
}

INSTANTIATE_TEST_SUITE_P(
    LibaomAv1,
    FixedBitrateRateControlTest,
    ::testing::Combine(::testing::Values(CreateLibaomAv1EncoderFactory),
                       ::testing::ValuesIn(kFixedBitrateConfigs)),
    FixedBitrateTestName);

}  // namespace
}  // namespace webrtc
