/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsGkAtoms.h"

#include "mozilla/HashFunctions.h"

namespace nsGkAtoms::detail {

// Because this is `constexpr` it ends up in read-only memory where it can be
// shared between processes.
extern constexpr GkAtoms gGkAtoms = {
// The initialization of each atom's string.
//
//   u"a" u"\0" "bb" "\0",
//
#define STATIC_ATOM(name_, value_, index_, offset_) u"" value_ u"\0"
#include "StaticAtomList.h"
#undef STATIC_ATOM
    ,
    {
// The initialization of the atoms themselves.
//
// Note that |value_| is an 8-bit string, and so |sizeof(value_)| is equal
// to the number of chars (including the terminating '\0'). The |u""| prefix
// converts |value_| to a 16-bit string.
//
// Similarly, offset_ is in chars, so we need to multiply to get to the right
// offset in bytes.
//
//   nsStaticAtom(
//     1,
//     HashString(u"" "a"),
//     offsetof(GkAtoms, mAtoms[index_]) - offset_ * 2,
//     nsAtom::ComputeIsAsciiLowercase(u"" "a")),
//
#define STATIC_ATOM(name_, value_, index_, offset_)                 \
  nsStaticAtom(sizeof(value_) - 1, mozilla::HashString(u"" value_), \
               offsetof(GkAtoms, mAtoms[index_]) - offset_ * 2,     \
               nsAtom::ComputeIsAsciiLowercase(u"" value_)),
#include "StaticAtomList.h"
#undef STATIC_ATOM
    }};

}  // namespace nsGkAtoms::detail
