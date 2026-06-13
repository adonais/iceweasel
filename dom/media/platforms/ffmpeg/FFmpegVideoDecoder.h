/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim:set ts=2 sw=2 sts=2 et cindent: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef __FFmpegVideoDecoder_h__
#define __FFmpegVideoDecoder_h__

#include "ImageContainer.h"
#include "FFmpegDataDecoder.h"
#include "FFmpegLibWrapper.h"
#include "PerformanceRecorder.h"
#include "SimpleMap.h"
#include "mozilla/ScopeExit.h"
#ifdef MOZ_WAYLAND_USE_HWDECODE
#  include "FFmpegVideoFramePool.h"
#endif

#if LIBAVCODEC_VERSION_MAJOR >= 57 && LIBAVUTIL_VERSION_MAJOR >= 56
#  define CUSTOMIZED_BUFFER_ALLOCATION 1
#  ifdef MOZ_DIAGNOSTIC_ASSERT_ENABLED
#    define CUSTOMIZED_BUFFER_ALLOCATION_ASSERT_ENABLED
#  endif
#endif

#ifdef CUSTOMIZED_BUFFER_ALLOCATION
#  include "mozilla/layers/TextureClient.h"
#endif

#ifdef CUSTOMIZED_BUFFER_ALLOCATION_ASSERT_ENABLED
#  include "nsTHashSet.h"
#  include "mozilla/DataMutex.h"
#endif

struct _VADRMPRIMESurfaceDescriptor;
typedef struct _VADRMPRIMESurfaceDescriptor VADRMPRIMESurfaceDescriptor;

namespace mozilla {

#ifdef CUSTOMIZED_BUFFER_ALLOCATION_ASSERT_ENABLED
class ImageBufferTracker;
class ImageBufferWrapper;
#endif

template <int V>
class FFmpegVideoDecoder : public FFmpegDataDecoder<V> {};

template <>
class FFmpegVideoDecoder<LIBAV_VER>;
DDLoggedTypeNameAndBase(FFmpegVideoDecoder<LIBAV_VER>,
                        FFmpegDataDecoder<LIBAV_VER>);

template <>
class FFmpegVideoDecoder<LIBAV_VER>
    : public FFmpegDataDecoder<LIBAV_VER>,
      public DecoderDoctorLifeLogger<FFmpegVideoDecoder<LIBAV_VER>> {
  typedef mozilla::layers::Image Image;
  typedef mozilla::layers::ImageContainer ImageContainer;
  typedef mozilla::layers::KnowsCompositor KnowsCompositor;
  typedef SimpleMap<int64_t> DurationMap;

 public:
  FFmpegVideoDecoder(FFmpegLibWrapper* aLib, const VideoInfo& aConfig,
                     KnowsCompositor* aAllocator,
                     ImageContainer* aImageContainer, bool aLowLatency,
                     bool aDisableHardwareDecoding,
                     Maybe<TrackingId> aTrackingId);

  ~FFmpegVideoDecoder();

  RefPtr<InitPromise> Init() override;
  void InitCodecContext() MOZ_REQUIRES(sMutex) override;
  nsCString GetDescriptionName() const override {
#ifdef USING_MOZFFVPX
    return "ffvpx video decoder"_ns;
#else
    return "ffmpeg video decoder"_ns;
#endif
  }
  nsCString GetCodecName() const override;
  ConversionRequired NeedsConversion() const override {
    return ConversionRequired::kNeedAVCC;
  }

  static AVCodecID GetCodecId(const nsACString& aMimeType);

#ifdef CUSTOMIZED_BUFFER_ALLOCATION
  int GetVideoBuffer(struct AVCodecContext* aCodecContext, AVFrame* aFrame,
                     int aFlags);
  int GetVideoBufferDefault(struct AVCodecContext* aCodecContext,
                            AVFrame* aFrame, int aFlags) {
    mIsUsingShmemBufferForDecode = Some(false);
    return mLib->avcodec_default_get_buffer2(aCodecContext, aFrame, aFlags);
  }
#endif

 private:
  RefPtr<FlushPromise> ProcessFlush() override;
  void ProcessShutdown() override;
  MediaResult DoDecode(MediaRawData* aSample, uint8_t* aData, int aSize,
                       bool* aGotFrame, DecodedData& aResults) override;
  void OutputDelayedFrames();
  bool NeedParser() const override {
    return
#if LIBAVCODEC_VERSION_MAJOR >= 58
        false;
#else
#  if LIBAVCODEC_VERSION_MAJOR >= 55
        mCodecID == AV_CODEC_ID_VP9 ||
#  endif
        mCodecID == AV_CODEC_ID_VP8;
#endif
  }
  gfx::YUVColorSpace GetFrameColorSpace() const;
  gfx::ColorSpace2 GetFrameColorPrimaries() const;
  gfx::ColorRange GetFrameColorRange() const;

  MediaResult CreateImage(int64_t aOffset, int64_t aPts, int64_t aDuration,
                          MediaDataDecoder::DecodedData& aResults) const;

  bool IsHardwareAccelerated(nsACString& aFailureReason) const override;
  bool IsHardwareAccelerated() const {
    nsAutoCString dummy;
    return IsHardwareAccelerated(dummy);
  }
  void UpdateDecodeTimes(TimeStamp aDecodeStart);

#ifdef CUSTOMIZED_BUFFER_ALLOCATION
  layers::TextureClient* AllocateTextureClientForImage(
      struct AVCodecContext* aCodecContext, layers::PlanarYCbCrImage* aImage);

  gfx::IntSize GetAlignmentVideoFrameSize(struct AVCodecContext* aCodecContext,
                                          int32_t aWidth,
                                          int32_t aHeight) const;
#endif

#ifdef MOZ_WAYLAND_USE_HWDECODE
  void InitHWDecodingPrefs();
  MediaResult InitVAAPIDecoder();
  bool CreateVAAPIDeviceContext();
  void InitVAAPICodecContext();
  AVCodec* FindVAAPICodec();
  bool GetVAAPISurfaceDescriptor(VADRMPRIMESurfaceDescriptor* aVaDesc);
  void AddAcceleratedFormats(nsTArray<AVCodecID>& aCodecList,
                             AVCodecID aCodecID, AVVAAPIHWConfig* hwconfig);
  nsTArray<AVCodecID> GetAcceleratedFormats();
  bool IsFormatAccelerated(AVCodecID aCodecID) const;

  MediaResult CreateImageVAAPI(int64_t aOffset, int64_t aPts, int64_t aDuration,
                               MediaDataDecoder::DecodedData& aResults);
#endif

#ifdef MOZ_WAYLAND_USE_HWDECODE
  AVBufferRef* mVAAPIDeviceContext;
  bool mEnableHardwareDecoding;
  VADisplay mDisplay;
  UniquePtr<VideoFramePool<LIBAV_VER>> mVideoFramePool;
  static nsTArray<AVCodecID> mAcceleratedFormats;
#endif
  RefPtr<KnowsCompositor> mImageAllocator;
  RefPtr<ImageContainer> mImageContainer;
  VideoInfo mInfo;
  int mDecodedFrames;
#if LIBAVCODEC_VERSION_MAJOR >= 58
  int mDecodedFramesLate;
  // Tracks when decode time of recent frame and averange decode time of
  // previous frames is bigger than frame interval,
  // i.e. we fail to decode in time.
  // We switch to SW decode when we hit HW_DECODE_LATE_FRAMES treshold.
  int mMissedDecodeInAverangeTime;
#endif
  float mAverangeDecodeTime;

  class PtsCorrectionContext {
   public:
    PtsCorrectionContext();
    int64_t GuessCorrectPts(int64_t aPts, int64_t aDts);
    void Reset();
    int64_t LastDts() const { return mLastDts; }

   private:
    int64_t mNumFaultyPts;  /// Number of incorrect PTS values so far
    int64_t mNumFaultyDts;  /// Number of incorrect DTS values so far
    int64_t mLastPts;       /// PTS of the last frame
    int64_t mLastDts;       /// DTS of the last frame
  };

  PtsCorrectionContext mPtsContext;

  DurationMap mDurationMap;
  const bool mLowLatency;
  const Maybe<TrackingId> mTrackingId;
  PerformanceRecorderMulti<DecodeStage> mPerformanceRecorder;

  // True if we're allocating shmem for ffmpeg decode buffer.
  Maybe<Atomic<bool>> mIsUsingShmemBufferForDecode;

#ifdef CUSTOMIZED_BUFFER_ALLOCATION_ASSERT_ENABLED
  // Used to explicitly track allocated images to ensure they are all released
  // by ffmpeg after shutdown.
  RefPtr<ImageBufferTracker> mImageTracker;
#endif
};

#ifdef CUSTOMIZED_BUFFER_ALLOCATION
#  ifdef CUSTOMIZED_BUFFER_ALLOCATION_ASSERT_ENABLED
class ImageBufferTracker {
 public:
  NS_INLINE_DECL_THREADSAFE_REFCOUNTING(ImageBufferTracker)

