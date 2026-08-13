/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#include <algorithm>
#include <array>
#include <cstring>
#include <numeric>

#include "EncryptedRandomAccessBlock.h"
#include "EncryptedRandomAccessBlockView.h"
#include "gtest/gtest.h"

namespace mozilla::dom::quota::test {

bool IsAllZero(Span<const uint8_t> aSpan) {
  return std::all_of(aSpan.data(), aSpan.data() + aSpan.Length(),
                     [](uint8_t e) { return e == 0; });
}

TEST(EncryptedRandomAccessBlockTest,
     EncryptedRandomAccessBlock_zeroInitializedEncryptedBlockMetadataAndPayload)
{
  EncryptedRandomAccessBlock encryptedRandomAccessBlock;

  EXPECT_TRUE(IsAllZero(encryptedRandomAccessBlock.CipherMetadata()));
  EXPECT_TRUE(IsAllZero(encryptedRandomAccessBlock.CipherPayload()));
}

TEST(EncryptedRandomAccessBlockTest, EncryptedRandomAccessBlock_accessors)
{
  std::array<uint8_t, EncryptedRandomAccessBlock::BlockSize> rawData{};
  std::iota(rawData.begin(), rawData.end(), 1);

  EncryptedRandomAccessBlock block;
  block.AssignFromBytes(Span<const uint8_t>{
      rawData.data(), EncryptedRandomAccessBlock::BlockSize});

  const Span<const uint8_t> raw{rawData.data(), rawData.size()};

  uint16_t expectedVersion;
  memcpy(&expectedVersion, rawData.data(), sizeof(uint16_t));
  EXPECT_EQ(block.Version(), expectedVersion);
  EXPECT_EQ(block.Header(), raw.First(32));
  EXPECT_EQ(block.ReservedBytes(), raw.Subspan(2, 32 - 2));
  EXPECT_EQ(block.CipherMetadata(), raw.Subspan(32, 32));
  EXPECT_EQ(block.CipherPayload(), raw.Subspan(64, 4096 - 64));

  EncryptedRandomAccessBlockCipherMetadataViewV1 v1(
      block.MutableCipherMetadata());
  EXPECT_EQ(v1.Nonce(), raw.Subspan(32, 12));
  EXPECT_EQ(v1.AuthenticationTag(), raw.Subspan(32 + 12, 16));
}

TEST(EncryptedRandomAccessBlockTest,
     DecryptedRandomAccessBlockCipherPayloadView_accessors)
{
  std::array<uint8_t, EncryptedRandomAccessBlock::CipherPayloadSize>
      payloadData{};
  std::iota(payloadData.begin(), payloadData.end(), 1);

  DecryptedRandomAccessBlockCipherPayloadView payloadView(payloadData);

  const Span<const uint8_t> raw{payloadData.data(), payloadData.size()};

  uint16_t expectedTextLength;
  memcpy(&expectedTextLength, payloadData.data(), sizeof(uint16_t));
  EXPECT_EQ(payloadView.TextLength(), expectedTextLength);
  EXPECT_EQ(payloadView.TextAndPadding(), raw.Subspan(2));
}

TEST(EncryptedRandomAccessBlockTest, EncryptedRandomAccessBlock_setVersion)
{
  EncryptedRandomAccessBlock block;
  block.SetVersion(0x0102);

  EXPECT_EQ(block.Version(), 0x0102u);

  // check if the adjacent area is not written
  EXPECT_TRUE(IsAllZero(block.ReservedBytes()));
}

TEST(EncryptedRandomAccessBlockTest,
     EncryptedRandomAccessBlockCipherMetadataViewV1_setNonce)
{
  EncryptedRandomAccessBlock block;
  EncryptedRandomAccessBlockCipherMetadataViewV1 v1(
      block.MutableCipherMetadata());

  std::array<uint8_t, 12> nonce{};
  std::iota(nonce.begin(), nonce.end(), 1);
  v1.SetNonce(Span<const uint8_t, 12>{nonce.data(), 12});

  EXPECT_EQ(v1.Nonce(), Span<const uint8_t>(nonce.data(), nonce.size()));

  // check if the adjacent area is not written
  EXPECT_TRUE(IsAllZero(v1.AuthenticationTag()));
}

TEST(EncryptedRandomAccessBlockTest,
     EncryptedRandomAccessBlockCipherMetadataViewV1_setAuthenticationTag)
{
  EncryptedRandomAccessBlock block;
  EncryptedRandomAccessBlockCipherMetadataViewV1 v1(
      block.MutableCipherMetadata());

  std::array<uint8_t, 16> authTag{};
  std::iota(authTag.begin(), authTag.end(), 1);
  v1.SetAuthenticationTag(Span<const uint8_t, 16>{authTag.data(), 16});

  EXPECT_EQ(v1.AuthenticationTag(),
            Span<const uint8_t>(authTag.data(), authTag.size()));

  // check if the adjacent area is not written
  EXPECT_TRUE(IsAllZero(v1.Nonce()));
}

TEST(EncryptedRandomAccessBlockTest,
     DecryptedRandomAccessBlockCipherPayloadView_setTextLength)
{
  std::array<uint8_t, EncryptedRandomAccessBlock::CipherPayloadSize>
      payloadData{};
  DecryptedRandomAccessBlockCipherPayloadView payloadView(payloadData);

  payloadView.SetTextLength(0x0102);

  EXPECT_EQ(payloadView.TextLength(), 0x0102u);

  // check that the adjacent area is not written
  EXPECT_TRUE(IsAllZero(payloadView.TextAndPadding()));
}

TEST(EncryptedRandomAccessBlockTest,
     EncryptedRandomAccessBlock_mutableCipherPayload)
{
  EncryptedRandomAccessBlock block;

  auto mutablePayload = block.MutableCipherPayload();
  std::iota(mutablePayload.data(),
            mutablePayload.data() + mutablePayload.Length(), 1);

  EXPECT_EQ(block.CipherPayload(), Span<const uint8_t>{mutablePayload});

  // check if the adjacent area is not written.
  EXPECT_TRUE(IsAllZero(block.CipherMetadata()));
}

TEST(EncryptedRandomAccessBlockTest,
     DecryptedRandomAccessBlockCipherPayloadView_mutableTextAndPadding)
{
  std::array<uint8_t, EncryptedRandomAccessBlock::CipherPayloadSize>
      payloadData{};
  DecryptedRandomAccessBlockCipherPayloadView payloadView(payloadData);

  auto mutableTextAndPadding = payloadView.MutableTextAndPadding();
  std::iota(mutableTextAndPadding.data(),
            mutableTextAndPadding.data() + mutableTextAndPadding.Length(), 1);

  EXPECT_EQ(payloadView.TextAndPadding(),
            Span<const uint8_t>{mutableTextAndPadding});

  // check if the adjacent area is not written.
  EXPECT_EQ(payloadView.TextLength(), 0u);
}

}  // namespace mozilla::dom::quota::test
