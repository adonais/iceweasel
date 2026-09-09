/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#include <algorithm>
#include <array>
#include <cstdint>
#include <cstring>
#include <limits>
#include <utility>
#include <vector>

#include "DummyRandomAccessCipherStrategy.h"
#include "EncryptedRandomAccessBlock.h"
#include "EncryptedRandomAccessBlockView.h"
#include "EncryptedRandomAccessStream.h"
#include "EncryptedRandomAccessStream_impl.h"
#include "ErrorList.h"
#include "NSSRandomAccessCipherStrategy.h"
#include "gtest/gtest.h"
#include "mozilla/EndianUtils.h"
#include "mozilla/NotNull.h"
#include "mozilla/Result.h"
#include "mozilla/ResultExtensions.h"
#include "nsCOMPtr.h"
#include "nsDirectoryServiceDefs.h"
#include "nsDirectoryServiceUtils.h"
#include "nsIFile.h"
#include "nsIFileStreams.h"
#include "nsIRandomAccessStream.h"
#include "nsISeekableStream.h"
#include "nsNetUtil.h"

namespace mozilla::dom::quota::test {

namespace {

constexpr uint16_t kTextLength = 100;
constexpr size_t kMaxTextLength =
    DecryptedRandomAccessBlockCipherPayloadView::MaxTextLength;
constexpr size_t kCipherPayloadOffset =
    EncryptedRandomAccessBlock::BlockSize -
    EncryptedRandomAccessBlock::CipherPayloadSize;

constexpr uint8_t kGapFillSentinelPadding = '!';

using TestPlaintext = std::vector<uint8_t>;

TestPlaintext CreatePlaintext(size_t aTextLength = kTextLength) {
  TestPlaintext text(aTextLength);
  for (size_t i = 0; i < text.size(); ++i) {
    text[i] = static_cast<uint8_t>('a' + (i % 26));
  }
  return text;
}

// Produces a pattern distinct from |CreatePlaintext| (uppercase letters) so a
// write can be told apart from the original on-disk content when reading back.
TestPlaintext CreateOverwritePattern(size_t aLength) {
  TestPlaintext text(aLength);
  for (size_t i = 0; i < text.size(); ++i) {
    text[i] = static_cast<uint8_t>('A' + (i % 26));
  }
  return text;
}

template <size_t N>
void XorWithDummyCipherStrategy(std::array<uint8_t, N>& aData) {
  // |DummyRandomAccessCipherStrategy| encrypts and decrypts each byte with this
  // XOR operation.
  for (auto& byte : aData) {
    byte ^= 42;
  }
}

struct DecryptFailingDummyRandomAccessCipherStrategy
    : DummyRandomAccessCipherStrategy {
  static nsresult Decrypt(const DecryptionInput&, DecryptionOutput&) {
    return NS_ERROR_FAILURE;
  }
};

struct EncryptFailingDummyRandomAccessCipherStrategy
    : DummyRandomAccessCipherStrategy {
  static nsresult Encrypt(const EncryptionInput&, EncryptionOutput&) {
    return NS_ERROR_FAILURE;
  }
};

nsresult ErrorSegmentWriter(nsIInputStream*, void*, const char*, uint32_t,
                            uint32_t, uint32_t*) {
  return NS_ERROR_FAILURE;
}

struct PartialSegmentWriterClosure {
  explicit PartialSegmentWriterClosure(
      size_t aTextLength,
      uint32_t aMaxTotal = std::numeric_limits<uint32_t>::max())
      : mData(aTextLength), mMaxTotal(aMaxTotal) {}

  TestPlaintext mData;
  uint32_t mWritten = 0;
  // Once |mWritten| reaches this cap, the writer reports that it consumed no
  // bytes. This exercises the path where the writer refuses to consume data.
  uint32_t mMaxTotal;
};

nsresult PartialSegmentWriter(nsIInputStream*, void* aClosure,
                              const char* aFromSegment, uint32_t aToOffset,
                              uint32_t aCount, uint32_t* aWriteCount) {
  auto* closure = static_cast<PartialSegmentWriterClosure*>(aClosure);
  // Use a small number to force |ReadSegments()| to invoke the writer
  // repeatedly, including when the requested data crosses an encrypted block
  // boundary. Never consume past |mMaxTotal|.
  const uint32_t remaining = closure->mMaxTotal - closure->mWritten;
  *aWriteCount = std::min({aCount, 7u, remaining});
  memcpy(closure->mData.data() + aToOffset, aFromSegment, *aWriteCount);
  closure->mWritten += *aWriteCount;
  return NS_OK;
}

nsresult ErrorSegmentReader(nsIOutputStream*, void*, char*, uint32_t, uint32_t,
                            uint32_t*) {
  return NS_ERROR_FAILURE;
}

struct PartialSegmentReaderClosure {
  explicit PartialSegmentReaderClosure(
      TestPlaintext aData,
      uint32_t aMaxTotal = std::numeric_limits<uint32_t>::max())
      : mData(std::move(aData)), mMaxTotal(aMaxTotal) {}

  TestPlaintext mData;
  uint32_t mRead = 0;
  // Once |mRead| reaches this cap, the reader reports that it produced no
  // bytes. This exercises the path where the reader provides no more data.
  uint32_t mMaxTotal;
};

nsresult PartialSegmentReader(nsIOutputStream*, void* aClosure,
                              char* aToSegment, uint32_t aFromOffset,
                              uint32_t aCount, uint32_t* aReadCount) {
  auto* closure = static_cast<PartialSegmentReaderClosure*>(aClosure);
  // Use a small number to force |WriteSegments()| to invoke the reader
  // repeatedly, including when the data crosses an encrypted block boundary.
  // Never produce past |mMaxTotal|.
  const uint32_t remaining = closure->mMaxTotal - closure->mRead;
  *aReadCount = std::min({aCount, 7u, remaining});
  memcpy(aToSegment, closure->mData.data() + aFromOffset, *aReadCount);
  closure->mRead += *aReadCount;
  return NS_OK;
}

/**
 * Owns a temporary file and its random access stream. Destruction closes the
 * stream before removing the file so individual tests do not need cleanup code.
 */
struct ScopedTestFileStream {
  ScopedTestFileStream(nsCOMPtr<nsIFile> aFile,
                       nsCOMPtr<nsIRandomAccessStream> aStream)
      : mFile(std::move(aFile)), mStream(std::move(aStream)) {}

  ScopedTestFileStream(const ScopedTestFileStream&) = delete;
  ScopedTestFileStream& operator=(const ScopedTestFileStream&) = delete;

  ScopedTestFileStream(ScopedTestFileStream&&) = default;
  ScopedTestFileStream& operator=(ScopedTestFileStream&&) = default;

  ~ScopedTestFileStream() {
    if (mStream) {
      mStream->InputStream()->Close();
    }
    if (mFile) {
      mFile->Remove(false);
    }
  }

