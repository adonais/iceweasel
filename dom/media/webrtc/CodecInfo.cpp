/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
#include "CodecInfo.h"

#ifdef MOZ_WEBRTC
#  include "MediaMIMETypes.h"
#  include "jsapi/DefaultCodecPreferences.h"
#  include "jsep/JsepCodecDescription.h"
#  include "libwebrtcglue/WebrtcVideoCodecFactory.h"
#  include "media/base/media_constants.h"
#  include "mozilla/Maybe.h"
#  include "mozilla/media/webrtc/AV1FmtpParser.h"
#  include "mozilla/media/webrtc/H264FmtpParser.h"
#endif

namespace mozilla {

#ifdef MOZ_WEBRTC
// Query the webrtc encoder factory whether aConfig is supported in SW and/or
// HW.
RefPtr<PlatformEncoderModule::SupportsEncoderPromise>
SupportsVideoEncodeForWebrtc(const EncoderConfig& aConfig) {
  return WebrtcVideoEncoderFactory::SupportsCodec(aConfig);
}

// Query the webrtc decoder factory whether aMime is supported in SW and/or HW.
RefPtr<PlatformDecoderModule::SupportsDecoderPromise>
SupportsVideoDecodeForWebrtc(const MediaExtendedMIMEType& aMime,
                             const SupportDecoderParams& aParams) {
  return WebrtcVideoDecoderFactory::SupportsCodec(aMime, aParams);
}

// Implementation class that samples codec preferences once at construction.
class CodecInfoImpl final : public WebrtcCodecInfo {
 public:
  CodecInfoImpl()
      : mPrefs(),
        mAudioCodecs([this] {
          AutoTArray<UniquePtr<JsepCodecDescription>, 5> codecs;
          EnumerateDefaultAudioCodecs(&codecs, mPrefs);
          return codecs;
        }()),
        mVideoCodecs([this] {
          AutoTArray<UniquePtr<JsepCodecDescription>, 10> codecs;
          EnumerateDefaultVideoCodecs(&codecs, mPrefs);
          return codecs;
        }()) {}

  [[nodiscard]] bool CheckEncodeType(
      const MediaExtendedMIMEType& aMime) const override {
    return QueryCodecDetails<sdp::kSend>(aMime);
  }

  [[nodiscard]] bool CheckDecodeType(
      const MediaExtendedMIMEType& aMime) const override {
    return QueryCodecDetails<sdp::kRecv>(aMime);
  }

 private:
  template <sdp::Direction kDirection>
  bool QueryCodecDetails(const MediaExtendedMIMEType& aMime) const {
    static_assert(kDirection == sdp::kSend || kDirection == sdp::kRecv);
    const auto& type = aMime.Type();
    const bool isAudio = type.HasAudioMajorType();
    const bool isVideo = type.HasVideoMajorType();

    if (!isAudio && !isVideo) {
      return {};
    }

    auto payloadString = aMime.Subtype();

    // Codecs that are not standalone media codecs and not supported by WebRTC
    if (payloadString.EqualsIgnoreCase(webrtc::kRtxCodecName) ||
        payloadString.EqualsIgnoreCase(webrtc::kRedCodecName) ||
        payloadString.EqualsIgnoreCase(webrtc::kUlpfecCodecName) ||
        payloadString.EqualsIgnoreCase(webrtc::kFlexfecCodecName) ||
        payloadString.EqualsIgnoreCase(webrtc::kDtmfCodecName)) {
      return {};
    }

    const bool isH264 =
        isVideo && payloadString.EqualsIgnoreCase(webrtc::kH264CodecName);
    Maybe<uint32_t> requestedPacketizationMode;
    if (isH264) {
      const auto fmtp = ParseH264Fmtp(aMime.OriginalString());
      if (fmtp.HasInvalidParam()) {
        return false;
      }
      if (fmtp.mPacketizationMode.isOk()) {
        requestedPacketizationMode = Some(fmtp.mPacketizationMode.inspect());
      }
    }

    const bool isAV1 =
        isVideo && payloadString.EqualsIgnoreCase(webrtc::kAv1CodecName);
    if (isAV1 && ParseAV1Fmtp(aMime.OriginalString()).HasInvalidParam()) {
      return false;
    }

    const auto& codecs = isAudio ? mAudioCodecs : mVideoCodecs;
    for (const auto& c : codecs) {
      if (!payloadString.EqualsIgnoreCase(c->mName) || !c->mEnabled ||
          !c->DirectionSupported(kDirection)) {
        continue;
      }
      if (isH264 && requestedPacketizationMode) {
        MOZ_ASSERT(c->Type() == SdpMediaSection::kVideo);
        const auto* h264 =
            static_cast<const JsepVideoCodecDescription*>(c.get());
        if (h264->mPacketizationMode != *requestedPacketizationMode) {
          continue;
        }
      }
      return true;
    }
    return false;
  }

  const DefaultCodecPreferences mPrefs;
  const nsTArray<UniquePtr<JsepCodecDescription>> mAudioCodecs;
  const nsTArray<UniquePtr<JsepCodecDescription>> mVideoCodecs;
};

/* static */
std::unique_ptr<WebrtcCodecInfo> WebrtcCodecInfo::Create() {
  return std::make_unique<CodecInfoImpl>();
}
#else
RefPtr<PlatformEncoderModule::SupportsEncoderPromise>
SupportsVideoEncodeForWebrtc(const EncoderConfig&) {
  return PlatformEncoderModule::SupportsEncoderPromise::CreateAndResolve(
      media::EncodeSupportSet{}, __func__);
}

RefPtr<PlatformDecoderModule::SupportsDecoderPromise>
SupportsVideoDecodeForWebrtc(const MediaExtendedMIMEType&,
                             const SupportDecoderParams&) {
  return PlatformDecoderModule::SupportsDecoderPromise::CreateAndResolve(
      media::DecodeSupportSet{}, __func__);
}

class CodecInfoStub final : public WebrtcCodecInfo {
 public:
  bool CheckEncodeType(const MediaExtendedMIMEType&) const override {
    return false;
  }
  bool CheckDecodeType(const MediaExtendedMIMEType&) const override {
    return false;
  }
};

/* static */
std::unique_ptr<WebrtcCodecInfo> WebrtcCodecInfo::Create() {
  return std::make_unique<CodecInfoStub>();
}
#endif

}  // namespace mozilla
