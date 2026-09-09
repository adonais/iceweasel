/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_MruCache_h
#define mozilla_MruCache_h

#include <cstddef>
#include <type_traits>
#include <utility>

#include "mozilla/Assertions.h"
#include "mozilla/Attributes.h"
#include "mozilla/HashFunctions.h"
#include "mozilla/MathAlgorithms.h"

namespace mozilla {

// Provides a most recently used cache that can be used as a layer on top of
// a larger container where lookups can be expensive.
//
// `Size` is the total number of entries and must be a power of two. The cache
// is set-associative: entries are grouped into sets, and the set is indexed by
// the high bits of the scrambled hash (Fibonacci hashing), so callers don't
// need to provide a well-distributed hash.
//
// Users are expected to provide a `Cache` class that defines the following
// methods:
//
//   - A method for providing the hash of a key:
//
//     static HashNumber Hash(const KeyType& aKey)
//
//   - A method for matching a key to a value, for pointer types the value
//     is guaranteed not to be null.
//
//     static bool Match(const KeyType& aKey, const ValueType& aVal)
//
//   - A method telling whether a value is an unused entry.
//     This is only required if `ValueType` is not a pointer type, for which
//     null is used. `ValueType{}` must be empty, since that is what `Remove()`
//     and `Clear()` leave behind. Reporting a live entry as empty is not
//     incorrect, just wasteful: it will be treated as a free slot and thus
//     never found again.
//
//     static bool IsEmpty(const ValueType& aVal)
//
// For example:
//    class MruExample : public MruCache<void*, PtrInfo*, MruExample>
//    {
//      static HashNumber Hash(const KeyType& aKey)
//      {
//        return HashGeneric(aKey);
//      }
//      static Match(const KeyType& aKey, const ValueType& aVal)
//      {
//        return aVal->mPtr == aKey;
//      }
//    };
template <class Key, class Value, class Cache, size_t Size = 32,
          size_t Ways = 2>
class MruCache {
 public:
  // Associativity: how many entries a single key hash may occupy.
  static constexpr size_t kWays = Ways;

  static_assert((Size & (Size - 1)) == 0, "Size must be a power of two");
  static_assert(Size > kWays,
                "Size must be larger than the associativity, so that there's "
                "more than one set");

  using KeyType = Key;
  using ValueType = Value;

  MruCache() = default;
  MruCache(const MruCache&) = delete;
  MruCache(const MruCache&&) = delete;

  // Default implementation of the emptiness check described above, which
  // `Cache` is expected to shadow for non-pointer value types.
  static bool IsEmpty(const ValueType& aVal) {
    static_assert(std::is_pointer_v<ValueType>,
                  "Non-pointer value types must provide "
                  "`static bool IsEmpty(const ValueType&)`");
    return !aVal;
  }

  // Inserts the given value into the cache. Overwrites the existing entry for
  // `aKey` if there is one, and otherwise potentially evicts an unrelated
  // entry.
  template <typename U>
  void Put(const KeyType& aKey, U&& aVal) {
    Lookup(aKey).Set(std::forward<U>(aVal));
  }

  // Removes the given entry if it is in the cache.
  void Remove(const KeyType& aKey) { Lookup(aKey).Remove(); }

  // Clears all cached entries and resets them to a default value.
  void Clear() {
    for (ValueType& val : mCache) {
      val = ValueType{};
    }
  }

  // Helper that holds an entry that matched a lookup key. Usage:
  //
  //    auto p = mCache.Lookup(aKey);
  //    if (p) {
  //      return p.Data();
  //    }
  //
  //    auto foo = new Foo();
  //    p.Set(foo);
  //    return foo;
  class Entry {
   public:
    Entry(ValueType* aEntry, bool aMatch) : mEntry(aEntry), mMatch(aMatch) {
      MOZ_ASSERT(mEntry);
    }

    explicit operator bool() const { return mMatch; }

    ValueType& Data() const {
      MOZ_ASSERT(mMatch);
      return *mEntry;
    }

    template <typename U>
    void Set(U&& aValue) {
      mMatch = true;
      Data() = std::forward<U>(aValue);
    }

    void Remove() {
      if (mMatch) {
        Data() = ValueType{};
        mMatch = false;
      }
    }

   private:
    ValueType* mEntry;  // Location of the entry in the cache.
    bool mMatch;        // Whether the value matched.
  };

  // Retrieves an entry from the cache. Can be used to test if an entry is
  // present, update the entry to a new value, or remove the entry if one was
  // matched. Does not modify the cache.
  MOZ_ALWAYS_INLINE Entry Lookup(const KeyType& aKey) {
    const HashNumber hash = ScrambleHashCode(Cache::Hash(aKey));
    const size_t base = SetIndex(hash) * kWays;

    size_t freeEntry = kWays;
    for (size_t way = 0; way < kWays; ++way) {
      ValueType& val = mCache[base + way];
      if (Cache::IsEmpty(val)) {
        freeEntry = way;
        continue;
      }
      if (Cache::Match(aKey, val)) {
        return Entry(&val, true);
      }
    }
    if (freeEntry == kWays) {
      // The set is full, so evict an entry chosen by the low bits of the hash.
      // TODO(emilio): Maybe better eviction policy?
      freeEntry = hash & (kWays - 1);
    }
    return Entry(&mCache[base + freeEntry], false);
  }

 private:
  static constexpr size_t kSets = Size / kWays;
  static constexpr uint32_t kSetBits = CeilingLog2(kSets);
  static constexpr uint32_t kShift = kHashNumberBits - kSetBits;
  static constexpr size_t SetIndex(HashNumber aHash) { return aHash >> kShift; }

  ValueType mCache[Size] = {};
};

}  // namespace mozilla

#endif  // mozilla_MruCache_h
