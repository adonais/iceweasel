/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include <cstring>

#include "CacheCrypto.h"
#include "LockstoreService.h"
#include "gtest/gtest.h"
#include "mozilla/SpinEventLoopUntil.h"
#include "nsCOMPtr.h"
#include "nsIX509CertDB.h"
#include "nsServiceManagerUtils.h"
#include "nsTArray.h"
#include "nsThreadUtils.h"

using namespace mozilla;
using namespace mozilla::net;
using mozilla::security::lockstore::LockstoreService;

namespace {

// CacheCrypto needs NSS (PK11) and a loaded key. Getting the cert DB service
// initializes NSS; InitForTesting() then generates a throwaway key, depending
// on neither the "once"-mirrored enabled pref nor the profile keystore.
// Returns the usable instance, or null if setup failed.
static already_AddRefed<CacheCrypto> InitCryptoForTest() {
  nsCOMPtr<nsIX509CertDB> certDB(do_GetService(NS_X509CERTDB_CONTRACTID));
  EXPECT_TRUE(certDB);
  CacheCrypto::InitForTesting();
  return CacheCrypto::GetInstanceOrNull();
}

}  // namespace

TEST(CacheCrypto, RoundTrip)
{
  RefPtr<CacheCrypto> crypto = InitCryptoForTest();
  ASSERT_TRUE(crypto);

  // Length deliberately not a multiple of the AES block size.
  const char* msg = "The quick brown fox jumps over the lazy dog -- 0123456789";
  const uint32_t len = strlen(msg);

  nsTArray<uint8_t> block;
  block.SetLength(len + CacheCrypto::kBlockOverhead);
  nsTArray<uint8_t> roundtrip;
  roundtrip.SetLength(len);

  for (uint64_t blockNumber :
       {uint64_t(0), uint64_t(1), uint64_t(7), uint64_t(12345),
        CacheCrypto::kMetadataBlockNumber}) {
    ASSERT_EQ(NS_OK, crypto->EncryptBlock(blockNumber,
                                          reinterpret_cast<const uint8_t*>(msg),
                                          len, block.Elements()));
    // Ciphertext differs from plaintext.
    EXPECT_NE(0, memcmp(block.Elements(), msg, len));

    ASSERT_EQ(NS_OK, crypto->DecryptBlock(blockNumber, block.Elements(), len,
                                          roundtrip.Elements()));
    EXPECT_EQ(0, memcmp(roundtrip.Elements(), msg, len));
  }

  CacheCrypto::Shutdown();
}

TEST(CacheCrypto, TamperAndWrongBlockFail)
{
  RefPtr<CacheCrypto> crypto = InitCryptoForTest();
  ASSERT_TRUE(crypto);

  const char* msg = "authenticated payload";
  const uint32_t len = strlen(msg);

  nsTArray<uint8_t> block;
  block.SetLength(len + CacheCrypto::kBlockOverhead);
  nsTArray<uint8_t> out;
  out.SetLength(len);

  ASSERT_EQ(NS_OK,
            crypto->EncryptBlock(3, reinterpret_cast<const uint8_t*>(msg), len,
                                 block.Elements()));

  // Decrypting with a different block number fails: the block number is bound
  // as additional authenticated data.
  EXPECT_NE(NS_OK,
            crypto->DecryptBlock(4, block.Elements(), len, out.Elements()));

  // Tampered ciphertext fails the AEAD tag check.
  nsTArray<uint8_t> tampered = block.Clone();
  tampered[0] ^= 0x01;
  EXPECT_NE(NS_OK,
            crypto->DecryptBlock(3, tampered.Elements(), len, out.Elements()));

  // The untouched block at its own block number still decrypts.
  EXPECT_EQ(NS_OK,
            crypto->DecryptBlock(3, block.Elements(), len, out.Elements()));
  EXPECT_EQ(0, memcmp(out.Elements(), msg, len));

  CacheCrypto::Shutdown();
}

TEST(CacheCrypto, WrongKeyFails)
{
  // Encrypt a block with the session's key.
  RefPtr<CacheCrypto> crypto = InitCryptoForTest();
  ASSERT_TRUE(crypto);

  const char* msg = "secret cache contents";
  const uint32_t len = strlen(msg);
  nsTArray<uint8_t> block;
  block.SetLength(len + CacheCrypto::kBlockOverhead);
  ASSERT_EQ(NS_OK,
            crypto->EncryptBlock(0, reinterpret_cast<const uint8_t*>(msg), len,
                                 block.Elements()));

  // Model a later session that came up with a different key: InitForTesting()
  // generates a fresh one each time. This covers both "no key could be
  // recovered" and "the key does not match".
  CacheCrypto::Shutdown();
  CacheCrypto::InitForTesting();
  RefPtr<CacheCrypto> crypto2 = CacheCrypto::GetInstanceOrNull();
  ASSERT_TRUE(crypto2);

  // Decrypting the block written with the old key must fail (AEAD auth).
  nsTArray<uint8_t> out;
  out.SetLength(len);
  EXPECT_NE(NS_OK,
            crypto2->DecryptBlock(0, block.Elements(), len, out.Elements()));

  CacheCrypto::Shutdown();
}

