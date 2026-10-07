/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

#ifndef DOM_MEDIA_WEBRTC_AV1FMTPPARSER_H_
#define DOM_MEDIA_WEBRTC_AV1FMTPPARSER_H_

#include <cstdint>

#include "mozilla/Assertions.h"
#include "mozilla/Maybe.h"
#include "mozilla/Result.h"
#include "mozilla/ResultVariant.h"
#include "nsStringFwd.h"

namespace mozilla {

enum class AV1FmtpParseError { NotPresent, Invalid };

struct AV1FmtpParams {
  Result<uint8_t, AV1FmtpParseError> mProfile =
      Err(AV1FmtpParseError::NotPresent);
  Result<uint8_t, AV1FmtpParseError> mLevelIdx =
      Err(AV1FmtpParseError::NotPresent);
  Result<uint8_t, AV1FmtpParseError> mTier = Err(AV1FmtpParseError::NotPresent);

  // Whether any parameter was present but invalid.
  bool HasInvalidParam() const {
    const auto invalid = [](const auto& aResult) {
      return aResult.isErr() &&
             aResult.inspectErr() == AV1FmtpParseError::Invalid;
    };
    return invalid(mProfile) || invalid(mLevelIdx) || invalid(mTier);
  }
};

// AV1 Annex A.3 "Levels" block limits: maximum picture size and display
// rate, expressed in 16x16-pixel blocks (the same unit H264/VP8/VP9 use for
// their max-fs/max-mbps fmtp parameters), so callers can feed them directly
// into VideoEncodingConstraints::maxFs/maxMbps.
struct AV1BlockLimits {
  uint32_t mMaxFs;
  uint64_t mMaxBlocksPerSecond;
};

#ifdef MOZ_WEBRTC
// Parse profile, level-idx and tier from a video/AV1 MIME content type.
// Missing parameters return Err(NotPresent), present but unparseable or
// unsupported values return Err(Invalid).
AV1FmtpParams ParseAV1Fmtp(const nsACString& aMimeString);

// The AV1 Annex A.3 MaxPicSize/MaxDisplayRate limits for aLevelIdx,
// converted from samples to 16x16-pixel blocks. Nothing() for levels with no
// defined caps (undefined, reserved, or unknown) and for level-idx 31
// ("Maximum parameters", which imposes no cap).
Maybe<AV1BlockLimits> AV1BlockLimitsForLevel(uint8_t aLevelIdx);

// Whether the given resolution and framerate fit aLevelIdx's AV1 Annex A.3
// MaxHSize/MaxVSize/MaxPicSize/MaxDisplayRate caps. False for levels with no
// defined caps (undefined, reserved, or unknown), true unconditionally for
// level-idx 31 ("Maximum parameters").
[[nodiscard]] bool AV1LevelFits(uint8_t aLevelIdx, uint32_t aWidth,
                                uint32_t aHeight, double aFramerate);
#else
inline AV1FmtpParams ParseAV1Fmtp(const nsACString&) {
  MOZ_ASSERT_UNREACHABLE("ParseAV1Fmtp called in non-MOZ_WEBRTC build");
  return {};
}
inline Maybe<AV1BlockLimits> AV1BlockLimitsForLevel(uint8_t) {
  MOZ_ASSERT_UNREACHABLE(
      "AV1BlockLimitsForLevel called in non-MOZ_WEBRTC build");
  return Nothing();
}
inline bool AV1LevelFits(uint8_t, uint32_t, uint32_t, double) {
  MOZ_ASSERT_UNREACHABLE("AV1LevelFits called in non-MOZ_WEBRTC build");
  return false;
}
#endif

}  // namespace mozilla

#endif  // DOM_MEDIA_WEBRTC_AV1FMTPPARSER_H_
