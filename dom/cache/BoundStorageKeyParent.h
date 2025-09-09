/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_dom_cache_BoundStorageKeyParent_h
#define mozilla_dom_cache_BoundStorageKeyParent_h

#include "mozilla/dom/cache/PBoundStorageKeyParent.h"

namespace mozilla {
namespace ipc {
class PBackgroundParent;
}  // namespace ipc

namespace dom::cache {
class PCacheOpParent;
class PCacheParent;
class PCacheStorageParent;
class ManagerId;

class BoundStorageKeyParent final : public PBoundStorageKeyParent {
  friend class PBoundStorageKeyParent;

 public:
  explicit BoundStorageKeyParent(
      mozilla::ipc::PBackgroundParent* aBackgroundParent)
      : mBackgroundParent(aBackgroundParent) {
    MOZ_COUNT_CTOR(BoundStorageKeyParent);
  }

  NS_INLINE_DECL_REFCOUNTING(BoundStorageKeyParent, override)

 private:
  virtual ~BoundStorageKeyParent() { MOZ_COUNT_DTOR(BoundStorageKeyParent); }

  already_AddRefed<PCacheStorageParent> AllocPCacheStorageParent(
      const Namespace& aNamespace, const PrincipalInfo& aPrincipalInfo);

  // Keeping a reference to PBackgroundParent actor as it is required to passed
  // in when creating CacheStorageParent in AllocPCacheStorageParent. Raw ptr is
  // fine here as PBackground is one of the few top-level that gets created very
  // early on in the content and parent lifecycle and extends the lifetime of
  // this class.
  mozilla::ipc::PBackgroundParent* MOZ_NON_OWNING_REF mBackgroundParent;
};

}  // namespace dom::cache
}  // namespace mozilla

#endif  // mozilla_dom_cache_BoundStorageKeyParent_h
