/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef WMFDATAENCODERUTILS_H_
#define WMFDATAENCODERUTILS_H_
#include <mfapi.h>

#include "AnnexB.h"
#include "EncoderConfig.h"
#include "H264.h"
#include "MediaCodecsSupport.h"
#include "WMF.h"
#include "libyuv.h"
#include "mozilla/Logging.h"
#include "mozilla/mscom/EnsureMTA.h"

#define WMF_ENC_LOGD(arg, ...)                                                 \
  MOZ_LOG_FMT(mozilla::sPEMLog, mozilla::LogLevel::Debug,                      \
              "WMFMediaDataEncoder(0x{})::{}: " arg, fmt::ptr(this), __func__, \
              ##__VA_ARGS__)
#define WMF_ENC_LOGE(arg, ...)                                                 \
  MOZ_LOG_FMT(mozilla::sPEMLog, mozilla::LogLevel::Error,                      \
              "WMFMediaDataEncoder(0x{})::{}: " arg, fmt::ptr(this), __func__, \
              ##__VA_ARGS__)
#define WMF_ENC_SLOGE(arg, ...)                           \
  MOZ_LOG_FMT(mozilla::sPEMLog, mozilla::LogLevel::Error, \
              "WMFMediaDataEncoder: {}" arg, __func__, ##__VA_ARGS__)

namespace mozilla {

class MFTEncoder;

extern LazyLogModule sPEMLog;

GUID CodecToSubtype(CodecType aCodec);

// Whether the NV12 buffer fed to the MFT can be laid out for aSize. Applies
// whatever the source format, since the MFT's input type is always NV12: the
// single stride of aSize.width is short of a chroma row at odd widths.
bool IsFrameSizeSupportedForNV12Input(const gfx::IntSize& aSize);

// Whether a hardware encoder, if available, would be allowed.
bool CanUseWMFHwEncoder(const GUID& aSubtype);
bool CanUseWMFHwEncoder(const EncoderConfig& aConfig);

media::EncodeSupportSet CanCreateWMFEncoder(const EncoderConfig& aConfig);

already_AddRefed<MediaByteBuffer> ParseH264Parameters(
    const nsTArray<uint8_t>& aHeader, const bool aAsAnnexB);
uint32_t GetProfile(H264_PROFILE aProfileLevel);

already_AddRefed<IMFMediaType> CreateInputType(EncoderConfig& aConfig);

already_AddRefed<IMFMediaType> CreateOutputType(EncoderConfig& aConfig);

HRESULT SetMediaTypes(RefPtr<MFTEncoder>& aEncoder, EncoderConfig& aConfig);

}  // namespace mozilla

#endif  // WMFDATAENCODERUTILS_H_
