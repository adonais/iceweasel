/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef FFmpegAACDecoder_h_
#define FFmpegAACDecoder_h_

#include "FFmpegDataDecoder.h"
#include "FFmpegLibWrapper.h"
#include "SimpleMap.h"

namespace mozilla {

template <int V>
class FFmpegAudioDecoder {};

template <>
class FFmpegAudioDecoder<LIBAV_VER>;
DDLoggedTypeNameAndBase(FFmpegAudioDecoder<LIBAV_VER>,
                        FFmpegDataDecoder<LIBAV_VER>);

template <>
class FFmpegAudioDecoder<LIBAV_VER>
    : public FFmpegDataDecoder<LIBAV_VER>,
      public DecoderDoctorLifeLogger<FFmpegAudioDecoder<LIBAV_VER>> {
 public:
  FFmpegAudioDecoder(const FFmpegLibWrapper* aLib,
                     const CreateDecoderParams& aDecoderParams);
  virtual ~FFmpegAudioDecoder();

  RefPtr<InitPromise> Init() override;
  void InitCodecContext() MOZ_REQUIRES(sMutex) override;
  static AVCodecID GetCodecId(const nsACString& aMimeType,
                              const AudioInfo& aInfo);
  nsCString GetDescriptionName() const override {
#ifdef USING_MOZFFVPX
    return "ffvpx audio decoder"_ns;
#else
    return "ffmpeg audio decoder"_ns;
#endif
  }
  nsCString GetCodecName() const override;

 private:
  MediaResult DoDecode(MediaRawData* aSample, uint8_t* aData, int aSize,
                       bool* aGotFrame, DecodedData& aResults) override;
  MediaResult DecodeUsingFFmpeg(AVPacket* aPacket, bool& aDecoded,
                                MediaRawData* aSample, DecodedData& aResults,
                                bool* aGotFrame);
  media::TimeUnit ExtractFramePts(MediaRawData* aSample,
                                  const media::NullableTimeUnit& aPreviousEnd);
  // aPreviousEnd is the end time of the frame this packet last produced, if
  // any, and is updated with that of the frame emitted here.
  MediaResult PostProcessOutput(bool aDecoded, MediaRawData* aSample,
                                DecodedData& aResults, bool* aGotFrame,
                                int32_t aSubmitted,
                                media::NullableTimeUnit& aPreviousEnd);
  RefPtr<FlushPromise> ProcessFlush() override;

  // Mapping of sample time in microseconds to full precision.
  SimpleMap<int64_t, media::TimeUnit> mInputTimes;

  const AudioInfo mAudioInfo;
  // True if the audio will be downmixed and rendered in mono.
  bool mDefaultPlaybackDeviceMono = false;
#if defined(MOZ_WIDGET_ANDROID) && defined(USING_MOZFFVPX)
  bool mIsMediaCodec = false;
  bool mHasSentDrainPacket = false;
#endif
};

}  // namespace mozilla

#endif  // FFmpegAACDecoder_h_
