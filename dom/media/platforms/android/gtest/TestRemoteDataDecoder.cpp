/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "RemoteDataDecoder.h"
#include "XiphExtradata.h"
#include "gtest/gtest.h"
#include "mozilla/EndianUtils.h"

using namespace mozilla;

static constexpr size_t kFlacStreamInfoSize = 34;
static constexpr int64_t kOpusSeekPreRollNs = 80000000;

static RefPtr<MediaByteBuffer> MakeBuffer(size_t aLength, uint8_t aFirst = 0) {
  RefPtr<MediaByteBuffer> buffer = new MediaByteBuffer();
  for (size_t i = 0; i < aLength; ++i) {
    buffer->AppendElement(static_cast<uint8_t>(aFirst + i));
  }
  return buffer;
}

static AudioInfo MakeFlacInfo(RefPtr<MediaByteBuffer> aStreamInfo) {
  AudioInfo info;
  FlacCodecSpecificData flac;
  flac.mStreamInfoBinaryBlob = std::move(aStreamInfo);
  info.mCodecSpecificConfig = AudioCodecSpecificVariant{std::move(flac)};
  return info;
}

static AudioInfo MakeVorbisInfo(RefPtr<MediaByteBuffer> aHeaders) {
  AudioInfo info;
  VorbisCodecSpecificData vorbis;
  vorbis.mHeadersBinaryBlob = std::move(aHeaders);
  info.mCodecSpecificConfig = AudioCodecSpecificVariant{std::move(vorbis)};
  return info;
}

static RefPtr<MediaByteBuffer> MakeOpusHeader(uint16_t aPreSkip) {
  RefPtr<MediaByteBuffer> header = new MediaByteBuffer();
  header->AppendElements(reinterpret_cast<const uint8_t*>("OpusHead"), 8);
  header->AppendElement(1);  // Version
  header->AppendElement(2);  // Channel count
  uint8_t preSkip[2];
  LittleEndian::writeUint16(preSkip, aPreSkip);
  header->AppendElements(preSkip, 2);
  uint8_t sampleRate[4];
  LittleEndian::writeUint32(sampleRate, 48000);
  header->AppendElements(sampleRate, 4);
  header->AppendElement(0);  // Output gain
  header->AppendElement(0);
  header->AppendElement(0);  // Channel mapping family
  EXPECT_EQ(header->Length(), 19u);
  return header;
}

static AudioInfo MakeOpusInfo(RefPtr<MediaByteBuffer> aHeader) {
  AudioInfo info;
  OpusCodecSpecificData opus;
  opus.mHeadersBinaryBlob = std::move(aHeader);
  info.mCodecSpecificConfig = AudioCodecSpecificVariant{std::move(opus)};
  return info;
}

static int64_t ReadInt64(const MediaByteBuffer& aBuffer) {
  EXPECT_EQ(aBuffer.Length(), sizeof(int64_t));
  return LittleEndian::readInt64(aBuffer.Elements());
}

static void ExpectOpusCsd(uint16_t aPreSkip, int64_t aExpectedCodecDelayNs) {
  RefPtr<MediaByteBuffer> header = MakeOpusHeader(aPreSkip);
  nsTArray<RefPtr<MediaByteBuffer>> csd =
      RemoteDataDecoder::GetAudioCodecSpecificData(MakeOpusInfo(header));
  ASSERT_EQ(csd.Length(), 3u);
  EXPECT_EQ(*csd[0], *header);
  EXPECT_EQ(ReadInt64(*csd[1]), aExpectedCodecDelayNs);
  EXPECT_EQ(ReadInt64(*csd[2]), kOpusSeekPreRollNs);
  // MediaCodec converts the delay back to frames by truncating.
  EXPECT_EQ(ReadInt64(*csd[1]) * 48000 / 1000000000, aPreSkip);
}

