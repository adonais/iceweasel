/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef AnchorPositioningUtils_h__
#define AnchorPositioningUtils_h__

#include "WritingModes.h"
#include "mozilla/EnumSet.h"
#include "mozilla/Maybe.h"
#include "nsRect.h"
#include "nsTHashMap.h"

class nsAtom;
class nsIFrame;

template <class T>
class nsTArray;

template <class T>
class CopyableTArray;

namespace mozilla {

struct AnchorPosInfo {
  // Border-box of the anchor frame, offset against the positioned frame's
  // absolute containing block's padding box.
  nsRect mRect;
  // See `AnchorPosOffsetData::mCompensatesForScroll`.
  bool mCompensatesForScroll;
};

class DistanceToNearestScrollContainer {
 public:
  DistanceToNearestScrollContainer() : mDistance{kInvalid} {}
  explicit DistanceToNearestScrollContainer(uint32_t aDistance)
      : mDistance{aDistance} {}
  bool Valid() const { return mDistance != kInvalid; }
  bool operator==(const DistanceToNearestScrollContainer& aOther) const {
    return mDistance == aOther.mDistance;
  }
  bool operator!=(const DistanceToNearestScrollContainer& aOther) const {
    return !(*this == aOther);
  }

 private:
  // 0 is invalid - a frame itself cannot be its own nearest scroll container.
  static constexpr uint32_t kInvalid = 0;
  // Ancestor hops to the nearest scroll container. Note that scroll containers
  // between abspos/fixedpos frames and their containing blocks are irrelevant,
  // so the distance should be measured from the out-of-flow frame, not the
  // placeholder frame.
  uint32_t mDistance;
};

struct AnchorPosOffsetData {
  // Origin of the referenced anchor, w.r.t. containing block at the time of
  // resolution.
  nsPoint mOrigin;
  // Does this anchor's offset compensate for scroll?
  // https://drafts.csswg.org/css-anchor-position-1/#compensate-for-scroll
  bool mCompensatesForScroll = false;
  // Distance to this anchor's nearest scroll container.
  DistanceToNearestScrollContainer mDistanceToNearestScrollContainer;
};

// Resolved anchor positioning data.
struct AnchorPosResolutionData {
  // Size of the referenced anchor.
  nsSize mSize;
  // Offset resolution data. Nothing if the anchor did not resolve, or if the
  // anchor was only referred to by its size.
  Maybe<AnchorPosOffsetData> mOffsetData;
};

// Data required for an anchor positioned frame, including:
// * If valid anchors are found,
// * Cached offset/size resolution, if resolution was valid,
// * Compensating for scroll [1]
// * Default scroll shift [2]
//
// [1]: https://drafts.csswg.org/css-anchor-position-1/#compensate-for-scroll
// [2]: https://drafts.csswg.org/css-anchor-position-1/#default-scroll-shift
class AnchorPosReferenceData {
 private:
  using ResolutionMap =
      nsTHashMap<RefPtr<const nsAtom>, mozilla::Maybe<AnchorPosResolutionData>>;

 public:
  // Backup data for attempting a different `@position-try` style, when
  // the default anchor remains the same.
  // These entries correspond 1:1 to that of `AnchorPosReferenceData`.
  struct PositionTryBackup {
    mozilla::PhysicalAxes mCompensatingForScroll;
    nsPoint mDefaultScrollShift;
    nsRect mContainingBlockRect;
    bool mUseScrollableContainingBlock = false;
  };
  using Value = mozilla::Maybe<AnchorPosResolutionData>;

  AnchorPosReferenceData() = default;
  AnchorPosReferenceData(const AnchorPosReferenceData&) = delete;
  AnchorPosReferenceData(AnchorPosReferenceData&&) = default;

  AnchorPosReferenceData& operator=(const AnchorPosReferenceData&) = delete;
  AnchorPosReferenceData& operator=(AnchorPosReferenceData&&) = default;

  struct Result {
    bool mAlreadyResolved;
    Value* mEntry;
  };

  Result InsertOrModify(const nsAtom* aAnchorName, bool aNeedOffset);
  const Value* Lookup(const nsAtom* aAnchorName) const;

  bool IsEmpty() const { return mMap.IsEmpty(); }

  ResolutionMap::const_iterator begin() const { return mMap.cbegin(); }
  ResolutionMap::const_iterator end() const { return mMap.cend(); }

