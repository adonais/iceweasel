/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include <jni.h>

#include "AOMDecoder.h"
#include "MediaInfo.h"
#include "RemoteDataDecoder.h"
#include "VPXDecoder.h"
#include "mozilla/Components.h"
#include "mozilla/StaticPrefs_media.h"
#include "mozilla/gfx/gfxVars.h"
#include "mozilla/java/GeckoAppShellWrappers.h"
#include "mozilla/java/HardwareCodecCapabilityUtilsWrappers.h"
#include "nsCharSeparatedTokenizer.h"
#include "nsIGfxInfo.h"
#include "nsPromiseFlatString.h"
#include "prlog.h"

#undef LOG
#define LOG(arg, ...)                                                         \
  MOZ_LOG_FMT(sAndroidDecoderModuleLog, mozilla::LogLevel::Debug,             \
              "AndroidDecoderModule({})::{}: " arg, fmt::ptr(this), __func__, \
              ##__VA_ARGS__)
#define SLOG(arg, ...)                                                        \
  MOZ_LOG_FMT(sAndroidDecoderModuleLog, mozilla::LogLevel::Debug, "{}: " arg, \
              __func__, ##__VA_ARGS__)

using namespace mozilla;
using media::DecodeSupport;
using media::DecodeSupportSet;
using media::MCSInfo;
using media::MediaCodec;
using media::MediaCodecsSupport;
using media::MediaCodecsSupported;
using media::TimeUnit;

namespace mozilla {

mozilla::LazyLogModule sAndroidDecoderModuleLog("AndroidDecoderModule");

nsCString TranslateMimeType(const nsACString& aMimeType) {
  if (VPXDecoder::IsVPX(aMimeType, VPXDecoder::VP8)) {
    static constexpr auto vp8 = "video/x-vnd.on2.vp8"_ns;
    return vp8;
  }
  if (VPXDecoder::IsVPX(aMimeType, VPXDecoder::VP9)) {
    static constexpr auto vp9 = "video/x-vnd.on2.vp9"_ns;
    return vp9;
  }
  if (aMimeType.EqualsLiteral("video/av1")) {
    static constexpr auto av1 = "video/av01"_ns;
    return av1;
  }
  return nsCString(aMimeType);
}

AndroidDecoderModule::AndroidDecoderModule(CDMProxy* aProxy) {
  mProxy = static_cast<MediaDrmCDMProxy*>(aProxy);
}

/* static */
media::MediaCodecsSupported AndroidDecoderModule::GetSupportedCodecs() {
  return MCSInfo::GetDecodeSupported(
      gfx::gfxVars::PlatformMediaCodecsSupported());
}

static bool ContainsMimeType(const nsACString& aList,
                             const nsACString& aMimeType) {
  for (const auto& token : nsCCharSeparatedTokenizer(aList, ',').ToRange()) {
    if (token.Equals(aMimeType)) {
      return true;
    }
  }
  return false;
}

DecodeSupportSet AndroidDecoderModule::SupportsMimeType(
    const nsACString& aMimeType) {
  // Handle per-codec logic if the codec type can be determined from
  // the MIME type string. GetMediaCodecFromMimeType should handle every
  // type string that was hardcoded in this function previously.
  MediaCodec codec = MCSInfo::GetMediaCodecFromMimeType(aMimeType);
  switch (codec) {
    case MediaCodec::VP8:
      if (!gfx::gfxVars::UseVP8HwDecode()) {
        return media::DecodeSupportSet{};
      }
      break;

    case MediaCodec::VP9:
      if (!gfx::gfxVars::UseVP9HwDecode()) {
        return media::DecodeSupportSet{};
      }
      break;

    // Prefer the gecko decoder for opus/vorbis; stagefright crashes
    // on content demuxed from mp4.
    // Not all android devices support FLAC even when they say they do.
    // Always use our own software decoder (in ffvpx) for audio except for AAC
    case MediaCodec::MP3:
      [[fallthrough]];
    case MediaCodec::Opus:
      [[fallthrough]];
    case MediaCodec::Vorbis:
      [[fallthrough]];
    case MediaCodec::Wave:
      [[fallthrough]];
    case MediaCodec::FLAC:
      SLOG("Rejecting audio of type {}", PromiseFlatCString(aMimeType).get());
      return media::DecodeSupportSet{};

    // H264 always reports software decode
    case MediaCodec::H264:
      return DecodeSupport::SoftwareDecode;

    case MediaCodec::HEVC:
      if (!StaticPrefs::media_hevc_enabled()) {
        SLOG("Rejecting HEVC as the preference is disabled");
        return media::DecodeSupportSet{};
      }
      break;

    // AV1 doesn't need any special handling.
    case MediaCodec::AV1:
      break;

    case MediaCodec::SENTINEL:
      [[fallthrough]];
    default:
      SLOG("Support check using default logic for {}",
           PromiseFlatCString(aMimeType).get());
      break;
  }

  // If the codec can't be determined from the MIME type string, check if the
  // MIME type string itself is supported.
  if (codec == MediaCodec::SENTINEL) {
    const nsCString mimeType = TranslateMimeType(aMimeType);
    if (ContainsMimeType(gfx::gfxVars::PlatformUnmappedHwDecodeMimeTypes(),
                         mimeType)) {
      return DecodeSupport::HardwareDecode;
    }
    if (ContainsMimeType(gfx::gfxVars::PlatformUnmappedSwDecodeMimeTypes(),
                         mimeType)) {
      return DecodeSupport::SoftwareDecode;
    }
    return media::DecodeSupportSet{};
  }

  auto supported = gfx::gfxVars::PlatformMediaCodecsSupported();
  if (MCSInfo::SupportsHardwareDecode(supported, codec)) {
    return DecodeSupport::HardwareDecode;
  }
  if (MCSInfo::SupportsSoftwareDecode(supported, codec)) {
    return DecodeSupport::SoftwareDecode;
  }
  return media::DecodeSupportSet{};
}

DecodeSupportSet AndroidDecoderModule::SupportsMimeType(
    const nsACString& aMimeType, DecoderDoctorDiagnostics* aDiagnostics) const {
  return AndroidDecoderModule::SupportsMimeType(aMimeType);
}

bool AndroidDecoderModule::SupportsColorDepth(
    gfx::ColorDepth aColorDepth, DecoderDoctorDiagnostics* aDiagnostics) const {
  // 10-bit support is codec dependent so this is not entirely accurate.
  // Supports() will correct it.
  return aColorDepth == gfx::ColorDepth::COLOR_8 ||
         aColorDepth == gfx::ColorDepth::COLOR_10;
}

// Further check is needed because the base class uses the inaccurate
// SupportsColorDepth().
media::DecodeSupportSet AndroidDecoderModule::Supports(
    const SupportDecoderParams& aParams,
    DecoderDoctorDiagnostics* aDiagnostics) const {
  media::DecodeSupportSet support =
      PlatformDecoderModule::Supports(aParams, aDiagnostics);

  // Short-circuit.
  if (support.isEmpty()) {
    return support;
  }

  // For AV1, only allow HW decoder.
  if (AOMDecoder::IsAV1(aParams.MimeType()) &&
      (!StaticPrefs::media_av1_enabled() ||
       !support.contains(media::DecodeSupport::HardwareDecode))) {
    return media::DecodeSupportSet{};
  }

  // Check 10-bit video.
  const TrackInfo& trackInfo = aParams.mConfig;
  const VideoInfo* videoInfo = trackInfo.GetAsVideoInfo();
  if (!videoInfo || videoInfo->mColorDepth != gfx::ColorDepth::COLOR_10) {
    return support;
  }

  return java::HardwareCodecCapabilityUtils::Decodes10Bit(
             TranslateMimeType(aParams.MimeType()))
             ? support
             : media::DecodeSupportSet{};
}

already_AddRefed<MediaDataDecoder> AndroidDecoderModule::CreateVideoDecoder(
    const CreateDecoderParams& aParams) {
  // Temporary - forces use of VPXDecoder when alpha is present.
  // Bug 1263836 will handle alpha scenario once implemented. It will shift
  // the check for alpha to PDMFactory but not itself remove the need for a
  // check.
  if (aParams.VideoConfig().HasAlpha()) {
    return nullptr;
  }

  if (AOMDecoder::IsAV1(aParams.mConfig.mMimeType) &&
      !AOMDecoder::IsMainProfile(aParams.VideoConfig().mExtraData)) {
    return nullptr;
  }

  // Don't use SW VPX MediaCodecs. Prefering VPXDecoder over MediaCodec SW
  // decoder implementation allow us to have more consistent cross-platform VPX
  // playback experience and be able to get upstream bug fixes/improvements more
  // frequently.
  if (VPXDecoder::IsVPX(aParams.VideoConfig().mMimeType) &&
      !SupportsMimeType(aParams.VideoConfig().mMimeType)
           .contains(DecodeSupport::HardwareDecode)) {
    return nullptr;
  }

  nsString drmStubId;
  if (mProxy) {
    drmStubId = mProxy->GetMediaDrmStubId();
  }

  RefPtr<MediaDataDecoder> decoder =
      RemoteDataDecoder::CreateVideoDecoder(aParams, drmStubId, mProxy);
  return decoder.forget();
}

// static
bool AndroidDecoderModule::IsJavaDecoderModuleAllowed() {
  return StaticPrefs::media_android_media_codec_enabled() &&
         !java::GeckoAppShell::IsIsolatedProcess();
}

already_AddRefed<MediaDataDecoder> AndroidDecoderModule::CreateAudioDecoder(
    const CreateDecoderParams& aParams) {
  const AudioInfo& config = aParams.AudioConfig();
  LOG("CreateAudioFormat with mimeType={}, mRate={}, channels={}",
      config.mMimeType.get(), config.mRate, config.mChannels);

  nsString drmStubId;
  if (mProxy) {
    drmStubId = mProxy->GetMediaDrmStubId();
  }
  RefPtr<MediaDataDecoder> decoder =
      RemoteDataDecoder::CreateAudioDecoder(aParams, drmStubId, mProxy);
  return decoder.forget();
}

/* static */
already_AddRefed<PlatformDecoderModule> AndroidDecoderModule::Create(
    CDMProxy* aProxy) {
  return MakeAndAddRef<AndroidDecoderModule>(aProxy);
}

}  // namespace mozilla
