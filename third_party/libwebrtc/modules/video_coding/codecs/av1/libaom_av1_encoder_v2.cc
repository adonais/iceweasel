/*
 *  Copyright (c) 2026 The WebRTC project authors. All Rights Reserved.
 *
 *  Use of this source code is governed by a BSD-style license
 *  that can be found in the LICENSE file in the root of the source
 *  tree. An additional intellectual property rights grant can be found
 *  in the file PATENTS.  All contributing project authors may
 *  be found in the AUTHORS file in the root of the source tree.
 */

#include "modules/video_coding/codecs/av1/libaom_av1_encoder_v2.h"

#include <algorithm>
#include <array>
#include <cstddef>
#include <cstdint>
#include <cstring>
#include <map>
#include <memory>
#include <numeric>
#include <optional>
#include <span>
#include <string>
#include <type_traits>
#include <variant>
#include <vector>

#include "absl/algorithm/container.h"
#include "absl/cleanup/cleanup.h"
#include "api/scoped_refptr.h"
#include "api/units/data_rate.h"
#include "api/units/data_size.h"
#include "api/units/time_delta.h"
#include "api/units/timestamp.h"
#include "api/video/resolution.h"
#include "api/video/video_frame_buffer.h"
#include "api/video_codecs/video_encoder_builders.h"
#include "api/video_codecs/video_encoder_factory_interface.h"
#include "api/video_codecs/video_encoder_interface.h"
#include "api/video_codecs/video_encoding_general.h"
#include "modules/video_coding/utility/reference_buffer_tracker.h"
#include "rtc_base/checks.h"
#include "rtc_base/logging.h"
#include "rtc_base/numerics/rational.h"
#include "rtc_base/strings/string_builder.h"
#include "third_party/libaom/source/libaom/aom/aom_codec.h"
#include "third_party/libaom/source/libaom/aom/aom_encoder.h"
#include "third_party/libaom/source/libaom/aom/aom_image.h"
#include "third_party/libaom/source/libaom/aom/aomcx.h"

#define SET_OR_RETURN(param_id, param_value)                          \
  do {                                                                \
    if (!SetEncoderControlParameters(&ctx_, param_id, param_value)) { \
      return;                                                         \
    }                                                                 \
  } while (0)

#define SET_OR_RETURN_FALSE(param_id, param_value)                    \
  do {                                                                \
    if (!SetEncoderControlParameters(&ctx_, param_id, param_value)) { \
      return false;                                                   \
    }                                                                 \
  } while (0)

