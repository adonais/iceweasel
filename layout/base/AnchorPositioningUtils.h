/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef AnchorPositioningUtils_h__
#define AnchorPositioningUtils_h__

#include "mozilla/Maybe.h"
#include "nsRect.h"
#include "nsTHashMap.h"

class nsAtom;
class nsIFrame;

template <class T>
class nsTArray;

namespace mozilla {

struct AnchorPosInfo {
  // Border-box of the anchor frame, offset against `mContainingBlock`'s padding
  // box.
  nsRect mRect;
  const nsIFrame* mContainingBlock;
};

// Resolved anchor positioning data.
struct AnchorPosResolutionData {
  // Size of the referenced anchor.
  nsSize mSize;
  // Origin of the referenced anchor, w.r.t. containing block at the time of
  // resolution. Includes scroll offsets, for now.
  // Nothing if the anchor did not resolve, or if the anchor was only referred
  // to by its size.
  mozilla::Maybe<nsPoint> mOrigin;
};

// Data required for an anchor positioned frame, including:
// * If valid anchors are found,
// * Cached offset/size resolution, if resolution was valid,
// * TODO(dshin, bug 1968745): Compensating for scroll [1]
// * TODO(dshin, bug 1987962): Default scroll shift [2]
//
// [1]: https://drafts.csswg.org/css-anchor-position-1/#compensate-for-scroll
// [2]: https://drafts.csswg.org/css-anchor-position-1/#default-scroll-shift
class AnchorPosReferenceData {
 private:
  using Map =
      nsTHashMap<RefPtr<const nsAtom>, mozilla::Maybe<AnchorPosResolutionData>>;

 public:
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

  Map::const_iterator begin() const { return mMap.cbegin(); }
  Map::const_iterator end() const { return mMap.cend(); }

 private:
  Map mMap;
};

struct StylePositionArea;
struct StylePositionTryFallbacksTryTactic;
class WritingMode;

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

  static Maybe<AnchorPosInfo> GetAnchorPosRect(
      const nsIFrame* aAbsoluteContainingBlock, const nsIFrame* aAnchor,
      bool aCBRectIsvalid,
      Maybe<AnchorPosResolutionData>* aReferencedAnchorsEntry);

  /**
   * Adjust the containing block rect for the 'position-area' property.
   * https://drafts.csswg.org/css-anchor-position-1/#position-area
   */
  static nsRect AdjustAbsoluteContainingBlockRectForPositionArea(
      nsIFrame* aPositionedFrame, nsIFrame* aContainingBlock,
      const nsRect& aCBRect, AnchorPosReferenceData* aAnchorPosReferenceData,
      const StylePositionArea& aPositionArea,
      const StylePositionTryFallbacksTryTactic* aFallbackTactic);
};

}  // namespace mozilla

#endif  // AnchorPositioningUtils_h__
