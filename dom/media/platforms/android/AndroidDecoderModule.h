/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef AndroidDecoderModule_h_
#define AndroidDecoderModule_h_

#include "MediaCodecsSupport.h"
#include "PlatformDecoderModule.h"
#include "mozilla/MediaDrmCDMProxy.h"

namespace mozilla {

class AndroidDecoderModule : public PlatformDecoderModule {
  template <typename T, typename... Args>
  friend already_AddRefed<T> MakeAndAddRef(Args&&...);

 public:
  const char* Name() const override { return "Android MediaCodec w/ proxy"; }
  static already_AddRefed<PlatformDecoderModule> Create(
      CDMProxy* aProxy = nullptr);

  RefPtr<CreateDecoderPromise> AsyncCreateDecoder(
      const CreateDecoderParams& aParams) override;

  media::DecodeSupportSet SupportsMimeType(
      const nsACString& aMimeType,
      DecoderDoctorDiagnostics* aDiagnostics) const override;

  static media::DecodeSupportSet SupportsMimeType(const nsACString& aMimeType);

  media::DecodeSupportSet Supports(
      const SupportDecoderParams& aParams,
      DecoderDoctorDiagnostics* aDiagnostics) const override;

  // Return supported decode codecs from the PlatformMediaCodecsSupported gfxVar
  static media::MediaCodecsSupported GetSupportedCodecs();

  static bool IsJavaDecoderModuleAllowed();

 protected:
  bool SupportsColorDepth(
      gfx::ColorDepth aColorDepth,
      DecoderDoctorDiagnostics* aDiagnostics) const override;

 private:
  explicit AndroidDecoderModule(CDMProxy* aProxy = nullptr);
  virtual ~AndroidDecoderModule() = default;

  RefPtr<CreateDecoderPromise> CreateVideoDecoder(
      const CreateDecoderParams& aParams);
  RefPtr<CreateDecoderPromise> CreateAudioDecoder(
      const CreateDecoderParams& aParams);

  RefPtr<MediaDrmCDMProxy> mProxy;
};

extern LazyLogModule sAndroidDecoderModuleLog;

nsCString TranslateMimeType(const nsACString& aMimeType);

}  // namespace mozilla

#endif
