/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "MediaMIMETypes.h"
#include "api/rtp_parameters.h"
#include "gtest/gtest.h"
#include "mozilla/media/webrtc/H264FmtpParser.h"

using namespace mozilla;

static H264FmtpParams Parse(const char* aType) {
  Maybe<MediaExtendedMIMEType> mime = MakeMediaExtendedMIMEType(aType);
  if (mime.isNothing()) {
    ADD_FAILURE() << "MIME failed to parse: " << aType;
    return {};
  }
  return ParseH264Fmtp(mime->OriginalString());
}

TEST(H264FmtpParser, NoParameters)
{
  H264FmtpParams p = Parse("video/H264");
  ASSERT_TRUE(p.mProfileLevel.isErr());
  EXPECT_EQ(p.mProfileLevel.inspectErr(), H264FmtpParseError::NotPresent);
  ASSERT_TRUE(p.mPacketizationMode.isErr());
  EXPECT_EQ(p.mPacketizationMode.inspectErr(), H264FmtpParseError::NotPresent);
}

TEST(H264FmtpParser, ConstrainedBaselineLevel31)
{
  // 0x42e01f -- constrained baseline, level 3.1 (WebRTC default).
  H264FmtpParams p = Parse("video/H264; profile-level-id=42e01f");
  ASSERT_TRUE(p.mProfileLevel.isOk());
  EXPECT_EQ(p.mProfileLevel.inspect().mProfile,
            H264_PROFILE::H264_PROFILE_BASE);
  EXPECT_EQ(p.mProfileLevel.inspect().mLevel, H264_LEVEL::H264_LEVEL_3_1);
  ASSERT_TRUE(p.mPacketizationMode.isErr());
  EXPECT_EQ(p.mPacketizationMode.inspectErr(), H264FmtpParseError::NotPresent);
}

TEST(H264FmtpParser, ConstrainedBaselineLevel31UpperCase)
{
  H264FmtpParams p = Parse("video/H264; profile-level-id=42E01F");
  ASSERT_TRUE(p.mProfileLevel.isOk());
  EXPECT_EQ(p.mProfileLevel.inspect().mProfile,
            H264_PROFILE::H264_PROFILE_BASE);
  EXPECT_EQ(p.mProfileLevel.inspect().mLevel, H264_LEVEL::H264_LEVEL_3_1);
}

TEST(H264FmtpParser, ConstrainedBaselineViaMainLevel31)
{
  H264FmtpParams p = Parse("video/H264; profile-level-id=4d801f");
  ASSERT_TRUE(p.mProfileLevel.isOk());
  EXPECT_EQ(p.mProfileLevel.inspect().mProfile,
            H264_PROFILE::H264_PROFILE_BASE);
  EXPECT_EQ(p.mProfileLevel.inspect().mLevel, H264_LEVEL::H264_LEVEL_3_1);
}

TEST(H264FmtpParser, ConstrainedBaselineViaExtendedLevel31)
{
  H264FmtpParams p = Parse("video/H264; profile-level-id=58c01f");
  ASSERT_TRUE(p.mProfileLevel.isOk());
  EXPECT_EQ(p.mProfileLevel.inspect().mProfile,
            H264_PROFILE::H264_PROFILE_BASE);
  EXPECT_EQ(p.mProfileLevel.inspect().mLevel, H264_LEVEL::H264_LEVEL_3_1);
}

TEST(H264FmtpParser, BaselineLevel31)
{
  // 0x42001f -- baseline, level 3.1.
  H264FmtpParams p = Parse("video/H264; profile-level-id=42001f");
  ASSERT_TRUE(p.mProfileLevel.isOk());
  EXPECT_EQ(p.mProfileLevel.inspect().mProfile,
            H264_PROFILE::H264_PROFILE_BASE);
  EXPECT_EQ(p.mProfileLevel.inspect().mLevel, H264_LEVEL::H264_LEVEL_3_1);
}

TEST(H264FmtpParser, BaselineViaExtendedLevel31)
{
  // 0x58801f -- Extended profile_idc with constraint_set0_flag set is
  // baseline per RFC 6184 (58 (E) 10xx0000).
  H264FmtpParams p = Parse("video/H264; profile-level-id=58801f");
  ASSERT_TRUE(p.mProfileLevel.isOk());
  EXPECT_EQ(p.mProfileLevel.inspect().mProfile,
            H264_PROFILE::H264_PROFILE_BASE);
  EXPECT_EQ(p.mProfileLevel.inspect().mLevel, H264_LEVEL::H264_LEVEL_3_1);
}

