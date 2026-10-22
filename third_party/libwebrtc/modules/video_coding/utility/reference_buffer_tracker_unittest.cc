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

#include <optional>

#include "api/units/timestamp.h"
#include "test/gmock.h"
#include "test/gtest.h"

namespace webrtc {
namespace {

using ::testing::ElementsAre;
using ::testing::IsEmpty;

TEST(ReferenceBufferTrackerTest, InitializesWithCustomBufferCount) {
  ReferenceBufferTracker tracker3(/*num_buffers=*/3);
  EXPECT_EQ(tracker3.num_buffers(), 3);
  for (int i = 0; i < 3; ++i) {
    EXPECT_EQ(tracker3.GetTimestamp(i), std::nullopt);
  }

  ReferenceBufferTracker tracker8(/*num_buffers=*/8);
  EXPECT_EQ(tracker8.num_buffers(), 8);
  for (int i = 0; i < 8; ++i) {
    EXPECT_EQ(tracker8.GetTimestamp(i), std::nullopt);
  }
}

TEST(ReferenceBufferTrackerTest, UpdateAndGetTimestamp) {
  ReferenceBufferTracker tracker(/*num_buffers=*/4);

  tracker.Update(/*buffer_id=*/1, Timestamp::Millis(100));
  tracker.Update(/*buffer_id=*/3, Timestamp::Millis(250));

  EXPECT_EQ(tracker.GetTimestamp(0), std::nullopt);
  EXPECT_EQ(tracker.GetTimestamp(1), Timestamp::Millis(100));
  EXPECT_EQ(tracker.GetTimestamp(2), std::nullopt);
  EXPECT_EQ(tracker.GetTimestamp(3), Timestamp::Millis(250));

  // Overwrite buffer 1.
  tracker.Update(/*buffer_id=*/1, Timestamp::Millis(300));
  EXPECT_EQ(tracker.GetTimestamp(1), Timestamp::Millis(300));
}

TEST(ReferenceBufferTrackerTest, ResetClearsAllTimestamps) {
  ReferenceBufferTracker tracker(/*num_buffers=*/4);

  tracker.Update(0, Timestamp::Millis(100));
  tracker.Update(1, Timestamp::Millis(200));
  tracker.Update(2, Timestamp::Millis(300));
  tracker.Update(3, Timestamp::Millis(400));

  tracker.Reset();

  for (int i = 0; i < 4; ++i) {
    EXPECT_EQ(tracker.GetTimestamp(i), std::nullopt);
  }
}

TEST(ReferenceBufferTrackerTest, OrderByTimestampAllBuffersHaveTimestamps) {
  ReferenceBufferTracker tracker(/*num_buffers=*/4);
  tracker.Update(0, Timestamp::Millis(100));
  tracker.Update(1, Timestamp::Millis(400));
  tracker.Update(2, Timestamp::Millis(200));
  tracker.Update(3, Timestamp::Millis(300));

  // Full set, out of order. Most recent should be first: 1 (400ms), 3 (300ms),
  // 2 (200ms), 0 (100ms).
  const int buffers[] = {0, 1, 2, 3};
  EXPECT_THAT(tracker.OrderByTimestamp(buffers), ElementsAre(1, 3, 2, 0));

  // Subset of buffers.
  const int subset[] = {0, 2, 3};
  EXPECT_THAT(tracker.OrderByTimestamp(subset), ElementsAre(3, 2, 0));

  // Single buffer.
  const int single[] = {2};
  EXPECT_THAT(tracker.OrderByTimestamp(single), ElementsAre(2));

  // Empty list.
  EXPECT_THAT(tracker.OrderByTimestamp({}), IsEmpty());
}

TEST(ReferenceBufferTrackerTest, OrderByTimestampWithUnsetBuffers) {
  ReferenceBufferTracker tracker(/*num_buffers=*/5);
  // Only buffers 0 and 2 have timestamps.
  tracker.Update(0, Timestamp::Millis(100));
  tracker.Update(2, Timestamp::Millis(200));

  // Buffers with timestamps should precede unset buffers.
  const int buffers[] = {0, 1, 2, 3, 4};
  EXPECT_THAT(tracker.OrderByTimestamp(buffers), ElementsAre(2, 0, 1, 3, 4));

  // When all requested buffers are unset, stable order is preserved.
  const int unset_buffers[] = {4, 3, 1};
  EXPECT_THAT(tracker.OrderByTimestamp(unset_buffers), ElementsAre(4, 3, 1));
}

TEST(ReferenceBufferTrackerTest,
     OrderByTimestampPreservesOrderForEqualTimestamps) {
  ReferenceBufferTracker tracker(/*num_buffers=*/4);
  tracker.Update(0, Timestamp::Millis(200));
  tracker.Update(1, Timestamp::Millis(200));
  tracker.Update(2, Timestamp::Millis(100));
  tracker.Update(3, Timestamp::Millis(200));

  const int buffers[] = {0, 1, 2, 3};
  // Buffers 0, 1, 3 all have 200ms, buffer 2 has 100ms.
  // Stable sort must preserve 0, 1, 3 relative order.
  EXPECT_THAT(tracker.OrderByTimestamp(buffers), ElementsAre(0, 1, 3, 2));

  const int reversed[] = {3, 1, 0, 2};
  EXPECT_THAT(tracker.OrderByTimestamp(reversed), ElementsAre(3, 1, 0, 2));
}

}  // namespace
}  // namespace webrtc
