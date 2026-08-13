/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "mozilla/TiedFields.h"

using namespace mozilla;

static_assert(sizeof(PaddingField<bool>) == 1);
static_assert(sizeof(PaddingField<bool, 2>) == 2);
static_assert(sizeof(PaddingField<int>) == 4);

struct Cat {
  int i;
  bool b;

  constexpr auto MutTiedFields() { return std::tie(i, b); }
};
static_assert(sizeof(Cat) == 8);
static_assert(!AreAllBytesTiedFields<Cat>());

struct Dog {
  bool b;
  int i;

  constexpr auto MutTiedFields() { return std::tie(i, b); }
};
static_assert(sizeof(Dog) == 8);
static_assert(!AreAllBytesTiedFields<Dog>());

struct Fish {
  bool b;
  bool padding[3];
  int i;

  constexpr auto MutTiedFields() { return std::tie(i, b, padding); }
};
static_assert(sizeof(Fish) == 8);
static_assert(AreAllBytesTiedFields<Fish>());

struct Eel {  // Like a Fish, but you can skip serializing the padding.
  bool b;
  PaddingField<bool, 3> padding;
  int i;

  constexpr auto MutTiedFields() { return std::tie(i, b, padding); }
};
static_assert(sizeof(Eel) == 8);
static_assert(AreAllBytesTiedFields<Eel>());

// #define LETS_USE_BIT_FIELDS
#ifdef LETS_USE_BIT_FIELDS
#  undef LETS_USE_BIT_FIELDS

struct Platypus {
  short s : 1;
  short s2 : 1;
  int i;

  constexpr auto MutTiedFields() {
    return std::tie(s, s2, i);  // Error: Can't take reference to bit-field.
  }
};

#endif

struct FishTank {
  Fish f;
  int i2;

  constexpr auto MutTiedFields() { return std::tie(f, i2); }
};
static_assert(sizeof(FishTank) == 12);
static_assert(AreAllBytesTiedFields<FishTank>());

struct CatCarrier {
  Cat c;
  int i2;

  constexpr auto MutTiedFields() { return std::tie(c, i2); }
};
static_assert(sizeof(CatCarrier) == 12);
static_assert(AreAllBytesTiedFields<CatCarrier>());
static_assert(
    !AreAllBytesTiedFields<decltype(CatCarrier::c)>());  // BUT BEWARE THIS!
// For example, if we had AreAllBytesRecursiveTiedFields:
// static_assert(!AreAllBytesRecursiveTiedFields<CatCarrier>());

// These tests all use static assertions to check behavior.
int main() { return 0; }
