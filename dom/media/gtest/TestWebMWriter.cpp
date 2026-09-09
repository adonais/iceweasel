/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "DriftCompensation.h"
#include "OpusTrackEncoder.h"
#include "VP8TrackEncoder.h"
#include "WebMWriter.h"
#include "gtest/gtest.h"
#include "mozilla/CheckedInt.h"
#include "mozilla/MathAlgorithms.h"
#include "nestegg/nestegg.h"

using namespace mozilla;

class WebMOpusTrackEncoder : public OpusTrackEncoder {
 public:
  explicit WebMOpusTrackEncoder(TrackRate aTrackRate)
      : OpusTrackEncoder(aTrackRate, mEncodedAudioQueue) {}
  bool TestOpusCreation(int aChannels) {
    if (NS_SUCCEEDED(Init(aChannels))) {
      return true;
    }
    return false;
  }
  MediaQueue<EncodedFrame> mEncodedAudioQueue;
};

class WebMVP8TrackEncoder : public VP8TrackEncoder {
 public:
  explicit WebMVP8TrackEncoder(TrackRate aTrackRate = 90000)
      : VP8TrackEncoder(nullptr, aTrackRate, mEncodedVideoQueue,
                        FrameDroppingMode::DISALLOW) {}

  bool TestVP8Creation(int32_t aWidth, int32_t aHeight, int32_t aDisplayWidth,
                       int32_t aDisplayHeight) {
    if (NS_SUCCEEDED(
            Init(aWidth, aHeight, aDisplayWidth, aDisplayHeight, 30))) {
      return true;
    }
    return false;
  }
  MediaQueue<EncodedFrame> mEncodedVideoQueue;
};

static void GetOpusMetadata(int aChannels, TrackRate aTrackRate,
                            nsTArray<RefPtr<TrackMetadataBase>>& aMeta) {
  WebMOpusTrackEncoder opusEncoder(aTrackRate);
  EXPECT_TRUE(opusEncoder.TestOpusCreation(aChannels));
  aMeta.AppendElement(opusEncoder.GetMetadata());
}

static void GetVP8Metadata(int32_t aWidth, int32_t aHeight,
                           int32_t aDisplayWidth, int32_t aDisplayHeight,
                           TrackRate aTrackRate,
                           nsTArray<RefPtr<TrackMetadataBase>>& aMeta) {
  WebMVP8TrackEncoder vp8Encoder;
  EXPECT_TRUE(vp8Encoder.TestVP8Creation(aWidth, aHeight, aDisplayWidth,
                                         aDisplayHeight));
  aMeta.AppendElement(vp8Encoder.GetMetadata());
}

const uint64_t FIXED_DURATION = 1000000;
const uint32_t FIXED_FRAMESIZE = 500;
// Opus frame durations are expressed in samples at 48kHz.
const uint64_t OPUS_DURATION_BASE = 48000;

class TestWebMWriter : public WebMWriter {
 public:
  TestWebMWriter() = default;

  // Writes a single frame of dummy data of the given type, spanning
  // [aTime, aTime + aDuration).
  void AppendFrame(EncodedFrame::FrameType aFrameType,
                   const media::TimeUnit& aTime,
                   const media::TimeUnit& aDuration) {
    const uint64_t durationBase = aFrameType == EncodedFrame::OPUS_AUDIO_FRAME
                                      ? OPUS_DURATION_BASE
                                      : static_cast<uint64_t>(PR_USEC_PER_SEC);
    nsTArray<RefPtr<EncodedFrame>> encodedData;
    auto frameData = MakeRefPtr<EncodedFrame::FrameData>();
    // Create dummy frame data.
    frameData->SetLength(FIXED_FRAMESIZE);
    encodedData.AppendElement(MakeRefPtr<EncodedFrame>(
        aTime, aDuration.ToTicksAtRate(durationBase), durationBase, aFrameType,
        std::move(frameData)));
    WriteEncodedTrack(encodedData, 0);
  }

  // When we append an I-Frame into WebM muxer, the muxer will treat previous
  // data as "a cluster".
  // In these test cases, we will call the function many times to enclose the
  // previous cluster so that we can retrieve data by |GetContainerData|.
  void AppendDummyFrame(EncodedFrame::FrameType aFrameType,
                        uint64_t aDuration) {
    AppendFrame(aFrameType, mTimestamp,
                media::TimeUnit::FromMicroseconds(aDuration));
    mTimestamp += media::TimeUnit::FromMicroseconds(aDuration);
  }

