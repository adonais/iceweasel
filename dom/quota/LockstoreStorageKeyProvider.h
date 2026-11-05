/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef DOM_QUOTA_LOCKSTORESTORAGEKEYPROVIDER_H_
#define DOM_QUOTA_LOCKSTORESTORAGEKEYPROVIDER_H_

#include "LockstoreService.h"
#include "mozilla/Mutex.h"
#include "mozilla/dom/quota/CipherKeyStoreBackend.h"

namespace mozilla::dom::quota {

class LockstoreStorageKeyProvider final : public CipherKeyStoreBackend {
 public:
  NS_INLINE_DECL_THREADSAFE_REFCOUNTING(LockstoreStorageKeyProvider, override)

  static already_AddRefed<LockstoreStorageKeyProvider> Create(
      const nsACString& aProfileId);

  Result<Maybe<NSSCipherStrategy::KeyType>, nsresult> Get(
      const nsACString& aOrigin, const nsACString& aClientType,
      const nsACString& aKeyId) override;
  nsresult Put(const nsACString& aOrigin, const nsACString& aClientType,
               const nsACString& aKeyId,
               const NSSCipherStrategy::KeyType& aKey) override;
  nsresult Remove(const nsACString& aOrigin) override;
  nsresult Clear() override;
  void Close() override;

 private:
  LockstoreStorageKeyProvider(
      already_AddRefed<mozilla::security::lockstore::LockstoreService>
          aLockstore,
      const nsACString& aProfileId);
  ~LockstoreStorageKeyProvider() = default;

  nsresult EnsureKek() MOZ_REQUIRES(mMutex);
  nsCString DekName(const nsACString& aOrigin, const nsACString& aClientType,
                    const nsACString& aKeyId) const;

  RefPtr<mozilla::security::lockstore::LockstoreService> mLockstore;
  Mutex mMutex{"LockstoreStorageKeyProvider"};
  nsCString mKekRef MOZ_GUARDED_BY(mMutex);
  nsCString mProfileId;
};

}  // namespace mozilla::dom::quota

#endif  // DOM_QUOTA_LOCKSTORESTORAGEKEYPROVIDER_H_
