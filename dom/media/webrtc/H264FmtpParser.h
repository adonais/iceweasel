/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

#ifndef DOM_MEDIA_WEBRTC_H264FMTPPARSER_H_
#define DOM_MEDIA_WEBRTC_H264FMTPPARSER_H_

#include "H264.h"
#include "mozilla/Assertions.h"
#include "mozilla/Maybe.h"
#include "mozilla/Result.h"
#include "mozilla/ResultVariant.h"
#include "nsStringFwd.h"

namespace webrtc {
struct CodecParameterMap;
}

namespace mozilla {

enum class H264FmtpParseError { NotPresent, Invalid };

struct H264ProfileLevel {
  H264_PROFILE mProfile;
  H264_LEVEL mLevel;
};

struct H264FmtpParams {
  Result<H264ProfileLevel, H264FmtpParseError> mProfileLevel =
      Err(H264FmtpParseError::NotPresent);
  Result<uint32_t, H264FmtpParseError> mPacketizationMode =
      Err(H264FmtpParseError::NotPresent);

  // Whether any parameter was present but invalid.
  bool HasInvalidParam() const {
    const auto invalid = [](const auto& aResult) {
      return aResult.isErr() &&
             aResult.inspectErr() == H264FmtpParseError::Invalid;
    };
    return invalid(mProfileLevel) || invalid(mPacketizationMode);
  }
};

// H.264 Annex A Table A-1 macroblock limits for a level: maximum
// macroblocks per frame and per second.
struct H264MacroblockLimits {
  uint32_t mMaxMacroblocksPerFrame;
  uint32_t mMaxMacroblocksPerSecond;
};

#ifdef MOZ_WEBRTC
// Parse profile-level-id and packetization-mode from a video/H264 MIME content
// type. Missing parameters return Err(NotPresent), present but unparseable or
// unsupported values return Err(Invalid).
H264FmtpParams ParseH264Fmtp(const nsACString& aMimeString);

// Parse profile-level-id directly from an already-parsed fmtp parameter map
// (as opposed to a MIME content-type string). Missing returns Err(NotPresent),
// present but unparseable or unsupported returns Err(Invalid).
Result<H264ProfileLevel, H264FmtpParseError>
ParseH264ProfileLevelFromParameters(
    const webrtc::CodecParameterMap& aParameters);

// The H.264 Annex A Table A-1 macroblock limits for aLevel. Nothing() for
// unknown levels.
Maybe<H264MacroblockLimits> H264MacroblockLimitsForLevel(H264_LEVEL aLevel);

// Whether the given resolution and framerate fit aLevel's H.264 Annex A
// macroblocks-per-frame and macroblocks-per-second caps. False for unknown
// levels.
[[nodiscard]] bool H264LevelFits(H264_LEVEL aLevel, uint32_t aWidth,
                                 uint32_t aHeight, double aFramerate);

// The smallest H.264 Annex A level that the given resolution and framerate
// conform to. Nothing() if no known level fits (the resolution/framerate
// exceeds even the highest level this file knows about).
Maybe<H264_LEVEL> H264SmallestConformingLevel(uint32_t aWidth, uint32_t aHeight,
                                              double aFramerate);
#else
inline H264FmtpParams ParseH264Fmtp(const nsACString&) {
  MOZ_ASSERT_UNREACHABLE("ParseH264Fmtp called in non-MOZ_WEBRTC build");
  return {};
}
inline Result<H264ProfileLevel, H264FmtpParseError>
ParseH264ProfileLevelFromParameters(const webrtc::CodecParameterMap&) {
  MOZ_ASSERT_UNREACHABLE(
      "ParseH264ProfileLevelFromParameters called in non-MOZ_WEBRTC build");
  return Err(H264FmtpParseError::NotPresent);
}
inline Maybe<H264MacroblockLimits> H264MacroblockLimitsForLevel(H264_LEVEL) {
  MOZ_ASSERT_UNREACHABLE(
      "H264MacroblockLimitsForLevel called in non-MOZ_WEBRTC build");
  return Nothing();
}
inline bool H264LevelFits(H264_LEVEL, uint32_t, uint32_t, double) {
  MOZ_ASSERT_UNREACHABLE("H264LevelFits called in non-MOZ_WEBRTC build");
  return false;
}
inline Maybe<H264_LEVEL> H264SmallestConformingLevel(uint32_t, uint32_t,
                                                     double) {
  MOZ_ASSERT_UNREACHABLE(
      "H264SmallestConformingLevel called in non-MOZ_WEBRTC build");
  return Nothing();
}
#endif

}  // namespace mozilla

#endif  // DOM_MEDIA_WEBRTC_H264FMTPPARSER_H_
