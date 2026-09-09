/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "gtest/gtest.h"
#include "mozilla/HashFunctions.h"
#include "mozilla/MruCache.h"
#include "nsString.h"

using namespace mozilla;

// A few MruCache implementations to use during testing.
struct IntMap : public MruCache<int, int, IntMap> {
  static HashNumber Hash(const KeyType& aKey) { return aKey - 1; }
  static bool IsEmpty(const ValueType& aVal) { return !aVal; }
  static bool Match(const KeyType& aKey, const ValueType& aVal) {
    return aKey == aVal;
  }
};

struct UintPtrMap : public MruCache<uintptr_t, int*, UintPtrMap> {
  static HashNumber Hash(const KeyType& aKey) { return aKey - 1; }
  static bool Match(const KeyType& aKey, const ValueType& aVal) {
    return aKey == (KeyType)aVal;
  }
};

struct StringStruct {
  nsCString mKey;
  nsCString mOther;
};

struct StringStructMap
    : public MruCache<nsCString, StringStruct, StringStructMap> {
  static HashNumber Hash(const KeyType& aKey) {
    return *aKey.BeginReading() - 1;
  }
  static bool IsEmpty(const ValueType& aVal) { return aVal.mKey.IsEmpty(); }
  static bool Match(const KeyType& aKey, const ValueType& aVal) {
    return aKey == aVal.mKey;
  }
};

// Every key hashes into the same set, so all keys collide. Used to exercise
// coexistence and eviction independently of hash distribution.
struct CollideMap : public MruCache<int, int, CollideMap, 8> {
  static HashNumber Hash(const KeyType&) { return 0; }
  static bool IsEmpty(const ValueType& aVal) { return !aVal; }
  static bool Match(const KeyType& aKey, const ValueType& aVal) {
    return aKey == aVal;
  }
};

// The number of keys CollideMap's single set holds at once.
static constexpr size_t kCollideWays = CollideMap::kWays;

// Counts how many of the keys [1, kCollideWays] are still cached.
static size_t CountLive(CollideMap& aMru) {
  size_t live = 0;
  for (size_t i = 1; i <= kCollideWays; i++) {
    if (aMru.Lookup(i)) {
      live++;
    }
  }
  return live;
}

// Helper for emulating convertable holders such as RefPtr.
template <typename T>
struct Convertable {
  T mItem;
  operator T() const { return mItem; }
};

// Helper to create a StringStructMap key.
static nsCString MakeStringKey(char aKey) {
  nsCString key;
  key.Append(aKey);
  return key;
}

TEST(MruCache, TestEmptyCache)
{
  {
    // Test a basic empty cache.
    IntMap mru;

    // Make sure the default values are set.
    for (int i = 1; i < 32; i++) {
      auto p = mru.Lookup(i);

      // Shouldn't be found.
      EXPECT_FALSE(p);
    }
  }

  {
    // Test an empty cache with pointer values.
    UintPtrMap mru;

    // Make sure the default values are set.
    for (uintptr_t i = 1; i < 32; i++) {
      auto p = mru.Lookup(i);

      // Shouldn't be found.
      EXPECT_FALSE(p);
    }
  }

  {
    // Test an empty cache with more complex structure.
    StringStructMap mru;

    // Make sure the default values are set.
    for (char i = 1; i < 32; i++) {
      const nsCString key = MakeStringKey(i);
      auto p = mru.Lookup(key);

      // Shouldn't be found.
      EXPECT_FALSE(p);
    }
  }
}

TEST(MruCache, TestPut)
{
  IntMap mru;

  // Each entry is present immediately after being inserted. (We can't assert
  // that all entries coexist: with a hashed index some keys share a slot.)
  for (int i = 1; i < 32; i++) {
    mru.Put(i, i);

    auto p = mru.Lookup(i);
    EXPECT_TRUE(p);
    EXPECT_EQ(p.Data(), i);
  }
}

TEST(MruCache, TestPutConvertable)
{
  UintPtrMap mru;

  for (uintptr_t i = 1; i < 32; i++) {
    Convertable<int*> val{(int*)i};
    mru.Put(i, val);

    auto p = mru.Lookup(i);
    EXPECT_TRUE(p);
    EXPECT_EQ(p.Data(), (int*)i);
  }
}

TEST(MruCache, TestOverwriting)
{
  // Distinct keys that map to the same set only evict each other once the set
  // is full.
  CollideMap mru;
  for (size_t i = 1; i <= kCollideWays; i++) {
    mru.Put(i, i);
  }
  EXPECT_EQ(CountLive(mru), kCollideWays);

  mru.Put(kCollideWays + 1, kCollideWays + 1);  // Evicts one of the above.

  auto p = mru.Lookup(kCollideWays + 1);
  EXPECT_TRUE(p);
  EXPECT_EQ(p.Data(), int(kCollideWays + 1));
  EXPECT_EQ(CountLive(mru), kCollideWays - 1);
}

