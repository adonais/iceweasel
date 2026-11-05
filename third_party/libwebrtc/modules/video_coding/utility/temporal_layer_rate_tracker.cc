/*
 *  Copyright (c) 2026 The WebRTC project authors. All Rights Reserved.
 *
 *  Use of this source code is governed by a BSD-style license
 *  that can be found in the LICENSE file in the root of the source
 *  tree. An additional intellectual property rights grant can be found
 *  in the file PATENTS.  All contributing project authors may
 *  be found in the AUTHORS file in the root of the source tree.
 */

#include "modules/video_coding/utility/temporal_layer_rate_tracker.h"

#include <algorithm>
#include <cmath>

#include "api/units/data_rate.h"
#include "rtc_base/checks.h"
#include "rtc_base/numerics/exp_filter.h"

namespace webrtc {
namespace {

// How often the frames of a layer occur is a property of the temporal
// structure, which either stays the same forever or changes wholesale. The
// samples are constant as long as the structure is, so there is no ripple to
// suppress and the filter only has to average out the jitter of structures
// whose layers do not occur at a fixed interval. A slow filter is what lets a
// single out of phase interval, as seen after a keyframe or a dropped frame,
// pass without disturbing the estimate.
constexpr float kFrameIntervalAlpha = 0.9f;

// The number of frames between consecutive frames of temporal layer `tid` in a
// dyadic L1Tx pattern with `num_layers` temporal layers. The topmost layer
// holds every other frame, the one below it every fourth, and so on, with the
// base layer matching the layer just above it.
double DyadicFrameInterval(int tid, int num_layers) {
  if (num_layers <= 1) {
    return 1.0;
  }
  return 1 << (num_layers - std::max(tid, 1));
}

float Filtered(const ExpFilter& filter) {
  const float value = filter.filtered();
  return value == ExpFilter::kValueUndefined ? 0.0f : value;
}

}  // namespace

TemporalLayerRateTracker::TemporalLayerRateTracker()
    : frame_interval_filters_(kMaxTemporalLayers,
                              ExpFilter(kFrameIntervalAlpha)) {
  // Until a frame of a higher layer shows up the stream is assumed to consist
  // of a single temporal layer holding all of the frames.
  frame_interval_filters_[0].Apply(1.0f, 1.0f);
}

void TemporalLayerRateTracker::PrimeStandardPattern(int num_layers,
                                                    int spatial_id,
                                                    DataRate delta_bitrate) {
  RTC_DCHECK_GT(num_layers, 1);
  RTC_DCHECK_LE(num_layers, kMaxTemporalLayers);
  num_temporal_layers_ = std::max(num_temporal_layers_, num_layers);

  for (int tid = 0; tid < kMaxTemporalLayers; ++tid) {
    frame_interval_filters_[tid].Reset(kFrameIntervalAlpha);
    if (tid < num_layers) {
      frame_interval_filters_[tid].Apply(
          1.0f, static_cast<float>(DyadicFrameInterval(tid, num_layers)));
    }
  }

  // Only the bitrates of the base layer, taken from the keyframe, and of the
  // topmost layer, taken from the frame at hand, are known. In the recommended
  // distribution, where the per frame bit budget halves for every step up the
  // temporal layer stack, every layer above the base one ends up with the same
  // share of the bitrate: the frames of a layer are twice as many but half as
  // large as those of the layer below it. Assume that is the case here, which
  // leaves the base layer as observed on the keyframe. The guesses are not
  // recorded as stated bitrates, so the first frame of a layer that turns out
  // to hold something else is not mistaken for a change of the allocation.
  for (int tid = 1; tid < num_layers; ++tid) {
    layer_rates_[spatial_id][tid].estimate = delta_bitrate;
  }
}

void TemporalLayerRateTracker::UpdateLayerRates(int spatial_id,
                                                int temporal_id,
                                                DataRate layer_bitrate) {
  SpatialLayerRates& layers = layer_rates_[spatial_id];
  LayerRate& layer = layers[temporal_id];

  // A caller that changes the allocation normally scales the whole stream, so
  // a layer that moves is taken to speak for the layers that have not reported
  // since. What is carried over is only the part of the change the tracker did
  // not already assume, and a layer that restates the bitrate it already had
  // says nothing at all, which together keep a change of the distribution from
  // being handed back and forth between the layers.
  if (layer.stated.has_value() && *layer.stated != layer_bitrate &&
      layer.estimate > DataRate::Zero()) {
    const double change = layer_bitrate / layer.estimate;
    for (int tid = 0; tid < kMaxTemporalLayers; ++tid) {
      if (tid != temporal_id) {
        layers[tid].estimate = layers[tid].estimate * change;
      }
    }
  }

  layer.estimate = layer_bitrate;
  layer.stated = layer_bitrate;
}

void TemporalLayerRateTracker::Update(int spatial_id,
                                      int temporal_id,
                                      DataRate layer_bitrate,
                                      bool is_keyframe) {
  RTC_DCHECK_GE(spatial_id, 0);
  RTC_DCHECK_LT(spatial_id, kMaxSpatialLayers);
  RTC_DCHECK_GE(temporal_id, 0);
  RTC_DCHECK_LT(temporal_id, kMaxTemporalLayers);

  if (is_keyframe) {
    // A keyframe restarts the temporal structure, and since it belongs to the
    // base layer the frame that follows it reveals the layer count.
    last_frame_was_keyframe_ = true;
  } else if (last_frame_was_keyframe_) {
    last_frame_was_keyframe_ = false;
    if (temporal_id > 0) {
      PrimeStandardPattern(temporal_id + 1, spatial_id, layer_bitrate);
    }
  }

  UpdateLayerRates(spatial_id, temporal_id, layer_bitrate);
  num_temporal_layers_ = std::max(num_temporal_layers_, temporal_id + 1);

  // All spatial layers of a temporal unit are assumed to run the same temporal
  // pattern, so only the first of them advances the cadence. A spatial id that
  // does not exceed the previous one means a new temporal unit started.
  if (!last_updated_spatial_id_.has_value() ||
      spatial_id <= *last_updated_spatial_id_) {
    ++temporal_unit_count_;
    if (last_unit_of_layer_[temporal_id].has_value()) {
      frame_interval_filters_[temporal_id].Apply(
          1.0f, temporal_unit_count_ - *last_unit_of_layer_[temporal_id]);
    }
    last_unit_of_layer_[temporal_id] = temporal_unit_count_;
  }
  last_updated_spatial_id_ = spatial_id;
}

double TemporalLayerRateTracker::FrameFraction(int temporal_id) const {
  const double interval = Filtered(frame_interval_filters_[temporal_id]);
  return interval > 0.0 ? 1.0 / interval : 0.0;
}

int TemporalLayerRateTracker::FramerateFactor(int temporal_id) const {
  RTC_DCHECK_GE(temporal_id, 0);
  if (temporal_id >= num_temporal_layers_ - 1) {
    return 1;
  }

  double total_fraction = 0.0;
  double cumulative_fraction = 0.0;
  for (int tid = 0; tid < num_temporal_layers_; ++tid) {
    const double fraction = FrameFraction(tid);
    total_fraction += fraction;
    if (tid <= temporal_id) {
      cumulative_fraction += fraction;
    }
  }

  if (cumulative_fraction <= 0.0) {
    return 1;
  }
  return std::max(
      1, static_cast<int>(std::round(total_fraction / cumulative_fraction)));
}

DataRate TemporalLayerRateTracker::CumulativeBitrate(int spatial_id,
                                                     int temporal_id) const {
  RTC_DCHECK_GE(spatial_id, 0);
  RTC_DCHECK_LT(spatial_id, kMaxSpatialLayers);
  RTC_DCHECK_GE(temporal_id, 0);

  DataRate bitrate = DataRate::Zero();
  for (int tid = 0; tid <= std::min(temporal_id, num_temporal_layers_ - 1);
       ++tid) {
    bitrate += layer_rates_[spatial_id][tid].estimate;
  }
  return bitrate;
}

DataRate TemporalLayerRateTracker::StreamBitrate(int spatial_id) const {
  return CumulativeBitrate(spatial_id, num_temporal_layers_ - 1);
}

}  // namespace webrtc