TEST(H264FmtpParser, MainLevel32)
{
  // 0x4d0020 -- main, level 3.2.
  H264FmtpParams p = Parse("video/H264; profile-level-id=4d0020");
  ASSERT_TRUE(p.mProfileLevel.isOk());
  EXPECT_EQ(p.mProfileLevel.inspect().mProfile,
            H264_PROFILE::H264_PROFILE_MAIN);
  EXPECT_EQ(p.mProfileLevel.inspect().mLevel, H264_LEVEL::H264_LEVEL_3_2);
}

TEST(H264FmtpParser, HighLevel52)
{
  // 0x640034 -- high, level 5.2 (OpenH264 ceiling per OpenH264 docs).
  H264FmtpParams p = Parse("video/H264; profile-level-id=640034");
  ASSERT_TRUE(p.mProfileLevel.isOk());
  EXPECT_EQ(p.mProfileLevel.inspect().mProfile,
            H264_PROFILE::H264_PROFILE_HIGH);
  EXPECT_EQ(p.mProfileLevel.inspect().mLevel, H264_LEVEL::H264_LEVEL_5_2);
}

TEST(H264FmtpParser, PacketizationModeOne)
{
  H264FmtpParams p = Parse(
      "video/H264; profile-level-id=42e01f;level-asymmetry-allowed=1;"
      "packetization-mode=1");
  ASSERT_TRUE(p.mPacketizationMode.isOk());
  EXPECT_EQ(p.mPacketizationMode.inspect(), 1u);
}

TEST(H264FmtpParser, PacketizationModeZero)
{
  H264FmtpParams p = Parse("video/H264; packetization-mode=0");
  ASSERT_TRUE(p.mPacketizationMode.isOk());
  EXPECT_EQ(p.mPacketizationMode.inspect(), 0u);
}

TEST(H264FmtpParser, PacketizationModeOutOfRange)
{
  H264FmtpParams p = Parse("video/H264; packetization-mode=3");
  ASSERT_TRUE(p.mPacketizationMode.isErr());
  EXPECT_EQ(p.mPacketizationMode.inspectErr(), H264FmtpParseError::Invalid);
}

TEST(H264FmtpParser, PacketizationModeNonNumeric)
{
  H264FmtpParams p = Parse("video/H264; packetization-mode=banana");
  ASSERT_TRUE(p.mPacketizationMode.isErr());
  EXPECT_EQ(p.mPacketizationMode.inspectErr(), H264FmtpParseError::Invalid);
}

TEST(H264FmtpParser, MalformedProfileByte)
{
  // Invalid hex in the profile_idc byte.
  H264FmtpParams p = Parse("video/H264; profile-level-id=zze01f");
  ASSERT_TRUE(p.mProfileLevel.isErr());
  EXPECT_EQ(p.mProfileLevel.inspectErr(), H264FmtpParseError::Invalid);
}

TEST(H264FmtpParser, MalformedLevelByte)
{
  // Invalid hex in the level_idc byte.
  H264FmtpParams p = Parse("video/H264; profile-level-id=42e0zz");
  ASSERT_TRUE(p.mProfileLevel.isErr());
  EXPECT_EQ(p.mProfileLevel.inspectErr(), H264FmtpParseError::Invalid);
}

TEST(H264FmtpParser, UnrecognizedProfileIop)
{
  // 0x42011f -- valid hex, but profile_iop=0x01 (low reserved bit set) does
  // not match any kProfilePatterns entry for profile_idc=0x42.
  H264FmtpParams p = Parse("video/H264; profile-level-id=42011f");
  ASSERT_TRUE(p.mProfileLevel.isErr());
  EXPECT_EQ(p.mProfileLevel.inspectErr(), H264FmtpParseError::Invalid);
}

TEST(H264FmtpParser, ShortProfileLevelId)
{
  H264FmtpParams p = Parse("video/H264; profile-level-id=42e0");
  ASSERT_TRUE(p.mProfileLevel.isErr());
  EXPECT_EQ(p.mProfileLevel.inspectErr(), H264FmtpParseError::Invalid);
}

TEST(H264MacroblockLimitsForLevel, KnownLevel)
{
  Maybe<H264MacroblockLimits> limits =
      H264MacroblockLimitsForLevel(H264_LEVEL::H264_LEVEL_3_1);
  ASSERT_TRUE(limits.isSome());
  EXPECT_EQ(limits->mMaxMacroblocksPerFrame, 3600u);
  EXPECT_EQ(limits->mMaxMacroblocksPerSecond, 108000u);
}

