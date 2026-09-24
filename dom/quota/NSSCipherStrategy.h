/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_dom_quota_NSSCipherStrategy_h
#define mozilla_dom_quota_NSSCipherStrategy_h

#include <array>
#include <cstddef>
#include <cstdint>

#include "CipherStrategy.h"
#include "ErrorList.h"
#include "ScopedNSSTypes.h"
#include "mozilla/InitializedOnce.h"
#include "mozilla/Result.h"
#include "mozilla/Span.h"

namespace mozilla::dom::quota {

struct NSSCipherStrategy {
  // Use numeric literals here to avoid having to include NSS headers here.
  // static_assert's in the cpp file check their consistency.
  using KeyType = std::array<uint8_t, 32>;
  static constexpr size_t BlockPrefixLength = 32;
  static constexpr size_t BasicBlockSize = 16;

  static Result<KeyType, nsresult> GenerateKey();

  nsresult Init(CipherMode aCipherMode, Span<const uint8_t> aKey);

  // On encrypt the whole of aIv is written -- a freshly generated nonce in the
  // leading 12 bytes, the authentication tag in the trailing 16, random filler
  // in between -- and the caller must store all of it alongside the ciphertext.
  // Its incoming contents are ignored. On decrypt aIv supplies that same stored
  // nonce and tag.
  nsresult Cipher(Span<uint8_t> aIv, Span<const uint8_t> aIn,
                  Span<uint8_t> aOut);

  static std::array<uint8_t, BlockPrefixLength> MakeBlockPrefix();

  static Span<const uint8_t> SerializeKey(const KeyType& aKey);

  static Maybe<KeyType> DeserializeKey(
      const Span<const uint8_t>& aSerializedKey);

 private:
  // XXX Remove EarlyDestructible, remove moving of the CipherStrategy.
  LazyInitializedOnceEarlyDestructible<const CipherMode> mMode;
  LazyInitializedOnceEarlyDestructible<const UniquePK11Context> mPK11Context;
};

}  // namespace mozilla::dom::quota

#endif
