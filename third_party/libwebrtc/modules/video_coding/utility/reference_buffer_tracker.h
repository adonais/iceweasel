/*
 *  Copyright (c) 2026 The WebRTC project authors. All Rights Reserved.
 *
 *  Use of this source code is governed by a BSD-style license
 *  that can be found in the LICENSE file in the root of the source
 *  tree. An additional intellectual property rights grant can be found
 *  in the file PATENTS.  All contributing project authors may
 *  be found in the AUTHORS file in the root of the source tree.
 */

#ifndef MODULES_VIDEO_CODING_UTILITY_REFERENCE_BUFFER_TRACKER_H_
#define MODULES_VIDEO_CODING_UTILITY_REFERENCE_BUFFER_TRACKER_H_

#include <optional>
#include <span>
#include <vector>

#include "api/units/timestamp.h"

namespace webrtc {

// Tracks the presentation timestamps of frames stored in reference buffers.
// Allows sorting reference buffers so that the most recently updated buffer
// can be prioritized.
class ReferenceBufferTracker {
 public:
  explicit ReferenceBufferTracker(int num_buffers);
  ~ReferenceBufferTracker() = default;

  int num_buffers() const { return static_cast<int>(timestamps_.size()); }

  void Update(int buffer_id, Timestamp timestamp);
  std::optional<Timestamp> GetTimestamp(int buffer_id) const;
  void Reset();

  // Returns `reference_buffers` ordered by their stored timestamps in
  // descending order (most recent first). Buffers without a timestamp are
  // sorted after buffers with a timestamp. Relative order of buffers with the
  // same timestamp or without timestamps is preserved.
  std::vector<int> OrderByTimestamp(
      std::span<const int> reference_buffers) const;

 private:
  std::vector<std::optional<Timestamp>> timestamps_;
};

}  // namespace webrtc

#endif  // MODULES_VIDEO_CODING_UTILITY_REFERENCE_BUFFER_TRACKER_H_