TEST(MruCache, TestRemove)
{
  {
    IntMap mru;

    // Insert, confirm present, remove, confirm gone -- one key at a time so a
    // hashed slot collision between two keys can't perturb the result.
    for (int i = 1; i < 32; i++) {
      mru.Put(i, i);

      // Should be present.
      auto p = mru.Lookup(i);
      EXPECT_TRUE(p);

      mru.Remove(i);

      // Should no longer match.
      p = mru.Lookup(i);
      EXPECT_FALSE(p);
    }
  }

  {
    UintPtrMap mru;

    for (uintptr_t i = 1; i < 32; i++) {
      mru.Put(i, (int*)i);

      // Should be present.
      auto p = mru.Lookup(i);
      EXPECT_TRUE(p);

      mru.Remove(i);

      // Should no longer match.
      p = mru.Lookup(i);
      EXPECT_FALSE(p);
    }
  }

  {
    StringStructMap mru;

    for (char i = 1; i < 32; i++) {
      const nsCString key = MakeStringKey(i);
      mru.Put(key, StringStruct{key, "foo"_ns});

      // Should be present.
      auto p = mru.Lookup(key);
      EXPECT_TRUE(p);

      mru.Remove(key);

      // Should no longer match.
      p = mru.Lookup(key);
      EXPECT_FALSE(p);
    }
  }
}

TEST(MruCache, TestClear)
{
  IntMap mru;

  // Fill it up.
  for (int i = 1; i < 32; i++) {
    mru.Put(i, i);
  }

  // Empty it.
  mru.Clear();

  // Now check each value.
  for (int i = 1; i < 32; i++) {
    auto p = mru.Lookup(i);

    // Should not be found.
    EXPECT_FALSE(p);
  }
}

TEST(MruCache, TestLookupMissingAndSet)
{
  IntMap mru;

  // Value not found.
  auto p = mru.Lookup(1);
  EXPECT_FALSE(p);

  // Set it.
  p.Set(1);
  EXPECT_TRUE(p);
  EXPECT_EQ(p.Data(), 1);

  // Look it up again.
  p = mru.Lookup(1);
  EXPECT_TRUE(p);
  EXPECT_EQ(p.Data(), 1);

  // Test w/ a convertable value.
  p = mru.Lookup(2);
  EXPECT_FALSE(p);

  // Set it.
  Convertable<int> val{2};
  p.Set(val);
  EXPECT_TRUE(p);
  EXPECT_EQ(p.Data(), 2);

  // Look it up again.
  p = mru.Lookup(2);
  EXPECT_TRUE(p);
  EXPECT_EQ(p.Data(), 2);
}

TEST(MruCache, TestLookupAndOverwrite)
{
  // Fill up a set with keys that all collide.
  CollideMap mru;
  for (size_t i = 1; i <= kCollideWays; i++) {
    mru.Put(i, i);
  }

  // Lookup a key that maps to the same, now full, set.
  const int key = kCollideWays + 1;
  auto p = mru.Lookup(key);
  EXPECT_FALSE(p);  // not a match

  // Now overwrite the entry it picked.
  p.Set(key);
  EXPECT_TRUE(p);
  EXPECT_EQ(p.Data(), key);

  // One of the previous keys should be gone now.
  EXPECT_EQ(CountLive(mru), kCollideWays - 1);

  p = mru.Lookup(key);
  EXPECT_TRUE(p);
  EXPECT_EQ(p.Data(), key);
}

TEST(MruCache, TestLookupAndRemove)
{
  IntMap mru;

  // Set 1.
  mru.Put(1, 1);

  auto p = mru.Lookup(1);
  EXPECT_TRUE(p);
  EXPECT_EQ(p.Data(), 1);

  // Now remove it.
  p.Remove();
  EXPECT_FALSE(p);

  p = mru.Lookup(1);
  EXPECT_FALSE(p);
}

TEST(MruCache, TestLookupNotMatchedAndRemove)
{
  IntMap mru;

  // Set 1.
  mru.Put(1, 1);

  // Lookup a key that matches 1's entry.
  auto p = mru.Lookup(32);
  EXPECT_FALSE(p);

  // Now attempt to remove it.
  p.Remove();

  // Make sure 1 is still there.
  p = mru.Lookup(1);
  EXPECT_TRUE(p);
  EXPECT_EQ(p.Data(), 1);
}

TEST(MruCache, TestLookupAndSetWithMove)
{
  StringStructMap mru;

  const nsCString key = MakeStringKey((char)1);
  StringStruct val{key, "foo"_ns};

  auto p = mru.Lookup(key);
  EXPECT_FALSE(p);
  p.Set(std::move(val));

  EXPECT_TRUE(p.Data().mKey == key);
  EXPECT_TRUE(p.Data().mOther == "foo"_ns);
}

TEST(MruCache, TestAssociativity)
{
  CollideMap mru;

  for (size_t i = 1; i <= kCollideWays; i++) {
    mru.Put(i, i);
  }

  for (size_t i = 1; i <= kCollideWays; i++) {
    auto p = mru.Lookup(i);
    EXPECT_TRUE(p);
    EXPECT_EQ(p.Data(), int(i));
  }
}

TEST(MruCache, TestPutReusesMatchingEntry)
{
  CollideMap mru;
  // Putting the same key should not create multiple entries.
  mru.Put(1, 1);
  mru.Put(1, 1);
  mru.Remove(1);
  EXPECT_FALSE(mru.Lookup(1));
}
