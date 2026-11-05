/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef DOM_QUOTA_CIPHERKEYMANAGER_H_
#define DOM_QUOTA_CIPHERKEYMANAGER_H_

#include "mozilla/AlreadyAddRefed.h"
#include "mozilla/DataMutex.h"
#include "mozilla/Result.h"
#include "mozilla/dom/FlippedOnce.h"
#include "mozilla/dom/quota/CipherKeyStoreBackend.h"
#include "mozilla/dom/quota/QuotaCommon.h"
#include "mozilla/dom/quota/RetryHelper.h"
#include "nsTHashMap.h"

namespace mozilla::dom::quota {

using mozilla::FlippedOnce;

// Interface for loading cipher keys from a backing store.
template <typename CipherStrategy>
class IKeyProvider {
 public:
  using CipherKey = typename CipherStrategy::KeyType;
  NS_INLINE_DECL_PURE_VIRTUAL_REFCOUNTING

  virtual Result<Maybe<CipherKey>, nsresult> Get(const nsACString& aKeyId) = 0;

 protected:
  virtual ~IKeyProvider() = default;
};

// Interface for persisting cipher keys to a backing store.
template <typename CipherStrategy>
class IKeyPersister {
 public:
  using CipherKey = typename CipherStrategy::KeyType;
  NS_INLINE_DECL_PURE_VIRTUAL_REFCOUNTING

  virtual nsresult Put(const nsACString& aKeyId, const CipherKey& aKey) = 0;

 protected:
  virtual ~IKeyPersister() = default;
};

// No-op provider for ephemeral (private browsing) mode: always returns
// Nothing(), so every Ensure() generates a fresh key.
template <typename CipherStrategy>
class InMemoryKeyProvider final : public IKeyProvider<CipherStrategy> {
 public:
  using CipherKey = typename CipherStrategy::KeyType;
  NS_INLINE_DECL_THREADSAFE_REFCOUNTING(InMemoryKeyProvider, override)

  Result<Maybe<CipherKey>, nsresult> Get(const nsACString&) override {
    return Maybe<CipherKey>(Nothing());
  }

 private:
  ~InMemoryKeyProvider() = default;
};

// No-op persister for ephemeral mode: keys live only in the in-memory cache.
template <typename CipherStrategy>
class InMemoryKeyPersister final : public IKeyPersister<CipherStrategy> {
 public:
  using CipherKey = typename CipherStrategy::KeyType;
  NS_INLINE_DECL_THREADSAFE_REFCOUNTING(InMemoryKeyPersister, override)

  nsresult Put(const nsACString&, const CipherKey&) override { return NS_OK; }

 private:
  ~InMemoryKeyPersister() = default;
};

// Provider backed by a CipherKeyStoreBackend (e.g. lockstore).
// Origin and client type are captured at construction so the caller
// only needs to pass key IDs.
template <typename CipherStrategy>
class StoreBackedKeyProvider final : public IKeyProvider<CipherStrategy> {
 public:
  using CipherKey = typename CipherStrategy::KeyType;
  NS_INLINE_DECL_THREADSAFE_REFCOUNTING(StoreBackedKeyProvider, override)

  StoreBackedKeyProvider(RefPtr<CipherKeyStoreBackend> aStore,
                         nsCString aOrigin, nsCString aClientType)
      : mStore(std::move(aStore)),
        mOrigin(std::move(aOrigin)),
        mClientType(std::move(aClientType)) {}

  Result<Maybe<CipherKey>, nsresult> Get(const nsACString& aKeyId) override {
    return mStore->Get(mOrigin, mClientType, aKeyId);
  }

 private:
  ~StoreBackedKeyProvider() = default;

  const RefPtr<CipherKeyStoreBackend> mStore;
  const nsCString mOrigin;
  const nsCString mClientType;
};

// Persister backed by a CipherKeyStoreBackend (e.g. lockstore).
template <typename CipherStrategy>
class StoreBackedKeyPersister final : public IKeyPersister<CipherStrategy> {
 public:
  using CipherKey = typename CipherStrategy::KeyType;
  NS_INLINE_DECL_THREADSAFE_REFCOUNTING(StoreBackedKeyPersister, override)

  StoreBackedKeyPersister(RefPtr<CipherKeyStoreBackend> aStore,
                          nsCString aOrigin, nsCString aClientType)
      : mStore(std::move(aStore)),
        mOrigin(std::move(aOrigin)),
        mClientType(std::move(aClientType)) {}

  nsresult Put(const nsACString& aKeyId, const CipherKey& aKey) override {
    return mStore->Put(mOrigin, mClientType, aKeyId, aKey);
  }

 private:
  ~StoreBackedKeyPersister() = default;