TEST(RemoteDataDecoder, FlacRawStreamInfo)
{
  RefPtr<MediaByteBuffer> streamInfo = MakeBuffer(kFlacStreamInfoSize, 1);
  nsTArray<RefPtr<MediaByteBuffer>> csd =
      RemoteDataDecoder::GetAudioCodecSpecificData(MakeFlacInfo(streamInfo));
  ASSERT_EQ(csd.Length(), 1u);

  const uint8_t kHeader[] = {'f', 'L', 'a', 'C', 0x80, 0x00, 0x00, 34};
  RefPtr<MediaByteBuffer> expected = new MediaByteBuffer();
  expected->AppendElements(kHeader, std::size(kHeader));
  expected->AppendElements(*streamInfo);
  EXPECT_EQ(*csd[0], *expected);
}

TEST(RemoteDataDecoder, FlacRawStreamInfoTruncatesTrailingData)
{
  RefPtr<MediaByteBuffer> streamInfo = MakeBuffer(kFlacStreamInfoSize + 10, 1);
  nsTArray<RefPtr<MediaByteBuffer>> csd =
      RemoteDataDecoder::GetAudioCodecSpecificData(MakeFlacInfo(streamInfo));
  ASSERT_EQ(csd.Length(), 1u);
  ASSERT_EQ(csd[0]->Length(), 8 + kFlacStreamInfoSize);
  EXPECT_EQ(memcmp(csd[0]->Elements(), "fLaC", 4), 0);
  EXPECT_EQ(memcmp(csd[0]->Elements() + 8, streamInfo->Elements(),
                   kFlacStreamInfoSize),
            0);
}

TEST(RemoteDataDecoder, FlacWithMarker)
{
  RefPtr<MediaByteBuffer> streamInfo = new MediaByteBuffer();
  const uint8_t kHeader[] = {'f', 'L', 'a', 'C', 0x80, 0x00, 0x00, 34};
  streamInfo->AppendElements(kHeader, std::size(kHeader));
  streamInfo->AppendElements(*MakeBuffer(kFlacStreamInfoSize, 1));
  nsTArray<RefPtr<MediaByteBuffer>> csd =
      RemoteDataDecoder::GetAudioCodecSpecificData(MakeFlacInfo(streamInfo));
  ASSERT_EQ(csd.Length(), 1u);
  EXPECT_EQ(*csd[0], *streamInfo);
}

TEST(RemoteDataDecoder, FlacTooShort)
{
  EXPECT_TRUE(RemoteDataDecoder::GetAudioCodecSpecificData(
                  MakeFlacInfo(new MediaByteBuffer()))
                  .IsEmpty());
  EXPECT_TRUE(RemoteDataDecoder::GetAudioCodecSpecificData(
                  MakeFlacInfo(MakeBuffer(kFlacStreamInfoSize - 1)))
                  .IsEmpty());
}

TEST(RemoteDataDecoder, Vorbis)
{
  RefPtr<MediaByteBuffer> ident = MakeBuffer(30, 1);
  RefPtr<MediaByteBuffer> comment = MakeBuffer(300, 2);
  RefPtr<MediaByteBuffer> setup = MakeBuffer(50, 3);
  nsTArray<const unsigned char*> headers{ident->Elements(), comment->Elements(),
                                         setup->Elements()};
  nsTArray<size_t> headerLens{ident->Length(), comment->Length(),
                              setup->Length()};
  RefPtr<MediaByteBuffer> extradata = new MediaByteBuffer();
  ASSERT_TRUE(XiphHeadersToExtradata(extradata, headers, headerLens));

  nsTArray<RefPtr<MediaByteBuffer>> csd =
      RemoteDataDecoder::GetAudioCodecSpecificData(MakeVorbisInfo(extradata));
  ASSERT_EQ(csd.Length(), 2u);
  EXPECT_EQ(*csd[0], *ident);
  EXPECT_EQ(*csd[1], *setup);
}

TEST(RemoteDataDecoder, VorbisWrongHeaderCount)
{
  RefPtr<MediaByteBuffer> ident = MakeBuffer(30, 1);
  RefPtr<MediaByteBuffer> setup = MakeBuffer(50, 3);
  nsTArray<const unsigned char*> headers{ident->Elements(), setup->Elements()};
  nsTArray<size_t> headerLens{ident->Length(), setup->Length()};
  RefPtr<MediaByteBuffer> extradata = new MediaByteBuffer();
  ASSERT_TRUE(XiphHeadersToExtradata(extradata, headers, headerLens));

  EXPECT_TRUE(
      RemoteDataDecoder::GetAudioCodecSpecificData(MakeVorbisInfo(extradata))
          .IsEmpty());
}