TEST(H264MacroblockLimitsForLevel, AnotherKnownLevel)
{
  Maybe<H264MacroblockLimits> limits =
      H264MacroblockLimitsForLevel(H264_LEVEL::H264_LEVEL_1);
  ASSERT_TRUE(limits.isSome());
  EXPECT_EQ(limits->mMaxMacroblocksPerFrame, 99u);
  EXPECT_EQ(limits->mMaxMacroblocksPerSecond, 1485u);
}

TEST(H264MacroblockLimitsForLevel, UnknownLevel)
{
  // Levels 6.0/6.1/6.2 are not in the Annex A Table A-1 data this file
  // vendors.
  Maybe<H264MacroblockLimits> limits =
      H264MacroblockLimitsForLevel(H264_LEVEL::H264_LEVEL_6);
  EXPECT_TRUE(limits.isNothing());
}

TEST(H264MacroblockLimitsForLevel, ConsistentWithH264LevelFits)
{
  Maybe<H264MacroblockLimits> limits =
      H264MacroblockLimitsForLevel(H264_LEVEL::H264_LEVEL_3_1);
  ASSERT_TRUE(limits.isSome());
  // 3600 macroblocks is exactly the level 3.1 cap; a resolution fitting
  // within it at a framerate fitting the macroblocks/second cap should
  // satisfy H264LevelFits.
  EXPECT_TRUE(
      H264LevelFits(H264_LEVEL::H264_LEVEL_3_1, 1280, 720,
                    static_cast<double>(limits->mMaxMacroblocksPerSecond) /
                        limits->mMaxMacroblocksPerFrame));
}

TEST(ParseH264ProfileLevelFromParameters, NotPresent)
{
  webrtc::CodecParameterMap params;
  Result<H264ProfileLevel, H264FmtpParseError> r =
      ParseH264ProfileLevelFromParameters(params);
  ASSERT_TRUE(r.isErr());
  EXPECT_EQ(r.inspectErr(), H264FmtpParseError::NotPresent);
}

TEST(ParseH264ProfileLevelFromParameters, ConstrainedBaselineLevel31)
{
  webrtc::CodecParameterMap params;
  params["profile-level-id"] = "42e01f";
  Result<H264ProfileLevel, H264FmtpParseError> r =
      ParseH264ProfileLevelFromParameters(params);
  ASSERT_TRUE(r.isOk());
  EXPECT_EQ(r.inspect().mProfile, H264_PROFILE::H264_PROFILE_BASE);
  EXPECT_EQ(r.inspect().mLevel, H264_LEVEL::H264_LEVEL_3_1);
}

TEST(ParseH264ProfileLevelFromParameters, Malformed)
{
  webrtc::CodecParameterMap params;
  params["profile-level-id"] = "zze01f";
  Result<H264ProfileLevel, H264FmtpParseError> r =
      ParseH264ProfileLevelFromParameters(params);
  ASSERT_TRUE(r.isErr());
  EXPECT_EQ(r.inspectErr(), H264FmtpParseError::Invalid);
}

TEST(H264SmallestConformingLevel, FitsLevel1)
{
  // Well within level 1's 99-macroblock, 1485-macroblocks/sec caps.
  Maybe<H264_LEVEL> level = H264SmallestConformingLevel(176, 144, 5);
  ASSERT_TRUE(level.isSome());
  EXPECT_EQ(*level, H264_LEVEL::H264_LEVEL_1);
}

TEST(H264SmallestConformingLevel, FitsLevel3_1)
{
  // 1280x720 @ 30fps is exactly the level 3.1 macroblocks/frame cap (3600)
  // and fits comfortably under its macroblocks/second cap (108000), but
  // exceeds every lower level's caps.
  Maybe<H264_LEVEL> level = H264SmallestConformingLevel(1280, 720, 30);
  ASSERT_TRUE(level.isSome());
  EXPECT_EQ(*level, H264_LEVEL::H264_LEVEL_3_1);
}

TEST(H264SmallestConformingLevel, ExceedsHighestKnownLevel)
{
  // Far beyond even level 5.2's caps.
  Maybe<H264_LEVEL> level = H264SmallestConformingLevel(7680, 4320, 60);
  EXPECT_TRUE(level.isNothing());
}