  bool HaveValidCluster() {
    nsTArray<nsTArray<uint8_t>> encodedBuf;
    GetContainerData(&encodedBuf, 0);
    return !encodedBuf.IsEmpty();
  }

  // Timestamp accumulator that increased by AppendDummyFrame.
  // Keep it public that we can do some testcases about it.
  media::TimeUnit mTimestamp;
};

TEST(WebMWriter, Metadata)
{
  TestWebMWriter writer;

  // The output should be empty since we didn't set any metadata in writer.
  nsTArray<nsTArray<uint8_t>> encodedBuf;
  writer.GetContainerData(&encodedBuf, ContainerWriter::GET_HEADER);
  EXPECT_TRUE(encodedBuf.Length() == 0);
  writer.GetContainerData(&encodedBuf, ContainerWriter::FLUSH_NEEDED);
  EXPECT_TRUE(encodedBuf.Length() == 0);

  nsTArray<RefPtr<TrackMetadataBase>> meta;

  TrackRate trackRate = 44100;

  // Get opus metadata.
  int channel = 1;
  GetOpusMetadata(channel, trackRate, meta);

  // Get vp8 metadata
  int32_t width = 640;
  int32_t height = 480;
  int32_t displayWidth = 640;
  int32_t displayHeight = 480;
  GetVP8Metadata(width, height, displayWidth, displayHeight, trackRate, meta);

  // Set metadata
  writer.SetMetadata(meta);

  writer.GetContainerData(&encodedBuf, ContainerWriter::GET_HEADER);
  EXPECT_TRUE(encodedBuf.Length() > 0);
}

TEST(WebMWriter, Cluster)
{
  TestWebMWriter writer;
  nsTArray<RefPtr<TrackMetadataBase>> meta;
  TrackRate trackRate = 48000;
  // Get opus metadata.
  int channel = 1;
  GetOpusMetadata(channel, trackRate, meta);
  // Get vp8 metadata
  int32_t width = 320;
  int32_t height = 240;
  int32_t displayWidth = 320;
  int32_t displayHeight = 240;
  GetVP8Metadata(width, height, displayWidth, displayHeight, trackRate, meta);
  writer.SetMetadata(meta);

  nsTArray<nsTArray<uint8_t>> encodedBuf;
  writer.GetContainerData(&encodedBuf, ContainerWriter::GET_HEADER);
  EXPECT_TRUE(encodedBuf.Length() > 0);
  encodedBuf.Clear();

  // write the first I-Frame.
  writer.AppendDummyFrame(EncodedFrame::VP8_I_FRAME, FIXED_DURATION);
  EXPECT_TRUE(writer.HaveValidCluster());

  // The second I-Frame.
  writer.AppendDummyFrame(EncodedFrame::VP8_I_FRAME, FIXED_DURATION);
  EXPECT_TRUE(writer.HaveValidCluster());

  // P-Frame.
  writer.AppendDummyFrame(EncodedFrame::VP8_P_FRAME, FIXED_DURATION);
  EXPECT_TRUE(writer.HaveValidCluster());

  // The third I-Frame.
  writer.AppendDummyFrame(EncodedFrame::VP8_I_FRAME, FIXED_DURATION);
  EXPECT_TRUE(writer.HaveValidCluster());
}

