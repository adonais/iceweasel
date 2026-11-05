/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "gmock/gmock.h"
#include "gtest/gtest.h"
#include "mozilla/Result.h"
#include "mozilla/dom/quota/CipherKeyManager.h"
#include "mozilla/dom/quota/CipherKeyStoreBackend.h"
#include "mozilla/dom/quota/DekNameCodec.h"
#include "mozilla/dom/quota/NSSCipherStrategy.h"
#include "nss.h"

namespace mozilla::dom::quota::test {

using ::testing::_;
using ::testing::Return;

class MockCipherKeyStoreBackend : public CipherKeyStoreBackend {
 public:
  NS_INLINE_DECL_THREADSAFE_REFCOUNTING(MockCipherKeyStoreBackend, override)

  MOCK_METHOD((Result<Maybe<NSSCipherStrategy::KeyType>, nsresult>), Get,
              (const nsACString& aOrigin, const nsACString& aClientType,
               const nsACString& aKeyId),
              (override));
  MOCK_METHOD(nsresult, Put,
              (const nsACString& aOrigin, const nsACString& aClientType,
               const nsACString& aKeyId,
               const NSSCipherStrategy::KeyType& aKey),
              (override));
  MOCK_METHOD(nsresult, Remove, (const nsACString& aOrigin), (override));
  MOCK_METHOD(nsresult, Clear, (), (override));
  MOCK_METHOD(void, Close, (), (override));

 private:
  ~MockCipherKeyStoreBackend() = default;
};

class TestCipherKeyManager : public ::testing::Test {
 public:
  static void SetUpTestCase() {
    if (!sNssContext) {
      sNssContext.reset(
          NSS_InitContext("", "", "", "", nullptr,
                          NSS_INIT_READONLY | NSS_INIT_NOCERTDB |
                              NSS_INIT_NOMODDB | NSS_INIT_FORCEOPEN |
                              NSS_INIT_OPTIMIZESPACE | NSS_INIT_NOROOTINIT));
    }
  }

  static void TearDownTestCase() { sNssContext = nullptr; }

 protected:
  static NSSCipherStrategy::KeyType GenerateTestKey() {
    auto result = NSSCipherStrategy::GenerateKey();
    MOZ_RELEASE_ASSERT(result.isOk());
    return result.unwrap();
  }

