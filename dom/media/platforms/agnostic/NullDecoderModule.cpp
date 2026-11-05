/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "DummyMediaDataDecoder.h"
#include "ImageContainer.h"
#include "mozilla/StaticPrefs_media.h"

namespace mozilla {

class NullVideoDataCreator : public DummyDataCreator {
 public:
  NullVideoDataCreator() = default;

  already_AddRefed<MediaData> Create(MediaRawData* aSample) override {
    // Create a dummy VideoData with an empty image. This gives us something to
    // send to media streams if necessary.
    RefPtr<layers::PlanarYCbCrImage> image =
        new layers::RecyclingPlanarYCbCrImage(new layers::BufferRecycleBin());
    return VideoData::CreateFromImage(gfx::IntSize(), aSample->mOffset,
                                      aSample->mTime, aSample->mDuration, image,
                                      aSample->mKeyframe, aSample->mTimecode);
  }
};

class NullDecoderModule : public PlatformDecoderModule {
 public:
  const char* Name() const override { return "Null"; }
  // Decode thread.
  RefPtr<CreateDecoderPromise> AsyncCreateDecoder(
      const CreateDecoderParams& aParams) override {
    MOZ_ASSERT(aParams.IsVideo(), "Audio decoders are unsupported.");
    if (!aParams.IsVideo() ||
        StaticPrefs::media_test_null_decoder_creation_failure()) {
      return CreateDecoderPromiseFrom(nullptr, aParams);
    }
    UniquePtr<DummyDataCreator> creator = MakeUnique<NullVideoDataCreator>();
    RefPtr<MediaDataDecoder> decoder = new DummyMediaDataDecoder(
        std::move(creator), "null media data decoder"_ns, aParams);
    return CreateDecoderPromiseFrom(decoder.forget(), aParams);
  }

  media::DecodeSupportSet SupportsMimeType(
      const nsACString& aMimeType,
      DecoderDoctorDiagnostics* aDiagnostics) const override {
    return media::DecodeSupport::SoftwareDecode;
  }
};

already_AddRefed<PlatformDecoderModule> CreateNullDecoderModule() {
  RefPtr<PlatformDecoderModule> pdm = new NullDecoderModule();
  return pdm.forget();
}

}  // namespace mozilla