TEST(WebMWriter, FLUSH_NEEDED)
{
  TestWebMWriter writer;
  nsTArray<RefPtr<TrackMetadataBase>> meta;
  TrackRate trackRate = 44100;
  // Get opus metadata.
  int channel = 2;
  GetOpusMetadata(channel, trackRate, meta);
  // Get vp8 metadata
  int32_t width = 176;
  int32_t height = 352;
  int32_t displayWidth = 176;
  int32_t displayHeight = 352;
  GetVP8Metadata(width, height, displayWidth, displayHeight, trackRate, meta);
  writer.SetMetadata(meta);
  // Have data because the metadata is finished.
  EXPECT_TRUE(writer.HaveValidCluster());

  // write the first I-Frame.
  writer.AppendDummyFrame(EncodedFrame::VP8_I_FRAME, FIXED_DURATION);

  // P-Frame
  writer.AppendDummyFrame(EncodedFrame::VP8_P_FRAME, FIXED_DURATION);
  // Have data because frames were written.
  EXPECT_TRUE(writer.HaveValidCluster());
  // No data because the previous check emptied it.
  EXPECT_FALSE(writer.HaveValidCluster());

  nsTArray<nsTArray<uint8_t>> encodedBuf;
  // No data because the flag ContainerWriter::FLUSH_NEEDED does nothing.
  writer.GetContainerData(&encodedBuf, ContainerWriter::FLUSH_NEEDED);
  EXPECT_TRUE(encodedBuf.IsEmpty());
  encodedBuf.Clear();

  // P-Frame
  writer.AppendDummyFrame(EncodedFrame::VP8_P_FRAME, FIXED_DURATION);
  // Have data because we continue the previous cluster.
  EXPECT_TRUE(writer.HaveValidCluster());

  // I-Frame
  writer.AppendDummyFrame(EncodedFrame::VP8_I_FRAME, FIXED_DURATION);
  // Have data with a new cluster.
  EXPECT_TRUE(writer.HaveValidCluster());

  // I-Frame
  writer.AppendDummyFrame(EncodedFrame::VP8_I_FRAME, FIXED_DURATION);
  // Have data with a new cluster.
  EXPECT_TRUE(writer.HaveValidCluster());
}

struct WebMioData {
  nsTArray<uint8_t> data;
  CheckedInt<size_t> offset;
};

static int64_t webm_read(void* aBuffer, size_t aLength, void* aUserData) {
  MOZ_RELEASE_ASSERT(aUserData, "aUserData must point to a valid WebMioData");
  WebMioData* ioData = static_cast<WebMioData*>(aUserData);

  if (!ioData->offset.isValid() ||
      ioData->offset.value() >= ioData->data.Length()) {
    return 0;
  }

  size_t oldOffset = ioData->offset.value();
  size_t available = ioData->data.Length() - oldOffset;
  size_t toRead = aLength < available ? aLength : available;
  ioData->offset += toRead;
  if (!ioData->offset.isValid()) {
    return -1;
  }
  memcpy(aBuffer, ioData->data.Elements() + oldOffset, toRead);
  return toRead;
}

static int webm_seek(int64_t aOffset, int aWhence, void* aUserData) {
  MOZ_RELEASE_ASSERT(aUserData, "aUserData must point to a valid WebMioData");
  WebMioData* ioData = static_cast<WebMioData*>(aUserData);

  if (Abs(aOffset) > ioData->data.Length()) {
    NS_ERROR("Invalid aOffset");
    return -1;
  }

  switch (aWhence) {
    case NESTEGG_SEEK_END: {
      CheckedInt<size_t> tempOffset = ioData->data.Length();
      ioData->offset = tempOffset + aOffset;
      break;
    }
    case NESTEGG_SEEK_CUR:
      ioData->offset += aOffset;
      break;
    case NESTEGG_SEEK_SET:
      ioData->offset = aOffset;
      break;
    default:
      NS_ERROR("Unknown whence");
      return -1;
  }

  if (!ioData->offset.isValid()) {
    NS_ERROR("Invalid offset");
    return -1;
  }

  return 0;
}

static int64_t webm_tell(void* aUserData) {
  MOZ_RELEASE_ASSERT(aUserData, "aUserData must point to a valid WebMioData");
  WebMioData* ioData = static_cast<WebMioData*>(aUserData);
  return ioData->offset.isValid() ? ioData->offset.value() : -1;
}

