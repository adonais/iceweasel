/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "PlatformDecoderModule.h"

#include "ImageContainer.h"
#include "nsPrintfCString.h"

namespace mozilla {

CreateDecoderParamsForAsync::CreateDecoderParamsForAsync(
    const CreateDecoderParams& aParams)
    : mConfig(aParams.mConfig.Clone()),
      mImageContainer(aParams.mImageContainer),
      mKnowsCompositor(aParams.mKnowsCompositor),
      mCrashHelper(aParams.mCrashHelper),
      mCDM(aParams.mCDM),
      mUseNullDecoder(aParams.mUseNullDecoder),
      mWrappers(aParams.mWrappers),
      mType(aParams.mType),
      mOnWaitingForKeyEvent(aParams.mOnWaitingForKeyEvent),
      mOptions(aParams.mOptions),
      mRate(aParams.mRate),
      mMediaEngineId(aParams.mMediaEngineId),
      mTrackingId(aParams.mTrackingId) {}

CreateDecoderParamsForAsync::CreateDecoderParamsForAsync(
    CreateDecoderParamsForAsync&& aParams) = default;

/* static */
RefPtr<PlatformDecoderModule::CreateDecoderPromise>
PlatformDecoderModule::CreateDecoderPromiseFrom(
    already_AddRefed<MediaDataDecoder> aDecoder,
    const CreateDecoderParams& aParams, const MediaResult& aError) {
  RefPtr<MediaDataDecoder> decoder = aDecoder;
  if (!decoder) {
    if (NS_FAILED(aError)) {
      return CreateDecoderPromise::CreateAndReject(aError, __func__);
    }
    return CreateDecoderPromise::CreateAndReject(
        MediaResult(NS_ERROR_DOM_MEDIA_FATAL_ERR,
                    nsPrintfCString("Error creating decoder for %s",
                                    aParams.mConfig.mMimeType.get())
                        .get()),
        __func__);
  }
  return CreateDecoderPromise::CreateAndResolve(decoder, __func__);
}

}  // namespace mozilla
