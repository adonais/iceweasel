/*
 *  Copyright (c) 2026 The WebRTC project authors. All Rights Reserved.
 *
 *  Use of this source code is governed by a BSD-style license
 *  that can be found in the LICENSE file in the root of the source
 *  tree. An additional intellectual property rights grant can be found
 *  in the file PATENTS.  All contributing project authors may
 *  be found in the AUTHORS file in the root of the source tree.
 */

#include "modules/video_coding/utility/reference_buffer_tracker.h"

#include <algorithm>
#include <optional>
#include <span>
#include <vector>

#include "absl/algorithm/container.h"
#include "api/units/timestamp.h"
#include "rtc_base/checks.h"

namespace webrtc {

ReferenceBufferTracker::ReferenceBufferTracker(int num_buffers)
    : timestamps_(num_buffers) {
  RTC_DCHECK_GT(num_buffers, 0);
}

void ReferenceBufferTracker::Update(int buffer_id, Timestamp timestamp) {
  RTC_DCHECK_GE(buffer_id, 0);
  RTC_DCHECK_LT(buffer_id, num_buffers());
  timestamps_[buffer_id] = timestamp;
}

std::optional<Timestamp> ReferenceBufferTracker::GetTimestamp(
    int buffer_id) const {
  RTC_DCHECK_GE(buffer_id, 0);
  RTC_DCHECK_LT(buffer_id, num_buffers());
  return timestamps_[buffer_id];
}

void ReferenceBufferTracker::Reset() {
  std::fill(timestamps_.begin(), timestamps_.end(), std::nullopt);
}

std::vector<int> ReferenceBufferTracker::OrderByTimestamp(
    std::span<const int> reference_buffers) const {
  std::vector<int> sorted(reference_buffers.begin(), reference_buffers.end());
  absl::c_stable_sort(sorted, [this](int a, int b) {
    return GetTimestamp(a) > GetTimestamp(b);
  });
  return sorted;
}

}  // namespace webrtc
