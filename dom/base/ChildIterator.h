/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef ChildIterator_h
#define ChildIterator_h

#include <stdint.h>

#include "nsIContent.h"

namespace mozilla::dom {

template <TreeKind>
class ChildIteratorBase;

using ChildIterator = ChildIteratorBase<TreeKind::DOM>;
using FlattenedChildIteratorForSelection =
    ChildIteratorBase<TreeKind::FlatForSelection>;
using FlattenedChildIterator = ChildIteratorBase<TreeKind::Flat>;

// Iterates over the children of aParent in the specified type of tree.
//
// The iterator can be initialized to start at the end by providing false for
// aStartAtBeginning in order to start iterating in reverse from the last child.
template <TreeKind aKind>
class ChildIteratorBase {
  static_assert(aKind != TreeKind::ShadowIncludingDOM,
                "It's unclear what should do when the parent is a shadow host "
                "in this TreeKind so that we don't support it");

 public:
  explicit ChildIteratorBase(const nsINode* aParentNode,
                             bool aStartAtBeginning = true);

  [[nodiscard]] nsIContent* GetNextChild();

  // Looks for aChildToFind respecting insertion points until aChildToFind is
  // found.  This can be O(1) instead of O(N) in many cases.
  bool Seek(const nsIContent* aChildToFind);

  // Returns the current target of this iterator (which might be an explicit
  // child of the node, or a node assigned to a slot.
  [[nodiscard]] nsIContent* Get() const { return mChild; }

  // Returns the original parent we were initialized with.
  [[nodiscard]] const nsINode* ParentNode() const {
    return mOriginalParentNode;
  }

  // The inverse of GetNextChild. Properly steps in and out of insertion
  // points.
  [[nodiscard]] nsIContent* GetPreviousChild();

  [[nodiscard]] nsIContent* GetFirstChild() {
    mIsFirst = true;
    mChild = nullptr;
    mIndexInInserted = 0;
    return GetNextChild();
  }
  [[nodiscard]] nsIContent* GetLastChild();

  [[nodiscard]] bool ShadowDOMInvolved() const { return mShadowDOMInvolved; }

  [[nodiscard]] static uint32_t GetLength(const nsINode* aParent);
  [[nodiscard]] static Maybe<uint32_t> GetIndexOf(
      const nsINode* aParent, const nsINode* aPossibleChild);
  [[nodiscard]] static nsIContent* GetChildAt(const nsINode* aParent,
                                              uint32_t aIndex);
  [[nodiscard]] static nsIContent* GetFirstChild(const nsINode* aParent) {
    return ChildIteratorBase(aParent).GetNextChild();
  }
  [[nodiscard]] static nsIContent* GetLastChild(const nsINode* aParent) {
    return ChildIteratorBase(aParent, false).GetPreviousChild();
  }

  /**
   * Return the next sibling of aChild in the tree. If this handles flattened
   * tree and aChild is assigned to a <slot>, this needs to compute the index
   * first to get the next assigned node. Therefore, this may be slow. If you
   * need to get the next siblings continuously, you should not use this static
   * method to avoid to compute the index for the each further call.
   */
  [[nodiscard]] static nsIContent* GetNextChild(const nsIContent* aChild) {
    MOZ_ASSERT(aChild);
    nsINode* const parentNode = GetParentNodeOf(*aChild);
    if (!parentNode) {
      return nullptr;
    }
    ChildIteratorBase iter(parentNode);
    return iter.Seek(aChild) ? iter.GetNextChild() : nullptr;
  }

  /**
   * Return the previous sibling of aChild in the tree. If this handles
   * flattened tree and aChild is assigned to a <slot>, this needs to compute
   * the index first to get the previous assigned node. Therefore, this may be
   * slow. If you need to get the previous siblings continuously, you should not
   * use this static method to avoid to compute the index for the each further
   * call.
   */
  [[nodiscard]] static nsIContent* GetPreviousChild(const nsIContent* aChild) {
    MOZ_ASSERT(aChild);
    nsINode* const parentNode = GetParentNodeOf(*aChild);
    if (!parentNode) {
      return nullptr;
    }
    ChildIteratorBase iter(parentNode);
    return iter.Seek(aChild) ? iter.GetPreviousChild() : nullptr;
  }

  /**
   * Return the parent node to get the siblings of aChild. This won't return a
   * ShadowRoot even if aChild is a child of a ShadowRoot. Instead, this returns
   * the host element in that case. Therefore, you can use this to iterate
   * siblings of inclusive ancestors like doing this:
   *
   * nsIContent* child = aChild;
   * for (nsIContent* parent = ChildIteratorBase<aKind>::GetParentNodeOf(child);
   *      parent; parent = ChildIteratorBase<aKind>::GetParentNodeOf(child)) {
   *   ChildIteratorBase<aKind> iter(parent);
   *   MOZ_ALWAYS_TRUE(iter.Seek(child));
   *   // Do something.
   *   child = parent;
   * }
   *
   * The Seek() should never fail if it fails, this has a bug.
   */
  [[nodiscard]] static nsINode* GetParentNodeOf(const nsIContent& aChild);

 protected:
  // The parent of the children being iterated. For shadow hosts this will point
  // to its shadow root.
  const nsINode* mParentNode;

  // If parent is a slot element with assigned slots, this points to the parent
  // as HTMLSlotElement, otherwise, it's null.
  const HTMLSlotElement* mParentNodeAsSlot = nullptr;

