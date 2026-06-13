/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "MediaDataCodec.h"

#include "PDMFactory.h"
#include "WebrtcGmpVideoCodec.h"
#include "WebrtcMediaDataDecoderCodec.h"
#include "WebrtcMediaDataEncoderCodec.h"
#include "mozilla/StaticPrefs_media.h"

namespace mozilla {

/* static */
media::EncodeSupportSet MediaDataCodec::SupportsEncoderCodec(
    const webrtc::SdpVideoFormat& aFormat) {
  const auto codecType = webrtc::PayloadStringToCodecType(aFormat.name);
  auto support = WebrtcMediaDataEncoder::SupportsCodec(codecType);
  if (codecType == webrtc::VideoCodecType::kVideoCodecH264 &&
      !StaticPrefs::media_webrtc_hw_h264_enabled()) {
    support -= media::EncodeSupport::HardwareEncode;
  }
  return support;
}

/* static */
WebrtcVideoEncoder* MediaDataCodec::CreateEncoder(
    const webrtc::SdpVideoFormat& aFormat) {
  if (SupportsEncoderCodec(aFormat).isEmpty()) {
    return nullptr;
  }
  return new WebrtcVideoEncoderProxy(new WebrtcMediaDataEncoder(aFormat));
}

static inline nsDependentCString MimeTypeFor(
    webrtc::VideoCodecType aCodecType) {
  switch (aCodecType) {
    case webrtc::VideoCodecType::kVideoCodecVP8:
      return nsDependentCString("video/vp8");
    case webrtc::VideoCodecType::kVideoCodecVP9:
      return nsDependentCString("video/vp9");
    case webrtc::VideoCodecType::kVideoCodecH264:
      return nsDependentCString("video/avc");
    case webrtc::VideoCodecType::kVideoCodecGeneric:
    case webrtc::VideoCodecType::kVideoCodecAV1:
    case webrtc::VideoCodecType::kVideoCodecH265:
      break;
  }
  return nsDependentCString("");
}

/* static */
media::DecodeSupportSet MediaDataCodec::SupportsDecoderCodec(
    webrtc::VideoCodecType aCodecType) {
  switch (aCodecType) {
    case webrtc::VideoCodecType::kVideoCodecVP8:
    case webrtc::VideoCodecType::kVideoCodecVP9:
      if (StaticPrefs::media_navigator_mediadatadecoder_vpx_enabled()) {
        RefPtr<PDMFactory> pdm = new PDMFactory();
        return pdm->SupportsMimeType(MimeTypeFor(aCodecType));
      }
      break;
    case webrtc::VideoCodecType::kVideoCodecH264:
      if (StaticPrefs::media_navigator_mediadatadecoder_h264_enabled()) {
        RefPtr<PDMFactory> pdm = new PDMFactory();
        media::DecodeSupportSet support;
        support = pdm->SupportsMimeType(MimeTypeFor(aCodecType));
        if (!StaticPrefs::media_webrtc_hw_h264_enabled()) {
          support -= media::DecodeSupport::HardwareDecode;
        }
        return support;
      }
      break;
    case webrtc::VideoCodecType::kVideoCodecGeneric:
    case webrtc::VideoCodecType::kVideoCodecAV1:
    case webrtc::VideoCodecType::kVideoCodecH265:
      break;
  }
  return {};
}

WebrtcVideoDecoder* MediaDataCodec::CreateDecoder(
    webrtc::VideoCodecType aCodecType, TrackingId aTrackingId) {
  if (SupportsDecoderCodec(aCodecType).isEmpty()) {
    return nullptr;
  }
  nsDependentCString codec = MimeTypeFor(aCodecType);
  return new WebrtcMediaDataDecoder(codec, aTrackingId);
}

}  // namespace mozilla
