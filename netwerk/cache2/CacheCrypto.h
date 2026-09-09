/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef CacheCrypto_h_
#define CacheCrypto_h_

#include "nsISupportsImpl.h"
#include "nsString.h"
#include "nscore.h"

namespace mozilla {

namespace security::lockstore {
class LockstoreService;
}

namespace net {

// Authenticated block encryptor for the HTTP disk cache, using AES-256-GCM via
// NSS. A single 32-byte master key is held in memory for the lifetime of the
// process. The key is a data encryption key owned by the profile keystore
// (security/lockstore) under the name "httpcache", wrapped by a "local" KEK
// shared with the rest of the profile's encrypted storage; the
// wrapping tier can later be switched to a password or PKCS#11 KEK via
// nsILockstore::switchKek without touching the key itself, and therefore
// without invalidating anything already on disk. Each block is encrypted
// independently with a fresh random nonce, and the block number is bound as
// additional authenticated data so a block cannot be moved to another position.
//
// On disk a block is laid out as [ciphertext(len)][tag][nonce]; the plaintext
// only ever exists in memory. Data chunks use the chunk index as the block
// number; the metadata block uses kMetadataBlockNumber.
class CacheCrypto {
 public:
  NS_INLINE_DECL_THREADSAFE_REFCOUNTING(CacheCrypto)

  static const uint32_t kKeyLength = 32;         // AES-256 key
  static const uint32_t kBlockNonceLength = 12;  // AES-GCM nonce (IV)
  static const uint32_t kBlockTagLength = 16;    // AES-GCM authentication tag
  // Per-block on-disk overhead added to the plaintext length.
  static const uint32_t kBlockOverhead = kBlockNonceLength + kBlockTagLength;

  // Block number for the single metadata block, distinct from any chunk index.
  static const uint64_t kMetadataBlockNumber = UINT64_MAX;

  // Starts loading the encryption key from the profile keystore. A no-op when
  // the feature pref is off or when a key is already loaded. Must be called on
  // the main thread, before CacheFileIOManager::OnProfile().
  //
  // The load itself is asynchronous -- Lockstore's synchronous tier must not
  // run on the main thread -- but it both runs and publishes its result on the
  // cache I/O thread, at the highest priority level. Everything that consults
  // the key runs on that thread at a lower priority, and is queued after this,
  // so callers do not have to wait for it; see the ordering note on Init() in
  // CacheCrypto.cpp.
  static void Init();
  static void Shutdown();

  // Test-only: sets up a usable cipher with a freshly generated random key,
  // synchronously and without consulting either the enabled pref or the
  // keystore. Each call after a Shutdown() yields a different key.
  static void InitForTesting();

  // Returns a singleton instance when encryption is enabled and a usable key
  // was loaded, otherwise nullptr.
  static already_AddRefed<CacheCrypto> GetInstanceOrNull();

  // Returns true when GetInstanceOrNull would return non-null.
  static bool IsActive();

  // Returns whether disk cache encryption is enabled (the pref captured at
  // Init). May be true while IsActive() is false if no usable cipher could be
  // loaded.
  static bool IsEnabled();

  // Encrypts aLen plaintext bytes (aPlaintext) into aOut, which must hold
  // aLen + kBlockOverhead bytes laid out as
  // [ciphertext(aLen)][tag(kBlockTagLength)][nonce(kBlockNonceLength)].
  // aAad (length aAadLen), when non-null, is authenticated by the AEAD tag but
  // not encrypted; DecryptBlock must be given the identical AAD. This lets
  // callers bind unencrypted-but-trusted context (e.g. the metadata trailer:
  // format version, encryption flag and data size) so it cannot be tampered
  // with or downgraded.
  nsresult EncryptBlock(uint64_t aBlockNumber, const uint8_t* aPlaintext,
                        uint32_t aLen, uint8_t* aOut,
                        const uint8_t* aAad = nullptr, uint32_t aAadLen = 0);

  // Decrypts a block of aLen + kBlockOverhead bytes (aIn, same layout as above)
  // into aOut (aLen plaintext bytes). aIn must be writable: the AEAD API takes
  // the nonce and tag as mutable spans. aAad must match what was passed to
  // EncryptBlock or decryption fails.
  nsresult DecryptBlock(uint64_t aBlockNumber, uint8_t* aIn, uint32_t aLen,
                        uint8_t* aOut, const uint8_t* aAad = nullptr,
                        uint32_t aAadLen = 0);

  // Fetches the key from the profile keystore, minting the KEK and DEK on
  // first use. Returns null when no key could be obtained, which leaves
  // encryption inactive for the session.
  //
  // Must not run on the main thread: Lockstore's synchronous tier asserts as
  // much. Init() calls it on the cache I/O thread; aLockstore has to be
  // resolved by the caller beforehand, on the main thread. Public so that
  // gtests can drive the real load on a background task.
  static already_AddRefed<CacheCrypto> LoadFromKeystore(
      security::lockstore::LockstoreService* aLockstore);

 private:
  CacheCrypto() = default;
  // Zeroizes the in-memory key material.
  ~CacheCrypto();

  // Publishes aCrypto, which may be null, as the session's cipher.
  static void Publish(already_AddRefed<CacheCrypto> aCrypto);

  bool mUsable{false};
  uint8_t mKeyBytes[kKeyLength]{};
};

}  // namespace net
}  // namespace mozilla

#endif  // CacheCrypto_h_
