/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef DOM_QUOTA_ENCRYPTEDRANDOMACCESSBLOCKVIEW_H_
#define DOM_QUOTA_ENCRYPTEDRANDOMACCESSBLOCKVIEW_H_

#include <cstdint>
#include <cstring>

#include "EncryptedRandomAccessBlock.h"
#include "mozilla/EndianUtils.h"
#include "mozilla/Span.h"

namespace mozilla::dom::quota {

/**
 * This header collects "view" classes that impose structured interpretations
 * on the raw byte regions exposed by EncryptedRandomAccessBlock. Currently,
 * two kinds of views live here:
 *
 *   - Version-specific views (named with a V[n] suffix): interpretations
 *     whose layout is allowed to differ between versions. Only V1 is
 *     currently defined.
 *
 *   - Version-independent views (no suffix): interpretations that are
 *     intentionally fixed across all block format versions.
 */

/**
 * Version 1 interpretation of CipherMetadata of EncryptedRandomAccessBlock
 * (byte offsets relative to the start of CipherMetadata, i.e., byte 32 in the
 * full block):
 *
 *  --------+-----------------------------------------------+
 *   offset | field                                 size    |
 *  --------+-----------------------------------------------+
 *       0  | Nonce / IV                          12 bytes  |
 *      12  | Authentication tag                  16 bytes  |
 *      28  | Reserved (unused)                    4 bytes  |
 *  --------+-----------------------------------------------+
 *      32
 */
class EncryptedRandomAccessBlockCipherMetadataViewV1 {
 public:
  static constexpr size_t NonceSize = 12;
  static constexpr size_t AuthenticationTagSize = 16;

  template <size_t N>
  using ConstSpan = Span<const uint8_t, N>;
  template <size_t N>
  using MutableSpan = Span<uint8_t, N>;

 private:
  static constexpr size_t ReservedBytesSize = 4;

  static_assert(NonceSize + AuthenticationTagSize + ReservedBytesSize ==
                EncryptedRandomAccessBlock::CipherMetadataSize);

 public:
  explicit EncryptedRandomAccessBlockCipherMetadataViewV1(
      MutableSpan<NonceSize + AuthenticationTagSize + ReservedBytesSize> aBlock)
      : mCipherMetadata(aBlock) {}

  /** The AEAD nonce (initialization vector) for this block. */
  ConstSpan<NonceSize> Nonce() const {
    return mCipherMetadata.First<NonceSize>();
  }

  /** This is necessary because NSS API requires non-const nonce. */
  MutableSpan<NonceSize> MutableNonce() {
    return mCipherMetadata.First<NonceSize>();
  }

  void SetNonce(ConstSpan<NonceSize> aNonce) {
    memcpy(mCipherMetadata.data(), aNonce.data(), NonceSize);
  }

  /** The AEAD authentication tag for this block. */
  ConstSpan<AuthenticationTagSize> AuthenticationTag() const {
    return mCipherMetadata.Subspan<NonceSize, AuthenticationTagSize>();
  }

  /** This is necessary because NSS API requires non-const authentication tag.
   */
  MutableSpan<AuthenticationTagSize> MutableAuthenticationTag() {
    return mCipherMetadata.Subspan<NonceSize, AuthenticationTagSize>();
  }

  void SetAuthenticationTag(
      ConstSpan<AuthenticationTagSize> aAuthenticationTag) {
    memcpy(mCipherMetadata.data() + NonceSize, aAuthenticationTag.data(),
           AuthenticationTagSize);
  }

 private:
  MutableSpan<NonceSize + AuthenticationTagSize + ReservedBytesSize>
      mCipherMetadata;
};

/**
 * Version-independent interpretation of the *decrypted* CipherPayload of
 * EncryptedRandomAccessBlock (byte offsets relative to the start of
 * CipherPayload, i.e., byte 64 in the full block):
 *
 *  --------+-----------------------------------------------+
 *   offset | field                                 size    |
 *  --------+-----------------------------------------------+
 *       0  | Text length (uint16_t, little-endian) 2 bytes |
 *       2  | Text                                  L bytes |
 *     2+L  | Random padding               (4030 - L) bytes |
 *  --------+-----------------------------------------------+
 *    4032
 *
 * Its layout is held constant across versions so that the random access
 * stream can compute block numbers from a plaintext offset using a
 * single |MaxTextLength| value, without first resolving each block's version.
 *
 * This view must be applied to the *decrypted plaintext* of CipherPayload.
 * Applying it to the on-disk ciphertext bytes is meaningless.
 *
 * Text and padding are exposed as a single contiguous span via
 * |TextAndPadding()| / |MutableTextAndPadding()|; the caller uses
 * |TextLength()| to distinguish the text portion (the first L bytes) from
 * the padding portion (the remaining bytes).
 */
class DecryptedRandomAccessBlockCipherPayloadView {
 public:
  using TextLengthType = uint16_t;
  static constexpr size_t TextLengthFieldSize = sizeof(TextLengthType);
  static_assert(TextLengthFieldSize == 2,
                "TextLength should take 2 bytes on disk.");

  static constexpr TextLengthType MaxTextLength =
      EncryptedRandomAccessBlock::CipherPayloadSize - TextLengthFieldSize;
  static_assert(MaxTextLength == 4030, "MaxTextLength should be 4030 bytes.");

  template <size_t N>
  using ConstSpan = Span<const uint8_t, N>;
  template <size_t N>
  using MutableSpan = Span<uint8_t, N>;

  explicit DecryptedRandomAccessBlockCipherPayloadView(
      MutableSpan<TextLengthFieldSize + MaxTextLength> aDecryptedCipherPayload)
      : mDecryptedCipherPayload(aDecryptedCipherPayload) {}

  /** The length of the text portion (excluding random padding). */
  TextLengthType TextLength() const {
    return mozilla::LittleEndian::readUint16(mDecryptedCipherPayload.data());
  }

  void SetTextLength(TextLengthType aLength) {
    mozilla::LittleEndian::writeUint16(mDecryptedCipherPayload.data(), aLength);
  }

  /**
   * Text and padding combined. The first |TextLength()| bytes are the real
   * text; the remaining bytes are random padding.
   */
  ConstSpan<MaxTextLength> TextAndPadding() const {
    return mDecryptedCipherPayload
        .Subspan<TextLengthFieldSize, MaxTextLength>();
  }

  MutableSpan<MaxTextLength> MutableTextAndPadding() {
    return mDecryptedCipherPayload
        .Subspan<TextLengthFieldSize, MaxTextLength>();
  }

 private:
  MutableSpan<TextLengthFieldSize + MaxTextLength> mDecryptedCipherPayload;
};

}  // namespace mozilla::dom::quota

#endif  // DOM_QUOTA_ENCRYPTEDRANDOMACCESSBLOCKVIEW_H_
