/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsHtml5AtomTable.h"

#include "mozilla/HashFunctions.h"
#include "mozilla/MathAlgorithms.h"
#include "nsHashKeys.h"
#include "nsThreadUtils.h"

nsHtml5AtomTable::nsHtml5AtomTable() {
  static_assert((kRecentlyUsedSize & (kRecentlyUsedSize - 1)) == 0,
                "must be a power of two");
#ifdef DEBUG
  mPermittedLookupEventTarget = mozilla::GetCurrentSerialEventTarget();
#endif
}

nsHtml5AtomTable::~nsHtml5AtomTable() = default;

nsAtom* nsHtml5AtomTable::GetAtom(const nsAString& aKey) {
  MOZ_ASSERT(mPermittedLookupEventTarget->IsOnCurrentThread());
  // We index using the high bits of the scrambled hash rather than `hash %
  // size`. This stays well-distributed for the short, similar attribute values
  // we cache, so frequently-parsed strings don't evict each other.
  constexpr uint32_t kTableShift =
      mozilla::kHashNumberBits - mozilla::CeilingLog2(kRecentlyUsedSize);
  const uint32_t hash = mozilla::HashString(aKey);
  const uint32_t index = mozilla::ScrambleHashCode(hash) >> kTableShift;
  if (nsAtom* atom = mRecentlyUsedParserAtoms[index]) {
    if (atom->hash() == hash && atom->Equals(aKey)) {
      return atom;
    }
  }

  RefPtr<nsAtom> atom = NS_Atomize(aKey, hash);
  nsAtom* ret = atom.get();
  mRecentlyUsedParserAtoms[index] = std::move(atom);
  return ret;
}