TEST(WebMWriter, bug970774_aspect_ratio)
{
  TestWebMWriter writer;
  nsTArray<RefPtr<TrackMetadataBase>> meta;
  TrackRate trackRate = 44100;
  // Get opus metadata.
  int channel = 1;
  GetOpusMetadata(channel, trackRate, meta);
  // Set vp8 metadata
  int32_t width = 640;
  int32_t height = 480;
  int32_t displayWidth = 1280;
  int32_t displayHeight = 960;
  GetVP8Metadata(width, height, displayWidth, displayHeight, trackRate, meta);
  writer.SetMetadata(meta);

  // write the first I-Frame.
  writer.AppendDummyFrame(EncodedFrame::VP8_I_FRAME, FIXED_DURATION);

  // write the second I-Frame.
  writer.AppendDummyFrame(EncodedFrame::VP8_I_FRAME, FIXED_DURATION);

  // Get the metadata and the first cluster.
  nsTArray<nsTArray<uint8_t>> encodedBuf;
  writer.GetContainerData(&encodedBuf, 0);
  // Flatten the encodedBuf.
  WebMioData ioData;
  ioData.offset = 0;
  for (uint32_t i = 0; i < encodedBuf.Length(); ++i) {
    ioData.data.AppendElements(encodedBuf[i]);
  }

  // Use nestegg to verify the information in metadata.
  nestegg* context = nullptr;
  nestegg_io io;
  io.read = webm_read;
  io.seek = webm_seek;
  io.tell = webm_tell;
  io.userdata = static_cast<void*>(&ioData);
  int rv = nestegg_init(&context, io, nullptr, -1);
  EXPECT_EQ(rv, 0);
  unsigned int ntracks = 0;
  rv = nestegg_track_count(context, &ntracks);
  EXPECT_EQ(rv, 0);
  EXPECT_EQ(ntracks, (unsigned int)2);
  for (unsigned int track = 0; track < ntracks; ++track) {
    int id = nestegg_track_codec_id(context, track);
    EXPECT_NE(id, -1);
    int type = nestegg_track_type(context, track);
    if (type == NESTEGG_TRACK_VIDEO) {
      nestegg_video_params params;
      rv = nestegg_track_video_params(context, track, &params);
      EXPECT_EQ(rv, 0);
      EXPECT_EQ(width, static_cast<int32_t>(params.width));
      EXPECT_EQ(height, static_cast<int32_t>(params.height));
      EXPECT_EQ(displayWidth, static_cast<int32_t>(params.display_width));
      EXPECT_EQ(displayHeight, static_cast<int32_t>(params.display_height));
    } else if (type == NESTEGG_TRACK_AUDIO) {
      nestegg_audio_params params;
      rv = nestegg_track_audio_params(context, track, &params);
      EXPECT_EQ(rv, 0);
      EXPECT_EQ(channel, static_cast<int>(params.channels));
      EXPECT_EQ(static_cast<double>(trackRate), params.rate);
    }
  }
  if (context) {
    nestegg_destroy(context);
  }
}

static nsTArray<uint8_t> Flatten(const nsTArray<nsTArray<uint8_t>>& aBufs) {
  nsTArray<uint8_t> data;
  for (const auto& buf : aBufs) {
    data.AppendElements(buf);
  }
  return data;
}

// Counts the Cluster elements in aData. Relies on the dummy frame payloads
// written by TestWebMWriter being all-zeroes, so that the EBML ID cannot occur
// inside block data.
static size_t CountClusters(const nsTArray<uint8_t>& aData) {
  static const uint8_t kClusterId[] = {0x1F, 0x43, 0xB6, 0x75};
  size_t count = 0;
  for (size_t i = 0; i + sizeof(kClusterId) <= aData.Length(); ++i) {
    if (memcmp(aData.Elements() + i, kClusterId, sizeof(kClusterId)) == 0) {
      ++count;
    }
  }
  return count;
}

struct DemuxedPacket {
  // NESTEGG_TRACK_VIDEO or NESTEGG_TRACK_AUDIO.
  int mTrackType;
  uint64_t mTimestampNs;
};

// The timestamp a demuxer reports for a frame written at aTime. The muxer's
// timecode scale is 1ms, so sub-millisecond precision is lost.
static uint64_t ExpectedTimestampNs(const media::TimeUnit& aTime) {
  return static_cast<uint64_t>(aTime.ToMicroseconds() / PR_USEC_PER_MSEC) *
         PR_NSEC_PER_MSEC;
}

// Demuxes aData with nestegg and returns its packets in file order. Adds a
// test failure if aData is not a parsable WebM stream.
static nsTArray<DemuxedPacket> DemuxWebM(const nsTArray<uint8_t>& aData) {
  nsTArray<DemuxedPacket> packets;

  WebMioData ioData;
  ioData.offset = 0;
  ioData.data.AppendElements(aData);

  nestegg* context = nullptr;
  nestegg_io io;
  io.read = webm_read;
  io.seek = webm_seek;
  io.tell = webm_tell;
  io.userdata = static_cast<void*>(&ioData);
  if (nestegg_init(&context, io, nullptr, -1) != 0) {
    ADD_FAILURE() << "nestegg_init failed";
    return packets;
  }

  int rv;
  nestegg_packet* packet = nullptr;
  while ((rv = nestegg_read_packet(context, &packet)) > 0) {
    unsigned int track = 0;
    EXPECT_EQ(nestegg_packet_track(packet, &track), 0);
    uint64_t tstamp = 0;
    EXPECT_EQ(nestegg_packet_tstamp(packet, &tstamp), 0);
    packets.AppendElement(
        DemuxedPacket{nestegg_track_type(context, track), tstamp});
    nestegg_free_packet(packet);
  }
  EXPECT_EQ(rv, 0) << "Demuxing must reach end of stream without error";

  nestegg_destroy(context);
  return packets;
}

