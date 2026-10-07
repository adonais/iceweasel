/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "MediaDataCodec.h"

#include "PDMFactorySupport.h"
#include "PEMFactory.h"
#include "WebrtcGmpVideoCodec.h"
#include "WebrtcMediaDataDecoderCodec.h"
#include "WebrtcMediaDataEncoderCodec.h"
#include "mozilla/StaticPrefs_media.h"
#include "nsThreadUtils.h"

namespace mozilla {

CodecType ToCodecType(const webrtc::VideoCodecType& aType) {
  switch (aType) {
    case webrtc::VideoCodecType::kVideoCodecVP8:
      return CodecType::VP8;
    case webrtc::VideoCodecType::kVideoCodecVP9:
      return CodecType::VP9;
    case webrtc::VideoCodecType::kVideoCodecH264:
      return CodecType::H264;
    case webrtc::VideoCodecType::kVideoCodecH265:
      return CodecType::H265;
    case webrtc::VideoCodecType::kVideoCodecAV1:
      return CodecType::AV1;
    case webrtc::VideoCodecType::kVideoCodecGeneric:
      return CodecType::Unknown;
  }
  MOZ_CRASH("Unsupported codec type");
  return CodecType::Unknown;
}

static media::EncodeSupportSet AdjustWebrtcEncodeSupportIdentity(
    media::EncodeSupportSet aSupport) {
  return aSupport;
}

static media::EncodeSupportSet AdjustWebrtcEncodeSupportH264(
    media::EncodeSupportSet aSupport) {
  if (!StaticPrefs::media_webrtc_hw_h264_enabled()) {
    return aSupport - media::EncodeSupport::HardwareEncode;
  }
  return aSupport;
}

AdjustEncodeSupportSetFunction AdjustWebrtcEncodeSupportFunctionForCodec(
    CodecType aCodec) {
  switch (aCodec) {
    case CodecType::H264:
      return &AdjustWebrtcEncodeSupportH264;
    default:
      return &AdjustWebrtcEncodeSupportIdentity;
  }
}

static media::DecodeSupportSet AdjustWebrtcDecodeSupportIdentity(
    media::DecodeSupportSet aSupport) {
  return aSupport;
}

static media::DecodeSupportSet AdjustWebrtcDecodeSupportH264(
    media::DecodeSupportSet aSupport) {
  // With media.webrtc.hw.h264.enabled off, drop hardware H.264 support so
  // WebRTC uses the software decoder, but only when one actually exists. On
  // hardware-only platforms (which bug 2044499 made us report accurately),
  // dropping it would leave H.264 with no support and fall back to OpenH264
  // which isn't a reliable substitute for every WebRTC stream (bug 2052237)
  if (!StaticPrefs::media_webrtc_hw_h264_enabled() &&
      aSupport.contains(media::DecodeSupport::SoftwareDecode)) {
    aSupport -= media::DecodeSupport::HardwareDecode;
  }
  return aSupport;
}

#ifdef MOZ_WIDGET_GTK
static media::DecodeSupportSet AdjustWebrtcDecodeSupportVP8(
    media::DecodeSupportSet aSupport) {
  if (!StaticPrefs::media_navigator_mediadatadecoder_vp8_hardware_enabled()) {
    aSupport -= media::DecodeSupport::HardwareDecode;
  }
  return aSupport;
}
#endif

// Return a codec-specific function to apply WebRTC-specific pref gating to the
// platform decoder support set.
AdjustDecodeSupportSetFunction AdjustWebrtcDecodeSupportFunctionForCodec(
    CodecType aCodec) {
  switch (aCodec) {
    case CodecType::H264:
      return &AdjustWebrtcDecodeSupportH264;
#ifdef MOZ_WIDGET_GTK
    case CodecType::VP8:
      return &AdjustWebrtcDecodeSupportVP8;
#endif
    default:
      return &AdjustWebrtcDecodeSupportIdentity;
  }
}

/* static */
media::EncodeSupportSet MediaDataCodec::SupportsEncoderCodec(
    const webrtc::SdpVideoFormat& aFormat) {
  const auto codecType = webrtc::PayloadStringToCodecType(aFormat.name);
  auto support = WebrtcMediaDataEncoder::SupportsCodec(codecType);
  return AdjustWebrtcEncodeSupportFunctionForCodec(ToCodecType(codecType))(
      support);
}

/* static */
RefPtr<PlatformEncoderModule::SupportsEncoderPromise>
MediaDataCodec::SupportsEncoderCodec(const EncoderConfig& aConfig) {
  // Mirror WebrtcMediaDataEncoder::SupportsCodec's gate; bug 1980201 tracks
  // adding the remaining codecs (AV1, HEVC) and will let both copies go.
  if (aConfig.mCodec != CodecType::H264 && aConfig.mCodec != CodecType::VP8 &&
      aConfig.mCodec != CodecType::VP9) {
    return PlatformEncoderModule::SupportsEncoderPromise::CreateAndResolve(
        media::EncodeSupportSet{}, __func__);
  }
  const CodecType codec = aConfig.mCodec;
  return MakeRefPtr<PEMFactory>()->SupportsAsync(aConfig)->Map(
      GetCurrentSerialEventTarget(), __func__,
      AdjustWebrtcEncodeSupportFunctionForCodec(codec));
}

/* static */
std::unique_ptr<WebrtcVideoEncoder> MediaDataCodec::CreateEncoder(
    const webrtc::SdpVideoFormat& aFormat, HardwarePreference aHardwarePref) {
  auto support = SupportsEncoderCodec(aFormat);
  if (aHardwarePref == HardwarePreference::RequireHardware) {
    support -= media::EncodeSupport::SoftwareEncode;
  }
  if (aHardwarePref == HardwarePreference::RequireSoftware) {
    support -= media::EncodeSupport::HardwareEncode;
  }
  if (support.isEmpty()) {
    return nullptr;
  }
  return std::make_unique<WebrtcVideoEncoderProxy>(
      MakeRefPtr<WebrtcMediaDataEncoder>(aFormat));
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
    case webrtc::VideoCodecType::kVideoCodecAV1:
      return nsDependentCString("video/av1");
    case webrtc::VideoCodecType::kVideoCodecGeneric:
    case webrtc::VideoCodecType::kVideoCodecH265:
      break;
  }
  return nsDependentCString("");
}

/* static */
media::DecodeSupportSet MediaDataCodec::SupportsDecoderCodec(
    webrtc::VideoCodecType aCodecType) {
  if (!WebrtcMediaDataDecoder::IsCodecEnabled(aCodecType)) {
    return {};
  }
  media::DecodeSupportSet support =
      PDMFactorySupport::IsTypeSupported(MimeTypeFor(aCodecType));
  if (aCodecType == webrtc::VideoCodecType::kVideoCodecH264) {
    support = AdjustWebrtcDecodeSupportH264(support);
  }
  return support;
}

std::unique_ptr<WebrtcVideoDecoder> MediaDataCodec::CreateDecoder(
    webrtc::VideoCodecType aCodecType, TrackingId aTrackingId) {
  if (SupportsDecoderCodec(aCodecType).isEmpty()) {
    return nullptr;
  }
  nsDependentCString codec = MimeTypeFor(aCodecType);
  return std::make_unique<WebrtcMediaDataDecoder>(codec, aTrackingId);
}

}  // namespace mozilla
