/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef DOM_QUOTA_ORIGINCACHEMAP_H_
#define DOM_QUOTA_ORIGINCACHEMAP_H_

#include <utility>

#include "PLDHashTable.h"
#include "mozilla/HashFunctions.h"
#include "mozilla/Maybe.h"
#include "mozilla/Result.h"
#include "mozilla/dom/quota/Assertions.h"
#include "mozilla/dom/quota/CommonMetadata.h"
#include "mozilla/dom/quota/PersistenceType.h"
#include "mozilla/dom/quota/ResultExtensions.h"
#include "nsHashKeys.h"
#include "nsTHashMap.h"

namespace mozilla::dom::quota {

// Map of `(persistenceType, origin) -> FullOriginMetadata` populated
// once at the top of `InitializeRepository` from the L1 cache, and
// consulted per-origin during the disk scan to decide whether the
// existing DB row already matches what we'd write.
//
// The "active" flag lets callers outside the reconciliation path share
// the same type by reference instead of plumbing a nullable pointer:
// mutating operations are no-ops on an inactive map.
class OriginCacheMap {
 public:
  OriginCacheMap() = default;

  void Activate() {
    AssertIsOnIOThread();
    mActive = true;
  }

  bool IsActive() const {
    AssertIsOnIOThread();
    return mActive;
  }

  void InsertOrUpdate(PersistenceType aPersistenceType,
                      const nsACString& aOrigin, FullOriginMetadata&& aValue) {
    AssertIsOnIOThread();
    if (!mActive) {
      return;
    }
    Key key(aPersistenceType, nsCString(aOrigin));
    mMap.InsertOrUpdate(key, std::move(aValue));
  }

  mozilla::Maybe<FullOriginMetadata> Extract(PersistenceType aPersistenceType,
                                             const nsACString& aOrigin) {
    AssertIsOnIOThread();
    if (!mActive) {
      return mozilla::Nothing();
    }
    Key key(aPersistenceType, nsCString(aOrigin));
    return mMap.Extract(key);
  }

  bool IsEmpty() const {
    AssertIsOnIOThread();
    return mMap.IsEmpty();
  }

  template <typename F>
  Result<Ok, nsresult> ForEachEntry(F&& aCallback) const {
    AssertIsOnIOThread();
    for (const auto& entry : mMap) {
      const Key& key = entry.GetKey();
      QM_TRY(aCallback(key.first, key.second));
    }
    return Ok{};
  }

  // Process-wide inactive instance suitable as a default argument for
  // callers that don't have a reconciliation map of their own. Safe to
  // share: all mutating operations are no-ops when inactive.
  static OriginCacheMap& Inactive();

 private:
  using Key = std::pair<PersistenceType, nsCString>;

  class KeyHashKey : public PLDHashEntryHdr {
   public:
    using KeyType = const Key&;
    using KeyTypePointer = const Key*;

    explicit KeyHashKey(KeyTypePointer aKey) : mKey(*aKey) {}
    KeyHashKey(KeyHashKey&& aOther) noexcept
        : PLDHashEntryHdr(std::move(aOther)), mKey(std::move(aOther.mKey)) {}
    ~KeyHashKey() = default;

    KeyType GetKey() const { return mKey; }
    bool KeyEquals(KeyTypePointer aKey) const { return *aKey == mKey; }

    static KeyTypePointer KeyToPointer(KeyType aKey) { return &aKey; }
    static PLDHashNumber HashKey(KeyTypePointer aKey) {
      return mozilla::HashGeneric(static_cast<uint32_t>(aKey->first),
                                  mozilla::HashString(aKey->second));
    }

    enum { ALLOW_MEMMOVE = false };

   private:
    Key mKey;
  };

  using HashMap = nsTHashMap<KeyHashKey, FullOriginMetadata>;

  bool mActive = false;
  HashMap mMap;
};

}  // namespace mozilla::dom::quota

#endif  // DOM_QUOTA_ORIGINCACHEMAP_H_
