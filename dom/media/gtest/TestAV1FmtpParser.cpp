/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "MediaMIMETypes.h"
#include "gtest/gtest.h"
#include "mozilla/media/webrtc/AV1FmtpParser.h"

using namespace mozilla;

static AV1FmtpParams Parse(const char* aType) {
  Maybe<MediaExtendedMIMEType> mime = MakeMediaExtendedMIMEType(aType);
  if (mime.isNothing()) {
    ADD_FAILURE() << "MIME failed to parse: " << aType;
    return {};
  }
  return ParseAV1Fmtp(mime->OriginalString());
}

TEST(AV1FmtpParser, NoParameters)
{
  AV1FmtpParams p = Parse("video/AV1");
  ASSERT_TRUE(p.mProfile.isErr());
  EXPECT_EQ(p.mProfile.inspectErr(), AV1FmtpParseError::NotPresent);
  ASSERT_TRUE(p.mLevelIdx.isErr());
  EXPECT_EQ(p.mLevelIdx.inspectErr(), AV1FmtpParseError::NotPresent);
  ASSERT_TRUE(p.mTier.isErr());
  EXPECT_EQ(p.mTier.inspectErr(), AV1FmtpParseError::NotPresent);
}

TEST(AV1FmtpParser, ProfileMain)
{
  AV1FmtpParams p = Parse("video/AV1; profile=0");
  ASSERT_TRUE(p.mProfile.isOk());
  EXPECT_EQ(p.mProfile.inspect(), 0u);
}

TEST(AV1FmtpParser, ProfileHigh)
{
  AV1FmtpParams p = Parse("video/AV1; profile=1");
  ASSERT_TRUE(p.mProfile.isOk());
  EXPECT_EQ(p.mProfile.inspect(), 1u);
}

TEST(AV1FmtpParser, ProfileProfessional)
{
  AV1FmtpParams p = Parse("video/AV1; profile=2");
  ASSERT_TRUE(p.mProfile.isOk());
  EXPECT_EQ(p.mProfile.inspect(), 2u);
}

TEST(AV1FmtpParser, ProfileOutOfRange)
{
  AV1FmtpParams p = Parse("video/AV1; profile=3");
  ASSERT_TRUE(p.mProfile.isErr());
  EXPECT_EQ(p.mProfile.inspectErr(), AV1FmtpParseError::Invalid);
}

TEST(AV1FmtpParser, ProfileNonNumeric)
{
  AV1FmtpParams p = Parse("video/AV1; profile=banana");
  ASSERT_TRUE(p.mProfile.isErr());
  EXPECT_EQ(p.mProfile.inspectErr(), AV1FmtpParseError::Invalid);
}

TEST(AV1FmtpParser, LevelIdxDefinedLevel)
{
  // level-idx 9 -- level 4.1.
  AV1FmtpParams p = Parse("video/AV1; level-idx=9");
  ASSERT_TRUE(p.mLevelIdx.isOk());
  EXPECT_EQ(p.mLevelIdx.inspect(), 9u);
}

TEST(AV1FmtpParser, LevelIdxMaximumParameters)
{
  // level-idx 31 -- "Maximum parameters".
  AV1FmtpParams p = Parse("video/AV1; level-idx=31");
  ASSERT_TRUE(p.mLevelIdx.isOk());
  EXPECT_EQ(p.mLevelIdx.inspect(), 31u);
}

TEST(AV1FmtpParser, LevelIdxUndefinedButNamed)
{
  // level-idx 2 -- level 2.2, named but has no defined parameters.
  AV1FmtpParams p = Parse("video/AV1; level-idx=2");
  ASSERT_TRUE(p.mLevelIdx.isErr());
  EXPECT_EQ(p.mLevelIdx.inspectErr(), AV1FmtpParseError::Invalid);
}

TEST(AV1FmtpParser, LevelIdxReserved)
{
  AV1FmtpParams p = Parse("video/AV1; level-idx=25");
  ASSERT_TRUE(p.mLevelIdx.isErr());
  EXPECT_EQ(p.mLevelIdx.inspectErr(), AV1FmtpParseError::Invalid);
}

TEST(AV1FmtpParser, LevelIdxOutOfRange)
{
  AV1FmtpParams p = Parse("video/AV1; level-idx=99");
  ASSERT_TRUE(p.mLevelIdx.isErr());
  EXPECT_EQ(p.mLevelIdx.inspectErr(), AV1FmtpParseError::Invalid);
}

TEST(AV1FmtpParser, LevelIdxNonNumeric)
{
  AV1FmtpParams p = Parse("video/AV1; level-idx=banana");
  ASSERT_TRUE(p.mLevelIdx.isErr());
  EXPECT_EQ(p.mLevelIdx.inspectErr(), AV1FmtpParseError::Invalid);
}

TEST(AV1FmtpParser, LevelIdxMalformed)
{
  // nsAString::ToInteger would accept all of these as 9.
  for (const char* type :
       {"video/AV1; level-idx=!!!9###", "video/AV1; level-idx=9!",
        "video/AV1; level-idx=+9", "video/AV1; level-idx=9.0",
        "video/AV1; level-idx=0x9"}) {
    SCOPED_TRACE(type);
    AV1FmtpParams p = Parse(type);
    ASSERT_TRUE(p.mLevelIdx.isErr());
    EXPECT_EQ(p.mLevelIdx.inspectErr(), AV1FmtpParseError::Invalid);
  }
}

