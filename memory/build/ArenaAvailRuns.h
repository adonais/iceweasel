/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

#ifndef ARENA_AVAIL_RUNS_H
#define ARENA_AVAIL_RUNS_H

#include "BaseArray.h"
#include "Constants.h"
#include "Chunk.h"
#include "Globals.h"

struct ArenaAvailTreeTrait {
  static mozilla::DoublyLinkedListElement<arena_chunk_map_t>& Get(
      arena_chunk_map_t* aThis) {
    return aThis->link;
  }
  static const mozilla::DoublyLinkedListElement<arena_chunk_map_t>& Get(
      const arena_chunk_map_t* aThis) {
    return aThis->link;
  }
};

// Wrap a doubly linked list.
class ArenaAvailRunsSize {
 private:
  mozilla::DoublyLinkedList<arena_chunk_map_t, ArenaAvailTreeTrait> mRuns;

 public:
  arena_chunk_map_t* Search() { return &(*mRuns.begin()); }

  bool IsEmpty() const { return mRuns.isEmpty(); }

  void Insert(arena_chunk_map_t* aElem) { mRuns.pushFront(aElem); }

  void Remove(arena_chunk_map_t* aElem) { mRuns.remove(aElem); }
};

class ArenaAvailRuns {
 private:
  BaseArray<ArenaAvailRunsSize> mSizeClasses;
  // If a given size class is empty then its slot in mHints points to the
  // next size class index worth checking.
  // Hints may be:
  //   0                  -> no information.
  //   MaxSizeClass() + 1 -> all the larger size classes are empty.
  //   n                  -> mSizeClasses[n] may be non-empty, n will never
  //                         point to a smaller size class.
  BaseArray<unsigned> mHints;

  static unsigned GetSizeClass(size_t aSize) {
    // aSize must be a multiple of gPageSize;
    MOZ_ASSERT((aSize % mozilla::gPageSize) == 0);
    return aSize >> mozilla::gPageSize2Pow;
  }

  static unsigned MaxSizeClass() {
    return GetSizeClass(PAGE_CEILING(mozilla::gMaxLargeClass));
  }

  // This is not in arena_chunk_map_t because that's defined before
  // gPageSizeMask.
  static size_t RunSize(const arena_chunk_map_t* aElem) {
    return aElem->bits & ~mozilla::gPageSizeMask;
  }

 public:
  ArenaAvailRuns() {
    mSizeClasses.Init(MaxSizeClass() + 1);
    mHints.Init(MaxSizeClass() + 1);
  }

  arena_chunk_map_t* SearchOrNext(size_t aSize) {
    unsigned size_class = GetSizeClass(aSize);
    MOZ_ASSERT(size_class <= MaxSizeClass());

    arena_chunk_map_t* elem = mSizeClasses[size_class].Search();
    if (MOZ_LIKELY(elem)) {
      MOZ_ASSERT(RunSize(elem) >= aSize);
      return elem;
    }

    if (size_class == MaxSizeClass()) {
      // There are no other size classes to check.
      return nullptr;
    }

    // Search for a non-empty size-class.
    unsigned start_size_class = size_class;
    do {
      unsigned prev_size_class = size_class;
      size_class = mHints[prev_size_class];
      if (size_class == 0) {
        // No hint available
        size_class = prev_size_class + 1;
      }

      if (size_class > MaxSizeClass()) {
        // Set the hint beyond the maximum so the next search will
        // terminate quickly.
        mHints[prev_size_class] = MaxSizeClass() + 1;
        mHints[start_size_class] = MaxSizeClass() + 1;
        return nullptr;
      }
    } while (mSizeClasses[size_class].IsEmpty());

    // This must be a populated size class.
    mHints[start_size_class] = size_class;
    elem = mSizeClasses[size_class].Search();
    MOZ_ASSERT(elem);
    MOZ_ASSERT(RunSize(elem) >= aSize);
    return elem;
  }

  void Insert(arena_chunk_map_t* aElem) {
    unsigned size_class = GetSizeClass(RunSize(aElem));

    if (mSizeClasses[size_class].IsEmpty() && size_class != 0) {
      // Update any hints in preceding empty classes.  This can stop when it
      // finds a non-empty class.  It does update the hint in the first
      // non-empty class so that when that class does become empty the hint
      // will be ready.
      for (int i = size_class - 1; i >= 0; i--) {
        mHints[i] = size_class;
        if (!mSizeClasses[i].IsEmpty()) {
          break;
        }
      }
    }

    mSizeClasses[size_class].Insert(aElem);
  }

  void Remove(arena_chunk_map_t* aElem) {
    mSizeClasses[GetSizeClass(RunSize(aElem))].Remove(aElem);

    // A removal doesn't update the hint.
  }
};

#endif /* ! ARENA_AVAIL_RUNS_H */
