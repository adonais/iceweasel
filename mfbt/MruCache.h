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

namespace detail {

// Helper struct for checking if a value is empty.
//
// `IsNotEmpty` will return true if `Value` is not a pointer type or if the
// pointer value is not null.
template <typename Value>
constexpr bool IsNotEmpty(const Value& aVal) {
  if constexpr (!std::is_pointer_v<Value>) {
    return true;
  } else {
    return aVal != nullptr;
  }
}

}  // namespace detail

// Provides a most recently used cache that can be used as a layer on top of
// a larger container where lookups can be expensive. The size must be a power
// of two; entries are indexed by the high bits of the scrambled hash (Fibonacci
// hashing), so callers don't need to provide a well-distributed hash.
//
// Users are expected to provide a `Cache` class that defines two required
// methods:
//   - A method for providing the hash of a key:
//
//     static HashNumber Hash(const KeyType& aKey)
//
//   - A method for matching a key to a value, for pointer types the value
//     is guaranteed not to be null.
//
//     static bool Match(const KeyType& aKey, const ValueType& aVal)
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
template <class Key, class Value, class Cache, size_t Size = 32>
class MruCache {
  static_assert(Size >= 2 && (Size & (Size - 1)) == 0,
                "Size must be a power of two");

 public:
  using KeyType = Key;
  using ValueType = Value;

  MruCache() = default;
  MruCache(const MruCache&) = delete;
  MruCache(const MruCache&&) = delete;

  // Inserts the given value into the cache. Potentially overwrites an
  // existing entry.
  template <typename U>
  void Put(const KeyType& aKey, U&& aVal) {
    *RawEntry(aKey) = std::forward<U>(aVal);
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
  // matched.
  Entry Lookup(const KeyType& aKey) {
    auto entry = RawEntry(aKey);
    bool match = detail::IsNotEmpty(*entry) && Cache::Match(aKey, *entry);
    return Entry(entry, match);
  }

 private:
  static constexpr uint32_t kShift = kHashNumberBits - CeilingLog2(Size);

  MOZ_ALWAYS_INLINE ValueType* RawEntry(const KeyType& aKey) {
    // Index using the high bits of the scrambled hash (Fibonacci hashing). This
    // stays well-distributed even for the low-entropy hashes some callers
    // provide, and avoids a modulo on this hot path.
    return &mCache[ScrambleHashCode(Cache::Hash(aKey)) >> kShift];
  }

  ValueType mCache[Size] = {};
};

}  // namespace mozilla

#endif  // mozilla_mrucache_h
