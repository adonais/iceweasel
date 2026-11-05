/*
 *  Copyright (c) 2026 The WebRTC project authors. All Rights Reserved.
 *
 *  Use of this source code is governed by a BSD-style license
 *  that can be found in the LICENSE file in the root of the source
 *  tree. An additional intellectual property rights grant can be found
 *  in the file PATENTS.  All contributing project authors may
 *  be found in the AUTHORS file in the root of the source tree.
 */

#ifndef MODULES_VIDEO_CODING_UTILITY_TEMPORAL_LAYER_RATE_TRACKER_H_
#define MODULES_VIDEO_CODING_UTILITY_TEMPORAL_LAYER_RATE_TRACKER_H_

#include <array>
#include <optional>

#include "absl/container/inlined_vector.h"
#include "api/units/data_rate.h"
#include "rtc_base/numerics/exp_filter.h"

namespace webrtc {

// Aggregates rate control decisions that are made per frame into the per
// temporal layer quantities encoder libraries want.
//
// Callers of `VideoEncoderInterface` state the bitrate of the temporal layer a
// frame belongs to, one frame at a time. Encoder libraries on the other hand
// tend to want the bitrate and the frame rate of the stream formed by all the
// layers up to and including a given one, which this class derives by tracking
// the bitrate stated for each layer together with how often frames of that
// layer occur.
//
// Only one layer is heard from per frame, so the bitrate of the others has to
// be assumed until they report. A caller that changes the allocation normally
// scales all of the layers by the same factor, so a change seen on one layer is
// taken to apply to the layers that have not reported since. The assumption is
// dropped as soon as a layer states a bitrate of its own, and a layer repeating
// the bitrate it already had is not taken as evidence of anything, which is
// what keeps a change of the distribution between the layers from ping ponging
// around rather than settling. A layer that stops being used keeps the bitrate
// it last had, which is only felt if it is taken back into use while a layer
// below it has gone stale as well.
//
// How often the frames of a layer occur cannot be stated by the caller and is
// measured instead, and smoothed. To avoid a transient at the start of a
// stream, the state is primed on the first frame after a keyframe under the
// assumption that a standard dyadic L1Tx pattern is used: in such a pattern
// that frame belongs to the topmost temporal layer, which reveals the layer
// count and thereby how often the frames of every layer occur. Structures the
// priming does not predict are learned instead, which takes a few repetitions
// of the pattern.
//
// An instance only ever describes one configuration of one encoder. Replace it
// rather than trying to reuse it when the encoder is reconfigured.
class TemporalLayerRateTracker {
 public:
  // Rate control is tracked separately per spatial layer, since the layers
  // have separate bitrates. The spatial layers are assumed to run the same
  // temporal pattern, though not necessarily in phase: the cadence is measured
  // from the first spatial layer of each temporal unit, so a pattern that
  // shifts the layers relative to each other, such as L2T2_KEY_SHIFT, is
  // described correctly as well.
  static constexpr int kMaxSpatialLayers = 4;
  static constexpr int kMaxTemporalLayers = 4;

  TemporalLayerRateTracker();

  // Records that a frame of temporal layer `temporal_id` in spatial layer
  // `spatial_id` was encoded, and that the layer it belongs to was allocated
  // `layer_bitrate`. Frames must be passed in encode order.
  void Update(int spatial_id,
              int temporal_id,
              DataRate layer_bitrate,
              bool is_keyframe);

  // The number of temporal layers seen so far, or the number the priming
  // guessed. At least one.
  int num_temporal_layers() const { return num_temporal_layers_; }

  // How many times lower the frame rate of the stream made up of the temporal
  // layers up to and including `temporal_id` is compared to the frame rate of
  // the full stream. Rounded to an integer, which is exact for the dyadic
  // temporal structures used in practice. At least one.
  int FramerateFactor(int temporal_id) const;

  // The bitrate of the stream made up of the temporal layers up to and
  // including `temporal_id` within spatial layer `spatial_id`.
  DataRate CumulativeBitrate(int spatial_id, int temporal_id) const;

  // The bitrate of all temporal layers of spatial layer `spatial_id` combined.
  DataRate StreamBitrate(int spatial_id) const;

 private:
  // What is known about the bitrate of one temporal layer of one spatial
  // layer.
  struct LayerRate {
    // The bitrate the tracker believes the layer has: what the caller stated
    // for it scaled by the changes seen on the other layers since, or what the
    // priming guessed.
    DataRate estimate = DataRate::Zero();
    // The bitrate the caller most recently stated for the layer, if any. Only
    // a departure from this counts as a change of the allocation.
    std::optional<DataRate> stated;
  };
  using SpatialLayerRates = std::array<LayerRate, kMaxTemporalLayers>;

  // `ExpFilter` is not assignable, so the filters are held in a container that
  // can be filled with copies of a prototype on construction.
  using TemporalLayerFilters =
      absl::InlinedVector<ExpFilter, kMaxTemporalLayers>;

  // Records that `layer_bitrate` was allocated to temporal layer `temporal_id`
  // of spatial layer `spatial_id`, and carries the change over to the layers
  // that have not reported since.
  void UpdateLayerRates(int spatial_id,
                        int temporal_id,
                        DataRate layer_bitrate);

  // Primes the state as if a standard dyadic L1Tx pattern with `num_layers`
  // temporal layers was in use, where the just observed topmost layer frame of
  // spatial layer `spatial_id` reported `delta_bitrate`.
  void PrimeStandardPattern(int num_layers,
                            int spatial_id,
                            DataRate delta_bitrate);

  // The share of the frames of the stream that belong to `temporal_id`, or
  // zero if no two frames of that layer have been seen yet.
  double FrameFraction(int temporal_id) const;

  int num_temporal_layers_ = 1;
  bool last_frame_was_keyframe_ = false;
  // The spatial id of the previous frame, used to tell the frames of a new
  // temporal unit from the remaining spatial layers of the current one.
  std::optional<int> last_updated_spatial_id_;
  // The number of temporal units seen so far, which doubles as the index of
  // the current one, and the index of the temporal unit each temporal layer
  // was last seen in.
  int temporal_unit_count_ = 0;
  std::array<std::optional<int>, kMaxTemporalLayers> last_unit_of_layer_;

  // What each temporal layer of each spatial layer is believed to hold.
  std::array<SpatialLayerRates, kMaxSpatialLayers> layer_rates_;

  // The number of temporal units between consecutive frames of each temporal
  // layer. Filtering the interval rather than the share of the frames each
  // layer holds directly means the samples are constant for a fixed temporal
  // structure, so the filter can be quick without the estimate rippling.
  TemporalLayerFilters frame_interval_filters_;
};

}  // namespace webrtc

#endif  // MODULES_VIDEO_CODING_UTILITY_TEMPORAL_LAYER_RATE_TRACKER_H_