  nsCOMPtr<nsIFile> mFile;
  nsCOMPtr<nsIRandomAccessStream> mStream;
};

/**
 * This helper constructs the encrypted block representation directly.
 * This helper is intentionally independent of |EncryptedRandomAccessStream|
 * write implementation so the read implementation can be tested independently.
 *
 * Each generated file is a sequence of encrypted blocks. See
 * |EncryptedRandomAccessBlock| for the complete on-disk format. This helper
 * fills each block as follows. Tests for invalid data create this valid
 * representation first and then overwrite the relevant bytes.
 *
 *  --------+----------------------------------------------------------+
 *   offset | value                                            size    |
 *  --------+----------------------------------------------------------+
 *       0  | Version = 1                                     2 bytes  |
 *       2  | Reserved, zero-filled                          30 bytes  |
 *      32  | CipherMetadata, zero-filled                    32 bytes  |
 *      64  | XOR-encrypted payload                        4032 bytes  |
 *  --------+----------------------------------------------------------+
 *    4096
 *
 * Before the payload is XOR-encrypted, its plaintext layout is:
 *
 *  --------+----------------------------------------------------------+
 *   offset | value                                            size    |
 *  --------+----------------------------------------------------------+
 *       0  | Text length                                     2 bytes  |
 *       2  | Text                                            L bytes  |
 *     2+L  | Padding, zero-filled                    (4030-L) bytes  |
 *  --------+----------------------------------------------------------+
 *    4032
 */
Result<ScopedTestFileStream, nsresult> CreateEncryptedFileStream(
    size_t aTextLength = kTextLength, uint8_t aPaddingByte = 0) {
  nsCOMPtr<nsIFile> dir;
  nsresult rv = NS_GetSpecialDirectory(NS_OS_TEMP_DIR, getter_AddRefs(dir));
  if (NS_FAILED(rv)) {
    return Err(rv);
  }

  nsCOMPtr<nsIFile> file;
  rv = dir->Clone(getter_AddRefs(file));
  if (NS_FAILED(rv)) {
    return Err(rv);
  }

  rv = file->Append(u"testfile"_ns);
  if (NS_FAILED(rv)) {
    return Err(rv);
  }

  rv = file->CreateUnique(nsIFile::NORMAL_FILE_TYPE, 0666);
  if (NS_FAILED(rv)) {
    return Err(rv);
  }

  nsCOMPtr<nsIRandomAccessStream> stream;
  rv = NS_NewLocalFileRandomAccessStream(getter_AddRefs(stream), file);
  if (NS_FAILED(rv)) {
    return Err(rv);
  }

  const auto text = CreatePlaintext(aTextLength);
  size_t textOffset = 0;

  // Construct the encrypted block representation directly.
  while (textOffset < text.size()) {
    std::array<uint8_t, EncryptedRandomAccessBlock::BlockSize> data{};

    constexpr uint16_t version = 1;
    mozilla::LittleEndian::writeUint16(data.data(), version);

    std::array<uint8_t, EncryptedRandomAccessBlock::CipherPayloadSize>
        payload{};
    const auto textLength = static_cast<uint16_t>(
        std::min(text.size() - textOffset, kMaxTextLength));
    mozilla::LittleEndian::writeUint16(payload.data(), textLength);
    memcpy(payload.data() + sizeof(textLength), text.data() + textOffset,
           textLength);
    std::fill(payload.begin() + sizeof(textLength) + textLength, payload.end(),
              aPaddingByte);

    XorWithDummyCipherStrategy(payload);

    memcpy(data.data() + kCipherPayloadOffset, payload.data(), payload.size());

    uint32_t written = 0;
    rv = stream->OutputStream()->Write(
        reinterpret_cast<const char*>(data.data()), data.size(), &written);
    if (NS_FAILED(rv)) {
      return Err(rv);
    }
    if (written != data.size()) {
      return Err(NS_ERROR_FAILURE);
    }

    textOffset += textLength;
  }

  rv = stream->Seek(nsISeekableStream::NS_SEEK_SET, 0);
  if (NS_FAILED(rv)) {
    return Err(rv);
  }

  return ScopedTestFileStream(std::move(file), std::move(stream));
}

RefPtr<EncryptedRandomAccessStream<DummyRandomAccessCipherStrategy>>
CreateEncryptedRandomAccessStream(nsCOMPtr<nsIRandomAccessStream> aBaseStream) {
  DummyRandomAccessCipherStrategy dummyStrategy;
  auto res =
      EncryptedRandomAccessStream<DummyRandomAccessCipherStrategy>::Create(
          dummyStrategy, WrapNotNull(std::move(aBaseStream)),
          DummyRandomAccessCipherStrategy::KeyType{});
  EXPECT_TRUE(res.isOk());
  return res.unwrap();
}

// Re-opens an encrypted stream over |aBaseStream| and reads its whole logical
// content. A write must be verified through a freshly created stream so the
// data is read back from disk rather than from the writer's in-memory block
// buffer.
TestPlaintext ReadDataFromStream(
    const nsCOMPtr<nsIRandomAccessStream>& aBaseStream, size_t aSize) {
  auto stream = CreateEncryptedRandomAccessStream(aBaseStream);
  std::vector<char> buf(aSize);
  uint32_t read = 0;
  EXPECT_EQ(stream->Read(buf.data(), buf.size(), &read), NS_OK);
  EXPECT_EQ(read, static_cast<uint32_t>(aSize));
  return TestPlaintext(buf.begin(), buf.end());
}

// Like |ReadDataFromStream|, but opens a brand new base stream on the file.
// This is needed after |Close()|, which closes the original base stream.
TestPlaintext ReadDataFromFile(nsIFile* aFile, size_t aSize) {
  nsCOMPtr<nsIRandomAccessStream> base;
  EXPECT_EQ(NS_NewLocalFileRandomAccessStream(getter_AddRefs(base), aFile),
            NS_OK);
  return ReadDataFromStream(base, aSize);
}

// The decrypted on-disk payload of a single block, split into its parts.
struct DecryptedBlockLayout {
  uint16_t mTextLength;
  TestPlaintext mText;     // [0, mTextLength)
  TestPlaintext mPadding;  // [mTextLength, MaxTextLength)
};

// Reads the raw encrypted block at |aBlockIndex| straight from the file and
// decrypts its cipher payload with the dummy XOR strategy, exposing the on-disk
// |text length| field, the text, and the padding. This inspects the persisted
// layout directly **while bypassing the read path** (which ignores the
// padding).
DecryptedBlockLayout ReadDecryptedBlock(nsIFile* aFile, uint64_t aBlockIndex) {
  nsCOMPtr<nsIRandomAccessStream> base;
  EXPECT_EQ(NS_NewLocalFileRandomAccessStream(getter_AddRefs(base), aFile),
            NS_OK);
  EXPECT_EQ(
      base->Seek(nsISeekableStream::NS_SEEK_SET,
                 static_cast<int64_t>(aBlockIndex *
                                      EncryptedRandomAccessBlock::BlockSize)),
      NS_OK);

  std::array<uint8_t, EncryptedRandomAccessBlock::BlockSize> block{};
  uint32_t read = 0;
  EXPECT_EQ(base->InputStream()->Read(reinterpret_cast<char*>(block.data()),
                                      block.size(), &read),
            NS_OK);
  EXPECT_EQ(read, EncryptedRandomAccessBlock::BlockSize);

  std::array<uint8_t, EncryptedRandomAccessBlock::CipherPayloadSize> payload{};
  std::copy(block.begin() + kCipherPayloadOffset, block.end(), payload.begin());
  XorWithDummyCipherStrategy(payload);

  DecryptedBlockLayout layout;
  memcpy(&layout.mTextLength, payload.data(), sizeof(layout.mTextLength));
  const auto textBegin = payload.begin() + sizeof(layout.mTextLength);
  layout.mText.assign(textBegin, textBegin + layout.mTextLength);
  layout.mPadding.assign(textBegin + layout.mTextLength,
                         textBegin + kMaxTextLength);
  return layout;
}

void ExpectPaddedFinalBlock(const DecryptedBlockLayout& aBlock,
                            const TestPlaintext& aText) {
  EXPECT_EQ(aBlock.mTextLength, static_cast<uint16_t>(aText.size()));
  ASSERT_EQ(aBlock.mText.size(), aText.size());
  for (size_t i = 0; i < aText.size(); ++i) {
    EXPECT_EQ(aBlock.mText[i], aText[i]);
  }

  ASSERT_EQ(aBlock.mPadding.size(), kMaxTextLength - aText.size());
  const bool paddingHasNonZero =
      std::any_of(aBlock.mPadding.begin(), aBlock.mPadding.end(),
                  [](uint8_t aByte) { return aByte != 0; });
  EXPECT_TRUE(paddingHasNonZero);
}

}  // namespace

// Exercise the same behavior with one partial block, one full block,
// and a read that must cross into the second block.
class ParameterizedEncryptedRandomAccessStreamTest
    : public testing::TestWithParam<size_t> {};

class GapFillEncryptedRandomAccessStreamTest
    : public testing::TestWithParam<size_t> {};

class WriteToEmptyStreamEncryptedRandomAccessStreamTest
    : public testing::TestWithParam<size_t> {};

constexpr size_t kSetEOFOriginalSize = kMaxTextLength + kMaxTextLength / 2;

struct SetEOFResizeCase {
  size_t mStartSize;
  size_t mTargetSize;
  const char* mName;
};

class SetEOFResizeEncryptedRandomAccessStreamTest
    : public testing::TestWithParam<SetEOFResizeCase> {};

struct SetEOFBufferedExpandCase {
  size_t mWriteLength;
  size_t mTargetSize;
  const char* mName;
};

class SetEOFBufferedExpandEncryptedRandomAccessStreamTest
    : public testing::TestWithParam<SetEOFBufferedExpandCase> {};

// -------------------------
// Tests covering Create()
// -------------------------

TEST(EncryptedRandomAccessStreamTest,
     EncryptedRandomAccessStream_createSucceedsWithEmptyStream)
{
  auto res = CreateEncryptedFileStream();
  ASSERT_TRUE(res.isOk());

  auto fileStream = res.unwrap();
  ASSERT_TRUE(fileStream.mStream);

  ASSERT_EQ(fileStream.mStream->Seek(nsISeekableStream::NS_SEEK_SET, 0), NS_OK);
  ASSERT_EQ(fileStream.mStream->SetEOF(), NS_OK);

  DummyRandomAccessCipherStrategy dummyStrategy;
  auto streamRes =
      EncryptedRandomAccessStream<DummyRandomAccessCipherStrategy>::Create(
          dummyStrategy, WrapNotNull(fileStream.mStream),
          DummyRandomAccessCipherStrategy::KeyType{});
  ASSERT_TRUE(streamRes.isOk());

  const auto stream = streamRes.unwrap();

  int64_t pos = std::numeric_limits<int64_t>::max();
  ASSERT_EQ(stream->Tell(&pos), NS_OK);
  EXPECT_EQ(pos, 0);

  uint64_t available = std::numeric_limits<uint64_t>::max();
  ASSERT_EQ(stream->Available(&available), NS_OK);
  EXPECT_EQ(available, uint64_t{0});

  std::array<char, 1> buf{'!'};
  uint32_t read = std::numeric_limits<uint32_t>::max();
  ASSERT_EQ(stream->Read(buf.data(), buf.size(), &read), NS_OK);
  EXPECT_EQ(read, 0u);
  EXPECT_EQ(buf[0], '!');
}

TEST(EncryptedRandomAccessStreamTest,
     EncryptedRandomAccessStream_createFailsWithInvalidBlockSize)
{
  auto res = CreateEncryptedFileStream();
  ASSERT_TRUE(res.isOk());

  auto fileStream = res.unwrap();
  ASSERT_TRUE(fileStream.mStream);

  std::array<uint8_t, 1> data{};
  uint32_t written;
  auto rv = fileStream.mStream->Seek(nsISeekableStream::NS_SEEK_END, 0);
  ASSERT_EQ(rv, NS_OK);
  rv = fileStream.mStream->OutputStream()->Write(
      reinterpret_cast<const char*>(data.data()), data.size(), &written);
  ASSERT_EQ(rv, NS_OK);

  DummyRandomAccessCipherStrategy dummyStrategy;
  auto streamRes =
      EncryptedRandomAccessStream<DummyRandomAccessCipherStrategy>::Create(
          dummyStrategy, WrapNotNull(fileStream.mStream),
          DummyRandomAccessCipherStrategy::KeyType{});
  ASSERT_TRUE(streamRes.isErr());
  ASSERT_EQ(streamRes.unwrapErr(), NS_ERROR_CORRUPTED_CONTENT);
}

TEST(EncryptedRandomAccessStreamTest,
     EncryptedRandomAccessStream_createFailsWithUnsupportedVersion)
{
  auto res = CreateEncryptedFileStream();
  ASSERT_TRUE(res.isOk());

  auto fileStream = res.unwrap();
  ASSERT_TRUE(fileStream.mStream);

  constexpr uint16_t version = 2;
  uint32_t written;
  ASSERT_EQ(fileStream.mStream->Seek(nsISeekableStream::NS_SEEK_SET, 0), NS_OK);
  ASSERT_EQ(
      fileStream.mStream->OutputStream()->Write(
          reinterpret_cast<const char*>(&version), sizeof(version), &written),
      NS_OK);
  ASSERT_EQ(written, sizeof(version));

  DummyRandomAccessCipherStrategy dummyStrategy;
  auto streamRes =
      EncryptedRandomAccessStream<DummyRandomAccessCipherStrategy>::Create(
          dummyStrategy, WrapNotNull(fileStream.mStream),
          DummyRandomAccessCipherStrategy::KeyType{});
  ASSERT_TRUE(streamRes.isErr());
  ASSERT_EQ(streamRes.unwrapErr(), NS_ERROR_CORRUPTED_CONTENT);
}

TEST(EncryptedRandomAccessStreamTest,
     EncryptedRandomAccessStream_createFailsWithInvalidTextLength)
{
  auto res = CreateEncryptedFileStream();
  ASSERT_TRUE(res.isOk());

  auto fileStream = res.unwrap();
  ASSERT_TRUE(fileStream.mStream);

  // Write invalid length data on the stream.
  std::array<uint8_t, EncryptedRandomAccessBlock::CipherPayloadSize> payload{};
  uint16_t textLength =
      DecryptedRandomAccessBlockCipherPayloadView::MaxTextLength +
      1;  // invalid data length.
  mozilla::LittleEndian::writeUint16(payload.data(), textLength);

  const auto text = CreatePlaintext();
  memcpy(payload.data() + sizeof(textLength), text.data(), text.size());

  XorWithDummyCipherStrategy(payload);

  uint32_t written;
  auto rv = fileStream.mStream->Seek(nsISeekableStream::NS_SEEK_SET,
                                     kCipherPayloadOffset);
  ASSERT_EQ(rv, NS_OK);
  rv = fileStream.mStream->OutputStream()->Write(
      reinterpret_cast<const char*>(payload.data()), payload.size(), &written);
  ASSERT_EQ(rv, NS_OK);
  ASSERT_EQ(written, EncryptedRandomAccessBlock::CipherPayloadSize);

  // Fail with invalid length data.
  DummyRandomAccessCipherStrategy dummyStrategy;
  auto streamRes =
      EncryptedRandomAccessStream<DummyRandomAccessCipherStrategy>::Create(
          dummyStrategy, WrapNotNull(fileStream.mStream),
          DummyRandomAccessCipherStrategy::KeyType{});
  ASSERT_TRUE(streamRes.isErr());
  ASSERT_EQ(streamRes.unwrapErr(), NS_ERROR_CORRUPTED_CONTENT);
}

TEST(EncryptedRandomAccessStreamTest,
     EncryptedRandomAccessStream_createFailsWithUndecryptableData)
{
  auto res = CreateEncryptedFileStream();
  ASSERT_TRUE(res.isOk());

  auto fileStream = res.unwrap();
  ASSERT_TRUE(fileStream.mStream);

  DecryptFailingDummyRandomAccessCipherStrategy strategy;
  auto streamRes = EncryptedRandomAccessStream<
      DecryptFailingDummyRandomAccessCipherStrategy>::
      Create(strategy, WrapNotNull(fileStream.mStream),
             DecryptFailingDummyRandomAccessCipherStrategy::KeyType{});
  ASSERT_TRUE(streamRes.isErr());
  ASSERT_EQ(streamRes.unwrapErr(), NS_ERROR_CORRUPTED_CONTENT);
}

// -------------------------
// Tests covering Read()
// -------------------------

TEST_P(ParameterizedEncryptedRandomAccessStreamTest,
       EncryptedRandomAccessStream_readFromTheStartToTheMiddleReturnsPrefix) {
  const auto textLength = GetParam();
  auto res = CreateEncryptedFileStream(textLength);
  ASSERT_TRUE(res.isOk());

  auto fileStream = res.unwrap();
  ASSERT_TRUE(fileStream.mStream);

  auto stream = CreateEncryptedRandomAccessStream(fileStream.mStream);

  std::vector<char> buf(textLength / 2);
  uint32_t read = 0;
  ASSERT_EQ(stream->Read(buf.data(), buf.size(), &read), NS_OK);
  ASSERT_EQ(read, textLength / 2);

  const auto expected = CreatePlaintext(textLength);
  for (size_t i = 0; i < expected.size() / 2; ++i) {
    EXPECT_EQ(static_cast<uint8_t>(buf[i]), expected[i]);
  }
}

TEST_P(ParameterizedEncryptedRandomAccessStreamTest,
       EncryptedRandomAccessStream_readFromTheMiddleToTheEndReturnsSuffix) {
  const auto textLength = GetParam();
  auto res = CreateEncryptedFileStream(textLength);
  ASSERT_TRUE(res.isOk());

  auto fileStream = res.unwrap();
  ASSERT_TRUE(fileStream.mStream);

  auto stream = CreateEncryptedRandomAccessStream(fileStream.mStream);

  const auto suffixLength = textLength / 2;
  ASSERT_EQ(stream->Seek(nsISeekableStream::NS_SEEK_END,
                         -static_cast<int64_t>(suffixLength)),
            NS_OK);

  constexpr size_t sentinelLength = 10;
  std::vector<char> buf(suffixLength + sentinelLength, '!');
  uint32_t read = 0;
  ASSERT_EQ(stream->Read(buf.data(), buf.size(), &read), NS_OK);
  ASSERT_EQ(read, suffixLength);

  const auto expected = CreatePlaintext(textLength);
  for (size_t i = 0; i < suffixLength; ++i) {
    EXPECT_EQ(static_cast<uint8_t>(buf[i]),
              expected[textLength - suffixLength + i]);
  }
  for (size_t i = suffixLength; i < buf.size(); ++i) {
    EXPECT_EQ(buf[i], '!');
  }
}

TEST_P(ParameterizedEncryptedRandomAccessStreamTest,
       EncryptedRandomAccessStream_readFromTheStartToTheEndReturnsFullData) {
  const auto textLength = GetParam();
  auto res = CreateEncryptedFileStream(textLength);
  ASSERT_TRUE(res.isOk());

  auto fileStream = res.unwrap();
  ASSERT_TRUE(fileStream.mStream);

  auto stream = CreateEncryptedRandomAccessStream(fileStream.mStream);

  std::vector<char> buf(textLength);
  uint32_t read = 0;
  ASSERT_EQ(stream->Read(buf.data(), buf.size(), &read), NS_OK);
  ASSERT_EQ(read, textLength);

  const auto expected = CreatePlaintext(textLength);
  for (size_t i = 0; i < expected.size(); ++i) {
    EXPECT_EQ(static_cast<uint8_t>(buf[i]), expected[i]);
  }
}

TEST_P(ParameterizedEncryptedRandomAccessStreamTest,
       EncryptedRandomAccessStream_readFromTheStartToPastEndReturnsFullText) {
  const auto textLength = GetParam();
  auto res = CreateEncryptedFileStream(textLength);
  ASSERT_TRUE(res.isOk());

  auto fileStream = res.unwrap();
  ASSERT_TRUE(fileStream.mStream);

  auto stream = CreateEncryptedRandomAccessStream(fileStream.mStream);

  std::vector<char> buf(textLength * 2, '!');
  uint32_t read = 0;
  ASSERT_EQ(stream->Read(buf.data(), buf.size(), &read), NS_OK);
  ASSERT_EQ(read, textLength);

  const auto expected = CreatePlaintext(textLength);
  for (size_t i = 0; i < expected.size(); ++i) {
    EXPECT_EQ(static_cast<uint8_t>(buf[i]), expected[i]);
  }
  // Check if the rest of data is not written.
  for (size_t i = expected.size(); i < buf.size(); ++i) {
    EXPECT_EQ(buf[i], '!');
  }
}

TEST_P(ParameterizedEncryptedRandomAccessStreamTest,
       EncryptedRandomAccessStream_readFromTheEndReturnsNoData) {
  const auto textLength = GetParam();
  auto res = CreateEncryptedFileStream(textLength);
  ASSERT_TRUE(res.isOk());

  auto fileStream = res.unwrap();
  ASSERT_TRUE(fileStream.mStream);

  auto stream = CreateEncryptedRandomAccessStream(fileStream.mStream);

  std::vector<char> buf(textLength);
  uint32_t read = 0;
  ASSERT_EQ(stream->Read(buf.data(), buf.size(), &read), NS_OK);
  ASSERT_EQ(read, textLength);

  const auto expected = CreatePlaintext(textLength);
  for (size_t i = 0; i < expected.size(); ++i) {
    EXPECT_EQ(static_cast<uint8_t>(buf[i]), expected[i]);
  }

  ASSERT_EQ(stream->Read(buf.data(), buf.size(), &read), NS_OK);
  ASSERT_EQ(read, 0u);
  for (size_t i = 0; i < expected.size(); ++i) {
    EXPECT_EQ(static_cast<uint8_t>(buf[i]), expected[i]);
  }
}

TEST(EncryptedRandomAccessStreamTest,
     EncryptedRandomAccessStream_readFailsWithPartiallyFilledNonFinalBlock)
{
  auto res = CreateEncryptedFileStream(kMaxTextLength + kTextLength);
  ASSERT_TRUE(res.isOk());

  auto fileStream = res.unwrap();
  ASSERT_TRUE(fileStream.mStream);

  // Make the text length of the first block shorter than |kMaxTextLength|.
  // Because it is not the last block, this is an invalid on-disk layout.
  std::array<uint8_t, EncryptedRandomAccessBlock::CipherPayloadSize> payload{};
  constexpr uint16_t textLength = kMaxTextLength - 1;
  mozilla::LittleEndian::writeUint16(payload.data(), textLength);
  XorWithDummyCipherStrategy(payload);

  ASSERT_EQ(fileStream.mStream->Seek(nsISeekableStream::NS_SEEK_SET,
                                     kCipherPayloadOffset),
            NS_OK);

  uint32_t written = 0;
  ASSERT_EQ(fileStream.mStream->OutputStream()->Write(
                reinterpret_cast<const char*>(payload.data()), payload.size(),
                &written),
            NS_OK);
  ASSERT_EQ(written, payload.size());

  // Try to read, but that fails.
  auto stream = CreateEncryptedRandomAccessStream(fileStream.mStream);

  std::array<char, 1> buf{};
  uint32_t read = std::numeric_limits<uint32_t>::max();
  ASSERT_EQ(stream->Read(buf.data(), buf.size(), &read),
            NS_ERROR_CORRUPTED_CONTENT);
  EXPECT_EQ(read, 0u);
}

TEST(EncryptedRandomAccessStreamTest,
     EncryptedRandomAccessStream_readWithZeroLengthReturnsNoData)
{
  auto res = CreateEncryptedFileStream();
  ASSERT_TRUE(res.isOk());

  auto fileStream = res.unwrap();
  ASSERT_TRUE(fileStream.mStream);

  auto stream = CreateEncryptedRandomAccessStream(fileStream.mStream);

  std::array<char, 1> buf{'!'};
  uint32_t read = std::numeric_limits<uint32_t>::max();
  ASSERT_EQ(stream->Read(buf.data(), 0, &read), NS_OK);
  ASSERT_EQ(read, 0u);
  EXPECT_EQ(buf[0], '!');

  int64_t pos;
  ASSERT_EQ(stream->Tell(&pos), NS_OK);
  EXPECT_EQ(pos, 0);
}

TEST_P(ParameterizedEncryptedRandomAccessStreamTest,
       EncryptedRandomAccessStream_readAdvancesCursorPosition) {
  const auto textLength = GetParam();
  auto res = CreateEncryptedFileStream(textLength);
  ASSERT_TRUE(res.isOk());

  auto fileStream = res.unwrap();
  ASSERT_TRUE(fileStream.mStream);

  auto stream = CreateEncryptedRandomAccessStream(fileStream.mStream);

  std::vector<char> buf(textLength / 2);
  uint32_t read = 0;
  ASSERT_EQ(stream->Read(buf.data(), buf.size(), &read), NS_OK);
  ASSERT_EQ(read, textLength / 2);

  const auto expected = CreatePlaintext(textLength);
  for (size_t i = 0; i < expected.size() / 2; ++i) {
    EXPECT_EQ(static_cast<uint8_t>(buf[i]), expected[i]);
  }

  ASSERT_EQ(stream->Read(buf.data(), buf.size(), &read), NS_OK);
  ASSERT_EQ(read, textLength / 2);

  for (size_t i = 0; i < expected.size() / 2; ++i) {
    EXPECT_EQ(static_cast<uint8_t>(buf[i]), expected[i + expected.size() / 2]);
  }
}

// -------------------------
// Tests covering ReadSegments()
// -------------------------

TEST_P(
    ParameterizedEncryptedRandomAccessStreamTest,
    EncryptedRandomAccessStream_readSegmentsWithPartialWriterReturnsRequestedData) {
  const auto textLength = GetParam();
  auto res = CreateEncryptedFileStream(textLength);
  ASSERT_TRUE(res.isOk());

  auto fileStream = res.unwrap();
  ASSERT_TRUE(fileStream.mStream);

  auto stream = CreateEncryptedRandomAccessStream(fileStream.mStream);

  PartialSegmentWriterClosure closure(textLength);
  uint32_t read = 0;
  ASSERT_EQ(
      stream->ReadSegments(PartialSegmentWriter, &closure, textLength, &read),
      NS_OK);
  ASSERT_EQ(read, textLength);
  EXPECT_EQ(closure.mWritten, textLength);

  const auto expected = CreatePlaintext(textLength);
  for (size_t i = 0; i < expected.size(); ++i) {
    EXPECT_EQ(closure.mData[i], expected[i]);
  }

  int64_t pos;
  ASSERT_EQ(stream->Tell(&pos), NS_OK);
  EXPECT_EQ(pos, static_cast<int64_t>(textLength));
}

TEST(
    EncryptedRandomAccessStreamTest,
    EncryptedRandomAccessStream_readSegmentsSwallowsWriterErrorWithoutAdvancingPosition)
{
  auto res = CreateEncryptedFileStream();
  ASSERT_TRUE(res.isOk());

  auto fileStream = res.unwrap();
  ASSERT_TRUE(fileStream.mStream);

  auto stream = CreateEncryptedRandomAccessStream(fileStream.mStream);

  uint32_t read = std::numeric_limits<uint32_t>::max();
  ASSERT_EQ(
      stream->ReadSegments(ErrorSegmentWriter, nullptr, kTextLength, &read),
      NS_OK);
  ASSERT_EQ(read, 0u);

  int64_t pos;
  ASSERT_EQ(stream->Tell(&pos), NS_OK);
  EXPECT_EQ(pos, 0);
}

// As nsIInputStream.idl documents for readSegments ("0 if reached
// end-of-file (or if aWriter refused to consume data)"), a writer that consumes
// nothing signals that ReadSegments should stop rather than fail.
// So, in this case, the writer consumes 7 bytes on its first call and then
// refuses to consume more (reports zero bytes). |ReadSegments()| must stop,
// succeed, and report only the bytes already consumed, leaving the position
// advanced by that amount.
TEST(
    EncryptedRandomAccessStreamTest,
    EncryptedRandomAccessStream_readSegmentsStopsWhenWriterRefusesToConsumeAndKeepsProgress)
{
  auto res = CreateEncryptedFileStream();
  ASSERT_TRUE(res.isOk());

  auto fileStream = res.unwrap();
  ASSERT_TRUE(fileStream.mStream);

  auto stream = CreateEncryptedRandomAccessStream(fileStream.mStream);

  constexpr uint32_t kCap = 7;
  PartialSegmentWriterClosure closure(kTextLength, kCap);
  uint32_t read = std::numeric_limits<uint32_t>::max();
  ASSERT_EQ(
      stream->ReadSegments(PartialSegmentWriter, &closure, kTextLength, &read),
      NS_OK);
  EXPECT_EQ(read, kCap);
  EXPECT_EQ(closure.mWritten, kCap);

  int64_t pos;
  ASSERT_EQ(stream->Tell(&pos), NS_OK);
  EXPECT_EQ(pos, static_cast<int64_t>(kCap));

  const auto expected = CreatePlaintext();
  for (size_t i = 0; i < kCap; ++i) {
    EXPECT_EQ(closure.mData[i], expected[i]);
  }
}

// -------------------------
// Tests covering Seek()
// -------------------------

TEST(EncryptedRandomAccessStreamTest,
     EncryptedRandomAccessStream_seekSetChangesReadPosition)
{
  auto res = CreateEncryptedFileStream();
  ASSERT_TRUE(res.isOk());

  auto fileStream = res.unwrap();
  ASSERT_TRUE(fileStream.mStream);

  auto stream = CreateEncryptedRandomAccessStream(fileStream.mStream);

  constexpr uint32_t offset = 13;
  constexpr uint32_t count = 17;
  ASSERT_EQ(stream->Seek(nsISeekableStream::NS_SEEK_SET, offset), NS_OK);

  std::array<char, count> buf{};
  uint32_t read = 0;
  ASSERT_EQ(stream->Read(buf.data(), buf.size(), &read), NS_OK);
  ASSERT_EQ(read, count);

  const auto expected = CreatePlaintext();
  for (size_t i = 0; i < buf.size(); ++i) {
    EXPECT_EQ(static_cast<uint8_t>(buf[i]), expected[i + offset]);
  }
}

TEST(EncryptedRandomAccessStreamTest,
     EncryptedRandomAccessStream_seekCurChangesReadPosition)
{
  auto res = CreateEncryptedFileStream();
  ASSERT_TRUE(res.isOk());

  auto fileStream = res.unwrap();
  ASSERT_TRUE(fileStream.mStream);

  auto stream = CreateEncryptedRandomAccessStream(fileStream.mStream);

  constexpr uint32_t initialOffset = 10;
  constexpr uint32_t relativeOffset = 7;
  constexpr uint32_t expectedOffset = initialOffset + relativeOffset;
  constexpr uint32_t count = 13;

  ASSERT_EQ(stream->Seek(nsISeekableStream::NS_SEEK_SET, initialOffset), NS_OK);
  ASSERT_EQ(stream->Seek(nsISeekableStream::NS_SEEK_CUR, relativeOffset),
            NS_OK);

  std::array<char, count> buf{};
  uint32_t read = 0;
  ASSERT_EQ(stream->Read(buf.data(), buf.size(), &read), NS_OK);
  ASSERT_EQ(read, count);

  const auto expected = CreatePlaintext();
  for (size_t i = 0; i < buf.size(); ++i) {
    EXPECT_EQ(static_cast<uint8_t>(buf[i]), expected[i + expectedOffset]);
  }
}

TEST_P(ParameterizedEncryptedRandomAccessStreamTest,
       EncryptedRandomAccessStream_seekEndChangesReadPosition) {
  const auto textLength = GetParam();
  auto res = CreateEncryptedFileStream(textLength);
  ASSERT_TRUE(res.isOk());

  auto fileStream = res.unwrap();
  ASSERT_TRUE(fileStream.mStream);

  auto stream = CreateEncryptedRandomAccessStream(fileStream.mStream);

  ASSERT_EQ(stream->Seek(nsISeekableStream::NS_SEEK_END, -20), NS_OK);

  std::array<char, 20> buf{};
  uint32_t read = 0;
  ASSERT_EQ(stream->Read(buf.data(), buf.size(), &read), NS_OK);
  ASSERT_EQ(read, 20u);

  const auto expected = CreatePlaintext(textLength);
  const auto expectedOffset = textLength - 20;
  for (size_t i = 0; i < buf.size(); ++i) {
    EXPECT_EQ(static_cast<uint8_t>(buf[i]), expected[i + expectedOffset]);
  }
}

TEST(
    EncryptedRandomAccessStreamTest,
    EncryptedRandomAccessStream_seekSetThenReadAcrossBlockBoundaryReturnsRequestedData)
{
  constexpr uint32_t offset = kMaxTextLength - 10;
  constexpr uint32_t count = 20;

  auto res = CreateEncryptedFileStream(kMaxTextLength + count);
  ASSERT_TRUE(res.isOk());

  auto fileStream = res.unwrap();
  ASSERT_TRUE(fileStream.mStream);

  auto stream = CreateEncryptedRandomAccessStream(fileStream.mStream);

  ASSERT_EQ(stream->Seek(nsISeekableStream::NS_SEEK_SET, offset), NS_OK);

  std::array<char, count> buf{};
  uint32_t read = 0;
  ASSERT_EQ(stream->Read(buf.data(), buf.size(), &read), NS_OK);
  ASSERT_EQ(read, count);

  const auto expected = CreatePlaintext(kMaxTextLength + count);
  for (size_t i = 0; i < buf.size(); ++i) {
    EXPECT_EQ(static_cast<uint8_t>(buf[i]), expected[i + offset]);
  }
}

TEST(
    EncryptedRandomAccessStreamTest,
    EncryptedRandomAccessStream_seekCurThenReadAcrossBlockBoundaryReturnsRequestedData)
{
  constexpr uint32_t initialOffset = kMaxTextLength - 20;
  constexpr uint32_t relativeOffset = 10;
  constexpr uint32_t expectedOffset = initialOffset + relativeOffset;
  constexpr uint32_t count = 20;

  auto res = CreateEncryptedFileStream(kMaxTextLength + count);
  ASSERT_TRUE(res.isOk());

  auto fileStream = res.unwrap();
  ASSERT_TRUE(fileStream.mStream);

  auto stream = CreateEncryptedRandomAccessStream(fileStream.mStream);

  ASSERT_EQ(stream->Seek(nsISeekableStream::NS_SEEK_SET, initialOffset), NS_OK);
  ASSERT_EQ(stream->Seek(nsISeekableStream::NS_SEEK_CUR, relativeOffset),
            NS_OK);

  std::array<char, count> buf{};
  uint32_t read = 0;
  ASSERT_EQ(stream->Read(buf.data(), buf.size(), &read), NS_OK);
  ASSERT_EQ(read, count);

  const auto expected = CreatePlaintext(kMaxTextLength + count);
  for (size_t i = 0; i < buf.size(); ++i) {
    EXPECT_EQ(static_cast<uint8_t>(buf[i]), expected[i + expectedOffset]);
  }
}

TEST(
    EncryptedRandomAccessStreamTest,
    EncryptedRandomAccessStream_seekEndThenReadAcrossBlockBoundaryReturnsRequestedData)
{
  constexpr int32_t count = 20;
  constexpr int32_t textLength = kMaxTextLength + 10;

  auto res = CreateEncryptedFileStream(textLength);
  ASSERT_TRUE(res.isOk());

  auto fileStream = res.unwrap();
  ASSERT_TRUE(fileStream.mStream);

  auto stream = CreateEncryptedRandomAccessStream(fileStream.mStream);

  ASSERT_EQ(stream->Seek(nsISeekableStream::NS_SEEK_END, -count), NS_OK);

  std::array<char, count> buf{};
  uint32_t read = 0;
  ASSERT_EQ(stream->Read(buf.data(), buf.size(), &read), NS_OK);
  ASSERT_EQ(static_cast<int32_t>(read), count);

  const auto expected = CreatePlaintext(textLength);
  for (size_t i = 0; i < buf.size(); ++i) {
    EXPECT_EQ(static_cast<uint8_t>(buf[i]), expected[i + textLength - count]);
  }
}

TEST_P(ParameterizedEncryptedRandomAccessStreamTest,
       EncryptedRandomAccessStream_seekToEndLeavesNoReadableData) {
  const auto textLength = GetParam();
  auto res = CreateEncryptedFileStream(textLength);
  ASSERT_TRUE(res.isOk());

  auto fileStream = res.unwrap();
  ASSERT_TRUE(fileStream.mStream);

  auto stream = CreateEncryptedRandomAccessStream(fileStream.mStream);

  ASSERT_EQ(stream->Seek(nsISeekableStream::NS_SEEK_SET, textLength), NS_OK);

  int64_t pos = std::numeric_limits<int64_t>::max();
  ASSERT_EQ(stream->Tell(&pos), NS_OK);
  EXPECT_EQ(pos, static_cast<int64_t>(textLength));

  std::array<char, 1> buf{'!'};
  uint32_t read = std::numeric_limits<uint32_t>::max();
  ASSERT_EQ(stream->Read(buf.data(), buf.size(), &read), NS_OK);
  EXPECT_EQ(read, 0u);
  EXPECT_EQ(buf[0], '!');

  uint64_t available = std::numeric_limits<uint64_t>::max();
  ASSERT_EQ(stream->Available(&available), NS_OK);
  EXPECT_EQ(available, uint64_t{0});
}

TEST_P(
    ParameterizedEncryptedRandomAccessStreamTest,
    EncryptedRandomAccessStream_seekPastEndUpdatesPositionAndLeavesNoAvailableData) {
  const auto textLength = GetParam();
  auto res1 = CreateEncryptedFileStream(textLength);
  ASSERT_TRUE(res1.isOk());

  auto fileStream = res1.unwrap();
  ASSERT_TRUE(fileStream.mStream);

  auto stream = CreateEncryptedRandomAccessStream(fileStream.mStream);

  int64_t pos;
  ASSERT_EQ(stream->Tell(&pos), NS_OK);
  EXPECT_EQ(pos, 0);

  ASSERT_EQ(stream->Seek(nsISeekableStream::NS_SEEK_SET, textLength + 100),
            NS_OK);

  ASSERT_EQ(stream->Tell(&pos), NS_OK);
  EXPECT_EQ(pos, static_cast<int64_t>(textLength + 100));

  std::vector<char> buf(textLength);
  uint32_t read = std::numeric_limits<uint32_t>::max();
  ASSERT_EQ(stream->Read(buf.data(), buf.size(), &read), NS_OK);
  ASSERT_EQ(read, 0u);

  uint64_t available = std::numeric_limits<uint64_t>::max();
  ASSERT_EQ(stream->Available(&available), NS_OK);
  EXPECT_EQ(available, uint64_t{0});
}

TEST(EncryptedRandomAccessStreamTest,
     EncryptedRandomAccessStream_seekPastUint32MaxSucceeds)
{
  auto res = CreateEncryptedFileStream();
  ASSERT_TRUE(res.isOk());

  auto fileStream = res.unwrap();
  ASSERT_TRUE(fileStream.mStream);

  auto stream = CreateEncryptedRandomAccessStream(fileStream.mStream);

  constexpr int64_t offset =
      static_cast<int64_t>(std::numeric_limits<uint32_t>::max()) + 1;
  ASSERT_EQ(stream->Seek(nsISeekableStream::NS_SEEK_SET, offset), NS_OK);

  int64_t pos;
  ASSERT_EQ(stream->Tell(&pos), NS_OK);
  EXPECT_EQ(pos, offset);
}

TEST_P(ParameterizedEncryptedRandomAccessStreamTest,
       EncryptedRandomAccessStream_seekFailsWithNegativePosition) {
  const auto textLength = GetParam();
  auto res1 = CreateEncryptedFileStream(textLength);
  ASSERT_TRUE(res1.isOk());

  auto fileStream = res1.unwrap();
  ASSERT_TRUE(fileStream.mStream);

  auto stream = CreateEncryptedRandomAccessStream(fileStream.mStream);

  int64_t pos;
  ASSERT_EQ(stream->Tell(&pos), NS_OK);
  EXPECT_EQ(pos, 0);

  ASSERT_EQ(stream->Seek(nsISeekableStream::NS_SEEK_SET, -10),
            nsresult::NS_ERROR_INVALID_ARG);
  ASSERT_EQ(stream->Tell(&pos), NS_OK);
  EXPECT_EQ(pos, 0);

  ASSERT_EQ(stream->Seek(nsISeekableStream::NS_SEEK_CUR, -10),
            nsresult::NS_ERROR_INVALID_ARG);
  ASSERT_EQ(stream->Tell(&pos), NS_OK);
  EXPECT_EQ(pos, 0);

  ASSERT_EQ(stream->Seek(nsISeekableStream::NS_SEEK_END,
                         -static_cast<int64_t>(textLength + 1)),
            nsresult::NS_ERROR_INVALID_ARG);
  ASSERT_EQ(stream->Tell(&pos), NS_OK);
  EXPECT_EQ(pos, 0);
}

// -------------------------
// Tests covering Tell()
// -------------------------

TEST_P(ParameterizedEncryptedRandomAccessStreamTest,
       EncryptedRandomAccessStream_tellTracksSeekPosition) {
  const auto textLength = GetParam();
  auto res1 = CreateEncryptedFileStream(textLength);
  ASSERT_TRUE(res1.isOk());

  auto fileStream = res1.unwrap();
  ASSERT_TRUE(fileStream.mStream);

  auto stream = CreateEncryptedRandomAccessStream(fileStream.mStream);

  int64_t pos;
  ASSERT_EQ(stream->Tell(&pos), NS_OK);
  EXPECT_EQ(pos, 0);

  ASSERT_EQ(stream->Seek(nsISeekableStream::NS_SEEK_SET, 64), NS_OK);
  ASSERT_EQ(stream->Tell(&pos), NS_OK);
  EXPECT_EQ(pos, 64);

  ASSERT_EQ(stream->Seek(nsISeekableStream::NS_SEEK_CUR, 10), NS_OK);
  ASSERT_EQ(stream->Tell(&pos), NS_OK);
  EXPECT_EQ(pos, 74);

  ASSERT_EQ(stream->Seek(nsISeekableStream::NS_SEEK_END, -1), NS_OK);
  ASSERT_EQ(stream->Tell(&pos), NS_OK);
  EXPECT_EQ(pos, static_cast<int64_t>(textLength - 1));
}

// -------------------------
// Tests covering Available()
// -------------------------

TEST_P(ParameterizedEncryptedRandomAccessStreamTest,
       EncryptedRandomAccessStream_availableTracksPosition) {
  const auto textLength = GetParam();
  auto res1 = CreateEncryptedFileStream(textLength);
  ASSERT_TRUE(res1.isOk());

  auto fileStream = res1.unwrap();
  ASSERT_TRUE(fileStream.mStream);

  auto stream = CreateEncryptedRandomAccessStream(fileStream.mStream);

  uint64_t available;
  ASSERT_EQ(stream->Available(&available), NS_OK);
  EXPECT_EQ(available, textLength);

  std::vector<char> buf(textLength / 2);
  uint32_t read = 0;
  ASSERT_EQ(stream->Read(buf.data(), buf.size(), &read), NS_OK);
  ASSERT_EQ(read, textLength / 2);

  ASSERT_EQ(stream->Available(&available), NS_OK);
  EXPECT_EQ(available, textLength / 2);

  ASSERT_EQ(stream->Seek(nsISeekableStream::NS_SEEK_CUR, -10), NS_OK);
  ASSERT_EQ(stream->Available(&available), NS_OK);
  EXPECT_EQ(available, textLength / 2 + 10);
}

// -------------------------
// Tests covering Write()
// -------------------------
//
// These cover two axes. First, the kind of write: overwriting existing data,
// growing the stream at the end, or writing past the end (which zero-fills the
// gap). Second, how the write meets block boundaries: within one block,
// crossing into the next, spanning several new blocks, or landing exactly on a
// boundary. The tests are grouped by kind, followed by cursor, buffering, and
// edge cases.

// --- Overwriting data within the current size ---

TEST_P(ParameterizedEncryptedRandomAccessStreamTest,
       EncryptedRandomAccessStream_writeFromTheStartToTheMiddleChangesPrefix) {
  const auto textLength = GetParam();
  auto res = CreateEncryptedFileStream(textLength);
  ASSERT_TRUE(res.isOk());

  auto fileStream = res.unwrap();
  ASSERT_TRUE(fileStream.mStream);

  const auto prefixLength = textLength / 2;
  const auto pattern = CreateOverwritePattern(prefixLength);

  {
    auto stream = CreateEncryptedRandomAccessStream(fileStream.mStream);

    uint32_t written = 0;
    ASSERT_EQ(stream->Write(reinterpret_cast<const char*>(pattern.data()),
                            pattern.size(), &written),
              NS_OK);
    ASSERT_EQ(written, prefixLength);

    ASSERT_EQ(stream->Flush(), NS_OK);
  }

  const auto result = ReadDataFromStream(fileStream.mStream, textLength);
  const auto original = CreatePlaintext(textLength);
  for (size_t i = 0; i < prefixLength; ++i) {
    EXPECT_EQ(result[i], pattern[i]);
  }
  for (size_t i = prefixLength; i < textLength; ++i) {
    EXPECT_EQ(result[i], original[i]);
  }
}

TEST_P(ParameterizedEncryptedRandomAccessStreamTest,
       EncryptedRandomAccessStream_writeFromTheMiddleToTheEndChangesSuffix) {
  const auto textLength = GetParam();
  auto res = CreateEncryptedFileStream(textLength);
  ASSERT_TRUE(res.isOk());

  auto fileStream = res.unwrap();
  ASSERT_TRUE(fileStream.mStream);

  const auto suffixLength = textLength / 2;
  const auto pattern = CreateOverwritePattern(suffixLength);

  {
    auto stream = CreateEncryptedRandomAccessStream(fileStream.mStream);

    ASSERT_EQ(stream->Seek(nsISeekableStream::NS_SEEK_END,
                           -static_cast<int64_t>(suffixLength)),
              NS_OK);

    uint32_t written = 0;
    ASSERT_EQ(stream->Write(reinterpret_cast<const char*>(pattern.data()),
                            pattern.size(), &written),
              NS_OK);
    ASSERT_EQ(written, suffixLength);

    ASSERT_EQ(stream->Flush(), NS_OK);
  }

  const auto result = ReadDataFromStream(fileStream.mStream, textLength);
  const auto original = CreatePlaintext(textLength);
  const auto suffixStart = textLength - suffixLength;
  for (size_t i = 0; i < suffixStart; ++i) {
    EXPECT_EQ(result[i], original[i]);
  }
  for (size_t i = 0; i < suffixLength; ++i) {
    EXPECT_EQ(result[suffixStart + i], pattern[i]);
  }
}

TEST_P(ParameterizedEncryptedRandomAccessStreamTest,
       EncryptedRandomAccessStream_writeFromTheStartToTheEndChangesFullData) {
  const auto textLength = GetParam();
  auto res = CreateEncryptedFileStream(textLength);
  ASSERT_TRUE(res.isOk());

  auto fileStream = res.unwrap();
  ASSERT_TRUE(fileStream.mStream);

  const auto pattern = CreateOverwritePattern(textLength);

  {
    auto stream = CreateEncryptedRandomAccessStream(fileStream.mStream);

    uint32_t written = 0;
    ASSERT_EQ(stream->Write(reinterpret_cast<const char*>(pattern.data()),
                            pattern.size(), &written),
              NS_OK);
    ASSERT_EQ(written, textLength);

    ASSERT_EQ(stream->Flush(), NS_OK);
  }

  const auto result = ReadDataFromStream(fileStream.mStream, textLength);
  for (size_t i = 0; i < textLength; ++i) {
    EXPECT_EQ(result[i], pattern[i]);
  }
}

TEST(EncryptedRandomAccessStreamTest,
     EncryptedRandomAccessStream_writeAcrossBlockBoundarySucceeds)
{
  constexpr uint32_t offset = kMaxTextLength - 10;
  constexpr uint32_t count = 20;
  constexpr size_t textLength = kMaxTextLength + count;

  auto res = CreateEncryptedFileStream(textLength);
  ASSERT_TRUE(res.isOk());

  auto fileStream = res.unwrap();
  ASSERT_TRUE(fileStream.mStream);

  const auto pattern = CreateOverwritePattern(count);

  {
    auto stream = CreateEncryptedRandomAccessStream(fileStream.mStream);

    ASSERT_EQ(stream->Seek(nsISeekableStream::NS_SEEK_SET, offset), NS_OK);

    uint32_t written = 0;
    ASSERT_EQ(stream->Write(reinterpret_cast<const char*>(pattern.data()),
                            pattern.size(), &written),
              NS_OK);
    ASSERT_EQ(written, count);

    ASSERT_EQ(stream->Flush(), NS_OK);
  }

  const auto result = ReadDataFromStream(fileStream.mStream, textLength);
  const auto original = CreatePlaintext(textLength);
  for (size_t i = 0; i < offset; ++i) {
    EXPECT_EQ(result[i], original[i]);
  }
  for (size_t i = 0; i < count; ++i) {
    EXPECT_EQ(result[offset + i], pattern[i]);
  }
  for (size_t i = offset + count; i < textLength; ++i) {
    EXPECT_EQ(result[i], original[i]);
  }
}

// --- Growing the stream by writing at or after the end ---

TEST_P(WriteToEmptyStreamEncryptedRandomAccessStreamTest,
       EncryptedRandomAccessStream_writeToEmptyStreamGrowsStream) {
  const auto writeLength = GetParam();
  auto res = CreateEncryptedFileStream(0);
  ASSERT_TRUE(res.isOk());

  auto fileStream = res.unwrap();
  ASSERT_TRUE(fileStream.mStream);

  const auto pattern = CreateOverwritePattern(writeLength);

  {
    auto stream = CreateEncryptedRandomAccessStream(fileStream.mStream);

    uint32_t written = 0;
    ASSERT_EQ(stream->Write(reinterpret_cast<const char*>(pattern.data()),
                            pattern.size(), &written),
              NS_OK);
    ASSERT_EQ(written, writeLength);

    ASSERT_EQ(stream->Flush(), NS_OK);
  }

  const auto result = ReadDataFromStream(fileStream.mStream, writeLength);
  for (size_t i = 0; i < writeLength; ++i) {
    EXPECT_EQ(result[i], pattern[i]);
  }
}

TEST_P(ParameterizedEncryptedRandomAccessStreamTest,
       EncryptedRandomAccessStream_writeFromTheStartToPastEndGrowsStream) {
  const auto textLength = GetParam();
  auto res = CreateEncryptedFileStream(textLength);
  ASSERT_TRUE(res.isOk());

  auto fileStream = res.unwrap();
  ASSERT_TRUE(fileStream.mStream);

  const size_t newLength = textLength + kTextLength;
  const auto pattern = CreateOverwritePattern(newLength);

  {
    auto stream = CreateEncryptedRandomAccessStream(fileStream.mStream);

    uint32_t written = 0;
    ASSERT_EQ(stream->Write(reinterpret_cast<const char*>(pattern.data()),
                            pattern.size(), &written),
              NS_OK);
    ASSERT_EQ(written, newLength);

    ASSERT_EQ(stream->Flush(), NS_OK);
  }

  {
    auto stream = CreateEncryptedRandomAccessStream(fileStream.mStream);
    uint64_t available = 0;
    ASSERT_EQ(stream->Available(&available), NS_OK);
    EXPECT_EQ(available, newLength);
  }

  const auto result = ReadDataFromStream(fileStream.mStream, newLength);
  for (size_t i = 0; i < newLength; ++i) {
    EXPECT_EQ(result[i], pattern[i]);
  }
}

TEST_P(ParameterizedEncryptedRandomAccessStreamTest,
       EncryptedRandomAccessStream_writeAtTheEndAppendsData) {
  const auto textLength = GetParam();
  auto res = CreateEncryptedFileStream(textLength);
  ASSERT_TRUE(res.isOk());

  auto fileStream = res.unwrap();
  ASSERT_TRUE(fileStream.mStream);

  const auto pattern = CreateOverwritePattern(kTextLength);
  const size_t newLength = textLength + kTextLength;

  {
    auto stream = CreateEncryptedRandomAccessStream(fileStream.mStream);

    ASSERT_EQ(stream->Seek(nsISeekableStream::NS_SEEK_END, 0), NS_OK);

    uint32_t written = 0;
    ASSERT_EQ(stream->Write(reinterpret_cast<const char*>(pattern.data()),
                            pattern.size(), &written),
              NS_OK);
    ASSERT_EQ(written, kTextLength);

    ASSERT_EQ(stream->Flush(), NS_OK);
  }

  const auto result = ReadDataFromStream(fileStream.mStream, newLength);
  const auto original = CreatePlaintext(textLength);
  for (size_t i = 0; i < textLength; ++i) {
    EXPECT_EQ(result[i], original[i]);
  }
  for (size_t i = 0; i < kTextLength; ++i) {
    EXPECT_EQ(result[textLength + i], pattern[i]);
  }
}

TEST(EncryptedRandomAccessStreamTest,
     EncryptedRandomAccessStream_writeAtTheEndAppendsMultipleBlocks)
{
  constexpr size_t baseLength = kMaxTextLength;
  constexpr size_t appendLength = 2 * kMaxTextLength + 50;
  constexpr size_t newLength = baseLength + appendLength;

  auto res = CreateEncryptedFileStream(baseLength);
  ASSERT_TRUE(res.isOk());

  auto fileStream = res.unwrap();
  ASSERT_TRUE(fileStream.mStream);

  const auto pattern = CreateOverwritePattern(appendLength);

  {
    auto stream = CreateEncryptedRandomAccessStream(fileStream.mStream);

    ASSERT_EQ(stream->Seek(nsISeekableStream::NS_SEEK_END, 0), NS_OK);

    uint32_t written = 0;
    ASSERT_EQ(stream->Write(reinterpret_cast<const char*>(pattern.data()),
                            pattern.size(), &written),
              NS_OK);
    ASSERT_EQ(written, appendLength);

    ASSERT_EQ(stream->Flush(), NS_OK);
  }

  const auto result = ReadDataFromStream(fileStream.mStream, newLength);
  const auto original = CreatePlaintext(baseLength);
  for (size_t i = 0; i < baseLength; ++i) {
    EXPECT_EQ(result[i], original[i]);
  }
  for (size_t i = 0; i < appendLength; ++i) {
    EXPECT_EQ(result[baseLength + i], pattern[i]);
  }
}

// --- Writing past the end fills the gap with zeros ---

TEST_P(GapFillEncryptedRandomAccessStreamTest,
       EncryptedRandomAccessStream_writeFromPastEndFillsGap) {
  constexpr size_t baseLength = kTextLength;
  const size_t writePos = GetParam();
  constexpr uint32_t dataLength = 60;
  const size_t newLength = writePos + dataLength;

  auto res = CreateEncryptedFileStream(baseLength, kGapFillSentinelPadding);
  ASSERT_TRUE(res.isOk());

  auto fileStream = res.unwrap();
  ASSERT_TRUE(fileStream.mStream);

  const auto pattern = CreateOverwritePattern(dataLength);

  {
    auto stream = CreateEncryptedRandomAccessStream(fileStream.mStream);

    ASSERT_EQ(stream->Seek(nsISeekableStream::NS_SEEK_SET, writePos), NS_OK);

    uint32_t written = 0;
    ASSERT_EQ(stream->Write(reinterpret_cast<const char*>(pattern.data()),
                            pattern.size(), &written),
              NS_OK);
    ASSERT_EQ(written, dataLength);

    ASSERT_EQ(stream->Flush(), NS_OK);

    ASSERT_EQ(stream->Seek(nsISeekableStream::NS_SEEK_SET, 0), NS_OK);
    uint64_t available = 0;
    ASSERT_EQ(stream->Available(&available), NS_OK);
    EXPECT_EQ(available, newLength);
  }

  const auto result = ReadDataFromStream(fileStream.mStream, newLength);
  const auto original = CreatePlaintext(baseLength);
  for (size_t i = 0; i < baseLength; ++i) {
    EXPECT_EQ(result[i], original[i]);
  }
  // Check if the gap is filled with zeroes.
  for (size_t i = baseLength; i < writePos; ++i) {
    EXPECT_EQ(result[i], 0);
  }
  for (size_t i = 0; i < dataLength; ++i) {
    EXPECT_EQ(result[writePos + i], pattern[i]);
  }
}

// NOTE: This is the only test that exercises the gap-fill path where the
// current block is not the last block: overwriting an earlier block first makes
// it the current block, so the subsequent write past the end must flush it and
// rebase onto the final block before filling the gap.
TEST(EncryptedRandomAccessStreamTest,
     EncryptedRandomAccessStream_writeFromPastEndAfterOverwritingEarlierBlock)
{
  constexpr size_t baseLength = kMaxTextLength + kTextLength;
  constexpr uint32_t prefixLength = 50;
  constexpr uint32_t writePos = 2 * kMaxTextLength + 50;
  constexpr uint32_t dataLength = 60;
  constexpr size_t newLength = writePos + dataLength;

  auto res = CreateEncryptedFileStream(baseLength, kGapFillSentinelPadding);
  ASSERT_TRUE(res.isOk());

  auto fileStream = res.unwrap();
  ASSERT_TRUE(fileStream.mStream);

  const auto prefix = CreateOverwritePattern(prefixLength);
  const auto data = CreateOverwritePattern(dataLength);

  {
    auto stream = CreateEncryptedRandomAccessStream(fileStream.mStream);

    // Overwrite the start so the first (non-final) block becomes current.
    uint32_t written = 0;
    ASSERT_EQ(stream->Seek(nsISeekableStream::NS_SEEK_SET, 0), NS_OK);
    ASSERT_EQ(stream->Write(reinterpret_cast<const char*>(prefix.data()),
                            prefix.size(), &written),
              NS_OK);
    ASSERT_EQ(written, prefixLength);

    // Then write past the end; this must rebase onto the final block.
    ASSERT_EQ(stream->Seek(nsISeekableStream::NS_SEEK_SET, writePos), NS_OK);
    ASSERT_EQ(stream->Write(reinterpret_cast<const char*>(data.data()),
                            data.size(), &written),
              NS_OK);
    ASSERT_EQ(written, dataLength);

    ASSERT_EQ(stream->Flush(), NS_OK);

    ASSERT_EQ(stream->Seek(nsISeekableStream::NS_SEEK_SET, 0), NS_OK);
    uint64_t available = 0;
    ASSERT_EQ(stream->Available(&available), NS_OK);
    EXPECT_EQ(available, newLength);
  }

  const auto result = ReadDataFromStream(fileStream.mStream, newLength);
  const auto original = CreatePlaintext(baseLength);
  for (size_t i = 0; i < prefixLength; ++i) {
    EXPECT_EQ(result[i], prefix[i]);
  }
  for (size_t i = prefixLength; i < baseLength; ++i) {
    EXPECT_EQ(result[i], original[i]);
  }
  // Check if the gap is filled with zeroes.
  for (size_t i = baseLength; i < writePos; ++i) {
    EXPECT_EQ(result[i], 0);
  }
  for (size_t i = 0; i < dataLength; ++i) {
    EXPECT_EQ(result[writePos + i], data[i]);
  }
}

// --- Cursor position, buffering, and edge cases ---

// NOTE: The data is encrypted on |Flush()|, so a failure appears there
// rather than on |Write()|.
TEST(EncryptedRandomAccessStreamTest,
     EncryptedRandomAccessStream_writeFailsWhenEncryptionFails)
{
  auto res = CreateEncryptedFileStream();
  ASSERT_TRUE(res.isOk());

  auto fileStream = res.unwrap();
  ASSERT_TRUE(fileStream.mStream);

  EncryptFailingDummyRandomAccessCipherStrategy strategy;
  auto streamRes = EncryptedRandomAccessStream<
      EncryptFailingDummyRandomAccessCipherStrategy>::
      Create(strategy, WrapNotNull(fileStream.mStream),
             EncryptFailingDummyRandomAccessCipherStrategy::KeyType{});
  ASSERT_TRUE(streamRes.isOk());

  auto stream = streamRes.unwrap();

  const auto pattern = CreateOverwritePattern(kTextLength / 2);
  uint32_t written = 0;
  ASSERT_EQ(stream->Write(reinterpret_cast<const char*>(pattern.data()),
                          pattern.size(), &written),
            NS_OK);
  ASSERT_EQ(written, pattern.size());

  EXPECT_EQ(stream->Flush(), NS_ERROR_CORRUPTED_CONTENT);
}

TEST(EncryptedRandomAccessStreamTest,
     EncryptedRandomAccessStream_writeWithZeroLengthChangesNothing)
{
  auto res = CreateEncryptedFileStream();
  ASSERT_TRUE(res.isOk());

  auto fileStream = res.unwrap();
  ASSERT_TRUE(fileStream.mStream);

  auto stream = CreateEncryptedRandomAccessStream(fileStream.mStream);

  std::array<char, 1> buf{'!'};
  uint32_t written = std::numeric_limits<uint32_t>::max();
  ASSERT_EQ(stream->Write(buf.data(), 0, &written), NS_OK);
  ASSERT_EQ(written, 0u);

  int64_t pos;
  ASSERT_EQ(stream->Tell(&pos), NS_OK);
  EXPECT_EQ(pos, 0);

  // The original data must be untouched by a zero-length write.
  const auto result = ReadDataFromStream(fileStream.mStream, kTextLength);
  const auto original = CreatePlaintext(kTextLength);
  EXPECT_EQ(result[0], original[0]);
}

TEST(EncryptedRandomAccessStreamTest,
     EncryptedRandomAccessStream_writeWithZeroLengthPastEndChangesNothing)
{
  constexpr size_t baseLength = kTextLength;
  constexpr uint32_t pastEndPos = kTextLength + 50;

  auto res = CreateEncryptedFileStream(baseLength);
  ASSERT_TRUE(res.isOk());

  auto fileStream = res.unwrap();
  ASSERT_TRUE(fileStream.mStream);

  {
    auto stream = CreateEncryptedRandomAccessStream(fileStream.mStream);

    ASSERT_EQ(stream->Seek(nsISeekableStream::NS_SEEK_SET, pastEndPos), NS_OK);

    std::array<char, 1> buf{'!'};
    uint32_t written = std::numeric_limits<uint32_t>::max();
    ASSERT_EQ(stream->Write(buf.data(), 0, &written), NS_OK);
    EXPECT_EQ(written, 0u);

    int64_t pos;
    ASSERT_EQ(stream->Tell(&pos), NS_OK);
    EXPECT_EQ(pos, static_cast<int64_t>(pastEndPos));

    ASSERT_EQ(stream->Seek(nsISeekableStream::NS_SEEK_SET, 0), NS_OK);
    uint64_t available = std::numeric_limits<uint64_t>::max();
    ASSERT_EQ(stream->Available(&available), NS_OK);
    EXPECT_EQ(available, uint64_t{baseLength});

    ASSERT_EQ(stream->Flush(), NS_OK);
  }

  {
    auto stream = CreateEncryptedRandomAccessStream(fileStream.mStream);
    uint64_t available = std::numeric_limits<uint64_t>::max();
    ASSERT_EQ(stream->Available(&available), NS_OK);
    EXPECT_EQ(available, uint64_t{baseLength});
  }

  const auto result = ReadDataFromStream(fileStream.mStream, baseLength);
  const auto original = CreatePlaintext(baseLength);
  for (size_t i = 0; i < baseLength; ++i) {
    EXPECT_EQ(result[i], original[i]);
  }
}

TEST_P(ParameterizedEncryptedRandomAccessStreamTest,
       EncryptedRandomAccessStream_writeAdvancesCursorPosition) {
  const auto textLength = GetParam();
  auto res = CreateEncryptedFileStream(textLength);
  ASSERT_TRUE(res.isOk());

  auto fileStream = res.unwrap();
  ASSERT_TRUE(fileStream.mStream);

  const auto firstLength = textLength / 2;
  const auto secondLength = textLength - firstLength;
  const auto pattern = CreateOverwritePattern(textLength);

  {
    auto stream = CreateEncryptedRandomAccessStream(fileStream.mStream);

    uint32_t written = 0;
    ASSERT_EQ(stream->Write(reinterpret_cast<const char*>(pattern.data()),
                            firstLength, &written),
              NS_OK);
    ASSERT_EQ(written, firstLength);

    int64_t pos;
    ASSERT_EQ(stream->Tell(&pos), NS_OK);
    EXPECT_EQ(pos, static_cast<int64_t>(firstLength));

    ASSERT_EQ(stream->Write(
                  reinterpret_cast<const char*>(pattern.data() + firstLength),
                  secondLength, &written),
              NS_OK);
    ASSERT_EQ(written, secondLength);

    ASSERT_EQ(stream->Tell(&pos), NS_OK);
    EXPECT_EQ(pos, static_cast<int64_t>(textLength));

    ASSERT_EQ(stream->Flush(), NS_OK);
  }

  const auto result = ReadDataFromStream(fileStream.mStream, textLength);
  for (size_t i = 0; i < textLength; ++i) {
    EXPECT_EQ(result[i], pattern[i]);
  }
}

// NOTE: A write is visible to a subsequent read on the same stream without an
// intervening |Flush()|, because both operate on the same in-memory block
// buffer. This test does not exercise the on-disk persistence path.
TEST(EncryptedRandomAccessStreamTest,
     EncryptedRandomAccessStream_writeIsVisibleToReadWithoutFlush)
{
  auto res = CreateEncryptedFileStream();
  ASSERT_TRUE(res.isOk());

  auto fileStream = res.unwrap();
  ASSERT_TRUE(fileStream.mStream);

  auto stream = CreateEncryptedRandomAccessStream(fileStream.mStream);

  const auto pattern = CreateOverwritePattern(kTextLength / 2);
  uint32_t written = 0;
  ASSERT_EQ(stream->Write(reinterpret_cast<const char*>(pattern.data()),
                          pattern.size(), &written),
            NS_OK);
  ASSERT_EQ(written, pattern.size());

  ASSERT_EQ(stream->Seek(nsISeekableStream::NS_SEEK_CUR, -kTextLength / 2),
            NS_OK);

  std::vector<char> result(pattern.size());
  uint32_t read = 0;
  ASSERT_EQ(stream->Read(result.data(), result.size(), &read), NS_OK);
  ASSERT_EQ(read, pattern.size());
  for (size_t i = 0; i < pattern.size(); ++i) {
    EXPECT_EQ(static_cast<uint8_t>(result[i]), pattern[i]);
  }
}

// -------------------------
// Tests covering the on-disk padding produced by Write()
// -------------------------

// A final block shorter than |MaxTextLength| must be padded out to the full
// length. The padding must start right after the text (not overwrite it) and
// must not be left as the original on-disk zeros (the write path fills it with
// random bytes so no stale data is exposed).
TEST(EncryptedRandomAccessStreamTest,
     EncryptedRandomAccessStream_writePadsFinalBlock)
{
  constexpr size_t textLength = kTextLength;

  auto res = CreateEncryptedFileStream(textLength);
  ASSERT_TRUE(res.isOk());

  auto fileStream = res.unwrap();
  ASSERT_TRUE(fileStream.mStream);

  const auto pattern = CreateOverwritePattern(textLength);

  {
    auto stream = CreateEncryptedRandomAccessStream(fileStream.mStream);

    uint32_t written = 0;
    ASSERT_EQ(stream->Write(reinterpret_cast<const char*>(pattern.data()),
                            pattern.size(), &written),
              NS_OK);
    ASSERT_EQ(written, textLength);

    ASSERT_EQ(stream->Flush(), NS_OK);
  }

  const auto block = ReadDecryptedBlock(fileStream.mFile, 0);
  ExpectPaddedFinalBlock(block, pattern);
}

// A brand new final block created by appending is padded out with random bytes,
// the same as an overwritten final block.
TEST(EncryptedRandomAccessStreamTest,
     EncryptedRandomAccessStream_writePadsNewlyAppendedFinalBlock)
{
  constexpr size_t baseLength = kMaxTextLength;
  constexpr size_t appendLength = kTextLength;

  auto res = CreateEncryptedFileStream(baseLength);
  ASSERT_TRUE(res.isOk());

  auto fileStream = res.unwrap();
  ASSERT_TRUE(fileStream.mStream);

  const auto pattern = CreateOverwritePattern(appendLength);

  {
    auto stream = CreateEncryptedRandomAccessStream(fileStream.mStream);

    ASSERT_EQ(stream->Seek(nsISeekableStream::NS_SEEK_END, 0), NS_OK);

    uint32_t written = 0;
    ASSERT_EQ(stream->Write(reinterpret_cast<const char*>(pattern.data()),
                            pattern.size(), &written),
              NS_OK);
    ASSERT_EQ(written, appendLength);

    ASSERT_EQ(stream->Flush(), NS_OK);
  }

  const auto block = ReadDecryptedBlock(fileStream.mFile, 1);
  ExpectPaddedFinalBlock(block, pattern);
}

// -------------------------
// Tests covering WriteSegments()
// -------------------------

TEST_P(
    ParameterizedEncryptedRandomAccessStreamTest,
    EncryptedRandomAccessStream_writeSegmentsWithPartialReaderConsumesRequestedData) {
  const auto textLength = GetParam();
  auto res = CreateEncryptedFileStream(textLength);
  ASSERT_TRUE(res.isOk());

  auto fileStream = res.unwrap();
  ASSERT_TRUE(fileStream.mStream);

  const auto pattern = CreateOverwritePattern(textLength);

  {
    auto stream = CreateEncryptedRandomAccessStream(fileStream.mStream);

    PartialSegmentReaderClosure closure(pattern);
    uint32_t written = 0;
    ASSERT_EQ(stream->WriteSegments(PartialSegmentReader, &closure, textLength,
                                    &written),
              NS_OK);
    ASSERT_EQ(written, textLength);
    EXPECT_EQ(closure.mRead, textLength);

    int64_t pos;
    ASSERT_EQ(stream->Tell(&pos), NS_OK);
    EXPECT_EQ(pos, static_cast<int64_t>(textLength));

    ASSERT_EQ(stream->Flush(), NS_OK);
  }

  const auto result = ReadDataFromStream(fileStream.mStream, textLength);
  for (size_t i = 0; i < textLength; ++i) {
    EXPECT_EQ(result[i], pattern[i]);
  }
}

TEST(
    EncryptedRandomAccessStreamTest,
    EncryptedRandomAccessStream_writeSegmentsSwallowsReaderErrorWithoutAdvancingPosition)
{
  auto res = CreateEncryptedFileStream();
  ASSERT_TRUE(res.isOk());

  auto fileStream = res.unwrap();
  ASSERT_TRUE(fileStream.mStream);

  auto stream = CreateEncryptedRandomAccessStream(fileStream.mStream);

  uint32_t written = std::numeric_limits<uint32_t>::max();
  ASSERT_EQ(
      stream->WriteSegments(ErrorSegmentReader, nullptr, kTextLength, &written),
      NS_OK);
  ASSERT_EQ(written, 0u);

  int64_t pos;
  ASSERT_EQ(stream->Tell(&pos), NS_OK);
  EXPECT_EQ(pos, 0);
}

// NOTE: nsIOutputStream.idl only lists "nothing left to write" and "reader
// returns an error" as stop conditions, but the current other implementations
// (e.g. |nsPipeOutputStream::WriteSegments|,
// |EncryptingOutputStream::WriteSegments|) treats a reader that produces zero
// bytes the same as an error: it stops, swallows the result, and keeps the
// progress already made. So a reader that produces 7 bytes on its first call
// and then reports zero must make |WriteSegments()| stop, succeed, and
// report 7.
TEST(
    EncryptedRandomAccessStreamTest,
    EncryptedRandomAccessStream_writeSegmentsStopsWhenReaderProvidesNoDataAndKeepsProgress)
{
  constexpr uint32_t kCap = 7;

  auto res = CreateEncryptedFileStream(kCap);
  ASSERT_TRUE(res.isOk());

  auto fileStream = res.unwrap();
  ASSERT_TRUE(fileStream.mStream);

  const auto pattern = CreateOverwritePattern(kTextLength);

  {
    auto stream = CreateEncryptedRandomAccessStream(fileStream.mStream);

    PartialSegmentReaderClosure closure(pattern, kCap);
    uint32_t written = std::numeric_limits<uint32_t>::max();
    ASSERT_EQ(stream->WriteSegments(PartialSegmentReader, &closure, kTextLength,
                                    &written),
              NS_OK);
    EXPECT_EQ(written, kCap);
    EXPECT_EQ(closure.mRead, kCap);

    int64_t pos;
    ASSERT_EQ(stream->Tell(&pos), NS_OK);
    EXPECT_EQ(pos, static_cast<int64_t>(kCap));

    ASSERT_EQ(stream->Flush(), NS_OK);
  }

  {
    auto stream = CreateEncryptedRandomAccessStream(fileStream.mStream);

    uint64_t available = 0;
    ASSERT_EQ(stream->Available(&available), NS_OK);
    EXPECT_EQ(available, kCap);
  }

  const auto result = ReadDataFromStream(fileStream.mStream, kCap);
  for (size_t i = 0; i < kCap; ++i) {
    EXPECT_EQ(result[i], pattern[i]);
  }
}

TEST(
    EncryptedRandomAccessStreamTest,
    EncryptedRandomAccessStream_writeSegmentsNoDataOnEmptyStreamDoesNotCreateBlock)
{
  auto res = CreateEncryptedFileStream(0);
  ASSERT_TRUE(res.isOk());

  auto fileStream = res.unwrap();
  ASSERT_TRUE(fileStream.mStream);

  const auto pattern = CreateOverwritePattern(kTextLength);

  {
    auto stream = CreateEncryptedRandomAccessStream(fileStream.mStream);

    PartialSegmentReaderClosure closure(pattern, 0);
    uint32_t written = std::numeric_limits<uint32_t>::max();
    ASSERT_EQ(stream->WriteSegments(PartialSegmentReader, &closure, kTextLength,
                                    &written),
              NS_OK);
    EXPECT_EQ(written, 0u);
    EXPECT_EQ(closure.mRead, 0u);

    int64_t pos;
    ASSERT_EQ(stream->Tell(&pos), NS_OK);
    EXPECT_EQ(pos, 0);

    ASSERT_EQ(stream->Flush(), NS_OK);
  }

  ASSERT_EQ(fileStream.mStream->Seek(nsISeekableStream::NS_SEEK_END, 0), NS_OK);
  int64_t physicalSize = -1;
  ASSERT_EQ(fileStream.mStream->Tell(&physicalSize), NS_OK);
  EXPECT_EQ(physicalSize, 0);
}

// -------------------------
// Tests covering Flush()
// -------------------------

TEST(EncryptedRandomAccessStreamTest,
     EncryptedRandomAccessStream_flushWithoutWriteSucceedsAndKeepsData)
{
  auto res = CreateEncryptedFileStream();
  ASSERT_TRUE(res.isOk());

  auto fileStream = res.unwrap();
  ASSERT_TRUE(fileStream.mStream);

  {
    auto stream = CreateEncryptedRandomAccessStream(fileStream.mStream);
    EXPECT_EQ(stream->Flush(), NS_OK);
  }

  const auto result = ReadDataFromStream(fileStream.mStream, kTextLength);
  const auto original = CreatePlaintext(kTextLength);
  for (size_t i = 0; i < kTextLength; ++i) {
    EXPECT_EQ(result[i], original[i]);
  }
}

TEST(EncryptedRandomAccessStreamTest,
     EncryptedRandomAccessStream_flushIsIdempotent)
{
  auto res = CreateEncryptedFileStream();
  ASSERT_TRUE(res.isOk());

  auto fileStream = res.unwrap();
  ASSERT_TRUE(fileStream.mStream);

  const uint32_t prefixLength = kTextLength / 2;
  const auto pattern = CreateOverwritePattern(prefixLength);

  {
    auto stream = CreateEncryptedRandomAccessStream(fileStream.mStream);

    uint32_t written = 0;
    ASSERT_EQ(stream->Write(reinterpret_cast<const char*>(pattern.data()),
                            pattern.size(), &written),
              NS_OK);
    ASSERT_EQ(written, prefixLength);

    EXPECT_EQ(stream->Flush(), NS_OK);
    EXPECT_EQ(stream->Flush(), NS_OK);
  }

  const auto result = ReadDataFromStream(fileStream.mStream, kTextLength);
  const auto original = CreatePlaintext(kTextLength);
  for (size_t i = 0; i < prefixLength; ++i) {
    EXPECT_EQ(result[i], pattern[i]);
  }
  for (size_t i = prefixLength; i < kTextLength; ++i) {
    EXPECT_EQ(result[i], original[i]);
  }
}

// -------------------------
// Tests covering SetEOF()
// -------------------------
//
// SetEOF() resizes the stream to the current cursor position. A resize is one
// of three kinds: shrinking (truncation), leaving the size unchanged (a no-op),
// or expanding (growing with a zero-filled region).
//
// The tests are organized in two layers:
//
//   1. A systematic resize matrix (one parameterized case per start/target
//      geometry) that drives the plain "seek, SetEOF(), read back" path. It
//      covers shrinking, no-op and expanding from empty, mid-block and
//      block-aligned starts, and folds in the on-disk block count, the logical
//      round-trip through a freshly reopened file, and the partial-final-block
//      padding check.
//   2. Cases the above matrix cannot reach because they involve writes,
//      in-memory buffered blocks, reusing the same stream object after a
//      resize, or a closed stream.

// --- Systematic resize matrix (start geometry x target geometry) ---

// Each case starts from a stream of |mStartSize| bytes, seeks to |mTargetSize|
// and calls SetEOF(). It then verifies the new size on the working stream, the
// on-disk block count, and -- after reopening the file from disk -- the new
// size and content (original prefix preserved, grown region zero-filled). A
// partial final block additionally has its on-disk padding checked: it must be
// the cipher's (non-zero) padding rather than logical zeros.

TEST_P(SetEOFResizeEncryptedRandomAccessStreamTest,
       EncryptedRandomAccessStream_setEOFResizeMatrix) {
  const size_t startSize = GetParam().mStartSize;
  const size_t targetSize = GetParam().mTargetSize;

  auto res = CreateEncryptedFileStream(startSize, kGapFillSentinelPadding);
  ASSERT_TRUE(res.isOk());

  auto fileStream = res.unwrap();
  ASSERT_TRUE(fileStream.mStream);

  const auto original = CreatePlaintext(startSize);
  TestPlaintext expected(targetSize);
  for (size_t i = 0; i < targetSize; ++i) {
    expected[i] = i < startSize ? original[i] : 0;
  }

  {
    auto stream = CreateEncryptedRandomAccessStream(fileStream.mStream);

    ASSERT_EQ(stream->Seek(nsISeekableStream::NS_SEEK_SET,
                           static_cast<int64_t>(targetSize)),
              NS_OK);
    ASSERT_EQ(stream->SetEOF(), NS_OK);

    // The new logical size is observable from the start of the stream.
    ASSERT_EQ(stream->Seek(nsISeekableStream::NS_SEEK_SET, 0), NS_OK);
    uint64_t available = std::numeric_limits<uint64_t>::max();
    ASSERT_EQ(stream->Available(&available), NS_OK);
    EXPECT_EQ(available, static_cast<uint64_t>(targetSize));

    ASSERT_EQ(stream->Flush(), NS_OK);
  }

  // The base file holds exactly the blocks needed to back |targetSize|.
  const size_t blockCount = (targetSize + kMaxTextLength - 1) / kMaxTextLength;
  ASSERT_EQ(fileStream.mStream->Seek(nsISeekableStream::NS_SEEK_END, 0), NS_OK);
  int64_t physicalSize = -1;
  ASSERT_EQ(fileStream.mStream->Tell(&physicalSize), NS_OK);
  EXPECT_EQ(
      physicalSize,
      static_cast<int64_t>(blockCount * EncryptedRandomAccessBlock::BlockSize));

  // Reopening the file from disk reports the new size and returns the expected
  // content: the original prefix is preserved and any grown region is
  // zero-filled (never the sentinel padding present on disk).
  {
    nsCOMPtr<nsIRandomAccessStream> base;
    ASSERT_EQ(NS_NewLocalFileRandomAccessStream(getter_AddRefs(base),
                                                fileStream.mFile),
              NS_OK);
    auto stream = CreateEncryptedRandomAccessStream(base);

    uint64_t available = std::numeric_limits<uint64_t>::max();
    ASSERT_EQ(stream->Available(&available), NS_OK);
    EXPECT_EQ(available, static_cast<uint64_t>(targetSize));

    std::vector<char> buf(targetSize);
    uint32_t read = std::numeric_limits<uint32_t>::max();
    ASSERT_EQ(stream->Read(buf.data(), buf.size(), &read), NS_OK);
    ASSERT_EQ(read, static_cast<uint32_t>(targetSize));
    for (size_t i = 0; i < targetSize; ++i) {
      EXPECT_EQ(static_cast<uint8_t>(buf[i]), expected[i]) << "byte " << i;
    }
  }

  // A partial final block must be padded on disk with the cipher's (non-zero)
  // padding, not with logical zeros.
  if (targetSize > 0 && targetSize % kMaxTextLength != 0) {
    const size_t finalBlockIndex = (targetSize - 1) / kMaxTextLength;
    const TestPlaintext finalBlockText(
        expected.begin() + finalBlockIndex * kMaxTextLength, expected.end());
    const auto block = ReadDecryptedBlock(fileStream.mFile, finalBlockIndex);
    ExpectPaddedFinalBlock(block, finalBlockText);
  }
}

// --- Truncation that discards a buffered dirty block above the new end ---

TEST(EncryptedRandomAccessStreamTest,
     EncryptedRandomAccessStream_setEOFTruncateDropsDirtyBlockAboveNewEnd)
{
  auto res =
      CreateEncryptedFileStream(kSetEOFOriginalSize, kGapFillSentinelPadding);
  ASSERT_TRUE(res.isOk());

  auto fileStream = res.unwrap();
  ASSERT_TRUE(fileStream.mStream);

  const auto pattern = CreateOverwritePattern(kTextLength);

  {
    auto stream = CreateEncryptedRandomAccessStream(fileStream.mStream);

    // Dirty the second block, then cut the stream back to the first block
    // boundary so that dirty block is discarded.
    ASSERT_EQ(stream->Seek(nsISeekableStream::NS_SEEK_SET,
                           static_cast<int64_t>(kMaxTextLength + 10)),
              NS_OK);
    uint32_t written = 0;
    ASSERT_EQ(stream->Write(reinterpret_cast<const char*>(pattern.data()),
                            pattern.size(), &written),
              NS_OK);
    ASSERT_EQ(written, kTextLength);

    ASSERT_EQ(stream->Seek(nsISeekableStream::NS_SEEK_SET,
                           static_cast<int64_t>(kMaxTextLength)),
              NS_OK);
    ASSERT_EQ(stream->SetEOF(), NS_OK);

    ASSERT_EQ(stream->Flush(), NS_OK);
  }

  // Exactly one block must remain on disk; the discarded dirty block must not
  // have been written back.
  ASSERT_EQ(fileStream.mStream->Seek(nsISeekableStream::NS_SEEK_END, 0), NS_OK);
  int64_t physicalSize = -1;
  ASSERT_EQ(fileStream.mStream->Tell(&physicalSize), NS_OK);
  EXPECT_EQ(physicalSize,
            static_cast<int64_t>(EncryptedRandomAccessBlock::BlockSize));

  // The surviving block still holds the original first-block content.
  const auto original = CreatePlaintext(kSetEOFOriginalSize);
  const auto result = ReadDataFromStream(fileStream.mStream, kMaxTextLength);
  for (size_t i = 0; i < kMaxTextLength; ++i) {
    EXPECT_EQ(result[i], original[i]) << "byte " << i;
  }
}

// --- Truncation that flushes a dirty block below the new end ---

TEST(EncryptedRandomAccessStreamTest,
     EncryptedRandomAccessStream_setEOFTruncateFlushesDirtyBlockBelowNewEnd)
{
  constexpr size_t truncatedSize = kMaxTextLength + kMaxTextLength / 4;

  auto res =
      CreateEncryptedFileStream(kSetEOFOriginalSize, kGapFillSentinelPadding);
  ASSERT_TRUE(res.isOk());

  auto fileStream = res.unwrap();
  ASSERT_TRUE(fileStream.mStream);

  const auto original = CreatePlaintext(kSetEOFOriginalSize);
  const auto pattern = CreateOverwritePattern(kTextLength);

  {
    auto stream = CreateEncryptedRandomAccessStream(fileStream.mStream);

    uint32_t written = 0;
    ASSERT_EQ(stream->Write(reinterpret_cast<const char*>(pattern.data()),
                            pattern.size(), &written),
              NS_OK);
    ASSERT_EQ(written, kTextLength);

    // Truncate into the middle of block 1. SetEOF() must save the dirty block 0
    // before loading block 1 for truncation, otherwise the overwrite is lost.
    ASSERT_EQ(stream->Seek(nsISeekableStream::NS_SEEK_SET,
                           static_cast<int64_t>(truncatedSize)),
              NS_OK);
    ASSERT_EQ(stream->SetEOF(), NS_OK);

    ASSERT_EQ(stream->Flush(), NS_OK);
  }

  // Two blocks remain: block 0 and the truncated block 1.
  ASSERT_EQ(fileStream.mStream->Seek(nsISeekableStream::NS_SEEK_END, 0), NS_OK);
  int64_t physicalSize = -1;
  ASSERT_EQ(fileStream.mStream->Tell(&physicalSize), NS_OK);
  EXPECT_EQ(physicalSize,
            static_cast<int64_t>(2 * EncryptedRandomAccessBlock::BlockSize));

  // Block 0's overwrite survived, proving the dirty block was saved before
  // block 1 was loaded for truncation. The rest is the original content up to
  // the new end.
  const auto result = ReadDataFromStream(fileStream.mStream, truncatedSize);
  for (size_t i = 0; i < truncatedSize; ++i) {
    const uint8_t expected = i < kTextLength ? pattern[i] : original[i];
    EXPECT_EQ(result[i], expected) << "byte " << i;
  }
}

// --- Expanding within a still-buffered (unflushed) block ---

TEST_P(SetEOFBufferedExpandEncryptedRandomAccessStreamTest,
       EncryptedRandomAccessStream_setEOFExpandWithinBufferedBlock) {
  const size_t writeLength = GetParam().mWriteLength;
  const size_t targetSize = GetParam().mTargetSize;

  auto res = CreateEncryptedFileStream(0, kGapFillSentinelPadding);
  ASSERT_TRUE(res.isOk());

  auto fileStream = res.unwrap();
  ASSERT_TRUE(fileStream.mStream);

  const auto pattern = CreateOverwritePattern(writeLength);

  {
    auto stream = CreateEncryptedRandomAccessStream(fileStream.mStream);

    // Write a partial block that is never flushed, so SetEOF() expands within a
    // block still buffered in memory.
    uint32_t written = 0;
    ASSERT_EQ(stream->Write(reinterpret_cast<const char*>(pattern.data()),
                            pattern.size(), &written),
              NS_OK);
    ASSERT_EQ(written, static_cast<uint32_t>(writeLength));

    ASSERT_EQ(stream->Seek(nsISeekableStream::NS_SEEK_SET,
                           static_cast<int64_t>(targetSize)),
              NS_OK);
    ASSERT_EQ(stream->SetEOF(), NS_OK);

    ASSERT_EQ(stream->Flush(), NS_OK);
  }

  const auto result = ReadDataFromStream(fileStream.mStream, targetSize);
  // The buffered write must survive and the grown region must be zero-filled.
  for (size_t i = 0; i < writeLength; ++i) {
    EXPECT_EQ(result[i], pattern[i]);
  }
  for (size_t i = writeLength; i < targetSize; ++i) {
    EXPECT_EQ(result[i], 0) << "grown byte at " << i << " must be zero-filled";
  }
}

// --- Truncating within a still-buffered (unflushed) new block ---

TEST(EncryptedRandomAccessStreamTest,
     EncryptedRandomAccessStream_setEOFTruncateWithinBufferedNewBlock)
{
  constexpr size_t originalSize = kMaxTextLength;
  constexpr size_t writeLength = kTextLength;
  constexpr size_t truncatedSize = originalSize + writeLength / 2;

  auto res = CreateEncryptedFileStream(originalSize, kGapFillSentinelPadding);
  ASSERT_TRUE(res.isOk());

  auto fileStream = res.unwrap();
  ASSERT_TRUE(fileStream.mStream);

  const auto original = CreatePlaintext(originalSize);
  const auto pattern = CreateOverwritePattern(writeLength);

  {
    auto stream = CreateEncryptedRandomAccessStream(fileStream.mStream);

    ASSERT_EQ(stream->Seek(nsISeekableStream::NS_SEEK_END, 0), NS_OK);
    uint32_t written = 0;
    ASSERT_EQ(stream->Write(reinterpret_cast<const char*>(pattern.data()),
                            pattern.size(), &written),
              NS_OK);
    ASSERT_EQ(written, writeLength);

    ASSERT_EQ(stream->Seek(nsISeekableStream::NS_SEEK_SET,
                           static_cast<int64_t>(truncatedSize)),
              NS_OK);
    ASSERT_EQ(stream->SetEOF(), NS_OK);

    // The truncated size is observable on the same stream.
    ASSERT_EQ(stream->Seek(nsISeekableStream::NS_SEEK_SET, 0), NS_OK);
    uint64_t available = std::numeric_limits<uint64_t>::max();
    ASSERT_EQ(stream->Available(&available), NS_OK);
    EXPECT_EQ(available, static_cast<uint64_t>(truncatedSize));

    ASSERT_EQ(stream->Flush(), NS_OK);
  }

  const auto result = ReadDataFromStream(fileStream.mStream, truncatedSize);
  for (size_t i = 0; i < originalSize; ++i) {
    EXPECT_EQ(result[i], original[i]);
  }
  for (size_t i = originalSize; i < truncatedSize; ++i) {
    EXPECT_EQ(result[i], pattern[i - originalSize]);
  }
}

// --- Continuing to use the same stream in various ways after SetEOF() ---

TEST(EncryptedRandomAccessStreamTest,
     EncryptedRandomAccessStream_setEOFTruncateThenAppendOnSameStream)
{
  constexpr size_t truncatedSize = kMaxTextLength / 2;
  constexpr size_t writeLength = kMaxTextLength + kTextLength;
  constexpr size_t finalSize = truncatedSize + writeLength;

  auto res =
      CreateEncryptedFileStream(kSetEOFOriginalSize, kGapFillSentinelPadding);
  ASSERT_TRUE(res.isOk());

  auto fileStream = res.unwrap();
  ASSERT_TRUE(fileStream.mStream);

  const auto pattern = CreateOverwritePattern(writeLength);

  {
    auto stream = CreateEncryptedRandomAccessStream(fileStream.mStream);

    ASSERT_EQ(stream->Seek(nsISeekableStream::NS_SEEK_SET,
                           static_cast<int64_t>(truncatedSize)),
              NS_OK);
    ASSERT_EQ(stream->SetEOF(), NS_OK);

    // The truncated size is observable on the same stream.
    ASSERT_EQ(stream->Seek(nsISeekableStream::NS_SEEK_SET, 0), NS_OK);
    uint64_t available = std::numeric_limits<uint64_t>::max();
    ASSERT_EQ(stream->Available(&available), NS_OK);
    EXPECT_EQ(available, static_cast<uint64_t>(truncatedSize));

    // Append from the new end on the same stream.
    ASSERT_EQ(stream->Seek(nsISeekableStream::NS_SEEK_END, 0), NS_OK);
    uint32_t written = 0;
    ASSERT_EQ(stream->Write(reinterpret_cast<const char*>(pattern.data()),
                            pattern.size(), &written),
              NS_OK);
    ASSERT_EQ(written, writeLength);

    ASSERT_EQ(stream->Flush(), NS_OK);
  }

  const auto original = CreatePlaintext(kSetEOFOriginalSize);
  const auto result = ReadDataFromStream(fileStream.mStream, finalSize);
  for (size_t i = 0; i < truncatedSize; ++i) {
    EXPECT_EQ(result[i], original[i]);
  }
  for (size_t i = truncatedSize; i < truncatedSize + writeLength; ++i) {
    EXPECT_EQ(result[i], pattern[i - truncatedSize]);
  }
}

TEST(EncryptedRandomAccessStreamTest,
     EncryptedRandomAccessStream_setEOFTruncateThenExpandOnSameStream)
{
  constexpr size_t originalSize = 2 * kMaxTextLength + kMaxTextLength / 2;
  constexpr size_t shrunkSize = kMaxTextLength / 2;
  constexpr size_t expandedSize = kMaxTextLength + 4 * kMaxTextLength / 5;

  auto res = CreateEncryptedFileStream(originalSize, kGapFillSentinelPadding);
  ASSERT_TRUE(res.isOk());

  auto fileStream = res.unwrap();
  ASSERT_TRUE(fileStream.mStream);

  {
    auto stream = CreateEncryptedRandomAccessStream(fileStream.mStream);

    ASSERT_EQ(stream->Seek(nsISeekableStream::NS_SEEK_SET,
                           static_cast<int64_t>(shrunkSize)),
              NS_OK);
    ASSERT_EQ(stream->SetEOF(), NS_OK);

    ASSERT_EQ(stream->Seek(nsISeekableStream::NS_SEEK_SET,
                           static_cast<int64_t>(expandedSize)),
              NS_OK);
    ASSERT_EQ(stream->SetEOF(), NS_OK);

    ASSERT_EQ(stream->Flush(), NS_OK);
  }

  const auto original = CreatePlaintext(originalSize);
  const auto result = ReadDataFromStream(fileStream.mStream, expandedSize);
  for (size_t i = 0; i < shrunkSize; ++i) {
    EXPECT_EQ(result[i], original[i]);
  }
  for (size_t i = shrunkSize; i < expandedSize; ++i) {
    EXPECT_EQ(result[i], 0)
        << "re-grown byte at " << i << " must be zero-filled";
  }
}

TEST(
    EncryptedRandomAccessStreamTest,
    EncryptedRandomAccessStream_setEOFTruncateThenAppendThenTruncateOnSameStream)
{
  constexpr size_t truncatedSize = kMaxTextLength / 2;
  constexpr size_t writeLength = kMaxTextLength + kTextLength;
  constexpr size_t retruncatedSize = kMaxTextLength + kTextLength / 2;

  auto res =
      CreateEncryptedFileStream(kSetEOFOriginalSize, kGapFillSentinelPadding);
  ASSERT_TRUE(res.isOk());

  auto fileStream = res.unwrap();
  ASSERT_TRUE(fileStream.mStream);

  const auto pattern = CreateOverwritePattern(writeLength);

  {
    auto stream = CreateEncryptedRandomAccessStream(fileStream.mStream);

    ASSERT_EQ(stream->Seek(nsISeekableStream::NS_SEEK_SET,
                           static_cast<int64_t>(truncatedSize)),
              NS_OK);
    ASSERT_EQ(stream->SetEOF(), NS_OK);

    ASSERT_EQ(stream->Seek(nsISeekableStream::NS_SEEK_END, 0), NS_OK);
    uint32_t written = 0;
    ASSERT_EQ(stream->Write(reinterpret_cast<const char*>(pattern.data()),
                            pattern.size(), &written),
              NS_OK);
    ASSERT_EQ(written, writeLength);

    // Truncate again within that just-appended, still-buffered block.
    ASSERT_EQ(stream->Seek(nsISeekableStream::NS_SEEK_SET,
                           static_cast<int64_t>(retruncatedSize)),
              NS_OK);
    ASSERT_EQ(stream->SetEOF(), NS_OK);

    ASSERT_EQ(stream->Flush(), NS_OK);
  }

  // Reopening from disk reports exactly the new length, so the truncated append
  // tail did not persist beyond the new end.
  {
    auto stream = CreateEncryptedRandomAccessStream(fileStream.mStream);
    uint64_t available = std::numeric_limits<uint64_t>::max();
    ASSERT_EQ(stream->Available(&available), NS_OK);
    EXPECT_EQ(available, static_cast<uint64_t>(retruncatedSize));
  }

  const auto original = CreatePlaintext(kSetEOFOriginalSize);
  const auto result = ReadDataFromStream(fileStream.mStream, retruncatedSize);
  for (size_t i = 0; i < truncatedSize; ++i) {
    EXPECT_EQ(result[i], original[i]);
  }
  for (size_t i = truncatedSize; i < retruncatedSize; ++i) {
    EXPECT_EQ(result[i], pattern[i - truncatedSize]);
  }
}

TEST(EncryptedRandomAccessStreamTest,
     EncryptedRandomAccessStream_setEOFExpandThenReadThenAppendOnSameStream)
{
  constexpr size_t originalSize = kMaxTextLength + kMaxTextLength / 2;
  constexpr size_t expandedSize = 2 * kMaxTextLength + kMaxTextLength / 2;
  constexpr uint32_t appendLength = 40;
  const size_t finalSize = expandedSize + appendLength;

  auto res = CreateEncryptedFileStream(originalSize, kGapFillSentinelPadding);
  ASSERT_TRUE(res.isOk());

  auto fileStream = res.unwrap();
  ASSERT_TRUE(fileStream.mStream);

  const auto original = CreatePlaintext(originalSize);
  const auto pattern = CreateOverwritePattern(appendLength);

  {
    auto stream = CreateEncryptedRandomAccessStream(fileStream.mStream);

    ASSERT_EQ(stream->Seek(nsISeekableStream::NS_SEEK_SET,
                           static_cast<int64_t>(expandedSize)),
              NS_OK);
    ASSERT_EQ(stream->SetEOF(), NS_OK);

    // Read back the whole stream on the same object: original then zeros.
    ASSERT_EQ(stream->Seek(nsISeekableStream::NS_SEEK_SET, 0), NS_OK);
    std::vector<char> buf(expandedSize);
    uint32_t read = 0;
    ASSERT_EQ(stream->Read(buf.data(), buf.size(), &read), NS_OK);
    ASSERT_EQ(read, static_cast<uint32_t>(expandedSize));
    for (size_t i = 0; i < originalSize; ++i) {
      EXPECT_EQ(static_cast<uint8_t>(buf[i]), original[i]);
    }
    for (size_t i = originalSize; i < expandedSize; ++i) {
      EXPECT_EQ(static_cast<uint8_t>(buf[i]), 0) << "gap byte " << i;
    }

    // Append from the new end on the same stream.
    ASSERT_EQ(stream->Seek(nsISeekableStream::NS_SEEK_END, 0), NS_OK);
    uint32_t written = 0;
    ASSERT_EQ(stream->Write(reinterpret_cast<const char*>(pattern.data()),
                            pattern.size(), &written),
              NS_OK);
    ASSERT_EQ(written, appendLength);

    ASSERT_EQ(stream->Flush(), NS_OK);
  }

  const auto result = ReadDataFromStream(fileStream.mStream, finalSize);
  for (size_t i = 0; i < originalSize; ++i) {
    EXPECT_EQ(result[i], original[i]);
  }
  for (size_t i = originalSize; i < expandedSize; ++i) {
    EXPECT_EQ(result[i], 0);
  }
  for (size_t i = expandedSize; i < expandedSize + appendLength; ++i) {
    EXPECT_EQ(result[i], pattern[i - expandedSize]);
  }
}

TEST(EncryptedRandomAccessStreamTest,
     EncryptedRandomAccessStream_setEOFExpandThenWriteOnSameStream)
{
  constexpr size_t originalSize = kMaxTextLength + kMaxTextLength / 2;
  constexpr size_t expandedSize = 2 * kMaxTextLength + kMaxTextLength / 2;
  constexpr size_t writePos = 2 * kMaxTextLength;
  constexpr uint32_t writeLength = 50;

  auto res = CreateEncryptedFileStream(originalSize, kGapFillSentinelPadding);
  ASSERT_TRUE(res.isOk());

  auto fileStream = res.unwrap();
  ASSERT_TRUE(fileStream.mStream);

  const auto original = CreatePlaintext(originalSize);
  const auto pattern = CreateOverwritePattern(writeLength);

  {
    auto stream = CreateEncryptedRandomAccessStream(fileStream.mStream);

    ASSERT_EQ(stream->Seek(nsISeekableStream::NS_SEEK_SET,
                           static_cast<int64_t>(expandedSize)),
              NS_OK);
    ASSERT_EQ(stream->SetEOF(), NS_OK);

    ASSERT_EQ(stream->Seek(nsISeekableStream::NS_SEEK_SET,
                           static_cast<int64_t>(writePos)),
              NS_OK);
    uint32_t written = 0;
    ASSERT_EQ(stream->Write(reinterpret_cast<const char*>(pattern.data()),
                            pattern.size(), &written),
              NS_OK);
    ASSERT_EQ(written, writeLength);

    ASSERT_EQ(stream->Flush(), NS_OK);
  }

  const auto result = ReadDataFromStream(fileStream.mStream, expandedSize);
  for (size_t i = 0; i < originalSize; ++i) {
    EXPECT_EQ(result[i], original[i]);
  }
  for (size_t i = originalSize; i < writePos; ++i) {
    EXPECT_EQ(result[i], 0) << "gap byte before write at " << i;
  }
  for (size_t i = writePos; i < writePos + writeLength; ++i) {
    EXPECT_EQ(result[i], pattern[i - writePos]);
  }
  for (size_t i = writePos + writeLength; i < expandedSize; ++i) {
    EXPECT_EQ(result[i], 0) << "gap byte after write at " << i;
  }
}

// --- Calling SetEOF() on a closed stream ---

TEST(EncryptedRandomAccessStreamTest,
     EncryptedRandomAccessStream_setEOFOnClosedStreamReturnsClosed)
{
  auto res = CreateEncryptedFileStream(kSetEOFOriginalSize);
  ASSERT_TRUE(res.isOk());

  auto fileStream = res.unwrap();
  ASSERT_TRUE(fileStream.mStream);

  auto stream = CreateEncryptedRandomAccessStream(fileStream.mStream);

  ASSERT_EQ(stream->Close(), NS_OK);

  EXPECT_EQ(stream->SetEOF(), NS_BASE_STREAM_CLOSED);
}

// -------------------------
// Tests covering Close()
// -------------------------

TEST(EncryptedRandomAccessStreamTest,
     EncryptedRandomAccessStream_closeFlushesDirtyBlock)
{
  auto res = CreateEncryptedFileStream();
  ASSERT_TRUE(res.isOk());

  auto fileStream = res.unwrap();
  ASSERT_TRUE(fileStream.mStream);

  const uint32_t prefixLength = kTextLength / 2;
  const auto pattern = CreateOverwritePattern(prefixLength);

  {
    auto stream = CreateEncryptedRandomAccessStream(fileStream.mStream);

    uint32_t written = 0;
    ASSERT_EQ(stream->Write(reinterpret_cast<const char*>(pattern.data()),
                            pattern.size(), &written),
              NS_OK);
    ASSERT_EQ(written, prefixLength);

    // NOTE: No explicit |Flush()|; |Close()| must flush the dirty block.
    ASSERT_EQ(stream->Close(), NS_OK);
  }

  const auto result = ReadDataFromFile(fileStream.mFile, kTextLength);
  const auto original = CreatePlaintext(kTextLength);
  for (size_t i = 0; i < prefixLength; ++i) {
    EXPECT_EQ(result[i], pattern[i]);
  }
  for (size_t i = prefixLength; i < kTextLength; ++i) {
    EXPECT_EQ(result[i], original[i]);
  }
}

TEST(EncryptedRandomAccessStreamTest,
     EncryptedRandomAccessStream_closeUpdatesStreamStatus)
{
  auto res = CreateEncryptedFileStream();
  ASSERT_TRUE(res.isOk());

  auto fileStream = res.unwrap();
  ASSERT_TRUE(fileStream.mStream);

  auto stream = CreateEncryptedRandomAccessStream(fileStream.mStream);

  ASSERT_EQ(stream->StreamStatus(), NS_OK);
  ASSERT_EQ(stream->Close(), NS_OK);

  // It's ok to call |Close()| more than once.
  ASSERT_EQ(stream->Close(), NS_OK);

  std::array<char, 1> buf{};
  uint32_t read = std::numeric_limits<uint32_t>::max();
  ASSERT_EQ(stream->Read(buf.data(), buf.size(), &read), NS_OK);
  EXPECT_EQ(read, 0u);

  uint32_t written = std::numeric_limits<uint32_t>::max();
  EXPECT_EQ(stream->Write(buf.data(), buf.size(), &written),
            NS_BASE_STREAM_CLOSED);
  EXPECT_EQ(written, 0u);

  EXPECT_EQ(stream->Flush(), NS_BASE_STREAM_CLOSED);

  uint64_t available;
  EXPECT_EQ(stream->Available(&available), NS_BASE_STREAM_CLOSED);
  EXPECT_EQ(stream->StreamStatus(), NS_BASE_STREAM_CLOSED);
  EXPECT_EQ(stream->Seek(nsISeekableStream::NS_SEEK_SET, 0),
            NS_BASE_STREAM_CLOSED);

  int64_t pos;
  EXPECT_EQ(stream->Tell(&pos), NS_BASE_STREAM_CLOSED);

  bool nonBlocking;
  EXPECT_EQ(stream->IsNonBlocking(&nonBlocking), NS_OK);
  EXPECT_FALSE(nonBlocking);
}

// -------------------------
// Tests covering NSS round-trips
// -------------------------

TEST(
    EncryptedRandomAccessStreamTest,
    EncryptedRandomAccessStream_NSSRoundTripWriteFromPastEndAcrossBlocksCanBeReopened)
{
  constexpr uint32_t writePos = 2 * kMaxTextLength + 50;
  constexpr uint32_t dataLength = 60;
  constexpr size_t newLength = writePos + dataLength;

  auto keyRes = NSSRandomAccessCipherStrategy::GenerateKey();
  ASSERT_TRUE(keyRes.isOk());
  const auto key = keyRes.unwrap();

  auto res = CreateEncryptedFileStream(0);
  ASSERT_TRUE(res.isOk());

  auto fileStream = res.unwrap();
  ASSERT_TRUE(fileStream.mStream);

  const auto data = CreatePlaintext(dataLength);

  {
    NSSRandomAccessCipherStrategy strategy;
    ASSERT_EQ(strategy.Init(), NS_OK);
    nsCOMPtr<nsIRandomAccessStream> baseStream = fileStream.mStream;
    auto streamRes =
        EncryptedRandomAccessStream<NSSRandomAccessCipherStrategy>::Create(
            strategy, WrapNotNull(std::move(baseStream)), key);
    ASSERT_TRUE(streamRes.isOk());
    auto stream = streamRes.unwrap();

    ASSERT_EQ(stream->Seek(nsISeekableStream::NS_SEEK_SET, writePos), NS_OK);

    uint32_t written = 0;
    ASSERT_EQ(stream->Write(reinterpret_cast<const char*>(data.data()),
                            data.size(), &written),
              NS_OK);
    ASSERT_EQ(written, dataLength);

    ASSERT_EQ(stream->Flush(), NS_OK);
  }

  TestPlaintext result;
  {
    NSSRandomAccessCipherStrategy strategy;
    ASSERT_EQ(strategy.Init(), NS_OK);
    nsCOMPtr<nsIRandomAccessStream> baseStream = fileStream.mStream;
    auto streamRes =
        EncryptedRandomAccessStream<NSSRandomAccessCipherStrategy>::Create(
            strategy, WrapNotNull(std::move(baseStream)), key);
    ASSERT_TRUE(streamRes.isOk());
    auto stream = streamRes.unwrap();

    std::vector<char> buf(newLength);
    uint32_t read = 0;
    ASSERT_EQ(stream->Read(buf.data(), buf.size(), &read), NS_OK);
    ASSERT_EQ(read, static_cast<uint32_t>(newLength));
    result.assign(buf.begin(), buf.end());
  }

  for (size_t i = 0; i < writePos; ++i) {
    EXPECT_EQ(result[i], 0);
  }
  for (size_t i = 0; i < dataLength; ++i) {
    EXPECT_EQ(result[writePos + i], data[i]);
  }
}

INSTANTIATE_TEST_SUITE_P(EncryptedRandomAccessStreamTextLengths,
                         ParameterizedEncryptedRandomAccessStreamTest,
                         testing::Values(kTextLength, kMaxTextLength,
                                         kMaxTextLength + kTextLength),
                         [](const testing::TestParamInfo<size_t>& aInfo) {
                           switch (aInfo.param) {
                             case kTextLength:
                               return "PartialSingleBlock";
                             case kMaxTextLength:
                               return "FullSingleBlock";
                             case kMaxTextLength + kTextLength:
                               return "PartialSecondBlock";
                             default:
                               MOZ_CRASH("Unexpected text length.");
                           }
                         });

INSTANTIATE_TEST_SUITE_P(
    EncryptedRandomAccessStreamGapFillWritePositions,
    GapFillEncryptedRandomAccessStreamTest,
    testing::Values(kMaxTextLength - 50, kMaxTextLength + 50,
                    2 * kMaxTextLength, 2 * kMaxTextLength + kTextLength),
    [](const testing::TestParamInfo<size_t>& aInfo) -> std::string {
      if (aInfo.param == kMaxTextLength - 50) {
        return "WithinFirstBlock";
      }
      if (aInfo.param == kMaxTextLength + 50) {
        return "AcrossBlocks";
      }
      if (aInfo.param == 2 * kMaxTextLength) {
        return "AtBlockBoundary";
      }
      if (aInfo.param == 2 * kMaxTextLength + kTextLength) {
        return "SpanningMultipleBlocks";
      }
      MOZ_CRASH("Unexpected block geometry value.");
    });

INSTANTIATE_TEST_SUITE_P(
    EncryptedRandomAccessStreamWriteToEmptyStreamLengths,
    WriteToEmptyStreamEncryptedRandomAccessStreamTest,
    testing::Values(kMaxTextLength - 50, kMaxTextLength + 50,
                    2 * kMaxTextLength, 2 * kMaxTextLength + kTextLength),
    [](const testing::TestParamInfo<size_t>& aInfo) -> std::string {
      if (aInfo.param == kMaxTextLength - 50) {
        return "WithinFirstBlock";
      }
      if (aInfo.param == kMaxTextLength + 50) {
        return "AcrossBlocks";
      }
      if (aInfo.param == 2 * kMaxTextLength) {
        return "AtBlockBoundary";
      }
      if (aInfo.param == 2 * kMaxTextLength + kTextLength) {
        return "SpanningMultipleBlocks";
      }
      MOZ_CRASH("Unexpected block geometry value.");
    });

INSTANTIATE_TEST_SUITE_P(
    EncryptedRandomAccessStreamSetEOFResize,
    SetEOFResizeEncryptedRandomAccessStreamTest,
    testing::Values(
        // Start: 0 blocks (empty)
        SetEOFResizeCase{0, kMaxTextLength / 2, "EmptyExpandToHalfBlock"},
        SetEOFResizeCase{0, kMaxTextLength, "EmptyExpandToOneFull"},
        SetEOFResizeCase{0, kMaxTextLength + kMaxTextLength / 2,
                         "EmptyExpandToOneAndHalf"},
        SetEOFResizeCase{0, 2 * kMaxTextLength, "EmptyExpandToTwoFull"},
        SetEOFResizeCase{0, 2 * kMaxTextLength + kMaxTextLength / 2,
                         "EmptyExpandToTwoAndHalf"},

        // Start: 2.0 blocks (boundary)
        SetEOFResizeCase{2 * kMaxTextLength,
                         2 * kMaxTextLength + kMaxTextLength / 2,
                         "TwoFullExpandToNextBlockMid"},
        SetEOFResizeCase{2 * kMaxTextLength, 3 * kMaxTextLength,
                         "TwoFullExpandToNextBlockEnd"},
        SetEOFResizeCase{2 * kMaxTextLength,
                         3 * kMaxTextLength + kMaxTextLength / 2,
                         "TwoFullExpandToSecondNextBlockMid"},
        SetEOFResizeCase{2 * kMaxTextLength, 4 * kMaxTextLength,
                         "TwoFullExpandToSecondNextBlockEnd"},
        SetEOFResizeCase{2 * kMaxTextLength,
                         kMaxTextLength + kMaxTextLength / 2,
                         "TwoFullShrinkToCurrentBlockMid"},
        SetEOFResizeCase{2 * kMaxTextLength, kMaxTextLength,
                         "TwoFullShrinkToCurrentBlockStart"},
        SetEOFResizeCase{2 * kMaxTextLength, kMaxTextLength / 2,
                         "TwoFullShrinkToPrevBlockMid"},
        SetEOFResizeCase{2 * kMaxTextLength, 0, "TwoFullShrinkToEmpty"},
        SetEOFResizeCase{2 * kMaxTextLength, 2 * kMaxTextLength, "TwoFullNoOp"},

        // Start: 3.5 blocks (middle in a block)
        SetEOFResizeCase{3 * kMaxTextLength + kMaxTextLength / 2,
                         3 * kMaxTextLength + 4 * kMaxTextLength / 5,
                         "ThreeAndHalfExpandWithinCurrentBlock"},
        SetEOFResizeCase{3 * kMaxTextLength + kMaxTextLength / 2,
                         4 * kMaxTextLength,
                         "ThreeAndHalfExpandToCurrentBlockEnd"},
        SetEOFResizeCase{3 * kMaxTextLength + kMaxTextLength / 2,
                         4 * kMaxTextLength + kMaxTextLength / 2,
                         "ThreeAndHalfExpandToNextBlockMid"},
        SetEOFResizeCase{3 * kMaxTextLength + kMaxTextLength / 2,
                         5 * kMaxTextLength,
                         "ThreeAndHalfExpandToNextBlockEnd"},
        SetEOFResizeCase{3 * kMaxTextLength + kMaxTextLength / 2,
                         5 * kMaxTextLength + kMaxTextLength / 2,
                         "ThreeAndHalfExpandToSecondNextBlockMid"},
        SetEOFResizeCase{3 * kMaxTextLength + kMaxTextLength / 2,
                         6 * kMaxTextLength,
                         "ThreeAndHalfExpandToSecondNextBlockEnd"},
        SetEOFResizeCase{3 * kMaxTextLength + kMaxTextLength / 2,
                         3 * kMaxTextLength + kMaxTextLength / 5,
                         "ThreeAndHalfShrinkWithinCurrentBlock"},
        SetEOFResizeCase{3 * kMaxTextLength + kMaxTextLength / 2,
                         3 * kMaxTextLength,
                         "ThreeAndHalfShrinkToCurrentBlockStart"},
        SetEOFResizeCase{3 * kMaxTextLength + kMaxTextLength / 2,
                         2 * kMaxTextLength + kMaxTextLength / 2,
                         "ThreeAndHalfShrinkToPrevBlockMid"},
        SetEOFResizeCase{3 * kMaxTextLength + kMaxTextLength / 2,
                         2 * kMaxTextLength,
                         "ThreeAndHalfShrinkToPrevBlockStart"},
        SetEOFResizeCase{3 * kMaxTextLength + kMaxTextLength / 2,
                         kMaxTextLength + kMaxTextLength / 2,
                         "ThreeAndHalfShrinkToSecondPrevBlockMid"},
        SetEOFResizeCase{3 * kMaxTextLength + kMaxTextLength / 2,
                         kMaxTextLength,
                         "ThreeAndHalfShrinkToSecondPrevBlockStart"},
        SetEOFResizeCase{3 * kMaxTextLength + kMaxTextLength / 2,
                         3 * kMaxTextLength + kMaxTextLength / 2,
                         "ThreeAndHalfNoOp"}),
    [](const testing::TestParamInfo<SetEOFResizeCase>& aInfo) {
      return std::string(aInfo.param.mName);
    });

INSTANTIATE_TEST_SUITE_P(
    EncryptedRandomAccessStreamSetEOFBufferedExpand,
    SetEOFBufferedExpandEncryptedRandomAccessStreamTest,
    testing::Values(SetEOFBufferedExpandCase{kTextLength, 2 * kTextLength,
                                             "WithinFirstBlock"},
                    SetEOFBufferedExpandCase{
                        kMaxTextLength + kMaxTextLength / 5,
                        kMaxTextLength + 4 * kMaxTextLength / 5,
                        "WithinSecondBlock"}),
    [](const testing::TestParamInfo<SetEOFBufferedExpandCase>& aInfo) {
      return std::string(aInfo.param.mName);
    });

}  // namespace mozilla::dom::quota::test