  const RefPtr<CipherKeyStoreBackend> mStore;
  const nsCString mOrigin;
  const nsCString mClientType;
};

// Neutral cache and coordinator for cipher keys.
//
// Storage policy is injected via IKeyProvider (load) and IKeyPersister (store).
// The manager maintains an in-memory cache and delegates to these interfaces
// for any key not yet cached. In private browsing mode, the in-memory
// implementations make every key ephemeral. When storage encryption is
// enabled, store-backed implementations persist keys via CipherKeyStoreBackend.
template <typename CipherStrategy>
class CipherKeyManager {
  NS_INLINE_DECL_THREADSAFE_REFCOUNTING(CipherKeyManager)

  using CipherKey = typename CipherStrategy::KeyType;

 public:
  static already_AddRefed<CipherKeyManager> Create(
      const char* aName, RefPtr<IKeyProvider<CipherStrategy>> aProvider,
      RefPtr<IKeyPersister<CipherStrategy>> aPersister) {
    RefPtr<CipherKeyManager> mgr = new CipherKeyManager(
        aName, std::move(aProvider), std::move(aPersister));
    return mgr.forget();
  }

  static already_AddRefed<CipherKeyManager> CreateEphemeral(const char* aName) {
    return Create(aName, MakeRefPtr<InMemoryKeyProvider<CipherStrategy>>(),
                  MakeRefPtr<InMemoryKeyPersister<CipherStrategy>>());
  }

  static already_AddRefed<CipherKeyManager> CreatePersistent(
      const char* aName, RefPtr<CipherKeyStoreBackend> aStore,
      const nsACString& aOrigin, const nsACString& aClientType) {
    // Separate statements: argument evaluation order is unspecified, so the
    // move must not race the copy.
    auto provider = MakeRefPtr<StoreBackedKeyProvider<CipherStrategy>>(
        aStore, nsCString(aOrigin), nsCString(aClientType));
    auto persister = MakeRefPtr<StoreBackedKeyPersister<CipherStrategy>>(
        std::move(aStore), nsCString(aOrigin), nsCString(aClientType));
    return Create(aName, std::move(provider), std::move(persister));
  }

  Result<Maybe<CipherKey>, nsresult> Get(const nsACString& aKeyId) {
    auto lockedCipherKeys = mCipherKeys.Lock();
    MOZ_ASSERT(!mInvalidated);

    auto maybeKey = lockedCipherKeys->MaybeGet(aKeyId);
    if (maybeKey) {
      return maybeKey;
    }

    QM_TRY_UNWRAP(auto loaded, mProvider->Get(aKeyId));
    if (loaded) {
      lockedCipherKeys->InsertOrUpdate(aKeyId, *loaded);
    }
    return loaded;
  }

  Result<CipherKey, nsresult> Ensure(const nsACString& aKeyId) {
    auto lockedCipherKeys = mCipherKeys.Lock();
    MOZ_ASSERT(!mInvalidated);

    auto maybeKey = lockedCipherKeys->MaybeGet(aKeyId);
    if (maybeKey) {
      return *maybeKey;
    }

    QM_TRY_UNWRAP(auto maybeLoaded, mProvider->Get(aKeyId));
    CipherKey key;
    if (maybeLoaded) {
      key = *maybeLoaded;
    } else {
      QM_TRY_UNWRAP(key, CipherStrategy::GenerateKey());
      MOZ_TRY(RetryOnTransientError(
          [&]() { return mPersister->Put(aKeyId, key); }));
    }

    lockedCipherKeys->InsertOrUpdate(aKeyId, key);
    return key;
  }

  void Remove(const nsACString& aKeyId) {
    auto lockedCipherKeys = mCipherKeys.Lock();

    MOZ_ASSERT(!mInvalidated);

    lockedCipherKeys->Remove(aKeyId);
  }

  bool Invalidated() {
    auto lockedCipherKeys = mCipherKeys.Lock();

    return mInvalidated;
  }

  void Invalidate() {
    auto lockedCipherKeys = mCipherKeys.Lock();

    mInvalidated.Flip();

    lockedCipherKeys->Clear();
  }

 private:
  CipherKeyManager(const char* aName,
                   RefPtr<IKeyProvider<CipherStrategy>> aProvider,
                   RefPtr<IKeyPersister<CipherStrategy>> aPersister)
      : mCipherKeys(aName),
        mProvider(std::move(aProvider)),
        mPersister(std::move(aPersister)) {};

  ~CipherKeyManager() = default;

  DataMutex<nsTHashMap<nsCStringHashKey, CipherKey>> mCipherKeys;

  const RefPtr<IKeyProvider<CipherStrategy>> mProvider;
  const RefPtr<IKeyPersister<CipherStrategy>> mPersister;

  FlippedOnce<false> mInvalidated;
};

}  // namespace mozilla::dom::quota

#endif  // DOM_QUOTA_CIPHERKEYMANAGER_H_
