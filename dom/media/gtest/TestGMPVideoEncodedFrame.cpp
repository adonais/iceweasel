/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "GMPVideoEncodedFrameImpl.h"
#include "GMPVideoHost.h"
#include "gtest/gtest.h"
#include "mozilla/gmp/GMPTypes.h"

using namespace mozilla::gmp;
using testing::Test;

static GMPVideoEncodedFrameData TemporalIdAndSize(int32_t aTemporalLayerId,
                                                  uint32_t aSize) {
  GMPVideoEncodedFrameData frameData;
  frameData.mTemporalLayerId() = aTemporalLayerId;
  frameData.mSize() = aSize;
  return frameData;
}

static bool CheckFrameData(const GMPVideoEncodedFrameData& aFrameData,
                           size_t aBufferSize) {
  return GMPVideoEncodedFrameImpl::CheckFrameData(aFrameData, aBufferSize);
}

// Valid temporal layer IDs: -1 (sentinel for "unset"), and [0, 3], which are
// the supported temporal layers in libwebrtc.
TEST(TestGMPVideoEncodedFrameImpl, CheckFrameData_ValidTemporalLayerIds)
{
  EXPECT_TRUE(CheckFrameData(TemporalIdAndSize(-1, 0), 0));
  EXPECT_TRUE(CheckFrameData(TemporalIdAndSize(0, 0), 0));
  EXPECT_TRUE(CheckFrameData(TemporalIdAndSize(1, 0), 0));
  EXPECT_TRUE(CheckFrameData(TemporalIdAndSize(2, 0), 0));
  EXPECT_TRUE(CheckFrameData(TemporalIdAndSize(3, 0), 0));
}

// Temporal layer IDs >= kMaxTemporalStreams (4) must be rejected.
TEST(TestGMPVideoEncodedFrameImpl,
     CheckFrameData_InvalidTemporalLayerIdTooLarge)
{
  EXPECT_FALSE(CheckFrameData(TemporalIdAndSize(4, 0), 0));
  EXPECT_FALSE(CheckFrameData(TemporalIdAndSize(100000, 0), 0));
  EXPECT_FALSE(CheckFrameData(TemporalIdAndSize(INT32_MAX, 0), 0));
}

// Temporal layer IDs below -1 are also invalid.
TEST(TestGMPVideoEncodedFrameImpl,
     CheckFrameData_InvalidTemporalLayerIdTooSmall)
{
  EXPECT_FALSE(CheckFrameData(TemporalIdAndSize(-2, 0), 0));
  EXPECT_FALSE(CheckFrameData(TemporalIdAndSize(INT32_MIN, 0), 0));
}

// The size check must work regardless of temporal layer ID.
TEST(TestGMPVideoEncodedFrameImpl, CheckFrameData_SizeExceedsBuffer)
{
  EXPECT_FALSE(CheckFrameData(TemporalIdAndSize(-1, 10), 9));
  EXPECT_FALSE(CheckFrameData(TemporalIdAndSize(0, 10), 9));
  EXPECT_FALSE(CheckFrameData(TemporalIdAndSize(100000, 10), 9));
}

// Size fits in buffer with valid temporal layer ID: valid.
TEST(TestGMPVideoEncodedFrameImpl, CheckFrameData_SizeFitsInBuffer)
{
  EXPECT_TRUE(CheckFrameData(TemporalIdAndSize(0, 10), 10));
  EXPECT_TRUE(CheckFrameData(TemporalIdAndSize(0, 9), 10));
  EXPECT_TRUE(CheckFrameData(TemporalIdAndSize(0, 0), 0));
}
