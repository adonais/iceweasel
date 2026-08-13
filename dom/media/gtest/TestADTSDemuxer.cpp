/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include <gtest/gtest.h>

#include <climits>

#include "ADTSDemuxer.h"
#include "MockMediaResource.h"

class MockADTSMediaResource;
namespace mozilla {
DDLoggedTypeNameAndBase(::MockADTSMediaResource, MockMediaResource);
}  // namespace mozilla

using namespace mozilla;
using media::TimeUnit;

class MockADTSMediaResource
    : public MockMediaResource,
      public DecoderDoctorLifeLogger<MockADTSMediaResource> {
 public:
  explicit MockADTSMediaResource(const char* aFileName)
      : MockMediaResource(aFileName) {}

 protected:
  virtual ~MockADTSMediaResource() = default;
};

// ADTSTrackDemuxer::Duration(int64_t) must not produce signed integer overflow
// when given a huge frame count.
TEST(ADTSDemuxer, DurationOverflowReturnsInvalid)
{
  RefPtr<MockADTSMediaResource> resource =
      new MockADTSMediaResource("adts.aac");
  ASSERT_EQ(NS_OK, resource->Open());

  RefPtr<ADTSTrackDemuxer> demuxer = new ADTSTrackDemuxer(resource);
  ASSERT_TRUE(demuxer->Init());

  // With 1024 samples/frame (typical AAC), INT64_MAX / 1024 + 1 frames means
  // that sample count overflows int64_t.
  const int64_t kOverflowFrames = INT64_MAX / 1024 + 1;
  TimeUnit duration = demuxer->Duration(kOverflowFrames);

  EXPECT_FALSE(duration.IsValid());
}
