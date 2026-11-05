/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef DOM_QUOTA_CIPHERKEYSTOREBACKEND_H_
#define DOM_QUOTA_CIPHERKEYSTOREBACKEND_H_

#include "mozilla/Maybe.h"
#include "mozilla/Result.h"
#include "mozilla/dom/quota/NSSCipherStrategy.h"
#include "nsISupportsImpl.h"
#include "nsStringFwd.h"

namespace mozilla::dom::quota {

// Abstract interface for per-origin cipher key storage.
//
// The production implementation (LockstoreStorageKeyProvider) wraps the
// lockstore service. Tests can mock this interface to avoid XPCOM service
// dependencies.
class CipherKeyStoreBackend {
 public:
  NS_INLINE_DECL_PURE_VIRTUAL_REFCOUNTING

  virtual Result<Maybe<NSSCipherStrategy::KeyType>, nsresult> Get(
      const nsACString& aOrigin, const nsACString& aClientType,
      const nsACString& aKeyId) = 0;

  virtual nsresult Put(const nsACString& aOrigin, const nsACString& aClientType,
                       const nsACString& aKeyId,
                       const NSSCipherStrategy::KeyType& aKey) = 0;

  virtual nsresult Remove(const nsACString& aOrigin) = 0;

  virtual nsresult Clear() = 0;

  virtual void Close() = 0;

 protected:
  virtual ~CipherKeyStoreBackend() = default;
};

}  // namespace mozilla::dom::quota

#endif  // DOM_QUOTA_CIPHERKEYSTOREBACKEND_H_