/**
 * Test that we don't crash when writing two video frames that are too far apart
 * to fit in the same cluster (>32767ms).
 */
TEST(WebMWriter, LongVideoGap)
{
  TestWebMWriter writer;
  nsTArray<RefPtr<TrackMetadataBase>> meta;
  TrackRate trackRate = 44100;
  // Set vp8 metadata
  int32_t width = 640;
  int32_t height = 480;
  int32_t displayWidth = 640;
  int32_t displayHeight = 480;
  GetVP8Metadata(width, height, displayWidth, displayHeight, trackRate, meta);
  writer.SetMetadata(meta);

  // write the first I-Frame.
  writer.AppendDummyFrame(EncodedFrame::VP8_I_FRAME,
                          media::TimeUnit::FromSeconds(33).ToMicroseconds());

  // write the second I-Frame.
  writer.AppendDummyFrame(EncodedFrame::VP8_I_FRAME,
                          media::TimeUnit::FromSeconds(0.33).ToMicroseconds());

  nsTArray<nsTArray<uint8_t>> encodedBuf;
  writer.GetContainerData(&encodedBuf, ContainerWriter::GET_HEADER);
  // metadata + 2 frames
  EXPECT_EQ(encodedBuf.Length(), 3U);
}

/**
 * Test that clusters are flushed on an interval while a healthy video track is
 * producing no keyframes, and that the video frame crossing the interval leads
 * the new cluster.
 */
TEST(WebMWriter, ClustersFlushOnInterval)
{
  TestWebMWriter writer;
  nsTArray<RefPtr<TrackMetadataBase>> meta;
  GetOpusMetadata(1, 48000, meta);
  GetVP8Metadata(320, 240, 320, 240, 48000, meta);
  writer.SetMetadata(meta);

  // 25fps video and 50 packets/s of audio, for 3s.
  const auto videoDuration = media::TimeUnit::FromSeconds(0.04);
  const auto audioDuration = media::TimeUnit::FromSeconds(0.02);
  const auto totalDuration = media::TimeUnit::FromSeconds(3);

  size_t numFrames = 0;
  for (auto t = media::TimeUnit::Zero(); t < totalDuration;
       t += videoDuration) {
    writer.AppendFrame(
        t.IsZero() ? EncodedFrame::VP8_I_FRAME : EncodedFrame::VP8_P_FRAME, t,
        videoDuration);
    ++numFrames;
    for (auto u = t; u < t + videoDuration; u += audioDuration) {
      writer.AppendFrame(EncodedFrame::OPUS_AUDIO_FRAME, u, audioDuration);
      ++numFrames;
    }
  }

  nsTArray<nsTArray<uint8_t>> encodedBuf;
  writer.GetContainerData(&encodedBuf, ContainerWriter::GET_HEADER);
  const nsTArray<uint8_t> data = Flatten(encodedBuf);

  // The leading keyframe, then one cluster per interval at 1000ms and 2000ms.
  EXPECT_EQ(CountClusters(data), 3U);
  EXPECT_EQ(DemuxWebM(data).Length(), numFrames);
}

/**
 * Test that a video track resuming after a stall that audio alone has been
 * filling picks back up in the cluster it lands in, without disturbing the
 * interval the audio established.
 */