namespace webrtc {

using FrameEncodeSettings = VideoEncoderInterface::FrameEncodeSettings;
using Cbr = FrameEncodeSettings::Cbr;
using Cqp = FrameEncodeSettings::Cqp;
using aom_img_ptr = std::unique_ptr<aom_image_t, decltype(&aom_img_free)>;

namespace {

constexpr int kMaxQuantizer = 63;
constexpr int kMaxQp = 255;
constexpr int kNumBuffers = 8;
constexpr int kMaxReferences = 3;
constexpr int kMinEffortLevel = -2;  // Speed 11.
constexpr int kMaxEffortLevel = 4;   // Speed 5.
constexpr int kMaxSpatialLayersLimit = 4;
constexpr int kMaxTemporalLayers = 4;
constexpr int kRtpTicksPerSecond = 90000;
constexpr int kRtpTicksPerMs = kRtpTicksPerSecond / 1000;

static_assert(kMaxSpatialLayersLimit <= AOM_MAX_SS_LAYERS);
static_assert(kMaxTemporalLayers <= AOM_MAX_TS_LAYERS);

constexpr std::array<Rational, 6> kSupportedScalingFactors = {
    {{.numerator = 16, .denominator = 1},
     {.numerator = 8, .denominator = 1},
     {.numerator = 4, .denominator = 1},
     {.numerator = 2, .denominator = 1},
     {.numerator = 1, .denominator = 1},
     {.numerator = 1, .denominator = 2}}};

std::optional<Rational> GetScalingFactor(const Resolution& from,
                                         const Resolution& to) {
  auto it = absl::c_find_if(kSupportedScalingFactors, [&](const Rational& r) {
    return (from.width * r.numerator == to.width * r.denominator) &&
           (from.height * r.numerator == to.height * r.denominator);
  });

  if (it != kSupportedScalingFactors.end()) {
    return *it;
  }

  return {};
}

template <typename T>
bool SetEncoderControlParameters(aom_codec_ctx_t* ctx, int id, T value) {
  aom_codec_err_t error_code = aom_codec_control(ctx, id, value);
  if (error_code != AOM_CODEC_OK) {
    RTC_LOG(LS_WARNING) << "aom_codec_control returned " << error_code
                        << " with id:  " << id << ".";
  }
  return error_code == AOM_CODEC_OK;
}

struct ThreadTilesAndSuperblockSizeInfo {
  int num_threads;
  int exp_tile_rows;
  int exp_tile_columns;
  aom_superblock_size_t superblock_size;
};

ThreadTilesAndSuperblockSizeInfo GetThreadingTilesAndSuperblockSize(
    int width,
    int height,
    int max_number_of_threads) {
  ThreadTilesAndSuperblockSizeInfo res;
  const int num_pixels = width * height;
  if (num_pixels >= 1920 * 1080 && max_number_of_threads > 8) {
    res.num_threads = 8;
    res.exp_tile_rows = 2;
    res.exp_tile_columns = 1;
  } else if (num_pixels >= 640 * 360 && max_number_of_threads > 4) {
    res.num_threads = 4;
    res.exp_tile_rows = 1;
    res.exp_tile_columns = 1;
  } else if (num_pixels >= 320 * 180 && max_number_of_threads > 2) {
    res.num_threads = 2;
    res.exp_tile_rows = 1;
    res.exp_tile_columns = 0;
  } else {
    res.num_threads = 1;
    res.exp_tile_rows = 0;
    res.exp_tile_columns = 0;
  }

  if (res.num_threads > 4 && num_pixels >= 960 * 540) {
    res.superblock_size = AOM_SUPERBLOCK_SIZE_64X64;
  } else {
    res.superblock_size = AOM_SUPERBLOCK_SIZE_DYNAMIC;
  }

  RTC_LOG(LS_VERBOSE) << __FUNCTION__ << " res.num_threads=" << res.num_threads
                      << " res.exp_tile_rows=" << res.exp_tile_rows
                      << " res.exp_tile_columns=" << res.exp_tile_columns
                      << " res.superblock_size=" << res.superblock_size;

  return res;
}

bool ValidateEncodeParams(
    const VideoFrameBuffer& frame_buffer,
    const VideoEncoderInterface::TemporalUnitSettings& /* tu_settings */,
    const std::vector<FrameEncodeSettings>& frame_settings,
    const std::array<std::optional<Resolution>, kNumBuffers>&
        last_resolution_in_buffer,
    aom_rc_mode rc_mode) {
  if (frame_settings.empty()) {
    RTC_LOG(LS_ERROR) << "No frame settings provided.";
    return false;
  }

  auto in_range = [](int low, int high, int val) {
    return low <= val && val < high;
  };

  const Resolution input_resolution = {.width = frame_buffer.width(),
                                       .height = frame_buffer.height()};

  for (size_t i = 0; i < frame_settings.size(); ++i) {
    const FrameEncodeSettings& settings = frame_settings[i];

    if (!settings.frame_output()) {
      RTC_LOG(LS_ERROR) << "No frame output provided.";
      return false;
    }

    if (static_cast<int64_t>(settings.resolution().width) *
            input_resolution.height !=
        static_cast<int64_t>(settings.resolution().height) *
            input_resolution.width) {
      RTC_LOG(LS_ERROR) << "Resolution scaling between input frame ("
                        << input_resolution.width << "x"
                        << input_resolution.height << ") and layer ("
                        << settings.resolution().width << "x"
                        << settings.resolution().height
                        << ") changes aspect ratio.";
      return false;
    }

    if (!in_range(kMinEffortLevel, kMaxEffortLevel + 1,
                  settings.effort_level())) {
      RTC_LOG(LS_ERROR) << "Unsupported effort level "
                        << settings.effort_level();
      return false;
    }

    if (!in_range(0, kMaxSpatialLayersLimit, settings.spatial_id())) {
      RTC_LOG(LS_ERROR) << "invalid spatial id " << settings.spatial_id();
      return false;
    }

    if (!in_range(0, kMaxTemporalLayers, settings.temporal_id())) {
      RTC_LOG(LS_ERROR) << "invalid temporal id " << settings.temporal_id();
      return false;
    }

    if ((settings.frame_type() == VideoEncoderInterface::FrameType::kKeyframe ||
         settings.frame_type() ==
             VideoEncoderInterface::FrameType::kStartFrame) &&
        !settings.reference_buffers().empty()) {
      RTC_LOG(LS_ERROR) << "Reference buffers can not be used for keyframes.";
      return false;
    }

    if ((settings.frame_type() == VideoEncoderInterface::FrameType::kKeyframe ||
         settings.frame_type() ==
             VideoEncoderInterface::FrameType::kStartFrame) &&
        !settings.update_buffer()) {
      RTC_LOG(LS_ERROR)
          << "Buffer to update must be specified for keyframe/startframe";
      return false;
    }

    if (settings.update_buffer() &&
        !in_range(0, kNumBuffers, *settings.update_buffer())) {
      RTC_LOG(LS_ERROR) << "Invalid update buffer id.";
      return false;
    }

    if (settings.reference_buffers().size() > kMaxReferences) {
      RTC_LOG(LS_ERROR) << "Too many referenced buffers.";
      return false;
    }

    for (size_t j = 0; j < settings.reference_buffers().size(); ++j) {
      if (!in_range(0, kNumBuffers, settings.reference_buffers()[j])) {
        RTC_LOG(LS_ERROR) << "Invalid reference buffer id.";
        return false;
      }

      // Figure out which frame resolution a certain buffer will hold when the
      // frame described by `settings` is encoded.
      std::optional<Resolution> referenced_resolution;
      bool keyframe_on_previous_layer = false;

      // Will some other frame in this temporal unit update the buffer?
      for (size_t k = 0; k < i; ++k) {
        if (frame_settings[k].frame_type() ==
            VideoEncoderInterface::FrameType::kKeyframe) {
          keyframe_on_previous_layer = true;
          referenced_resolution.reset();
        }
        if (frame_settings[k].update_buffer() ==
            settings.reference_buffers()[j]) {
          referenced_resolution = frame_settings[k].resolution();
        }
      }

      // Not updated by another frame in the temporal unit, what is the
      // resolution of the last frame stored into that buffer?
      if (!referenced_resolution && !keyframe_on_previous_layer) {
        referenced_resolution =
            last_resolution_in_buffer[settings.reference_buffers()[j]];
      }

      if (!referenced_resolution) {
        RTC_LOG(LS_ERROR) << "Referenced buffer holds no frame.";
        return false;
      }

      if (!GetScalingFactor(*referenced_resolution, settings.resolution())) {
        RTC_LOG(LS_ERROR)
            << "Required resolution scaling factor not supported.";
        return false;
      }

      for (size_t l = j + 1; l < settings.reference_buffers().size(); ++l) {
        if (settings.reference_buffers()[j] ==
            settings.reference_buffers()[l]) {
          RTC_LOG(LS_ERROR) << "Duplicate reference buffer specified.";
          return false;
        }
      }
    }

    if ((rc_mode == AOM_CBR &&
         std::holds_alternative<Cqp>(settings.rate_options())) ||
        (rc_mode == AOM_Q &&
         std::holds_alternative<Cbr>(settings.rate_options()))) {
      RTC_LOG(LS_ERROR) << "Invalid rate options, encoder configured with "
                        << (rc_mode == AOM_CBR ? "AOM_CBR" : "AOM_Q");
      return false;
    }

    for (size_t j = i + 1; j < frame_settings.size(); ++j) {
      if (settings.spatial_id() >= frame_settings[j].spatial_id()) {
        RTC_LOG(LS_ERROR) << "Frame spatial id specified out of order.";
        return false;
      }
    }
  }

  return true;
}

void PrepareInputImage(const VideoFrameBuffer& input_buffer,
                       aom_img_ptr& out_aom_image) {
  aom_img_fmt_t input_format;
  switch (input_buffer.type()) {
    case VideoFrameBuffer::Type::kI420:
      input_format = AOM_IMG_FMT_I420;
      break;
    case VideoFrameBuffer::Type::kNV12:
      input_format = AOM_IMG_FMT_NV12;
      break;
    default:
      RTC_CHECK_NOTREACHED();
      return;
  }

  if (!out_aom_image || out_aom_image->fmt != input_format ||
      static_cast<int>(out_aom_image->w) != input_buffer.width() ||
      static_cast<int>(out_aom_image->h) != input_buffer.height()) {
    out_aom_image.reset(
        aom_img_wrap(/*img=*/nullptr, input_format, input_buffer.width(),
                     input_buffer.height(), /*align=*/1, /*img_data=*/nullptr));

    RTC_LOG(LS_VERBOSE) << __FUNCTION__ << " input_format=" << input_format
                        << " input_buffer.width()=" << input_buffer.width()
                        << " input_buffer.height()=" << input_buffer.height()
                        << " w=" << out_aom_image->w
                        << " h=" << out_aom_image->h
                        << " d_w=" << out_aom_image->d_w
                        << " d_h=" << out_aom_image->d_h
                        << " r_w=" << out_aom_image->r_w
                        << " r_h=" << out_aom_image->r_h;
  }

  if (input_format == AOM_IMG_FMT_I420) {
    const I420BufferInterface* i420_buffer = input_buffer.GetI420();
    RTC_DCHECK(i420_buffer);
    out_aom_image->planes[AOM_PLANE_Y] =
        const_cast<unsigned char*>(i420_buffer->DataY());
    out_aom_image->planes[AOM_PLANE_U] =
        const_cast<unsigned char*>(i420_buffer->DataU());
    out_aom_image->planes[AOM_PLANE_V] =
        const_cast<unsigned char*>(i420_buffer->DataV());
    out_aom_image->stride[AOM_PLANE_Y] = i420_buffer->StrideY();
    out_aom_image->stride[AOM_PLANE_U] = i420_buffer->StrideU();
    out_aom_image->stride[AOM_PLANE_V] = i420_buffer->StrideV();
  } else {
    const NV12BufferInterface* nv12_buffer = input_buffer.GetNV12();
    RTC_DCHECK(nv12_buffer);
    out_aom_image->planes[AOM_PLANE_Y] =
        const_cast<unsigned char*>(nv12_buffer->DataY());
    out_aom_image->planes[AOM_PLANE_U] =
        const_cast<unsigned char*>(nv12_buffer->DataUV());
    out_aom_image->planes[AOM_PLANE_V] = nullptr;
    out_aom_image->stride[AOM_PLANE_Y] = nv12_buffer->StrideY();
    out_aom_image->stride[AOM_PLANE_U] = nv12_buffer->StrideUV();
    out_aom_image->stride[AOM_PLANE_V] = 0;
  }
}

aom_svc_ref_frame_config_t GetSvcRefFrameConfig(
    const FrameEncodeSettings& settings,
    const ReferenceBufferTracker& reference_buffer_tracker) {
  // Buffer alias to use for each position. In particular when there are two
  // buffers being used, prefer to alias them as LAST and GOLDEN, since the AV1
  // bitstream format has dedicated fields for them. See last_frame_idx and
  // golden_frame_idx in the av1 spec
  // https://aomediacodec.github.io/av1-spec/av1-spec.pdf.

  // Libaom is also compiled for RTC, which limits the number of references to
  // at most three, and they must be aliased as LAST, GOLDEN and ALTREF. Also
  // note that libaom favors LAST the most, and GOLDEN second most, so buffers
  // should be specified in order of how useful they are for prediction. Libaom
  // could be updated to make LAST, GOLDEN and ALTREF equivalent, but that is
  // not a priority for now. All aliases can be used to update buffers.
  // Buffers are ordered so that the most recent update is aliased as LAST,
  // the next oldest as GOLDEN, ALTREF, and so on.
  static constexpr std::array<int, 7> kPreferredAlias = {0,  // LAST
                                                         3,  // GOLDEN
                                                         6,  // ALTREF
                                                         1, 2, 4, 5};

  aom_svc_ref_frame_config_t ref_frame_config = {};
  std::span ref_idx_view(ref_frame_config.ref_idx);
  std::span reference_view(ref_frame_config.reference);
  std::span refresh_view(ref_frame_config.refresh);

  int alias_index = 0;
  if (!settings.reference_buffers().empty()) {
    std::vector<int> sorted_references =
        reference_buffer_tracker.OrderByTimestamp(settings.reference_buffers());
    for (size_t i = 0; i < sorted_references.size(); ++i) {
      ref_idx_view[kPreferredAlias[alias_index]] = sorted_references[i];
      reference_view[kPreferredAlias[alias_index]] = 1;
      alias_index++;
    }

    // Delta frames must not alias unused buffers, and since start frames only
    // update some buffers it is not safe to leave unused aliases to simply
    // point to buffer 0.
    for (size_t i = sorted_references.size(); i < ref_idx_view.size(); ++i) {
      ref_idx_view[kPreferredAlias[i]] = sorted_references.back();
    }
  }

  if (settings.update_buffer()) {
    if (!absl::c_linear_search(settings.reference_buffers(),
                               *settings.update_buffer())) {
      ref_idx_view[kPreferredAlias[alias_index]] = *settings.update_buffer();
      alias_index++;
    }
    refresh_view[*settings.update_buffer()] = 1;
  }

  if (RTC_LOG_CHECK_LEVEL(LS_VERBOSE)) {
    StringBuilder sb;
    sb << "GetSvcRefFrameConfig spatial_id=" << settings.spatial_id();
    sb << "  ref_idx=[ ";
    for (auto r : ref_frame_config.ref_idx) {
      sb << r << " ";
    }
    sb << "]  reference=[ ";
    for (auto r : ref_frame_config.reference) {
      sb << r << " ";
    }
    sb << "]  refresh=[ ";
    for (auto r : ref_frame_config.refresh) {
      sb << r << " ";
    }
    sb << "]";
    RTC_LOG(LS_VERBOSE) << sb.Release();
  }

  return ref_frame_config;
}

aom_svc_params_t GetSvcParams(
    const VideoFrameBuffer& frame_buffer,
    const std::vector<FrameEncodeSettings>& frame_settings) {
  aom_svc_params_t svc_params = {};
  svc_params.number_spatial_layers = frame_settings.back().spatial_id() + 1;
  svc_params.number_temporal_layers = kMaxTemporalLayers;

  std::span framerate_factor_view(svc_params.framerate_factor);
  std::span scaling_factor_num_view(svc_params.scaling_factor_num);
  std::span scaling_factor_den_view(svc_params.scaling_factor_den);
  std::span layer_target_bitrate_view(svc_params.layer_target_bitrate);
  std::span max_quantizers_view(svc_params.max_quantizers);
  std::span min_quantizers_view(svc_params.min_quantizers);

  // TODO(bugs.webrtc.org/496266459): Dynamically determine temporal layer
  // settings based on the provided FrameEncodeSettings.
  for (int tid = 0; tid < svc_params.number_temporal_layers; ++tid) {
    framerate_factor_view[tid] = 1;
  }

  // If the scaling factor is left at zero for unused layers a division by zero
  // will happen inside libaom, default all layers to one.
  for (int sid = 0; sid < svc_params.number_spatial_layers; ++sid) {
    scaling_factor_num_view[sid] = 1;
    scaling_factor_den_view[sid] = 1;
  }

  for (const FrameEncodeSettings& settings : frame_settings) {
    int w_num = settings.resolution().width;
    int w_den = frame_buffer.width();
    int gcd = std::gcd(w_num, w_den);
    scaling_factor_num_view[settings.spatial_id()] = w_num / gcd;
    scaling_factor_den_view[settings.spatial_id()] = w_den / gcd;

    const int flat_layer_id =
        settings.spatial_id() * svc_params.number_temporal_layers +
        settings.temporal_id();

    RTC_LOG(LS_VERBOSE) << __FUNCTION__ << " flat_layer_id=" << flat_layer_id
                        << " num="
                        << scaling_factor_num_view[settings.spatial_id()]
                        << " den="
                        << scaling_factor_den_view[settings.spatial_id()];

    std::visit(
        [&](auto&& arg) {
          using T = std::decay_t<decltype(arg)>;
          if constexpr (std::is_same_v<T, Cbr>) {
            // Libaom calculates the total bitrate across all spatial layers by
            // summing the bitrate of the last temporal layer in each spatial
            // layer. This means the bitrate for the top temporal layer always
            // has to be set even if that temporal layer is not being encoded.
            const int last_temporal_layer_in_spatial_layer_id =
                settings.spatial_id() * svc_params.number_temporal_layers +
                (kMaxTemporalLayers - 1);
            layer_target_bitrate_view[last_temporal_layer_in_spatial_layer_id] =
                arg.target_bitrate.kbps();

            layer_target_bitrate_view[flat_layer_id] =
                arg.target_bitrate.kbps();
            // When libaom is configured with `AOM_CBR` it will still limit QP
            // to stay between `min_quantizers` and `max_quantizers'. Set
            // `max_quantizers` to max QP to avoid the encoder overshooting.
            max_quantizers_view[flat_layer_id] = kMaxQuantizer;
            min_quantizers_view[flat_layer_id] = 0;
          } else if constexpr (std::is_same_v<T, Cqp>) {
            // When libaom is configured with `AOM_Q` it will still look at the
            // `layer_target_bitrate` to determine whether the layer is disabled
            // or not. Set `layer_target_bitrate` to 1 so that libaom knows the
            // layer is active.
            const int last_temporal_layer_in_spatial_layer_id =
                settings.spatial_id() * svc_params.number_temporal_layers +
                (kMaxTemporalLayers - 1);
            layer_target_bitrate_view[last_temporal_layer_in_spatial_layer_id] =
                1;
            layer_target_bitrate_view[flat_layer_id] = 1;
            // libaom expects quantizers in [0, 63] range, whereas the API
            // is designed to use the bitstream QP range - [0, 255] in this
            // case. Quantizer 0 implies lossless mode in libaom, so only QP 0
            // is mapped to quantizer 0, while QP 1-3 are rounded up to 4
            // (quantizer 1).
            int target_qp =
                (arg.target_qp > 0 && arg.target_qp < 4) ? 4 : arg.target_qp;
            int quantizer = std::clamp(target_qp / 4, 0, kMaxQuantizer);
            max_quantizers_view[flat_layer_id] = quantizer;
            min_quantizers_view[flat_layer_id] = quantizer;
            // TD: Does libaom look at both max and min? Shouldn't it just be
            // one of them?
            RTC_LOG(LS_WARNING)
                << __FUNCTION__ << " svc_params.qp[" << flat_layer_id
                << "]=" << arg.target_qp << " (quantizer=" << quantizer << ")";
          }
        },
        settings.rate_options());
  }

  if (RTC_LOG_CHECK_LEVEL(LS_VERBOSE)) {
    StringBuilder sb;
    sb << "GetSvcParams layer bitrates kbps";
    for (int s = 0; s < svc_params.number_spatial_layers; ++s) {
      sb << " S" << s << "=[ ";
      for (int t = 0; t < svc_params.number_temporal_layers; ++t) {
        int id = s * svc_params.number_temporal_layers + t;
        sb << "T" << t << "=" << layer_target_bitrate_view[id] << " ";
      }
      sb << "]";
    }
    RTC_LOG(LS_VERBOSE) << sb.Release();
  }

  return svc_params;
}

}  // namespace

VideoEncoderFactoryInterface::Capabilities
LibaomAv1EncoderV2::GetCapabilities() {
  return CapabilitiesBuilder()
      .WithPredictionConstraints(
          [](VideoEncoderFactoryInterface::Capabilities::PredictionConstraints&
                 p) {
            p.set_num_buffers(kNumBuffers);
            p.set_max_references(kMaxReferences);
            p.set_max_temporal_layers(kMaxTemporalLayers);
            p.set_buffer_space_type(
                VideoEncoderFactoryInterface::Capabilities::
                    PredictionConstraints::BufferSpaceType::kSingleKeyframe);
            p.set_max_spatial_layers(kMaxSpatialLayersLimit);
            p.set_scaling_factors(
                std::vector<Rational>(kSupportedScalingFactors.begin(),
                                      kSupportedScalingFactors.end()));
            p.set_supported_frame_types(
                {VideoEncoderInterface::FrameType::kKeyframe,
                 VideoEncoderInterface::FrameType::kStartFrame,
                 VideoEncoderInterface::FrameType::kDeltaFrame});
          })
      .WithInputConstraints(
          [](VideoEncoderFactoryInterface::Capabilities::InputConstraints& i) {
            i.set_min({.width = 64, .height = 36});
            i.set_max({.width = 3840, .height = 2160});
            i.set_pixel_alignment(1);
            i.set_input_formats(
                {VideoFrameBuffer::Type::kI420, VideoFrameBuffer::Type::kNV12});
          })
      .EncodingFormats({{.sub_sampling = EncodingFormat::k420, .bit_depth = 8}})
      .WithBitrateControl(
          [](VideoEncoderFactoryInterface::Capabilities::BitrateControl& b) {
            b.set_qp_range(0, kMaxQp);
            using enum VideoEncoderFactoryInterface::RateControlMode;
            b.set_rc_modes({kCbr, kCqp});
          })
      .WithPerformance(
          [](VideoEncoderFactoryInterface::Capabilities::Performance& p) {
            p.set_encode_on_calling_thread(true);
            p.set_min_max_effort_level(kMinEffortLevel, kMaxEffortLevel);
          })
      .Build();
}

LibaomAv1EncoderV2::~LibaomAv1EncoderV2() {
  aom_codec_destroy(&ctx_);
}

bool LibaomAv1EncoderV2::InitEncode(
    const VideoEncoderFactoryInterface::StaticEncoderSettings& settings,
    const std::map<std::string, std::string>& encoder_specific_settings) {
  if (!encoder_specific_settings.empty()) {
    RTC_LOG(LS_ERROR)
        << "libaom av1 encoder accepts no encoder specific settings";
    return false;
  }

  last_resolution_in_buffer_ = {};
  reference_buffer_tracker_.Reset();
  content_type_.reset();
  effort_level_by_spatial_id_.fill(std::nullopt);

  if (aom_codec_err_t ret = aom_codec_enc_config_default(
          aom_codec_av1_cx(), &cfg_, AOM_USAGE_REALTIME);
      ret != AOM_CODEC_OK) {
    RTC_LOG(LS_ERROR) << "aom_codec_enc_config_default returned " << ret;
    return false;
  }

  max_number_of_threads_ = settings.max_number_of_threads();
  ThreadTilesAndSuperblockSizeInfo ttsbi = GetThreadingTilesAndSuperblockSize(
      settings.max_encode_dimensions().width,
      settings.max_encode_dimensions().height, max_number_of_threads_);

  // The encode resolution is set dynamically for each call to `Encode`, but for
  // `aom_codec_enc_init` to not fail we set it here as well.
  cfg_.g_w = settings.max_encode_dimensions().width;
  cfg_.g_h = settings.max_encode_dimensions().height;
  cfg_.g_forced_max_frame_width = settings.max_encode_dimensions().width;
  cfg_.g_forced_max_frame_height = settings.max_encode_dimensions().height;
  cfg_.g_threads = ttsbi.num_threads;
  cfg_.g_timebase.num = 1;
  // Use 90kHz time base to be consistent with the rest of WebRTC.
  cfg_.g_timebase.den = kRtpTicksPerSecond;
  cfg_.g_input_bit_depth = settings.encoding_format().bit_depth;
  cfg_.kf_mode = AOM_KF_DISABLED;
  cfg_.rc_undershoot_pct = 50;
  cfg_.rc_overshoot_pct = 50;
  auto* cbr =
      std::get_if<VideoEncoderFactoryInterface::StaticEncoderSettings::Cbr>(
          &settings.rc_mode());
  cfg_.rc_buf_initial_sz = cbr ? cbr->target_buffer_size.ms() : 600;
  cfg_.rc_buf_optimal_sz = cbr ? cbr->target_buffer_size.ms() : 600;
  cfg_.rc_buf_sz = cbr ? cbr->max_buffer_size.ms() : 1000;
  cfg_.g_usage = AOM_USAGE_REALTIME;
  cfg_.g_pass = AOM_RC_ONE_PASS;
  cfg_.g_lag_in_frames = 0;
  cfg_.g_error_resilient = 0;
  cfg_.rc_end_usage = cbr ? AOM_CBR : AOM_Q;

  if (aom_codec_err_t ret =
          aom_codec_enc_init(&ctx_, aom_codec_av1_cx(), &cfg_, /*flags=*/0);
      ret != AOM_CODEC_OK) {
    RTC_LOG(LS_ERROR) << "aom_codec_enc_init returned " << ret;
    return false;
  }

  SET_OR_RETURN_FALSE(AV1E_SET_SUPERBLOCK_SIZE, ttsbi.superblock_size);
  SET_OR_RETURN_FALSE(AV1E_SET_TILE_ROWS, ttsbi.exp_tile_rows);
  SET_OR_RETURN_FALSE(AV1E_SET_TILE_COLUMNS, ttsbi.exp_tile_columns);
  SET_OR_RETURN_FALSE(AV1E_SET_ENABLE_CDEF, 1);
  SET_OR_RETURN_FALSE(AV1E_SET_ENABLE_TPL_MODEL, 0);
  SET_OR_RETURN_FALSE(AV1E_SET_DELTAQ_MODE, 0);
  SET_OR_RETURN_FALSE(AV1E_SET_ENABLE_ORDER_HINT, 0);
  SET_OR_RETURN_FALSE(AV1E_SET_AQ_MODE, 3);
  SET_OR_RETURN_FALSE(AOME_SET_MAX_INTRA_BITRATE_PCT, 300);
  SET_OR_RETURN_FALSE(AV1E_SET_COEFF_COST_UPD_FREQ, 3);
  SET_OR_RETURN_FALSE(AV1E_SET_MODE_COST_UPD_FREQ, 3);
  SET_OR_RETURN_FALSE(AV1E_SET_MV_COST_UPD_FREQ, 3);
  SET_OR_RETURN_FALSE(AV1E_SET_ROW_MT, 1);
  SET_OR_RETURN_FALSE(AV1E_SET_ENABLE_OBMC, 0);
  SET_OR_RETURN_FALSE(AV1E_SET_NOISE_SENSITIVITY, 0);
  SET_OR_RETURN_FALSE(AV1E_SET_ENABLE_WARPED_MOTION, 0);
  SET_OR_RETURN_FALSE(AV1E_SET_ENABLE_GLOBAL_MOTION, 0);
  SET_OR_RETURN_FALSE(AV1E_SET_ENABLE_REF_FRAME_MVS, 0);
  SET_OR_RETURN_FALSE(AV1E_SET_ENABLE_CFL_INTRA, 0);
  SET_OR_RETURN_FALSE(AV1E_SET_ENABLE_SMOOTH_INTRA, 0);
  SET_OR_RETURN_FALSE(AV1E_SET_ENABLE_ANGLE_DELTA, 0);
  SET_OR_RETURN_FALSE(AV1E_SET_ENABLE_FILTER_INTRA, 0);
  SET_OR_RETURN_FALSE(AV1E_SET_INTRA_DEFAULT_TX_ONLY, 1);
  SET_OR_RETURN_FALSE(AV1E_SET_DISABLE_TRELLIS_QUANT, 1);
  SET_OR_RETURN_FALSE(AV1E_SET_ENABLE_DIST_WTD_COMP, 0);
  SET_OR_RETURN_FALSE(AV1E_SET_ENABLE_DIFF_WTD_COMP, 0);
  SET_OR_RETURN_FALSE(AV1E_SET_ENABLE_DUAL_FILTER, 0);
  SET_OR_RETURN_FALSE(AV1E_SET_ENABLE_INTERINTRA_COMP, 0);
  SET_OR_RETURN_FALSE(AV1E_SET_ENABLE_INTERINTRA_WEDGE, 0);
  SET_OR_RETURN_FALSE(AV1E_SET_ENABLE_INTRA_EDGE_FILTER, 0);
  SET_OR_RETURN_FALSE(AV1E_SET_ENABLE_INTRABC, 0);
  SET_OR_RETURN_FALSE(AV1E_SET_ENABLE_MASKED_COMP, 0);
  SET_OR_RETURN_FALSE(AV1E_SET_ENABLE_PAETH_INTRA, 0);
  SET_OR_RETURN_FALSE(AV1E_SET_ENABLE_QM, 0);
  SET_OR_RETURN_FALSE(AV1E_SET_ENABLE_RECT_PARTITIONS, 0);
  SET_OR_RETURN_FALSE(AV1E_SET_ENABLE_RESTORATION, 0);
  SET_OR_RETURN_FALSE(AV1E_SET_ENABLE_SMOOTH_INTERINTRA, 0);
  SET_OR_RETURN_FALSE(AV1E_SET_ENABLE_TX64, 0);
  SET_OR_RETURN_FALSE(AV1E_SET_MAX_REFERENCE_FRAMES, 3);

  return true;
}

void LibaomAv1EncoderV2::Encode(
    scoped_refptr<VideoFrameBuffer> frame_buffer,
    const TemporalUnitSettings& tu_settings,
    std::vector<FrameEncodeSettings> frame_settings) {
  // On return call `EncodeComplete` with EncodingError result unless they
  // were already called with an EncodedData result.
  absl::Cleanup on_return = [&] {
    for (FrameEncodeSettings& settings : frame_settings) {
      if (settings.frame_output()) {
        settings.frame_output()->EncodeComplete(
            VideoEncoderInterface::EncodingError());
      }
    }
  };

  if (!ValidateEncodeParams(*frame_buffer, tu_settings, frame_settings,
                            last_resolution_in_buffer_, cfg_.rc_end_usage)) {
    return;
  }

  if (content_type_ != tu_settings.content_hint()) {
    if (tu_settings.content_hint() == ContentHint::kText ||
        tu_settings.content_hint() == ContentHint::kDetailed) {
      SET_OR_RETURN(AV1E_SET_TUNE_CONTENT, AOM_CONTENT_SCREEN);
      SET_OR_RETURN(AV1E_SET_ENABLE_PALETTE, 1);
    } else {
      SET_OR_RETURN(AV1E_SET_TUNE_CONTENT, AOM_CONTENT_DEFAULT);
      SET_OR_RETURN(AV1E_SET_ENABLE_PALETTE, 0);
    }
    content_type_ = tu_settings.content_hint();
  }

  if (cfg_.rc_end_usage == AOM_CBR) {
    DataRate accum_rate = DataRate::Zero();
    for (const FrameEncodeSettings& settings : frame_settings) {
      accum_rate += std::get<Cbr>(settings.rate_options()).target_bitrate;
    }
    cfg_.rc_target_bitrate = accum_rate.kbps();
    RTC_LOG(LS_VERBOSE) << __FUNCTION__
                        << " cfg_.rc_target_bitrate=" << cfg_.rc_target_bitrate;
  } else if (cfg_.rc_end_usage == AOM_Q) {
    cfg_.rc_target_bitrate = 1;
  }

  if (static_cast<int>(cfg_.g_w) != frame_buffer->width() ||
      static_cast<int>(cfg_.g_h) != frame_buffer->height()) {
    RTC_LOG(LS_VERBOSE) << __FUNCTION__ << " resolution changed from "
                        << cfg_.g_w << "x" << cfg_.g_h << " to "
                        << frame_buffer->width() << "x"
                        << frame_buffer->height();
    cfg_.g_w = frame_buffer->width();
    cfg_.g_h = frame_buffer->height();
  }

  PrepareInputImage(*frame_buffer, image_to_encode_);

  // The bitrates calculated internally in libaom when `AV1E_SET_SVC_PARAMS` is
  // called depends on the currently configured `cfg_.rc_target_bitrate`. If the
  // total target bitrate is not updated first a division by zero could happen.
  if (aom_codec_err_t ret = aom_codec_enc_config_set(&ctx_, &cfg_);
      ret != AOM_CODEC_OK) {
    RTC_LOG(LS_ERROR) << "aom_codec_enc_config_set returned " << ret;
    return;
  }
  aom_svc_params_t svc_params = GetSvcParams(*frame_buffer, frame_settings);
  SET_OR_RETURN(AV1E_SET_SVC_PARAMS, &svc_params);

  // The libaom AV1 encoder requires that `aom_codec_encode` is called for
  // every spatial layer, even if no frame should be encoded for that layer.
  std::array<FrameEncodeSettings*, kMaxSpatialLayersLimit>
      settings_for_spatial_id;
  settings_for_spatial_id.fill(nullptr);
  FrameEncodeSettings settings_for_unused_layer;
  for (FrameEncodeSettings& settings : frame_settings) {
    settings_for_spatial_id[settings.spatial_id()] = &settings;
  }

  for (int sid = frame_settings[0].spatial_id();
       sid < svc_params.number_spatial_layers; ++sid) {
    const bool layer_enabled = settings_for_spatial_id[sid] != nullptr;
    FrameEncodeSettings& settings = layer_enabled
                                        ? *settings_for_spatial_id[sid]
                                        : settings_for_unused_layer;

    aom_svc_layer_id_t layer_id = {
        .spatial_layer_id = sid,
        .temporal_layer_id = settings.temporal_id(),
    };
    SET_OR_RETURN(AV1E_SET_SVC_LAYER_ID, &layer_id);
    aom_svc_ref_frame_config_t ref_config =
        GetSvcRefFrameConfig(settings, reference_buffer_tracker_);
    SET_OR_RETURN(AV1E_SET_SVC_REF_FRAME_CONFIG, &ref_config);

    // Duration must not be zero in libaom, use 1ms as fallback.
    TimeDelta duration = TimeDelta::Millis(1);
    if (layer_enabled) {
      if (const Cbr* cbr = std::get_if<Cbr>(&settings.rate_options())) {
        duration = cbr->duration;
      }

      if (settings.effort_level() !=
          effort_level_by_spatial_id_[settings.spatial_id()]) {
        // For RTC we use speed level 5 to 11, with 9 being the default. Note
        // that low effort means higher speed.
        SET_OR_RETURN(AOME_SET_CPUUSED, 9 - settings.effort_level());
        effort_level_by_spatial_id_[settings.spatial_id()] =
            settings.effort_level();
      }
    }

    RTC_LOG(LS_VERBOSE)
        << __FUNCTION__ << " timestamp="
        << (tu_settings.presentation_timestamp().ms() * kRtpTicksPerMs)
        << "  duration=" << (duration.ms() * kRtpTicksPerMs) << "  type="
        << (settings.frame_type() == VideoEncoderInterface::FrameType::kKeyframe
                ? "key"
                : "delta");
    aom_codec_err_t ret = aom_codec_encode(
        &ctx_, &*image_to_encode_,
        tu_settings.presentation_timestamp().ms() * kRtpTicksPerMs,
        duration.ms() * kRtpTicksPerMs,
        settings.frame_type() == VideoEncoderInterface::FrameType::kKeyframe
            ? AOM_EFLAG_FORCE_KF
            : 0);
    if (ret != AOM_CODEC_OK) {
      RTC_LOG(LS_WARNING) << "aom_codec_encode returned " << ret << " : "
                          << aom_codec_error(&ctx_) << " detail: "
                          << (aom_codec_error_detail(&ctx_)
                                  ? aom_codec_error_detail(&ctx_)
                                  : "none");
      return;
    }

    if (!layer_enabled) {
      continue;
    }

    if (settings.frame_type() == VideoEncoderInterface::FrameType::kKeyframe) {
      last_resolution_in_buffer_ = {};
      reference_buffer_tracker_.Reset();
    }

    if (settings.update_buffer()) {
      last_resolution_in_buffer_[*settings.update_buffer()] =
          settings.resolution();
      reference_buffer_tracker_.Update(*settings.update_buffer(),
                                       tu_settings.presentation_timestamp());
    }

    VideoEncoderInterface::EncodedData result;
    aom_codec_iter_t iter = nullptr;
    bool bitstream_produced = false;
    while (const aom_codec_cx_pkt_t* pkt =
               aom_codec_get_cx_data(&ctx_, &iter)) {
      if (pkt->kind == AOM_CODEC_CX_FRAME_PKT && pkt->data.frame.sz > 0) {
        SET_OR_RETURN(AOME_GET_LAST_QUANTIZER, &result.encoded_qp);
        result.frame_type = pkt->data.frame.flags & AOM_FRAME_IS_KEY
                                ? VideoEncoderInterface::FrameType::kKeyframe
                                : VideoEncoderInterface::FrameType::kDeltaFrame;
        std::span<uint8_t> output_buffer =
            settings.frame_output()->GetBitstreamOutputBuffer(
                DataSize::Bytes(pkt->data.frame.sz));
        if (output_buffer.size() != pkt->data.frame.sz) {
          return;
        }
        memcpy(output_buffer.data(), pkt->data.frame.buf, pkt->data.frame.sz);
        bitstream_produced = true;
        break;
      }
    }

    if (!bitstream_produced) {
      return;
    }

    RTC_CHECK(settings.frame_output());
    settings.frame_output()->EncodeComplete(result);
    settings.set_frame_output(nullptr);
  }
}

#undef SET_OR_RETURN
#undef SET_OR_RETURN_FALSE

}  // namespace webrtc