TEST(CacheCrypto, FreshNoncePerEncryption)
{
  RefPtr<CacheCrypto> crypto = InitCryptoForTest();
  ASSERT_TRUE(crypto);

  const char* msg = "identical plaintext, identical block number";
  const uint32_t len = strlen(msg);

  nsTArray<uint8_t> b1, b2;
  b1.SetLength(len + CacheCrypto::kBlockOverhead);
  b2.SetLength(len + CacheCrypto::kBlockOverhead);

  ASSERT_EQ(NS_OK,
            crypto->EncryptBlock(0, reinterpret_cast<const uint8_t*>(msg), len,
                                 b1.Elements()));
  ASSERT_EQ(NS_OK,
            crypto->EncryptBlock(0, reinterpret_cast<const uint8_t*>(msg), len,
                                 b2.Elements()));
  // Same key/block/plaintext, but a fresh random nonce per encryption means the
  // ciphertext (and nonce) differ. This is what prevents keystream/nonce reuse
  // when a block is rewritten.
  EXPECT_NE(0, memcmp(b1.Elements(), b2.Elements(),
                      len + CacheCrypto::kBlockOverhead));

  CacheCrypto::Shutdown();
}

// The LockstoreService gtests are skipped on Android because they hang on the
// emulator (bug 1892964); skip this one for the same reason.
#ifndef MOZ_WIDGET_ANDROID

TEST(CacheCrypto, KeyIsRecoveredFromTheKeystore)
{
  // The point of the bug: the key survives a session because the keystore
  // holds it, not because it was written to a pref. Two loads of the real
  // keystore path must yield the same key, so a block encrypted by the first
  // decrypts under the second.
  nsCOMPtr<nsIX509CertDB> certDB(do_GetService(NS_X509CERTDB_CONTRACTID));
  ASSERT_TRUE(certDB);

  // Resolve on the main thread: that is what caches the service's profile
  // path, and LoadFromKeystore() must not run here.
  RefPtr<LockstoreService> lockstore = LockstoreService::GetSingleton();
  ASSERT_TRUE(lockstore);

  auto load = [&lockstore]() -> RefPtr<CacheCrypto> {
    // `crypto` and `done` are handed between the two threads by the spin
    // below, which only reads them after the background task has finished.
    RefPtr<CacheCrypto> crypto;
    bool done = false;
    MOZ_ALWAYS_SUCCEEDS(NS_DispatchBackgroundTask(NS_NewRunnableFunction(
        "TestCacheCrypto::Load", [&lockstore, &crypto, &done]() {
          crypto = CacheCrypto::LoadFromKeystore(lockstore);
          // Wake the spin from the main thread; see the same pattern in
          // TestLockstoreService.cpp for why the completion has to be posted.
          NS_DispatchToMainThread(NS_NewRunnableFunction(
              "TestCacheCrypto::Load::Done", [&done] { done = true; }));
        })));
    MOZ_ALWAYS_TRUE(SpinEventLoopUntil("TestCacheCrypto::Load"_ns,
                                       [&done]() { return done; }));
    return crypto;
  };

  RefPtr<CacheCrypto> first = load();
  ASSERT_TRUE(first);

  const char* msg = "cache contents that must outlive the session";
  const uint32_t len = strlen(msg);
  nsTArray<uint8_t> block;
  block.SetLength(len + CacheCrypto::kBlockOverhead);
  ASSERT_EQ(NS_OK, first->EncryptBlock(0, reinterpret_cast<const uint8_t*>(msg),
                                       len, block.Elements()));

  // A second session: the DEK already exists, so this recovers it rather than
  // minting a new one.
  RefPtr<CacheCrypto> second = load();
  ASSERT_TRUE(second);
  ASSERT_NE(first.get(), second.get());

  nsTArray<uint8_t> out;
  out.SetLength(len);
  EXPECT_EQ(NS_OK,
            second->DecryptBlock(0, block.Elements(), len, out.Elements()));
  EXPECT_EQ(0, memcmp(out.Elements(), msg, len));
}

#endif  // MOZ_WIDGET_ANDROID
