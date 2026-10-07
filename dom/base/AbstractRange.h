/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_dom_AbstractRange_h
#define mozilla_dom_AbstractRange_h

#include <cstdint>
#include <ostream>

#include "ErrorList.h"
#include "js/RootingAPI.h"
#include "mozilla/RangeBoundary.h"
#include "mozilla/RefPtr.h"
#include "mozilla/WeakPtr.h"
#include "mozilla/dom/RangeBinding.h"
#include "nsCycleCollectionParticipant.h"
#include "nsISupports.h"
#include "nsWrapperCache.h"

class JSObject;
class nsIContent;
class nsINode;
struct JSContext;

namespace mozilla {
class RectCallback;

namespace dom {
class Document;
class Range;
class Selection;
class StaticRange;
class HTMLSlotElement;

enum class AllowRangeCrossShadowBoundary : bool { No, Yes };

class AbstractRange : public nsISupports,
                      public nsWrapperCache,
                      // For linking together selection-associated ranges.
                      public mozilla::LinkedListElement<AbstractRange> {
  using AllowRangeCrossShadowBoundary =
      mozilla::dom::AllowRangeCrossShadowBoundary;

 protected:
  explicit AbstractRange(nsINode* aNode, bool aIsRange,
                         TreeKind aBoundaryTreeKind);
  virtual ~AbstractRange();

  using DOMRect = mozilla::dom::DOMRect;
  using DOMRectList = mozilla::dom::DOMRectList;

 public:
  enum class IsUnlinking : bool { No, Yes };

  AbstractRange() = delete;
  explicit AbstractRange(const AbstractRange& aOther) = delete;

  /**
   * Called when the process is shutting down.
   */
  static void Shutdown();

  NS_DECL_CYCLE_COLLECTING_ISUPPORTS
  NS_DECL_CYCLE_COLLECTION_WRAPPERCACHE_CLASS(AbstractRange)

  /**
   * All of the MayCrossShadowBoundary* methods are used to get the boundary
   * endpoints that cross shadow boundaries. They would return
   * the same value as the non-MayCrossShadowBoundary* methods if the range
   * boundaries don't cross shadow boundaries.
   */
  const RangeBoundary& StartRef() const { return mStart; }
  const RangeBoundary& MayCrossShadowBoundaryStartRef() const;

  const RangeBoundary& EndRef() const { return mEnd; }
  const RangeBoundary& MayCrossShadowBoundaryEndRef() const;

  [[nodiscard]] inline nsIContent* GetChildAtStartOffset() const {
    return mStart.GetChildAtOffset();
  }
  nsIContent* GetMayCrossShadowBoundaryChildAtStartOffset() const;

  nsIContent* GetChildAtEndOffset() const { return mEnd.GetChildAtOffset(); }
  nsIContent* GetMayCrossShadowBoundaryChildAtEndOffset() const;

  bool IsPositioned() const { return mIsPositioned; }
  /**
   * https://dom.spec.whatwg.org/#concept-tree-inclusive-ancestor
   */
  nsINode* GetClosestCommonInclusiveAncestor(
      AllowRangeCrossShadowBoundary aAllowCrossShadowBoundary =
          AllowRangeCrossShadowBoundary::No) const;

  // WebIDL

  // If Range is created from JS, it's initialized with Document.createRange()
  // and it collaps the range to start of the Document.  Therefore, the
  // following WebIDL methods are called only when `mIsPositioned` is true.
  // So, it does not make sense to take `ErrorResult` as their parameter
  // since its destruction cost may appear in profile.  If you create range
  // object from C++ and needs to check whether it's positioned, should call
  // `IsPositioned()` directly.

  nsINode* GetStartContainer() const { return mStart.GetContainer(); }
  nsINode* GetMayCrossShadowBoundaryStartContainer() const;

  nsINode* GetEndContainer() const { return mEnd.GetContainer(); }
  nsINode* GetMayCrossShadowBoundaryEndContainer() const;

  /**
   * Return GetStartContainer() and GetEndContainer() if this is positioned.
   */
  [[nodiscard]] bool IsPositionedAndSameContainer() const {
    return MOZ_LIKELY(mIsPositioned) &&
           mStart.GetContainer() == mEnd.GetContainer();
  }
  /**
   * Return GetMayCrossShadowBoundaryStartContainer() and
   * GetMayCrossShadowBoundaryEndContainer() if this is positioned.
   */
  [[nodiscard]] bool IsPositionedAndSameContainerMayCrossShadowBoundary()
      const {
    return MOZ_LIKELY(mIsPositioned) &&
           GetMayCrossShadowBoundaryStartContainer() ==
               GetMayCrossShadowBoundaryEndContainer();
  }

  bool MayCrossShadowBoundary() const;

  already_AddRefed<DOMRect> GetBoundingClientRect(bool aClampToEdge = true,
                                                  bool aFlushLayout = true);
  already_AddRefed<DOMRectList> GetClientRects(bool aClampToEdge = true,
                                               bool aFlushLayout = true);
  // ChromeOnly
  already_AddRefed<DOMRectList> GetAllowCrossShadowBoundaryClientRects(
      bool aClampToEdge = true, bool aFlushLayout = true);

  void GetClientRectsAndTexts(mozilla::dom::ClientRectsAndTexts& aResult,
                              ErrorResult& aErr);
  /**
   * Invokes aCallback.AddRect() for each client rect of this range.
   * Layout must have been flushed by the caller.
   */
  void CollectClientRects(mozilla::RectCallback& aCallback,
                          bool aClampToEdge = true) const;

  /**
   * This helper function gets rects and correlated text for the given range.
   * @param aTextList optional where nullptr = don't retrieve text
   */
  static void CollectClientRectsAndText(
      mozilla::RectCallback* aCollector,
      mozilla::dom::Sequence<nsString>* aTextList, AbstractRange* aRange,
      nsINode* aStartContainer, uint32_t aStartOffset, nsINode* aEndContainer,
      uint32_t aEndOffset, bool aClampToEdge, bool aFlushLayout);

  Document* GetComposedDocOfContainers() const {
    return mStart.GetComposedDoc();
  }

  // FYI: Returns 0 if it's not positioned.
  uint32_t StartOffset() const {
    return static_cast<uint32_t>(
        *mStart.Offset(RangeBoundary::OffsetFilter::kValidOrInvalidOffsets));
  }
  uint32_t MayCrossShadowBoundaryStartOffset() const;

  // FYI: Returns 0 if it's not positioned.
  uint32_t EndOffset() const {
    return static_cast<uint32_t>(
        *mEnd.Offset(RangeBoundary::OffsetFilter::kValidOrInvalidOffsets));
  }
  uint32_t MayCrossShadowBoundaryEndOffset() const;

  /**
   * Return the stored start offset only when it's valid in the current DOM.
   * Otherwise, return Nothing.
   */
  [[nodiscard]] inline Maybe<uint32_t> ValidStartOffset() const {
    return mStart.Offset(RangeBoundary::OffsetFilter::kValidOffsets);
  }
  /**
   * Return the stored end offset only when it's valid in the current DOM.
   * Otherwise, return Nothing.
   */
  [[nodiscard]] inline Maybe<uint32_t> ValidEndOffset() const {
    return mEnd.Offset(RangeBoundary::OffsetFilter::kValidOffsets);
  }

  /**
   * Accessors with RangeBoundarySide. These members can be template methods
   * too. However, templating the handlers for start and end boundaries means
   * that we'd run 2 different paths for them. If you call both handlers in a
   * place in a hot path, each templated handler may be considered as not in a
   * hot path because the number of calling is half comparing with methods
   * checking RangeBoundarySide at the runtime. Actually, making these accessors
   * and the handlers of Range::CharacterDataChanged() templated got worse
   * performance on Windows PGO build. Therefore, we now have only dynamic check
   * accessors only.
   */

  /**
   * Return the result of StartRef() or EndRef().
   */
  [[nodiscard]] const RangeBoundary& BoundaryRef(
      RangeBoundarySide aSide) const {
    return aSide == RangeBoundarySide::Start ? StartRef() : EndRef();
  }
  /**
   * Return the result of GetChildAtStartOffset() or GetChildAtEndOffset().
   */
  [[nodiscard]] nsIContent* GetChildAtOffset(RangeBoundarySide aSide) const {
    return aSide == RangeBoundarySide::Start ? GetChildAtStartOffset()
                                             : GetChildAtEndOffset();
  }
  /**
   * Return the result of GetMayCrossShadowBoundaryChildAtStartOffset() or
   * GetMayCrossShadowBoundaryChildAtEndOffset().
   */
  [[nodiscard]] nsIContent* GetMayCrossShadowBoundaryChildAtOffset(
      RangeBoundarySide aSide) const {
    return aSide == RangeBoundarySide::Start
               ? GetMayCrossShadowBoundaryChildAtStartOffset()
               : GetMayCrossShadowBoundaryChildAtEndOffset();
  }
  /**
   * Return the result of GetStartContainer() or GetEndContainer().
   */
  [[nodiscard]] nsINode* GetContainer(RangeBoundarySide aSide) const {
    return aSide == RangeBoundarySide::Start ? GetStartContainer()
                                             : GetEndContainer();
  }
  /**
   * Return the result of GetMayCrossShadowBoundaryStartContainer() or
   * GetMayCrossShadowBoundaryEndContainer().
   */
  [[nodiscard]] nsINode* GetMayCrossShadowBoundaryContainer(
      RangeBoundarySide aSide) const {
    return aSide == RangeBoundarySide::Start
               ? GetMayCrossShadowBoundaryStartContainer()
               : GetMayCrossShadowBoundaryEndContainer();
  }
  /**
   * Return the result of StartOffset() or EndOffset().
   */
  [[nodiscard]] uint32_t Offset(RangeBoundarySide aSide) const {
    return aSide == RangeBoundarySide::Start ? StartOffset() : EndOffset();
  }
  /**
   * Return the result of MayCrossShadowBoundaryStartOffset() or
   * MayCrossShadowBoundaryEndOffset().
   */
  [[nodiscard]] uint32_t MayCrossShadowBoundaryOffset(
      RangeBoundarySide aSide) const {
    return aSide == RangeBoundarySide::Start
               ? MayCrossShadowBoundaryStartOffset()
               : MayCrossShadowBoundaryEndOffset();
  }
  /**
   * Return the result of ValidStartOffset() or ValidEndOffset().
   */
  [[nodiscard]] Maybe<uint32_t> ValidOffset(RangeBoundarySide aSide) const {
    return aSide == RangeBoundarySide::Start ? ValidStartOffset()
                                             : ValidEndOffset();
  }

  bool Collapsed() const {
    return !mIsPositioned || (mStart.GetContainer() == mEnd.GetContainer() &&
                              StartOffset() == EndOffset());
  }

  bool AreNormalRangeAndCrossShadowBoundaryRangeCollapsed() const;

  nsINode* GetParentObject() const;
  virtual JSObject* WrapObject(JSContext* aCx,
                               JS::Handle<JSObject*> aGivenProto) override;

  bool HasEqualBoundaries(const AbstractRange& aOther) const {
    return (mStart == aOther.mStart) && (mEnd == aOther.mEnd);
  }
  bool IsRange() const { return mIsRange; }
  bool IsStaticRange() const { return !mIsRange; }
  inline Range* AsRange();
  inline const Range* AsRange() const;
  inline StaticRange* AsStaticRange();
  inline const StaticRange* AsStaticRange() const;

  /**
   * Return true if this range is part of a Selection object
   * and isn't detached.
   */
  bool IsInAnySelection() const { return !mSelections.IsEmpty(); }

  [[nodiscard]] nsresult RegisterSelection(mozilla::dom::Selection& aSelection);

  void UnregisterSelection(const mozilla::dom::Selection& aSelection,
                           IsUnlinking aIsUnlinking = IsUnlinking::No);

  /**
   * Returns a list of all Selections the range is associated with.
   */
  const nsTArray<WeakPtr<Selection>>& GetSelections() const;

  /**
   * Return true if this range is in |aSelection|.
   */
  bool IsInSelection(const mozilla::dom::Selection& aSelection) const;

  /**
   * Return true if aRoot is a UA shadow root.
   */
  static bool IsRootUAWidget(const nsINode* aRoot);

  /**
   * Return a shrunken range computed by
   * SelectionMoveUtils::GetFirstVisiblePointAtLeaf() and
   * SelectionMoveUtils::GetLastVisiblePointAtLeaf().
   */
  already_AddRefed<StaticRange> GetShrunkenRangeToVisibleLeaves() const;

 protected:
  template <typename SPT, typename SRT, typename EPT, typename ERT,
            typename RangeType>
  static nsresult SetStartAndEndInternal(
      const RangeBoundaryBase<SPT, SRT>& aStartBoundary,
      const RangeBoundaryBase<EPT, ERT>& aEndBoundary, RangeType* aRange,
      AllowRangeCrossShadowBoundary aAllowCrossShadowBoundary =
          AllowRangeCrossShadowBoundary::No);

  template <class RangeType>
  static bool MaybeCacheToReuse(RangeType& aInstance);

  void Init(nsINode* aNode);

  friend auto format_as(const AbstractRange& aRange) {
    if (aRange.MayCrossShadowBoundary()) {
      return fmt::format(
          "{{ MayCrossShadowBoundaryStartRef()={}, mIsGenerated={}, "
          "mCalledByJS={}, mIsRange={} }}",
          aRange.Collapsed()
              ? fmt::format("MayCrossShadowBoundaryEndRef()={}",
                            aRange.MayCrossShadowBoundaryStartRef())
              : fmt::format("{}, MayCrossShadowBoundaryEndRef()={}",
                            aRange.MayCrossShadowBoundaryStartRef(),
                            aRange.MayCrossShadowBoundaryEndRef()),
          aRange.mIsGenerated, aRange.mIsPositioned, aRange.mIsRange);
    }
    return fmt::format(
        "{{ mStart={}, mIsGenerated={}, mCalledByJS={}, mIsRange={} }}",
        aRange.Collapsed()
            ? fmt::format("mEnd={}", aRange.mStart)
            : fmt::format("{}, mEnd={}", aRange.mStart, aRange.mEnd),
        aRange.mIsGenerated, aRange.mIsPositioned, aRange.mIsRange);
  }
  friend std::ostream& operator<<(std::ostream& aStream,
                                  const AbstractRange& aRange) {
    return aStream << format_as(aRange);
  }

  /**
   * https://dom.spec.whatwg.org/#concept-tree-inclusive-ancestor
   */
  void RegisterClosestCommonInclusiveAncestor(nsINode* aNode);
  /**
   * https://dom.spec.whatwg.org/#concept-tree-inclusive-ancestor
   */
  void UnregisterClosestCommonInclusiveAncestor(
      IsUnlinking aIsUnlinking = IsUnlinking::No);

  void UpdateCommonAncestorIfNecessary();

  static void MarkDescendants(nsINode& aNode);
  static void UnmarkDescendants(nsINode& aNode);

  static void UpdateDescendantsInFlattenedTree(nsINode& aNode,
                                               bool aMarkDescendants);
  friend class HTMLSlotElement;

  already_AddRefed<DOMRectList> GetClientRectsInner(
      AllowRangeCrossShadowBoundary = AllowRangeCrossShadowBoundary::No,
      bool aClampToEdge = true, bool aFlushLayout = true);

 private:
  void ClearForReuse();

 protected:
  RefPtr<Document> mOwner;
  RangeBoundary mStart;
  RangeBoundary mEnd;

  // A Range can be part of multiple |Selection|s. This is a very rare use case.
  AutoTArray<WeakPtr<Selection>, 1> mSelections;
  // mRegisteredClosestCommonInclusiveAncestor is only non-null when the range
  // IsInAnySelection().
  nsCOMPtr<nsINode> mRegisteredClosestCommonInclusiveAncestor;

  // `true` if `mStart` and `mEnd` are set for StaticRange or set and valid
  // for Range.
  bool mIsPositioned;

  // Used by Range, but this should have this for minimizing the size.
  bool mIsGenerated;
  // Used by Range, but this should have this for minimizing the size.
  bool mCalledByJS;

  // true if this is a `Range` object.
  const bool mIsRange;

  static bool sHasShutDown;
};

}  // namespace dom
}  // namespace mozilla

#endif  // #ifndef mozilla_dom_AbstractRange_h