  const nsINode* mOriginalParentNode = nullptr;

  // The current child.
  nsIContent* mChild = nullptr;

  // A flag to let us know that we haven't started iterating yet.
  bool mIsFirst = false;

  // The index of the current element in the slot assigned nodes. One-past the
  // end to represent the last position.
  uint32_t mIndexInInserted = 0u;

  // For certain optimizations, nsCSSFrameConstructor needs to know if the child
  // list of the element that we're iterating matches its .childNodes.
  bool mShadowDOMInvolved = false;
};

/**
 * AllChildrenIterator traverses the children of an element including before /
 * after content and shadow DOM.  The iterator can be initialized to start at
 * the end by providing false for aStartAtBeginning in order to start iterating
 * in reverse from the last child.
 *
 * Note: it assumes that no mutation of the DOM or frame tree takes place during
 * iteration, and will break horribly if that is not true.
 */
class AllChildrenIterator : private FlattenedChildIterator {
 public:
  AllChildrenIterator(const nsIContent* aNode, uint32_t aFlags,
                      bool aStartAtBeginning = true)
      : FlattenedChildIterator(aNode, aStartAtBeginning),
        mAnonKidsIdx(aStartAtBeginning ? UINT32_MAX : 0),
        mFlags(aFlags),
        mPhase(aStartAtBeginning ? Phase::AtBegin : Phase::AtEnd) {}

#ifdef DEBUG
  AllChildrenIterator(AllChildrenIterator&&) = default;

  AllChildrenIterator& operator=(AllChildrenIterator&& aOther) {
    // Explicitly call the destructor to ensure the assertion in the destructor
    // is checked.
    this->~AllChildrenIterator();
    new (this) AllChildrenIterator(std::move(aOther));
    return *this;
  }

  ~AllChildrenIterator() { MOZ_ASSERT(!mMutationGuard.Mutated(0)); }
#endif

  // Returns the current target the iterator is at, or null if the iterator
  // doesn't point to any child node (either eAtBegin or eAtEnd phase).
  nsIContent* Get() const;

  const nsIContent* Parent() const { return ParentNode()->AsContent(); }

  // Seeks the given node in children of a parent element, starting from
  // the current iterator's position, and sets the iterator at the given child
  // node if it was found.
  bool Seek(const nsIContent* aChildToFind);

  nsIContent* GetNextChild();
  nsIContent* GetPreviousChild();

 private:
  enum class Phase : uint8_t {
    AtBegin,
    AtBackdropKid,
    AtMarkerKid,
    AtCheckmarkKid,
    AtBeforeKid,
    AtFlatTreeKids,
    AtAnonKids,
    AtAfterKid,
    AtPickerIconKid,
    AtEnd
  };

  // Helpers.
  void AppendNativeAnonymousChildren();

  // mAnonKids is an array of native anonymous children, mAnonKidsIdx is index
  // in the array. If mAnonKidsIdx < mAnonKids.Length() and mPhase is
  // eAtAnonKids then the iterator points at a child at mAnonKidsIdx index. If
  // mAnonKidsIdx == mAnonKids.Length() then the iterator is somewhere after
  // the last native anon child. If mAnonKidsIdx == UINT32_MAX then the iterator
  // is somewhere before the first native anon child.
  nsTArray<nsIContent*> mAnonKids;
  uint32_t mAnonKidsIdx;

  uint32_t mFlags;
  Phase mPhase;
#ifdef DEBUG
  // XXX we should really assert there are no frame tree changes as well, but
  // there's no easy way to do that.
  nsMutationGuard mMutationGuard;
#endif
};

/**
 * StyleChildrenIterator traverses the children of the element from the
 * perspective of the style system, particularly the children we need to
 * traverse during restyle.
 *
 * At present, this is identical to AllChildrenIterator with
 * (eAllChildren | eSkipDocumentLevelNativeAnonymousContent). We used to have
 * detect and skip any native anonymous children that are used to implement some
 * special magic in here that went away, but we keep the separate class so
 * we can reintroduce special magic back if needed.
 *
 * Note: it assumes that no mutation of the DOM or frame tree takes place during
 * iteration, and will break horribly if that is not true.
 *
 * We require this to be memmovable since Rust code can create and move
 * StyleChildrenIterators.
 */
class MOZ_NEEDS_MEMMOVABLE_MEMBERS StyleChildrenIterator
    : private AllChildrenIterator {
 public:
  explicit StyleChildrenIterator(const nsIContent* aContent,
                                 bool aStartAtBeginning = true)
      : AllChildrenIterator(
            aContent,
            nsIContent::eAllChildren |
                nsIContent::eSkipDocumentLevelNativeAnonymousContent,
            aStartAtBeginning) {
    MOZ_COUNT_CTOR(StyleChildrenIterator);
  }

  StyleChildrenIterator(StyleChildrenIterator&& aOther)
      : AllChildrenIterator(std::move(aOther)) {
    MOZ_COUNT_CTOR(StyleChildrenIterator);
  }

  StyleChildrenIterator& operator=(StyleChildrenIterator&& aOther) = default;

  MOZ_COUNTED_DTOR(StyleChildrenIterator)

  using AllChildrenIterator::GetNextChild;
  using AllChildrenIterator::GetPreviousChild;
  using AllChildrenIterator::Seek;

  [[nodiscard]] static nsINode* GetParentNodeOf(const nsIContent& aChild);
};

}  // namespace mozilla::dom

#endif