  void AdjustCompensatingForScroll(const mozilla::PhysicalAxes& aAxes) {
    mCompensatingForScroll += aAxes;
  }

  mozilla::PhysicalAxes CompensatingForScrollAxes() const {
    return mCompensatingForScroll;
  }

  PositionTryBackup TryPositionWithSameDefaultAnchor() {
    auto compensatingForScroll = std::exchange(mCompensatingForScroll, {});
    auto defaultScrollShift = std::exchange(mDefaultScrollShift, {});
    auto insetModifiedContainingBlock = std::exchange(mContainingBlockRect, {});
    return {compensatingForScroll, defaultScrollShift,
            insetModifiedContainingBlock};
  }

  void UndoTryPositionWithSameDefaultAnchor(PositionTryBackup&& aBackup) {
    mCompensatingForScroll = aBackup.mCompensatingForScroll;
    mDefaultScrollShift = aBackup.mDefaultScrollShift;
    mContainingBlockRect = aBackup.mContainingBlockRect;
  }

  // Distance from the default anchor to the nearest scroll container.
  DistanceToNearestScrollContainer mDistanceToDefaultScrollContainer;
  // https://drafts.csswg.org/css-anchor-position-1/#default-scroll-shift
  nsPoint mDefaultScrollShift;
  // Rect of containing block before being inset-modified, at the time of
  // resolution.
  nsRect mContainingBlockRect;
  // TODO(dshin, bug 1987962): Remembered scroll offset
  // https://drafts.csswg.org/css-anchor-position-1/#remembered-scroll-offset
  // Name of the default used anchor. Not necessarily positioned frame's
  // style, because of fallbacks.
  RefPtr<const nsAtom> mDefaultAnchorName;

 private:
  ResolutionMap mMap;
  // Axes we need to compensate for scroll [1] in.
  // [1]: https://drafts.csswg.org/css-anchor-position-1/#compensate-for-scroll
  mozilla::PhysicalAxes mCompensatingForScroll;
};

struct StylePositionArea;
class WritingMode;

struct AnchorPosDefaultAnchorCache {
  // Default anchor element's corresponding frame.
  const nsIFrame* mAnchor = nullptr;
  // Scroll container for the default anchor.
  const nsIFrame* mScrollContainer = nullptr;

  AnchorPosDefaultAnchorCache() = default;
  AnchorPosDefaultAnchorCache(const nsIFrame* aAnchor,
                              const nsIFrame* aScrollContainer);
};

// Cache data used by anchor resolution. To be populated on abspos reflow,
// whenever the frame makes any anchor reference.
struct AnchorPosResolutionCache {
  // Storage for referenced anchors. Designed to be long-lived (i.e. beyond
  // a reflow cycle).
  AnchorPosReferenceData* mReferenceData = nullptr;
  // Cached data for default anchor resolution. Designed to be short-lived,
  // so it can contain e.g. frame pointers.
  AnchorPosDefaultAnchorCache mDefaultAnchorCache;

  // Backup data for attempting a different `@position-try` style, when
  // the default anchor remains the same.
  using PositionTryBackup = AnchorPosReferenceData::PositionTryBackup;
  PositionTryBackup TryPositionWithSameDefaultAnchor() {
    return mReferenceData->TryPositionWithSameDefaultAnchor();
  }
  void UndoTryPositionWithSameDefaultAnchor(PositionTryBackup&& aBackup) {
    mReferenceData->UndoTryPositionWithSameDefaultAnchor(std::move(aBackup));
  }