TEST(RemoteDataDecoder, VorbisInvalid)
{
  EXPECT_TRUE(RemoteDataDecoder::GetAudioCodecSpecificData(
                  MakeVorbisInfo(new MediaByteBuffer()))
                  .IsEmpty());

  RefPtr<MediaByteBuffer> truncated = new MediaByteBuffer();
  truncated->AppendElement(2);    // Three headers
  truncated->AppendElement(100);  // First header length
  truncated->AppendElement(100);  // Second header length
  truncated->AppendElements(*MakeBuffer(10));
  EXPECT_TRUE(
      RemoteDataDecoder::GetAudioCodecSpecificData(MakeVorbisInfo(truncated))
          .IsEmpty());
}

TEST(RemoteDataDecoder, Opus)
{
  ExpectOpusCsd(0, 0);
  ExpectOpusCsd(312, 6500000);
  ExpectOpusCsd(3840, 80000000);
}

TEST(RemoteDataDecoder, OpusCodecDelayRoundsUp)
{
  ExpectOpusCsd(1, 20834);
  ExpectOpusCsd(356, 7416667);
  ExpectOpusCsd(UINT16_MAX, 1365312500);
}

TEST(RemoteDataDecoder, OpusTooShort)
{
  RefPtr<MediaByteBuffer> header = MakeOpusHeader(312);
  header->SetLength(18);
  EXPECT_TRUE(RemoteDataDecoder::GetAudioCodecSpecificData(MakeOpusInfo(header))
                  .IsEmpty());
}

TEST(RemoteDataDecoder, Aac)
{
  AudioInfo info;
  AacCodecSpecificData aac;
  aac.mEsDescriptorBinaryBlob = MakeBuffer(20, 1);
  aac.mDecoderConfigDescriptorBinaryBlob = MakeBuffer(2, 0x12);
  info.mCodecSpecificConfig = AudioCodecSpecificVariant{aac};
  nsTArray<RefPtr<MediaByteBuffer>> csd =
      RemoteDataDecoder::GetAudioCodecSpecificData(info);
  ASSERT_EQ(csd.Length(), 1u);
  EXPECT_EQ(*csd[0], *aac.mDecoderConfigDescriptorBinaryBlob);

  aac.mDecoderConfigDescriptorBinaryBlob = MakeBuffer(1, 0x12);
  info.mCodecSpecificConfig = AudioCodecSpecificVariant{aac};
  EXPECT_TRUE(RemoteDataDecoder::GetAudioCodecSpecificData(info).IsEmpty());
}

TEST(RemoteDataDecoder, BinaryBlob)
{
  AudioInfo info;
  AudioCodecSpecificBinaryBlob blob;
  blob.mBinaryBlob = MakeBuffer(5, 1);
  info.mCodecSpecificConfig = AudioCodecSpecificVariant{blob};
  nsTArray<RefPtr<MediaByteBuffer>> csd =
      RemoteDataDecoder::GetAudioCodecSpecificData(info);
  ASSERT_EQ(csd.Length(), 1u);
  EXPECT_EQ(*csd[0], *blob.mBinaryBlob);
}

TEST(RemoteDataDecoder, NoBlob)
{
  AudioInfo info;
  EXPECT_TRUE(RemoteDataDecoder::GetAudioCodecSpecificData(info).IsEmpty());

  info.mCodecSpecificConfig = AudioCodecSpecificVariant{Mp3CodecSpecificData{}};
  EXPECT_TRUE(RemoteDataDecoder::GetAudioCodecSpecificData(info).IsEmpty());

  info.mCodecSpecificConfig =
      AudioCodecSpecificVariant{WaveCodecSpecificData{}};
  EXPECT_TRUE(RemoteDataDecoder::GetAudioCodecSpecificData(info).IsEmpty());
}
