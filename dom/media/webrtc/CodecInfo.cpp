/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
#include "CodecInfo.h"

#ifdef MOZ_WEBRTC
#  include "MediaMIMETypes.h"
#  include "jsapi/DefaultCodecPreferences.h"
#  include "libwebrtcglue/WebrtcVideoCodecFactory.h"
#  include "media/base/media_constants.h"
#endif

namespace mozilla {

#ifdef MOZ_WEBRTC
static nsDependentCSubstring MimeTypeToPayloadString(
    const MediaExtendedMIMEType& aMime) {
  const nsCString& norm = aMime.Type().AsString();
  const int32_t slash = norm.FindChar('/');
  if (slash < 0) {
    return {};
  }
  return Substring(norm, slash + 1);
}

// Query the webrtc encoder factory whether aMime is supported in SW and/or HW.
media::EncodeSupportSet SupportsVideoMimeEncodeForWebrtc(
    const MediaExtendedMIMEType& aMime) {
  return WebrtcVideoEncoderFactory::SupportsCodec(webrtc::SdpVideoFormat(
      std::string(MimeTypeToPayloadString(aMime).View())));
}

// Query the webrtc decoder factory whether aMime is supported in SW and/or HW.
media::DecodeSupportSet SupportsVideoMimeDecodeForWebrtc(
    const MediaExtendedMIMEType& aMime) {
  return WebrtcVideoDecoderFactory::SupportsCodec(
      webrtc::PayloadStringToCodecType(
          std::string(MimeTypeToPayloadString(aMime).View())));
}

// Implementation class that samples codec preferences once at construction.
class CodecInfoImpl final : public WebrtcCodecInfo {
 public:
  CodecInfoImpl() : CodecInfoImpl(OverrideRtxPreference::NoOverride) {}
  explicit CodecInfoImpl(const OverrideRtxPreference aOverrideRtxPreference)
      : mPrefs([aOverrideRtxPreference] {
          return DefaultCodecPreferences(aOverrideRtxPreference);
        }()),
        mAudioCodecs([this] {
          nsTArray<UniquePtr<JsepCodecDescription>> codecs;
          EnumerateDefaultAudioCodecs(codecs, mPrefs);
          return codecs;
        }()),
        mVideoCodecs([this] {
          nsTArray<UniquePtr<JsepCodecDescription>> codecs;
          EnumerateDefaultVideoCodecs(codecs, mPrefs);
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

    auto payloadString = MimeTypeToPayloadString(aMime);

    // Codecs that are not standalone media codecs and not supported by WebRTC
    if (payloadString.EqualsIgnoreCase(webrtc::kRtxCodecName) ||
        payloadString.EqualsIgnoreCase(webrtc::kRedCodecName) ||
        payloadString.EqualsIgnoreCase(webrtc::kUlpfecCodecName) ||
        payloadString.EqualsIgnoreCase(webrtc::kFlexfecCodecName) ||
        payloadString.EqualsIgnoreCase(webrtc::kDtmfCodecName)) {
      return {};
    }

    const auto& codecs = isAudio ? mAudioCodecs : mVideoCodecs;
    for (const auto& c : codecs) {
      // TODO(Bug 2024767): Handle fmtp parameters
      if (payloadString.EqualsIgnoreCase(c->mName) && c->mEnabled &&
          c->DirectionSupported(kDirection)) {
        return true;
      }
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
media::EncodeSupportSet SupportsVideoMimeEncodeForWebrtc(
    const MediaExtendedMIMEType& aMime) {
  return {};
}
media::DecodeSupportSet SupportsVideoMimeDecodeForWebrtc(
    const MediaExtendedMIMEType& aMime) {
  return {};
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
