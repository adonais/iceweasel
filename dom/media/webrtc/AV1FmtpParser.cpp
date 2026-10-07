/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

#include "AV1FmtpParser.h"

#include <charconv>

#include "api/video_codecs/av1_profile.h"
#include "mozilla/CheckedInt.h"
#include "mozilla/Maybe.h"
#include "nsContentTypeParser.h"

namespace mozilla {

// Whether aLevelIdx is one of the AV1 Annex A.3 levels with defined
// parameters, or level-idx 31 ("Maximum parameters"). Levels 2.2, 2.3, 3.2,
// 3.3, 4.2, 4.3 and 7.0-7.3 are named but have no defined parameters, and
// 24-30 are reserved.
static bool IsDefinedAV1LevelIdx(uint8_t aLevelIdx) {
  switch (aLevelIdx) {
    case 0:
    case 1:
    case 4:
    case 5:
    case 8:
    case 9:
    case 12:
    case 13:
    case 14:
    case 15:
    case 16:
    case 17:
    case 18:
    case 19:
    case 31:
      return true;
    default:
      return false;
  }
}

// Strict decimal parse: digits only, no sign, whitespace or trailing junk.
static Maybe<uint8_t> ParseUint8(const nsAString& aStr) {
  const NS_ConvertUTF16toUTF8 narrow(aStr);
  const char* end = narrow.EndReading();
  uint8_t value;
  const auto [ptr, ec] = std::from_chars(narrow.BeginReading(), end, value);
  if (ec != std::errc() || ptr != end) {
    return Nothing();
  }
  return Some(value);
}

AV1FmtpParams ParseAV1Fmtp(const nsACString& aMimeString) {
  AV1FmtpParams out;
  nsContentTypeParser parser((NS_ConvertUTF8toUTF16(aMimeString)));

  nsAutoString profile;
  if (NS_SUCCEEDED(parser.GetParameter("profile", profile))) {
    NS_ConvertUTF16toUTF8 narrow(profile);
    auto parsed = webrtc::StringToAV1Profile(narrow.get());
    if (parsed) {
      out.mProfile = static_cast<uint8_t>(*parsed);
    } else {
      out.mProfile = Err(AV1FmtpParseError::Invalid);
    }
  }

  nsAutoString levelIdx;
  if (NS_SUCCEEDED(parser.GetParameter("level-idx", levelIdx))) {
    Maybe<uint8_t> level = ParseUint8(levelIdx);
    if (level && IsDefinedAV1LevelIdx(*level)) {
      out.mLevelIdx = *level;
    } else {
      out.mLevelIdx = Err(AV1FmtpParseError::Invalid);
    }
  }

  nsAutoString tier;
  if (NS_SUCCEEDED(parser.GetParameter("tier", tier))) {
    Maybe<uint8_t> t = ParseUint8(tier);
    if (t && *t <= 1) {
      out.mTier = *t;
    } else {
      out.mTier = Err(AV1FmtpParseError::Invalid);
    }
  }

  return out;
}

namespace {
struct AV1LevelConstraint {
  uint8_t mLevelIdx;
  uint32_t mMaxPicSize;
  uint32_t mMaxHSize;
  uint32_t mMaxVSize;
  uint64_t mMaxDisplayRate;
};
}  // namespace

// AV1 spec Annex A.3 "Levels" table (MaxPicSize/MaxHSize/MaxVSize/
// MaxDisplayRate columns). Only levels with defined parameters are listed;
// levels 2.2, 2.3, 3.2, 3.3, 4.2, 4.3 and 7.0-7.3 (level-idx 2, 3, 6, 7, 10,
// 11, 20-23) have no defined parameters and are intentionally absent, as are
// the reserved 24-30.
static constexpr AV1LevelConstraint kAV1LevelConstraints[] = {
    {0, 147456, 2048, 1152, 4423680},         // 2.0
    {1, 278784, 2816, 1584, 8363520},         // 2.1
    {4, 665856, 4352, 2448, 19975680},        // 3.0
    {5, 1065024, 5504, 3096, 31950720},       // 3.1
    {8, 2359296, 6144, 3456, 70778880},       // 4.0
    {9, 2359296, 6144, 3456, 141557760},      // 4.1
    {12, 8912896, 8192, 4352, 267386880},     // 5.0
    {13, 8912896, 8192, 4352, 534773760},     // 5.1
    {14, 8912896, 8192, 4352, 1069547520},    // 5.2
    {15, 8912896, 8192, 4352, 1069547520},    // 5.3
    {16, 35651584, 16384, 8704, 1069547520},  // 6.0
    {17, 35651584, 16384, 8704, 2139095040},  // 6.1
    {18, 35651584, 16384, 8704, 4278190080},  // 6.2
    {19, 35651584, 16384, 8704, 4278190080},  // 6.3
};

Maybe<AV1BlockLimits> AV1BlockLimitsForLevel(uint8_t aLevelIdx) {
  if (aLevelIdx == 31) {
    // "Maximum parameters" -- no limits imposed.
    return Nothing();
  }
  for (const auto& c : kAV1LevelConstraints) {
    if (c.mLevelIdx == aLevelIdx) {
      // Convert samples to 16x16-pixel blocks, the unit
      // VideoEncodingConstraints::maxFs/maxMbps use.
      return Some(AV1BlockLimits{c.mMaxPicSize / 256, c.mMaxDisplayRate / 256});
    }
  }
  return Nothing();
}

bool AV1LevelFits(uint8_t aLevelIdx, uint32_t aWidth, uint32_t aHeight,
                  double aFramerate) {
  if (aLevelIdx == 31) {
    // "Maximum parameters" -- no limits imposed.
    return true;
  }

  for (const auto& c : kAV1LevelConstraints) {
    if (c.mLevelIdx != aLevelIdx) {
      continue;
    }
    if (aWidth > c.mMaxHSize || aHeight > c.mMaxVSize) {
      return false;
    }
    const CheckedInt<uint64_t> picSize =
        CheckedInt<uint64_t>(aWidth) * CheckedInt<uint64_t>(aHeight);
    if (!picSize.isValid() || picSize.value() > c.mMaxPicSize) {
      return false;
    }
    if (static_cast<double>(picSize.value()) * aFramerate >
        static_cast<double>(c.mMaxDisplayRate)) {
      return false;
    }
    return true;
  }
  return false;
}

}  // namespace mozilla
