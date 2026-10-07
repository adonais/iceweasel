/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

#ifndef DOM_MEDIA_WEBRTC_GMPH264UTILS_H_
#define DOM_MEDIA_WEBRTC_GMPH264UTILS_H_

#include "H264.h"
#include "gmp-video-codec.h"

namespace mozilla {

inline GMPProfile ToGMPProfile(H264_PROFILE aProfile) {
  switch (aProfile) {
    case H264_PROFILE_MAIN:
      return kGMPH264ProfileMain;
    case H264_PROFILE_EXTENDED:
      return kGMPH264ProfileExtended;
    case H264_PROFILE_HIGH:
      return kGMPH264ProfileHigh;
    case H264_PROFILE_UNKNOWN:
    default:
      return kGMPH264ProfileUnknown;
  }
}

inline GMPLevel ToGMPLevel(H264_LEVEL aLevel) {
  switch (aLevel) {
    case H264_LEVEL::H264_LEVEL_1:
      return kGMPH264Level1_0;
    case H264_LEVEL::H264_LEVEL_1_1:
      // H264_LEVEL_1_b has the same value as H264_LEVEL_1_1, while
      // kGMPH264Level1_B and kGMPH264Level1_1 differ. Since we can't tell the
      // difference, we just ignore the 1_b case.
      return kGMPH264Level1_1;
    case H264_LEVEL::H264_LEVEL_1_2:
      return kGMPH264Level1_2;
    case H264_LEVEL::H264_LEVEL_1_3:
      return kGMPH264Level1_3;
    case H264_LEVEL::H264_LEVEL_2:
      return kGMPH264Level2_0;
    case H264_LEVEL::H264_LEVEL_2_1:
      return kGMPH264Level2_1;
    case H264_LEVEL::H264_LEVEL_2_2:
      return kGMPH264Level2_2;
    case H264_LEVEL::H264_LEVEL_3:
      return kGMPH264Level3_0;
    case H264_LEVEL::H264_LEVEL_3_1:
      return kGMPH264Level3_1;
    case H264_LEVEL::H264_LEVEL_3_2:
      return kGMPH264Level3_2;
    case H264_LEVEL::H264_LEVEL_4:
      return kGMPH264Level4_0;
    case H264_LEVEL::H264_LEVEL_4_1:
      return kGMPH264Level4_1;
    case H264_LEVEL::H264_LEVEL_4_2:
      return kGMPH264Level4_2;
    case H264_LEVEL::H264_LEVEL_5:
      return kGMPH264Level5_0;
    case H264_LEVEL::H264_LEVEL_5_1:
      return kGMPH264Level5_1;
    case H264_LEVEL::H264_LEVEL_5_2:
      return kGMPH264Level5_2;
    // 6.0 and above isn't supported.
    default:
      return kGMPH264LevelUnknown;
  }
}

}  // namespace mozilla

#endif  // DOM_MEDIA_WEBRTC_GMPH264UTILS_H_
