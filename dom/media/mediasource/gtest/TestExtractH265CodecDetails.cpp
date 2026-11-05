/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include <gtest/gtest.h>

#include "H265.h"
#include "VideoUtils.h"

using namespace mozilla;

struct H265TestData {
  const char16_t* const mCodecParameterString;
  const bool mExpectedValue;
  const char* const mComment;
};

TEST(ExtractH265CodecDetails, TestInputData)
{
  H265TestData tests[] = {
      // <sample entry 4CC>.<general_profile_space><general_profile_idc>.
      // <general_profile_compatibility_flags>.
      // <general_tier_flag><general_level_idc>.<constraint bytes>

      // Format checks
      {u"hvc1.1.6.L93.B0", true, "Valid Main"},
      {u"hev1.1.6.L93.B0", true, "hev1 is spelled the same way as hvc1"},
      {u"hvc2.1.6.L93.B0", false, "Invalid 4CC"},
      {u"hev1", false, "0 of 3 required fields"},
      {u"hev1.1", false, "1 of 3 required fields"},
      {u"hev1.1.6", false, "2 of 3 required fields"},
      {u"hvc1.1..L93", false, "Blank field"},
      {u"hvc1.1.6.L93", true, "Constraint bytes are optional"},

      // Profile spaces
      {u"hvc1.A1.6.L93.B0", true, "Profile space A"},
      {u"hvc1.B1.6.L93.B0", true, "Profile space B"},
      {u"hvc1.C1.6.L93.B0", true, "Profile space C"},
      // 'D' is a hex digit, so ToInteger starts parsing there and rejects it
      // as an invalid base 10 digit.
      {u"hvc1.D1.6.L93.B0", false, "Invalid profile space D"},

      // Profiles
      {u"hvc1.2.4.L120.B0", true, "Main 10"},
      {u"hvc1.3.8.L93.B0", true, "Main Still Picture"},
      {u"hvc1.4.10.L153.B0", true, "Range Extensions"},
      {u"hvc1.12.0.L93.B0", false, "Unrecognizable profile"},
      {u"hvc1.32.6.L93.B0", false, "Invalid profile > 31"},

      // Tiers
      {u"hvc1.1.6.H93.B0", true, "High tier"},
      // ToInteger skips leading characters that are not hex digits, so an
      // unrecognized tier is dropped and the level still parses. Main tier is
      // the conservative reading of the two.
      {u"hvc1.1.6.X93.B0", true, "Unrecognized tier falls back to Main tier"},

      // Constraint bytes
      {u"hvc1.1.6.L93.B0.9.16.9", true, "Four constraint bytes"},
      {u"hvc1.1.6.L93.B0.0.0.0.0.0", true, "Six constraint bytes"},
      {u"hvc1.1.6.L93.B0.0.0.0.0.0.0", false, "Seven constraint bytes"},
  };

  for (const auto& data : tests) {
    H265CodecDetails details;
    bool result =
        ExtractH265CodecDetails(nsString(data.mCodecParameterString), &details);
    EXPECT_EQ(result, data.mExpectedValue)
        << NS_ConvertUTF16toUTF8(data.mCodecParameterString).get() << " ("
        << data.mComment << ")";
  }
}

TEST(ExtractH265CodecDetails, TestParsingOutput)
{
  H265CodecDetails details;

  // ISO/IEC 14496-15 Annex E.3: "the 32 bits of the
  // general_profile_compatibility_flags, but in reverse bit order." Thus "6"
  // here becomes bits 30 and 29 in bitstream order.
  EXPECT_TRUE(ExtractH265CodecDetails(nsString(u"hvc1.1.6.L93.B0"), &details));
  EXPECT_EQ(details.general_profile_space, 0);
  EXPECT_EQ(details.general_tier_flag, false);
  EXPECT_EQ(details.general_profile_idc, 1);
  EXPECT_EQ(details.general_profile_compatibility_flags, 0x60000000u);
  EXPECT_EQ(details.general_constraint_indicator_flags,
            UINT64_C(0xB00000000000));
  EXPECT_EQ(details.general_level_idc, 93);

  // Profile space B, Main 10 at High tier, with all six constraint bytes.
  EXPECT_TRUE(ExtractH265CodecDetails(nsString(u"hvc1.B2.4.H120.B0.9.16.9.1.2"),
                                      &details));
  EXPECT_EQ(details.general_profile_space, 2);
  EXPECT_EQ(details.general_tier_flag, true);
  EXPECT_EQ(details.general_profile_idc, 2);
  EXPECT_EQ(details.general_profile_compatibility_flags, 0x20000000u);
  EXPECT_EQ(details.general_constraint_indicator_flags,
            UINT64_C(0xB00916090102));
  EXPECT_EQ(details.general_level_idc, 120);

  // Omitted constraint bytes read as zero.
  EXPECT_TRUE(ExtractH265CodecDetails(nsString(u"hvc1.1.6.L93"), &details));
  EXPECT_EQ(details.general_constraint_indicator_flags, UINT64_C(0));
}