  // Backup data for attempting a different `@position-try` style, when
  // the default anchor changes.
  using PositionTryFullBackup =
      std::pair<AnchorPosReferenceData, AnchorPosDefaultAnchorCache>;
  PositionTryFullBackup TryPositionWithDifferentDefaultAnchor() {
    auto referenceData = std::move(*mReferenceData);
    *mReferenceData = {};
    return std::make_pair(
        std::move(referenceData),
        std::exchange(mDefaultAnchorCache, AnchorPosDefaultAnchorCache{}));
  }
  void UndoTryPositionWithDifferentDefaultAnchor(
      PositionTryFullBackup&& aBackup) {
    *mReferenceData = std::move(aBackup.first);
    std::exchange(mDefaultAnchorCache, aBackup.second);
  }
};

enum class StylePositionTryFallbacksTryTacticKeyword : uint8_t;
using StylePositionTryFallbacksTryTactic =
    CopyableTArray<StylePositionTryFallbacksTryTacticKeyword>;

/**
 * AnchorPositioningUtils is a namespace class used for various anchor
 * positioning helper functions that are useful in multiple places.
 * The goal is to avoid code duplication and to avoid having too
 * many helpers in nsLayoutUtils.
 */
struct AnchorPositioningUtils {
  /**
   * Finds the first acceptable frame from the list of possible anchor frames
   * following https://drafts.csswg.org/css-anchor-position-1/#target
   */
  static nsIFrame* FindFirstAcceptableAnchor(
      const nsAtom* aName, const nsIFrame* aPositionedFrame,
      const nsTArray<nsIFrame*>& aPossibleAnchorFrames);

  static Maybe<nsRect> GetAnchorPosRect(
      const nsIFrame* aAbsoluteContainingBlock, const nsIFrame* aAnchor,
      bool aCBRectIsvalid);

  static Maybe<AnchorPosInfo> ResolveAnchorPosRect(
      const nsIFrame* aPositioned, const nsIFrame* aAbsoluteContainingBlock,
      const nsAtom* aAnchorName, bool aCBRectIsvalid,
      AnchorPosResolutionCache* aResolutionCache);

  static Maybe<nsSize> ResolveAnchorPosSize(
      const nsIFrame* aPositioned, const nsAtom* aAnchorName,
      AnchorPosResolutionCache* aResolutionCache);

  /**
   * Adjust the containing block rect for the 'position-area' property.
   * https://drafts.csswg.org/css-anchor-position-1/#position-area
   */
  static nsRect AdjustAbsoluteContainingBlockRectForPositionArea(
      const nsRect& aAnchorRect, const nsRect& aCBRect,
      WritingMode aPositionedWM, WritingMode aCBWM,
      const StylePositionArea& aPosArea, StylePositionArea* aOutResolvedArea);

  /**
   * Gets the used anchor name for an anchor positioned frame.
   *
   * @param aPositioned The anchor positioned frame.
   * @param aAnchorName The anchor name specified in the anchor function,
   *   or nullptr if not specified.
   *
   * If `aAnchorName` is not specified, then this function will return the
   * default anchor name, if the `position-anchor` property specified one.
   * Otherwise it will return `nsGkAtoms::AnchorPosImplicitAnchor` if the
   * element has an implicit anchor, or a nullptr.
   */
  static const nsAtom* GetUsedAnchorName(const nsIFrame* aPositioned,
                                         const nsAtom* aAnchorName);

  /**
   * Get the implicit anchor of the frame.
   *
   * @param aFrame The anchor positioned frame.
   *
   * For pseudo-elements, this returns the parent frame of the originating
   * element. For popovers, this returns the primary frame of the invoker. In
   * all other cases, returns null.
   */
  static const nsIFrame* GetAnchorPosImplicitAnchor(const nsIFrame* aFrame);

  struct NearestScrollFrameInfo {
    const nsIFrame* mScrollContainer = nullptr;
    DistanceToNearestScrollContainer mDistance;
  };
  static NearestScrollFrameInfo GetNearestScrollFrame(const nsIFrame* aFrame);

  static nsPoint GetScrollOffsetFor(
      PhysicalAxes aAxes, const nsIFrame* aPositioned,
      const AnchorPosDefaultAnchorCache& aDefaultAnchorCache);

  struct ContainingBlockInfo {
    // Provide an explicit containing block size, for during reflow when
    // its `mRect` has not yet been set.
    static ContainingBlockInfo ExplicitCBFrameSize(
        const nsRect& aContainingBlockRect);
    // Provide the positioned frame, to query  its containing block rect.
    static ContainingBlockInfo UseCBFrameSize(const nsIFrame* aPositioned);

    nsRect GetContainingBlockRect() const { return mRect; }

   private:
    explicit ContainingBlockInfo(const nsRect& aRect) : mRect{aRect} {}
    nsRect mRect;
  };

  static bool FitsInContainingBlock(
      const ContainingBlockInfo& aContainingBlockInfo,
      const nsIFrame* aPositioned,
      const AnchorPosReferenceData* aReferenceData);
};

}  // namespace mozilla

#endif  // AnchorPositioningUtils_h__