 private:
  struct NSSInitContextDeleter {
    void operator()(NSSInitContext* p) { NSS_ShutdownContext(p); }
  };
  static std::unique_ptr<NSSInitContext, NSSInitContextDeleter> sNssContext;
};

constinit std::unique_ptr<NSSInitContext,
                          TestCipherKeyManager::NSSInitContextDeleter>
    TestCipherKeyManager::sNssContext;

// Persistent mode: Ensure() loads from backend, caches, and returns the key.
// Different key IDs get different keys (per-blob isolation).
TEST_F(TestCipherKeyManager, EnsureLoadsCachedKey) {
  auto backend = MakeRefPtr<MockCipherKeyStoreBackend>();
  auto key1 = GenerateTestKey();
  auto key2 = GenerateTestKey();

  EXPECT_CALL(*backend, Get(_, _, _))
      .WillOnce(Return(
          Result<Maybe<NSSCipherStrategy::KeyType>, nsresult>(Some(key1))))
      .WillOnce(Return(
          Result<Maybe<NSSCipherStrategy::KeyType>, nsresult>(Some(key2))));
  EXPECT_CALL(*backend, Put(_, _, _, _)).Times(0);

  RefPtr<CipherKeyManager<NSSCipherStrategy>> manager =
      CipherKeyManager<NSSCipherStrategy>::CreatePersistent(
          "TestPersistent", backend, "https://example.com"_ns, "idb"_ns);

  auto result1 = manager->Ensure("db1:42"_ns);
  ASSERT_TRUE(result1.isOk());
  ASSERT_EQ(result1.unwrap(), key1);

  // Same key ID returns cached key (no additional backend call).
  auto result1Again = manager->Ensure("db1:42"_ns);
  ASSERT_TRUE(result1Again.isOk());
  ASSERT_EQ(result1Again.unwrap(), key1);

  // Different key ID loads from backend again.
  auto result2 = manager->Ensure("db1:43"_ns);
  ASSERT_TRUE(result2.isOk());
  ASSERT_EQ(result2.unwrap(), key2);
}

// Persistent mode: Ensure() generates and persists a new key when the backend
// returns Nothing().
TEST_F(TestCipherKeyManager, EnsureGeneratesAndPersistsOnMiss) {
  auto backend = MakeRefPtr<MockCipherKeyStoreBackend>();

  NSSCipherStrategy::KeyType persistedKey{};

  EXPECT_CALL(*backend, Get(_, _, _))
      .WillOnce(Return(Result<Maybe<NSSCipherStrategy::KeyType>, nsresult>(
          Maybe<NSSCipherStrategy::KeyType>{})));

  EXPECT_CALL(*backend, Put(_, _, _, _))
      .WillOnce([&persistedKey](const nsACString&, const nsACString&,
                                const nsACString&,
                                const NSSCipherStrategy::KeyType& aKey) {
        persistedKey = aKey;
        return NS_OK;
      });

  RefPtr<CipherKeyManager<NSSCipherStrategy>> manager =
      CipherKeyManager<NSSCipherStrategy>::CreatePersistent(
          "TestPersistent", backend, "https://example.com"_ns, "idb"_ns);

  auto keyResult = manager->Ensure("db1:db"_ns);
  ASSERT_TRUE(keyResult.isOk());
  auto key = keyResult.unwrap();

  bool allZero = true;
  for (uint8_t b : key) {
    if (b != 0) {
      allZero = false;
      break;
    }
  }
  ASSERT_FALSE(allZero);

  ASSERT_EQ(persistedKey, key);
}

// Persistent mode: Get() before Ensure() queries the backend and returns
// Nothing() on miss.
TEST_F(TestCipherKeyManager, GetBeforeEnsureReturnsNothing) {
  auto backend = MakeRefPtr<MockCipherKeyStoreBackend>();

  EXPECT_CALL(*backend, Get(_, _, _))
      .WillOnce(Return(Result<Maybe<NSSCipherStrategy::KeyType>, nsresult>(
          Maybe<NSSCipherStrategy::KeyType>{})));

  RefPtr<CipherKeyManager<NSSCipherStrategy>> manager =
      CipherKeyManager<NSSCipherStrategy>::CreatePersistent(
          "TestPersistent", backend, "https://example.com"_ns, "cache"_ns);

  auto result = manager->Get("db"_ns);
  ASSERT_TRUE(result.isOk());
  ASSERT_TRUE(result.unwrap().isNothing());
}

// Persistent mode: Get() returns the key from backend when it exists.
TEST_F(TestCipherKeyManager, GetLoadsFromBackend) {
  auto backend = MakeRefPtr<MockCipherKeyStoreBackend>();
  auto originKey = GenerateTestKey();

  EXPECT_CALL(*backend, Get(_, _, _))
      .WillOnce(Return(Result<Maybe<NSSCipherStrategy::KeyType>, nsresult>(
          Some(originKey))));

  RefPtr<CipherKeyManager<NSSCipherStrategy>> manager =
      CipherKeyManager<NSSCipherStrategy>::CreatePersistent(
          "TestPersistent", backend, "https://example.com"_ns, "ls"_ns);

  auto result = manager->Get("db"_ns);
  ASSERT_TRUE(result.isOk());
  auto maybeKey = result.unwrap();
  ASSERT_TRUE(maybeKey.isSome());
  ASSERT_EQ(*maybeKey, originKey);
}

// Invalidate() clears the in-memory cache.
TEST_F(TestCipherKeyManager, InvalidateClearsCache) {
  auto backend = MakeRefPtr<MockCipherKeyStoreBackend>();
  auto originKey = GenerateTestKey();

  EXPECT_CALL(*backend, Get(_, _, _))
      .WillOnce(Return(Result<Maybe<NSSCipherStrategy::KeyType>, nsresult>(
          Some(originKey))));

  RefPtr<CipherKeyManager<NSSCipherStrategy>> manager =
      CipherKeyManager<NSSCipherStrategy>::CreatePersistent(
          "TestPersistent", backend, "https://example.com"_ns, "idb"_ns);

  auto keyResult = manager->Ensure("db1:db"_ns);
  ASSERT_TRUE(keyResult.isOk());
  ASSERT_EQ(keyResult.unwrap(), originKey);

  manager->Invalidate();
  ASSERT_TRUE(manager->Invalidated());
}

// Ephemeral mode: keys are randomly generated per key ID.
TEST_F(TestCipherKeyManager, EphemeralModeGeneratesKeys) {
  RefPtr<CipherKeyManager<NSSCipherStrategy>> manager =
      CipherKeyManager<NSSCipherStrategy>::CreateEphemeral("TestEphemeral");

  auto result1 = manager->Ensure("blob-1"_ns);
  ASSERT_TRUE(result1.isOk());
  auto key1 = result1.unwrap();

  auto result2 = manager->Ensure("blob-2"_ns);
  ASSERT_TRUE(result2.isOk());
  auto key2 = result2.unwrap();

  ASSERT_NE(key1, key2);

  auto result1Again = manager->Ensure("blob-1"_ns);
  ASSERT_TRUE(result1Again.isOk());
  ASSERT_EQ(key1, result1Again.unwrap());
}

// MockCipherKeyStoreBackend basic operations.
TEST_F(TestCipherKeyManager, MockBackendBasicOperations) {
  auto backend = MakeRefPtr<MockCipherKeyStoreBackend>();
  auto key = GenerateTestKey();

  EXPECT_CALL(*backend, Put(_, _, _, _)).WillOnce(Return(NS_OK));
  EXPECT_CALL(*backend, Get(_, _, _))
      .WillOnce(Return(
          Result<Maybe<NSSCipherStrategy::KeyType>, nsresult>(Some(key))));
  EXPECT_CALL(*backend, Remove(_)).WillOnce(Return(NS_OK));
  EXPECT_CALL(*backend, Clear()).WillOnce(Return(NS_OK));
  EXPECT_CALL(*backend, Close()).Times(1);

  ASSERT_EQ(NS_OK,
            backend->Put("https://example.com"_ns, "idb"_ns, "db1:db"_ns, key));

  auto retrievedResult =
      backend->Get("https://example.com"_ns, "idb"_ns, "db1:db"_ns);
  ASSERT_TRUE(retrievedResult.isOk());
  auto retrieved = retrievedResult.unwrap();
  ASSERT_TRUE(retrieved.isSome());
  ASSERT_EQ(*retrieved, key);

  ASSERT_EQ(NS_OK, backend->Remove("https://example.com"_ns));
  ASSERT_EQ(NS_OK, backend->Clear());
  backend->Close();
}

// DekNameCodec: Build produces the documented length-prefixed layout.
TEST_F(TestCipherKeyManager, DekNameCodecBuildLayout) {
  DekNameCodec::DekNameParts parts;
  parts.mProfileId = DekNameCodec::ProfileId("default"_ns).unwrap();
  parts.mStorageOrigin = "https://example.com"_ns;
  parts.mBottleUUID = nsCString(DekNameCodec::kNilBottleUUID);
  parts.mClientType = "idb"_ns;
  parts.mKeyId = "2*https://example.com*myDB:42"_ns;

  ASSERT_EQ(DekNameCodec::Build(parts),
            "dom-quota:10:ZGVmYXVsdA:19:https://example.com:"
            "36:00000000-0000-0000-0000-000000000000:3:idb:"
            "29:2*https://example.com*myDB:42"_ns);
}

// DekNameCodec: OriginPrefix matches DEK names for the same origin.
TEST_F(TestCipherKeyManager, DekNameCodecOriginPrefixMatching) {
  nsCString profileId = DekNameCodec::ProfileId("default"_ns).unwrap();
  nsCString origin = "https://example.com"_ns;

  nsCString prefix = DekNameCodec::OriginPrefix(profileId, origin);

  DekNameCodec::DekNameParts parts;
  parts.mProfileId = profileId;
  parts.mStorageOrigin = origin;
  parts.mBottleUUID = nsCString(DekNameCodec::kNilBottleUUID);
  parts.mClientType = "idb"_ns;
  parts.mKeyId = "db1:42"_ns;

  nsCString dekName = DekNameCodec::Build(parts);
  ASSERT_TRUE(StringBeginsWith(dekName, prefix));

  // Different origin should not match.
  DekNameCodec::DekNameParts otherParts = parts;
  otherParts.mStorageOrigin = "https://other.com"_ns;
  nsCString otherDekName = DekNameCodec::Build(otherParts);
  ASSERT_FALSE(StringBeginsWith(otherDekName, prefix));
}

// Persistent mode: Get() propagates backend Get() errors instead of
// swallowing them.
TEST_F(TestCipherKeyManager, GetPropagatesBackendError) {
  auto backend = MakeRefPtr<MockCipherKeyStoreBackend>();

  EXPECT_CALL(*backend, Get(_, _, _))
      .WillOnce(Return(Result<Maybe<NSSCipherStrategy::KeyType>, nsresult>(
          Err(NS_ERROR_FAILURE))));

  RefPtr<CipherKeyManager<NSSCipherStrategy>> manager =
      CipherKeyManager<NSSCipherStrategy>::CreatePersistent(
          "TestPersistent", backend, "https://example.com"_ns, "idb"_ns);

  auto result = manager->Get("db1:db"_ns);
  ASSERT_TRUE(result.isErr());
  ASSERT_EQ(result.inspectErr(), NS_ERROR_FAILURE);
}

// Persistent mode: Ensure() propagates backend Get() errors.
TEST_F(TestCipherKeyManager, EnsurePropagatesGetError) {
  auto backend = MakeRefPtr<MockCipherKeyStoreBackend>();

  EXPECT_CALL(*backend, Get(_, _, _))
      .WillOnce(Return(Result<Maybe<NSSCipherStrategy::KeyType>, nsresult>(
          Err(NS_ERROR_FAILURE))));

  RefPtr<CipherKeyManager<NSSCipherStrategy>> manager =
      CipherKeyManager<NSSCipherStrategy>::CreatePersistent(
          "TestPersistent", backend, "https://example.com"_ns, "idb"_ns);

  auto result = manager->Ensure("db1:db"_ns);
  ASSERT_TRUE(result.isErr());
  ASSERT_EQ(result.inspectErr(), NS_ERROR_FAILURE);
}

// Persistent mode: Ensure() propagates backend Put() errors on key generation.
TEST_F(TestCipherKeyManager, EnsurePropagatesPutError) {
  auto backend = MakeRefPtr<MockCipherKeyStoreBackend>();

  EXPECT_CALL(*backend, Get(_, _, _))
      .WillOnce(Return(Result<Maybe<NSSCipherStrategy::KeyType>, nsresult>(
          Maybe<NSSCipherStrategy::KeyType>{})));

  EXPECT_CALL(*backend, Put(_, _, _, _)).WillOnce(Return(NS_ERROR_FAILURE));

  RefPtr<CipherKeyManager<NSSCipherStrategy>> manager =
      CipherKeyManager<NSSCipherStrategy>::CreatePersistent(
          "TestPersistent", backend, "https://example.com"_ns, "idb"_ns);

  auto result = manager->Ensure("db1:db"_ns);
  ASSERT_TRUE(result.isErr());
}

}  // namespace mozilla::dom::quota::test
