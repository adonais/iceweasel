/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#if !defined(PDMFactory_h_)
#  define PDMFactory_h_

#  include "DecoderDoctorDiagnostics.h"
#  include "MediaCodecsSupport.h"
#  include "PlatformDecoderModule.h"
#  include "mozilla/AlreadyAddRefed.h"
#  include "mozilla/MozPromise.h"
#  include "mozilla/RefPtr.h"
#  include "mozilla/ipc/UtilityProcessSandboxing.h"
#  include "nsISupports.h"
#  include "nsStringFwd.h"
#  include "nsTArray.h"

namespace mozilla {

class AllocPolicy;
class CDMProxy;
class MediaDataDecoder;
class MediaResult;
class StaticMutex;
struct CreateDecoderParams;
struct CreateDecoderParamsForAsync;
struct SupportDecoderParams;
enum class RemoteMediaIn;

using PDMCreateDecoderPromise = PlatformDecoderModule::CreateDecoderPromise;
using PDMSupportsDecoderPromise = PlatformDecoderModule::SupportsDecoderPromise;

class PDMFactory final {
 public:
  NS_INLINE_DECL_THREADSAFE_REFCOUNTING(PDMFactory)

  PDMFactory();

  // Factory method that creates the appropriate PlatformDecoderModule for
  // the platform we're running on.
  RefPtr<PDMCreateDecoderPromise> CreateDecoder(
      const CreateDecoderParams& aParams);

  media::DecodeSupportSet SupportsMimeType(const nsACString& aMimeType) const;
  media::DecodeSupportSet Supports(
      const SupportDecoderParams& aParams,
      DecoderDoctorDiagnostics* aDiagnostics) const;

  // Asynchronous variant of Supports() that resolves once the module which
  // would handle aParams is ready to report accurate (hardware-inclusive)
  // support. For remote modules this waits until the relevant process has
  // reported its codec support. Must be called off the main thread.
  RefPtr<PDMSupportsDecoderPromise> SupportsAsync(
      const SupportDecoderParams& aParams) const;

  // Strictest support query: actually creates the decoder that would handle
  // aParams, initializes it, and reports support reflecting whether that
  // decoder is hardware-accelerated. Whereas SupportsAsync() trusts the
  // reported codec support, this verifies it by briefly creating (and
  // immediately destroying) a real decoder, so it is correspondingly more
  // expensive. Resolves with an empty DecodeSupportSet if the decoder cannot
  // be created or initialized. aPolicy throttles concurrent allocations; when
  // null the per-track GlobalAllocPolicy is used. Must be called off the main
  // thread.
  static RefPtr<PDMSupportsDecoderPromise> StrictSupportsAsync(
      const CreateDecoderParams& aParams, AllocPolicy* aPolicy = nullptr);

  // Creates a PlatformDecoderModule that uses a CDMProxy to decrypt or
  // decrypt-and-decode EME encrypted content. If the CDM only decrypts and
  // does not decode, we create a PDM and use that to create MediaDataDecoders
  // that we use on on aTaskQueue to decode the decrypted stream.
  // This is called on the decode task queue.
  void SetCDMProxy(CDMProxy* aProxy);

  static constexpr int kYUV400 = 0;
  static constexpr int kYUV420 = 1;
  static constexpr int kYUV422 = 2;
  static constexpr int kYUV444 = 3;

  static media::MediaCodecsSupported Supported(bool aForceRefresh = false);
  static media::DecodeSupportSet SupportsMimeType(
      const nsACString& aMimeType,
      const media::MediaCodecsSupported& aSupported, RemoteMediaIn aLocation);

  static bool AllDecodersAreRemote();

  // For GTests
  class MOZ_RAII AutoForcePDM {
   public:
    explicit AutoForcePDM(PlatformDecoderModule* aPDM) { ForcePDM(aPDM); }
    ~AutoForcePDM() { ForcePDM(nullptr); }
  };

 private:
  ~PDMFactory();

  void CreatePDMs();
  void CreateNullPDM();
  void CreateGpuPDMs();
  void CreateRddPDMs();
  void CreateUtilityPDMs();
  void CreateContentPDMs();
  void CreateDefaultPDMs();

  // Startup the provided PDM and add it to our list if successful.
  bool StartupPDM(already_AddRefed<PlatformDecoderModule> aPDM,
                  bool aInsertAtBeginning = false);
  // Returns the first PDM in our list supporting the mimetype.
  already_AddRefed<PlatformDecoderModule> GetDecoderModule(
      const SupportDecoderParams& aParams,
      DecoderDoctorDiagnostics* aDiagnostics) const;

  RefPtr<PDMCreateDecoderPromise> CreateDecoderWithPDM(
      PlatformDecoderModule* aPDM, const CreateDecoderParams& aParams);
  RefPtr<PDMCreateDecoderPromise> CheckAndMaybeCreateDecoder(
      CreateDecoderParamsForAsync&& aParams, uint32_t aIndex,
      Maybe<MediaResult> aEarlierError = Nothing());

  nsTArray<RefPtr<PlatformDecoderModule>> mCurrentPDMs;
  RefPtr<PlatformDecoderModule> mEMEPDM;
  RefPtr<PlatformDecoderModule> mNullPDM;

  DecoderDoctorDiagnostics::FlagsSet mFailureFlags;

  static StaticMutex sSupportedMutex;

  friend class RemoteVideoDecoderParent;
  static void EnsureInit();
  static void ForcePDM(PlatformDecoderModule* aPDM);
};

}  // namespace mozilla

#endif /* PDMFactory_h_ */