  ImageBufferTracker() = default;

  void Insert(ImageBufferWrapper* aImage) {
    auto lock = mAllocatedImages.Lock();
    lock->Insert(aImage);
  }

  void Remove(ImageBufferWrapper* aImage) {
    auto lock = mAllocatedImages.Lock();
    lock->Remove(aImage);
  }

  bool IsEmpty() const {
    auto lock = mAllocatedImages.Lock();
    return lock->IsEmpty();
  }

 private:
  ~ImageBufferTracker() = default;

  mutable DataMutex<nsTHashSet<ImageBufferWrapper*>> mAllocatedImages{
      "ImageBufferTracker::mAllocatedImages"};
};
#  endif

class ImageBufferWrapper final {
 public:
  typedef mozilla::layers::Image Image;

  NS_INLINE_DECL_THREADSAFE_REFCOUNTING(ImageBufferWrapper)

#  ifdef CUSTOMIZED_BUFFER_ALLOCATION_ASSERT_ENABLED
  ImageBufferWrapper(RefPtr<Image>&& aImage, ImageBufferTracker* aTracker)
      : mImage(std::move(aImage)), mTracker(aTracker) {
    MOZ_ASSERT(mImage);
    MOZ_ASSERT(mTracker);
  }
#  else
  explicit ImageBufferWrapper(RefPtr<Image>&& aImage)
      : mImage(std::move(aImage)) {
    MOZ_ASSERT(mImage);
  }
#  endif

  Image* AsImage() { return mImage; }

  void StartTracking() {
#  ifdef CUSTOMIZED_BUFFER_ALLOCATION_ASSERT_ENABLED
    mTracker->Insert(this);
#  endif
  }

  void StopTracking() {
#  ifdef CUSTOMIZED_BUFFER_ALLOCATION_ASSERT_ENABLED
    mTracker->Remove(this);
#  endif
  }

 private:
  ~ImageBufferWrapper() = default;
  const RefPtr<Image> mImage;
#  ifdef CUSTOMIZED_BUFFER_ALLOCATION_ASSERT_ENABLED
  const RefPtr<ImageBufferTracker> mTracker;
#  endif
};
#endif

}  // namespace mozilla

#endif  // __FFmpegVideoDecoder_h__