TEST(WebMWriter, VideoResumingAfterStall)
{
  TestWebMWriter writer;
  nsTArray<RefPtr<TrackMetadataBase>> meta;
  GetOpusMetadata(1, 48000, meta);
  GetVP8Metadata(320, 240, 320, 240, 48000, meta);
  writer.SetMetadata(meta);

  const auto audioDuration = media::TimeUnit::FromSeconds(0.02);
  const auto stallEnd = media::TimeUnit::FromSeconds(3);
  const auto totalDuration = media::TimeUnit::FromSeconds(4);

  // A keyframe, a 3s video stall filled by audio alone, then video resumes.
  // Frames are appended in the time order the muxer would produce them.
  writer.AppendFrame(EncodedFrame::VP8_I_FRAME, media::TimeUnit::Zero(),
                     stallEnd);
  size_t numAudioBeforeResume = 0;
  for (auto t = media::TimeUnit::Zero(); t < stallEnd; t += audioDuration) {
    writer.AppendFrame(EncodedFrame::OPUS_AUDIO_FRAME, t, audioDuration);
    ++numAudioBeforeResume;
  }
  writer.AppendFrame(EncodedFrame::VP8_P_FRAME, stallEnd, audioDuration);
  size_t numAudioAfterResume = 0;
  for (auto t = stallEnd; t < totalDuration; t += audioDuration) {
    writer.AppendFrame(EncodedFrame::OPUS_AUDIO_FRAME, t, audioDuration);
    ++numAudioAfterResume;
  }

  nsTArray<nsTArray<uint8_t>> encodedBuf;
  writer.GetContainerData(&encodedBuf, ContainerWriter::GET_HEADER);
  const nsTArray<uint8_t> data = Flatten(encodedBuf);

  // Clusters at 0ms, 1000ms, 2000ms and 3000ms, the last of which is led by
  // the resuming video frame.
  EXPECT_EQ(CountClusters(data), 4U);

  const nsTArray<DemuxedPacket> packets = DemuxWebM(data);
  ASSERT_EQ(packets.Length(), numAudioBeforeResume + numAudioAfterResume + 2);
  EXPECT_EQ(packets[0].mTrackType, NESTEGG_TRACK_VIDEO);
  EXPECT_EQ(packets[numAudioBeforeResume + 1].mTrackType, NESTEGG_TRACK_VIDEO);
  EXPECT_EQ(packets[numAudioBeforeResume + 1].mTimestampNs,
            ExpectedTimestampNs(stallEnd));
}

/**
 * Test that a video track that goes longer than a cluster can span (32767ms)
 * without producing a keyframe doesn't block audio from being written. Once
 * video stops producing frames, audio is on its own and falls back to flushing
 * clusters on an interval. See bug 1830323.
 */
TEST(WebMWriter, AudioSpanningLongVideoKeyframeGap)
{
  TestWebMWriter writer;
  nsTArray<RefPtr<TrackMetadataBase>> meta;
  GetOpusMetadata(1, 48000, meta);
  GetVP8Metadata(320, 240, 320, 240, 48000, meta);
  writer.SetMetadata(meta);

  const auto audioDuration = media::TimeUnit::FromSeconds(0.02);
  const auto totalDuration = media::TimeUnit::FromSeconds(40);

  // One video keyframe up front, then a stalled video track while audio keeps
  // flowing.
  writer.AppendFrame(EncodedFrame::VP8_I_FRAME, media::TimeUnit::Zero(),
                     totalDuration);
  nsTArray<media::TimeUnit> audioTimes;
  for (auto t = media::TimeUnit::Zero(); t < totalDuration;
       t += audioDuration) {
    writer.AppendFrame(EncodedFrame::OPUS_AUDIO_FRAME, t, audioDuration);
    audioTimes.AppendElement(t);
  }

  nsTArray<nsTArray<uint8_t>> encodedBuf;
  writer.GetContainerData(&encodedBuf, ContainerWriter::GET_HEADER);
  const nsTArray<uint8_t> data = Flatten(encodedBuf);

  // The leading keyframe starts the first cluster, then audio is on its own
  // and flushes a cluster every 1000ms up to and including 39000ms.
  EXPECT_EQ(CountClusters(data), 40U);

  const nsTArray<DemuxedPacket> packets = DemuxWebM(data);
  ASSERT_EQ(packets.Length(), audioTimes.Length() + 1);
  EXPECT_EQ(packets[0].mTrackType, NESTEGG_TRACK_VIDEO);
  EXPECT_EQ(packets[0].mTimestampNs, 0U);
  for (size_t i = 0; i < audioTimes.Length(); ++i) {
    EXPECT_EQ(packets[i + 1].mTrackType, NESTEGG_TRACK_AUDIO)
        << "Audio packet " << i;
    EXPECT_EQ(packets[i + 1].mTimestampNs, ExpectedTimestampNs(audioTimes[i]))
        << "Audio packet " << i;
  }
}
