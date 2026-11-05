/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef RemoteDataDecoder_h_
#define RemoteDataDecoder_h_

#include "AndroidDecoderModule.h"
#include "SurfaceTexture.h"
#include "TimeUnits.h"
#include "mozilla/Maybe.h"
#include "mozilla/Monitor.h"
#include "mozilla/TaskQueue.h"
#include "mozilla/java/CodecProxyWrappers.h"

namespace mozilla {

DDLoggedTypeDeclNameAndBase(RemoteDataDecoder, MediaDataDecoder);

class RemoteDataDecoder : public MediaDataDecoder,
                          public DecoderDoctorLifeLogger<RemoteDataDecoder> {
 public:
  NS_INLINE_DECL_THREADSAFE_REFCOUNTING_WITH_DELETE_ON_EVENT_TARGET(
      RemoteDataDecoder, mTaskQueue, final);

  static RefPtr<PlatformDecoderModule::CreateDecoderPromise> CreateAudioDecoder(
      const CreateDecoderParams& aParams, const nsString& aDrmStubId,
      CDMProxy* aProxy);

  static RefPtr<PlatformDecoderModule::CreateDecoderPromise> CreateVideoDecoder(
      const CreateDecoderParams& aParams, const nsString& aDrmStubId,
      CDMProxy* aProxy);

  // Returns the codec specific data buffers, in csd-N order, in the format that
  // MediaCodec expects for the given audio codec.
  static nsTArray<RefPtr<MediaByteBuffer>> GetAudioCodecSpecificData(
      const AudioInfo& aConfig);

  RefPtr<InitPromise> Init() override;
  RefPtr<DecodePromise> Decode(MediaRawData* aSample) override;
  RefPtr<DecodePromise> Drain() override;
  RefPtr<FlushPromise> Flush() override;
  RefPtr<ShutdownPromise> Shutdown() override;
  nsCString GetDescriptionName() const override {
    return "android decoder (remote)"_ns;
  }

 protected:
  class CallbacksSupportBase;

  virtual ~RemoteDataDecoder();
  RemoteDataDecoder(MediaData::Type aType, const nsACString& aMimeType,
                    java::sdk::MediaFormat::Param aFormat,
                    const nsString& aDrmStubId);

  // Creates the Java codec on mTaskQueue.
  RefPtr<InitPromise> Construct();

  // Methods only called on mTaskQueue.
  virtual MediaResult ProcessConstruct() = 0;
  virtual MediaResult ProcessInit();
  virtual RefPtr<DecodePromise> ProcessDecode(MediaRawData* aSample);
  virtual RefPtr<FlushPromise> ProcessFlush();
  RefPtr<DecodePromise> ProcessDrain();
  void ProcessShutdown();
  void UpdateInputStatus(int64_t aTimestamp, bool aProcessed);
  void UpdateOutputStatus(RefPtr<MediaData>&& aSample);
  void ReturnDecodedData();
  void DrainComplete();
  void Error(const MediaResult& aError);
  void AssertOnTaskQueue() const {
    MOZ_ASSERT(mTaskQueue->IsOnCurrentThread());
  }

  TrackInfo::TrackType GetTrackType() const {
    return mType == MediaData::Type::AUDIO_DATA ? TrackInfo::kAudioTrack
                                                : TrackInfo::kVideoTrack;
  }

  enum class State { DRAINED, DRAINABLE, DRAINING, SHUTDOWN };
  void SetState(State aState);
  State GetState() const {
    AssertOnTaskQueue();
    return mState;
  }

  // Whether the sample will be used.
  virtual bool IsUsefulData(const RefPtr<MediaData>& aSample) { return true; }

  MediaData::Type mType;

  nsAutoCString mMimeType;
  java::sdk::MediaFormat::GlobalRef mFormat;

  java::CodecProxy::GlobalRef mJavaDecoder;
  java::CodecProxy::NativeCallbacks::GlobalRef mJavaCallbacks;
  nsString mDrmStubId;

  const RefPtr<TaskQueue> mTaskQueue;

  // Preallocated Java object used as a reusable storage for input buffer
  // information. Contents must be changed only on mTaskQueue.
  java::sdk::MediaCodec::BufferInfo::GlobalRef mInputBufferInfo;

  // Session ID attached to samples. It is returned by CodecProxy::Input().
  // Accessed on mTaskQueue only.
  int64_t mSession;

 private:
  enum class PendingOp { INCREASE, DECREASE, CLEAR };
  void UpdatePendingInputStatus(PendingOp aOp);
  size_t HasPendingInputs() {
    AssertOnTaskQueue();
    return mNumPendingInputs > 0;
  }

  // Returns true if we are in a state which requires a new decoder to be
  // created. In this case all errors will be reported as
  // NS_ERROR_DOM_MEDIA_NEED_NEW_DECODER to avoid reporting errors as fatal when
  // they can be fixed with a new decoder.
  virtual bool NeedsNewDecoder() const { return false; }

  // The following members must only be accessed on mTaskQueue.
  MozPromiseHolder<DecodePromise> mDecodePromise;
  MozPromiseHolder<DecodePromise> mDrainPromise;
  DecodedData mDecodedData;
  Maybe<MediaResult> mDecodeError;
  State mState = State::DRAINED;
  size_t mNumPendingInputs;
};

}  // namespace mozilla

#endif
