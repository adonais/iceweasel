/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim:set ts=2 sw=2 sts=2 et cindent: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "MatroskaDemuxer.h"

#include "H264.h"
#include "mozilla/glean/DomMediaMetrics.h"

namespace mozilla {

extern LazyLogModule gMediaDemuxerLog;
#define MKV_DEBUG(msg, ...) \
  MOZ_LOG(gMediaDemuxerLog, LogLevel::Debug, (msg, ##__VA_ARGS__))

static void ReportCodecUsage(int aCodec) {
  MKV_DEBUG("ReportCodecUsage, codec: %d", aCodec);
  switch (aCodec) {
    case NESTEGG_CODEC_AV1:
      mozilla::glean::media::mkv_codec_type
          .EnumGet(mozilla::glean::media::MkvCodecTypeLabel::eVideoav1)
          .Add();
      break;
    case NESTEGG_CODEC_AVC:
      mozilla::glean::media::mkv_codec_type
          .EnumGet(mozilla::glean::media::MkvCodecTypeLabel::eVideoavc)
          .Add();
      break;
    case NESTEGG_CODEC_HEVC:
      mozilla::glean::media::mkv_codec_type
          .EnumGet(mozilla::glean::media::MkvCodecTypeLabel::eVideohevc)
          .Add();
      break;
    case NESTEGG_CODEC_VP8:
      mozilla::glean::media::mkv_codec_type
          .EnumGet(mozilla::glean::media::MkvCodecTypeLabel::eVideovp8)
          .Add();
      break;
    case NESTEGG_CODEC_VP9:
      mozilla::glean::media::mkv_codec_type
          .EnumGet(mozilla::glean::media::MkvCodecTypeLabel::eVideovp9)
          .Add();
      break;
    case NESTEGG_CODEC_AAC:
      mozilla::glean::media::mkv_codec_type
          .EnumGet(mozilla::glean::media::MkvCodecTypeLabel::eAudioaac)
          .Add();
      break;
    case NESTEGG_CODEC_MP3:
      mozilla::glean::media::mkv_codec_type
          .EnumGet(mozilla::glean::media::MkvCodecTypeLabel::eAudiomp3)
          .Add();
      break;
    case NESTEGG_CODEC_OPUS:
      mozilla::glean::media::mkv_codec_type
          .EnumGet(mozilla::glean::media::MkvCodecTypeLabel::eAudioopus)
          .Add();
      break;
    case NESTEGG_CODEC_VORBIS:
      mozilla::glean::media::mkv_codec_type
          .EnumGet(mozilla::glean::media::MkvCodecTypeLabel::eAudiovorbis)
          .Add();
      break;
    case NESTEGG_CODEC_FLAC:
      mozilla::glean::media::mkv_codec_type
          .EnumGet(mozilla::glean::media::MkvCodecTypeLabel::eAudioflac)
          .Add();
      break;
    case NESTEGG_CODEC_PCM:
      mozilla::glean::media::mkv_codec_type
          .EnumGet(mozilla::glean::media::MkvCodecTypeLabel::eAudiopcm)
          .Add();
      break;
    default:
      mozilla::glean::media::mkv_codec_type
          .EnumGet(mozilla::glean::media::MkvCodecTypeLabel::eNocodecspecified)
          .Add();
      break;
  }
}

MatroskaDemuxer::MatroskaDemuxer(MediaResource* aResource)
    : WebMDemuxer(aResource) {}

nsresult MatroskaDemuxer::SetVideoCodecInfo(nestegg* aContext, int aTrackId) {
  mVideoCodec = nestegg_track_codec_id(aContext, aTrackId);
  ReportCodecUsage(mVideoCodec);
  // TODO : support more codecs
  switch (mVideoCodec) {
    case NESTEGG_CODEC_AVC: {
      mInfo.mVideo.mMimeType = "video/avc";
      // Retrieve the extradata from the codec private.
      nsTArray<const unsigned char*> headers;
      nsTArray<size_t> headerLens;
      nsresult rv =
          GetCodecPrivateData(aContext, aTrackId, &headers, &headerLens);
      if (NS_FAILED(rv)) {
        MKV_DEBUG("GetCodecPrivateData error for AVC");
        return rv;
      }
      mInfo.mVideo.mExtraData->AppendElements(headers[0], headerLens[0]);
      break;
    }
    default:
      NS_WARNING("Unknown Matroska video codec");
      return NS_ERROR_FAILURE;
  }
  return NS_OK;
}

nsresult MatroskaDemuxer::SetAudioCodecInfo(
    nestegg* aContext, int aTrackId, const nestegg_audio_params& aParams) {
  mAudioCodec = nestegg_track_codec_id(aContext, aTrackId);
  ReportCodecUsage(mAudioCodec);

  static const uint64_t NSECS_PER_USEC = 1000;
  static const uint64_t USECS_PER_S = 1e6;

  // TODO : support more codecs
  switch (mAudioCodec) {
    case NESTEGG_CODEC_AAC: {
      mInfo.mAudio.mMimeType = "audio/mp4a-latm";
      const uint32_t AAC_SAMPLES_PER_FRAME = 1024;
      AacCodecSpecificData aacCodecSpecificData{};
      uint64_t codecDelayUs = aParams.codec_delay / NSECS_PER_USEC;
      if (codecDelayUs > 0) {
        aacCodecSpecificData.mEncoderDelayFrames = static_cast<uint32_t>(
            std::lround(static_cast<double>(codecDelayUs) * aParams.rate /
                        (USECS_PER_S * AAC_SAMPLES_PER_FRAME)));
        MKV_DEBUG("AAC stream in MKV container, %" PRIu32
                  " frames of encoder delay.",
                  aacCodecSpecificData.mEncoderDelayFrames);
      } else {
        aacCodecSpecificData.mEncoderDelayFrames = 0;
      }

      // Calulate the media frame count.
      // Media frame count = total count - delay - padding.
      nestegg_packet* lastPacket;
      int r = nestegg_read_last_packet(aContext, aTrackId, &lastPacket);
      if (r == -1) {
        return NS_ERROR_FAILURE;
      }

      RefPtr<NesteggPacketHolder> holder = new NesteggPacketHolder();
      if (!holder->Init(lastPacket, 0 /* dummy */, aTrackId, false)) {
        MKV_DEBUG("NesteggPacketHolder::Init: error for AAC");
        return NS_ERROR_DOM_MEDIA_DEMUXER_ERR;
      }

      CheckedInt64 mediaFrameCount =
          CheckedInt64(holder->Timestamp()) + holder->Duration();
      mediaFrameCount *= mInfo.mAudio.mRate;
      mediaFrameCount /= USECS_PER_S * AAC_SAMPLES_PER_FRAME;

      CheckedInt64 discardPaddingFrames = holder->DiscardPaddingUs();
      discardPaddingFrames *= mInfo.mAudio.mRate;
      discardPaddingFrames /= USECS_PER_S * AAC_SAMPLES_PER_FRAME;

      if (!mediaFrameCount.isValid() || !discardPaddingFrames.isValid() ||
          mediaFrameCount.value() <
              discardPaddingFrames.value() +
                  aacCodecSpecificData.mEncoderDelayFrames) {
        MKV_DEBUG("Invalid AAC audio frame count");
        return NS_ERROR_DOM_MEDIA_METADATA_ERR;
      }
      mediaFrameCount -= (aacCodecSpecificData.mEncoderDelayFrames +
                          discardPaddingFrames.value());
      aacCodecSpecificData.mMediaFrameCount = mediaFrameCount.value();

      // Get the codec specific data from the codec private.
      nsTArray<const unsigned char*> headers;
      nsTArray<size_t> headerLens;
      nsresult rv =
          GetCodecPrivateData(aContext, aTrackId, &headers, &headerLens);
      if (NS_FAILED(rv)) {
        MKV_DEBUG("GetCodecPrivateData error for AAC");
        return rv;
      }
      aacCodecSpecificData.mDecoderConfigDescriptorBinaryBlob->AppendElements(
          headers[0], headerLens[0]);
      mInfo.mAudio.mCodecSpecificConfig =
          AudioCodecSpecificVariant{std::move(aacCodecSpecificData)};
      break;
    }
    default:
      NS_WARNING("Unknown Matroska audio codec");
      return NS_ERROR_FAILURE;
  }
  return NS_OK;
}

bool MatroskaDemuxer::CheckKeyFrameByExamineByteStream(
    const MediaRawData* aSample) {
  // TODO : support more codecs
  switch (mVideoCodec) {
    case NESTEGG_CODEC_AVC: {
      auto frameType = H264::GetFrameType(aSample);
      return frameType == H264::FrameType::I_FRAME_IDR ||
             frameType == H264::FrameType::I_FRAME_OTHER;
    }
    default:
      MOZ_ASSERT_UNREACHABLE(
          "Cannot detect keyframes in unknown Matroska video codec");
      return false;
  }
}

}  // namespace mozilla

#undef MKV_DEBUG
