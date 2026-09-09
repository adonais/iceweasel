/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef gc_AtomMarking_inl_h
#define gc_AtomMarking_inl_h

#include "gc/AtomMarking.h"

#include "mozilla/Assertions.h"

#include <type_traits>

#include "vm/JSContext.h"
#include "vm/StringType.h"
#include "vm/SymbolType.h"

#include "gc/GC-inl.h"
#include "gc/Heap-inl.h"

namespace js {
namespace gc {

/* static */
inline size_t AtomRefRuntime::getAtomBit(TenuredCell* thing) {
  MOZ_ASSERT(thing->zoneFromAnyThread()->isAtomsZone());
  Arena* arena = thing->arena();
  size_t arenaBit = (reinterpret_cast<uintptr_t>(thing) - arena->address()) /
                    CellBytesPerMarkBit;
  return arena->atomBitmapStart() * JS_BITS_PER_WORD + arenaBit;
}

template <typename T>
MOZ_ALWAYS_INLINE bool AtomRefRuntime::inlinedRecordRefInternal(
    Zone* zone, T* thing, const AutoMarkingLock& lock) {
  static_assert(std::is_same_v<T, JSAtom> || std::is_same_v<T, JS::Symbol>,
                "Should only be called with JSAtom* or JS::Symbol* argument");

  MOZ_ASSERT(zone);
  MOZ_ASSERT(!zone->isAtomsZone());

  MOZ_ASSERT(thing);
  js::gc::TenuredCell* cell = &thing->asTenured();
  MOZ_ASSERT(cell->zoneFromAnyThread()->isAtomsZone());

  if (thing->isPermanentAndMayBeShared()) {
    return true;
  }

  if constexpr (std::is_same_v<T, JSAtom>) {
    if (thing->isPinned()) {
      return true;
    }
  }

  size_t bit = getAtomBit(cell);
  size_t blackBit = bit + size_t(ColorBit::BlackBit);
  size_t grayOrBlackBit = bit + size_t(ColorBit::GrayOrBlackBit);
  MOZ_ASSERT(grayOrBlackBit / JS_BITS_PER_WORD < allocatedWords);

  SparseBitmap& bitmap = zone->referencedAtoms();

  if (!bitmap.ensureBitExists(grayOrBlackBit)) {
    return false;
  }

#ifdef JS_GC_CONCURRENT_MARKING
  bitmap.atomicSetExistingBit(blackBit);
  if constexpr (std::is_same_v<T, JS::Symbol>) {
    bitmap.atomicSetExistingBit(grayOrBlackBit);
  }
#else
  MOZ_ALWAYS_TRUE(bitmap.setBit(blackBit));
  if constexpr (std::is_same_v<T, JS::Symbol>) {
    MOZ_ALWAYS_TRUE(bitmap.setBit(grayOrBlackBit));
  }
#endif

  // Children of the thing also need to be marked in the context's zone.
  // We don't have a JSTracer for this so manually handle the cases in which
  // an atom can reference other atoms.
  if constexpr (std::is_same_v<T, JS::Symbol>) {
    if (JSAtom* description = thing->description()) {
      if (!inlinedRecordRefInternal(zone, description, lock)) {
        return false;
      }
    }
  }

  return true;
}

inline void AtomRefRuntime::maybeUnmarkGrayAtomically(Zone* zone,
                                                      JS::Symbol* symbol) {
  MOZ_ASSERT(zone);
  MOZ_ASSERT(!zone->isAtomsZone());
  MOZ_ASSERT(symbol);
  MOZ_ASSERT(symbol->zoneFromAnyThread()->isAtomsZone());

  if (symbol->isPermanentAndMayBeShared()) {
    return;
  }

  // The atom is currently referred to with a black or gray reference.
  MOZ_ASSERT(hasRef(zone, symbol));

  {
    // This may be called on the background thread by concurrent marking.
    AutoMarkingLock lock(zone, atomRefLock);

    // Set the black bit. This has the effect of making the mark black if it was
    // previously gray.
    size_t blackBit = getAtomBit(symbol) + size_t(ColorBit::BlackBit);
    MOZ_ASSERT(blackBit / JS_BITS_PER_WORD < allocatedWords);
    zone->referencedAtoms().atomicSetExistingBit(blackBit);
  }

  MOZ_ASSERT(getRefColor(zone, symbol) == CellColor::Black);
}

template <typename T>
inline void GCRuntime::maybeMarkWeaklyHeldAtom(T* atom) {
  // To effectively refine atom references we do it at the end of collection
  // before marking atoms referenced from uncollected zones in
  // GCRuntime::updateAtomsBitmap. The refinement step is to AND each zone's
  // references with the atoms currently marked.
  //
  // Conceptually, it would be simplest to mark references from uncollected
  // zones at the start of collection. Delaying this ensures that references
  // from uncollected zones don't stop us removing dead references from
  // collected zones (otherwise we would require all zones with references to
  // that atom to be collected at the same time to drop them).
  //
  // The problem is weak references: we need to keep the zone's reference but we
  // never directly mark the atom. To fix this we mark atoms referenced by
  // uncollected zones when we encounter weak references to them. This would
  // have happened later anyway so the final mark state is not affected. Doing
  // this means the atom is marked before the refinement step which then keeps
  // the reference.

  static_assert(std::is_same_v<T, JSAtom> || std::is_same_v<T, JS::Symbol>);

  Zone* zone = atom->zoneFromAnyThread();
  MOZ_ASSERT(zone->isAtomsZone());
  if (!zone->isGCMarkingOrSweeping()) {
    return;
  }

  CellColor refColor = isAtomReferencedByUncollectedZone(&atom->asTenured());
  if (refColor == CellColor::White) {
    return;
  }

  // Set the mark bits directly since this may be called after normal marking
  // has finished. Implicitly marked edges are handled via weakmap marking which
  // happens after this.
  MarkColor color = AsMarkColor(refColor);
  (void)atom->asTenured().markIfUnmarked(color);
  if constexpr (std::is_same_v<T, JS::Symbol>) {
    if (JSAtom* description = atom->description()) {
      (void)description->asTenured().markIfUnmarked(color);
    }
  }
}

inline CellColor GCRuntime::isAtomReferencedByUncollectedZone(
    TenuredCell* atom) {
  MOZ_ASSERT(atom->zoneFromAnyThread()->isAtomsZone());

  if (!atomsUsedByUncollectedZones.ref()) {
    return CellColor::White;
  }

  MOZ_ASSERT(atomsZone()->wasGCStarted());

  size_t bit = AtomRefRuntime::getAtomBit(atom);
  size_t blackBit = bit + size_t(ColorBit::BlackBit);
  size_t grayOrBlackBit = bit + size_t(ColorBit::GrayOrBlackBit);
  MOZ_ASSERT(grayOrBlackBit / JS_BITS_PER_WORD < atomReferences.allocatedWords);

  const DenseBitmap& bitmap = *atomsUsedByUncollectedZones.ref();
  if (grayOrBlackBit >= bitmap.count()) {
    return CellColor::White;  // Atom created during collection.
  }

  if (bitmap.getBit(blackBit)) {
    return CellColor::Black;
  }

  if (bitmap.getBit(grayOrBlackBit)) {
    return CellColor::Gray;
  }

  return CellColor::White;
}

template <typename T>
MOZ_ALWAYS_INLINE void AtomRefRuntime::inlinedRecordRefInfallible(Zone* zone,
                                                                  T* thing) {
  // TODO: The main thread only needs to take the lock (here and in the next
  // method) if it expands the bitmap but that's hard to arrange currently. This
  // only affects concurrent marking builds.
  AutoMarkingLock lock(zone->runtimeFromMainThread(), atomRefLock);

  AutoEnterOOMUnsafeRegion oomUnsafe;
  if (!inlinedRecordRefInternal(zone, thing, lock)) {
    oomUnsafe.crash("AtomRefRuntime::inlinedRecordRefInfallible");
  }
}

template <typename T>
MOZ_ALWAYS_INLINE bool AtomRefRuntime::inlinedRecordRefFallible(Zone* zone,
                                                                T* thing) {
  AutoMarkingLock lock(zone->runtimeFromMainThread(), atomRefLock);

  return inlinedRecordRefInternal(zone, thing, lock);
}

}  // namespace gc
}  // namespace js

#endif  // gc_AtomMarking_inl_h