TEST(AV1FmtpParser, LevelIdxEmpty)
{
  AV1FmtpParams p = Parse("video/AV1; level-idx=");
  ASSERT_TRUE(p.mLevelIdx.isErr());
  EXPECT_EQ(p.mLevelIdx.inspectErr(), AV1FmtpParseError::Invalid);
}

TEST(AV1FmtpParser, TierMain)
{
  AV1FmtpParams p = Parse("video/AV1; tier=0");
  ASSERT_TRUE(p.mTier.isOk());
  EXPECT_EQ(p.mTier.inspect(), 0u);
}

TEST(AV1FmtpParser, TierHigh)
{
  AV1FmtpParams p = Parse("video/AV1; tier=1");
  ASSERT_TRUE(p.mTier.isOk());
  EXPECT_EQ(p.mTier.inspect(), 1u);
}

TEST(AV1FmtpParser, TierOutOfRange)
{
  AV1FmtpParams p = Parse("video/AV1; tier=2");
  ASSERT_TRUE(p.mTier.isErr());
  EXPECT_EQ(p.mTier.inspectErr(), AV1FmtpParseError::Invalid);
}

TEST(AV1FmtpParser, TierNonNumeric)
{
  AV1FmtpParams p = Parse("video/AV1; tier=banana");
  ASSERT_TRUE(p.mTier.isErr());
  EXPECT_EQ(p.mTier.inspectErr(), AV1FmtpParseError::Invalid);
}

TEST(AV1FmtpParser, TierMalformed)
{
  for (const char* type :
       {"video/AV1; tier=!1", "video/AV1; tier=1!", "video/AV1; tier=-0"}) {
    SCOPED_TRACE(type);
    AV1FmtpParams p = Parse(type);
    ASSERT_TRUE(p.mTier.isErr());
    EXPECT_EQ(p.mTier.inspectErr(), AV1FmtpParseError::Invalid);
  }
}

TEST(AV1FmtpParser, AllValid)
{
  AV1FmtpParams p = Parse("video/AV1; profile=2;level-idx=9;tier=1");
  ASSERT_TRUE(p.mProfile.isOk());
  EXPECT_EQ(p.mProfile.inspect(), 2u);
  ASSERT_TRUE(p.mLevelIdx.isOk());
  EXPECT_EQ(p.mLevelIdx.inspect(), 9u);
  ASSERT_TRUE(p.mTier.isOk());
  EXPECT_EQ(p.mTier.inspect(), 1u);
}

TEST(AV1LevelFits, FitsAtSpecExampleResolution)
{
  // 426x240@30fps is the AV1 spec's own example for level 2.0 (level-idx 0).
  EXPECT_TRUE(AV1LevelFits(0, 426, 240, 30));
}

TEST(AV1LevelFits, ExceedsMaxHSize)
{
  // Level 2.0's MaxHSize is 2048.
  EXPECT_FALSE(AV1LevelFits(0, 2049, 100, 30));
}

TEST(AV1LevelFits, ExceedsMaxVSize)
{
  // Level 2.0's MaxVSize is 1152.
  EXPECT_FALSE(AV1LevelFits(0, 100, 1153, 30));
}

TEST(AV1LevelFits, ExceedsMaxPicSize)
{
  // Level 2.0's MaxHSize/MaxVSize are 2048/1152, but MaxPicSize is only
  // 147456 -- far smaller than 2048*1152, so a frame within the H/V caps can
  // still exceed the picture size cap.
  EXPECT_FALSE(AV1LevelFits(0, 2048, 1152, 1));
}

TEST(AV1LevelFits, ExceedsMaxDisplayRate)
{
  // 426x240 fits level 2.0's picture size, but 100fps exceeds MaxDisplayRate.
  EXPECT_FALSE(AV1LevelFits(0, 426, 240, 100));
}

TEST(AV1LevelFits, UndefinedLevelReturnsFalse)
{
  // level-idx 2 (level 2.2) has no defined parameters.
  EXPECT_FALSE(AV1LevelFits(2, 16, 16, 1));
}

TEST(AV1LevelFits, ReservedLevelReturnsFalse)
{
  EXPECT_FALSE(AV1LevelFits(25, 16, 16, 1));
}

TEST(AV1LevelFits, MaximumParametersAlwaysFits)
{
  EXPECT_TRUE(AV1LevelFits(31, 999999, 999999, 999));
}

TEST(AV1BlockLimitsForLevel, KnownLevel)
{
  // Level 2.0: MaxPicSize=147456 samples, MaxDisplayRate=4423680
  // samples/sec, converted to 16x16 blocks (/256).
  Maybe<AV1BlockLimits> limits = AV1BlockLimitsForLevel(0);
  ASSERT_TRUE(limits.isSome());
  EXPECT_EQ(limits->mMaxFs, 576u);
  EXPECT_EQ(limits->mMaxBlocksPerSecond, 17280u);
}

TEST(AV1BlockLimitsForLevel, UndefinedButNamedLevel)
{
  EXPECT_TRUE(AV1BlockLimitsForLevel(2).isNothing());
}

TEST(AV1BlockLimitsForLevel, ReservedLevel)
{
  EXPECT_TRUE(AV1BlockLimitsForLevel(25).isNothing());
}

TEST(AV1BlockLimitsForLevel, MaximumParametersImposesNoLimit)
{
  EXPECT_TRUE(AV1BlockLimitsForLevel(31).isNothing());
}
