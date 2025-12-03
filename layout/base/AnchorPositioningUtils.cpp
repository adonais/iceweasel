/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "AnchorPositioningUtils.h"

#include "ScrollContainerFrame.h"
#include "mozilla/Maybe.h"
#include "mozilla/PresShell.h"
#include "mozilla/dom/Document.h"
#include "mozilla/dom/Element.h"
#include "nsCanvasFrame.h"
#include "nsContainerFrame.h"
#include "nsIContent.h"
#include "nsIFrame.h"
#include "nsIFrameInlines.h"
#include "nsINode.h"
#include "nsLayoutUtils.h"
#include "nsPlaceholderFrame.h"
#include "nsStyleStruct.h"
#include "nsTArray.h"

namespace mozilla {

namespace {

bool DoTreeScopedPropertiesOfElementApplyToContent(
    const nsINode* aStylePropertyElement, const nsINode* aStyledContent) {
  // XXX: The proper implementation is deferred to bug 1988038
  // concerning tree-scoped name resolution. For now, we just
  // keep the shadow and light trees separate.
  return aStylePropertyElement->GetContainingDocumentOrShadowRoot() ==
         aStyledContent->GetContainingDocumentOrShadowRoot();
}

/**
 * Checks for the implementation of `anchor-scope`:
 * https://drafts.csswg.org/css-anchor-position-1/#anchor-scope
 *
 * TODO: Consider caching the ancestors, see bug 1986347
 */
bool IsAnchorInScopeForPositionedElement(const nsAtom* aName,
                                         const nsIFrame* aPossibleAnchorFrame,
                                         const nsIFrame* aPositionedFrame) {
  // We don't need to look beyond positioned element's containing block.
  const auto* positionedContainingBlockContent =
      aPositionedFrame->GetParent()->GetContent();

  auto getAnchorPosNearestScope =
      [&positionedContainingBlockContent](
          const nsAtom* aName, const nsIFrame* aFrame) -> const nsIContent* {
    // We need to traverse the DOM, not the frame tree, since `anchor-scope`
    // may be present on elements with `display: contents` (in which case its
    // frame is in the `::before` list and won't be found by walking the frame
    // tree parent chain).
    for (const nsIContent* cp = aFrame->GetContent();
         cp && cp != positionedContainingBlockContent;
         cp = cp->GetFlattenedTreeParentElementForStyle()) {
      // TODO: The case when no frame is generated needs to be
      // handled, e.g. `display: contents`, see bug 1987086.
      const nsIFrame* f = cp->GetPrimaryFrame();
      if (!f) {
        continue;
      }

      const StyleAnchorScope& anchorScope = f->StyleDisplay()->mAnchorScope;
      if (anchorScope.IsNone()) {
        continue;
      }

      if (anchorScope.IsAll()) {
        return cp;
      }

      MOZ_ASSERT(anchorScope.IsIdents());
      for (const StyleAtom& ident : anchorScope.AsIdents().AsSpan()) {
        const auto* id = ident.AsAtom();
        if (aName->Equals(id->GetUTF16String(), id->GetLength())) {
          return cp;
        }
      }
    }

    return nullptr;
  };

  const nsIContent* nearestScopeForAnchor =
      getAnchorPosNearestScope(aName, aPossibleAnchorFrame);
  const nsIContent* nearestScopeForPositioned =
      getAnchorPosNearestScope(aName, aPositionedFrame);
  if (!nearestScopeForAnchor) {
    // Anchor is not scoped and positioned element also should
    // not be gated by a scope.
    return !nearestScopeForPositioned ||
           aPossibleAnchorFrame->GetContent() == nearestScopeForPositioned;
  }

  // There may not be any other scopes between the positioned element
  // and the nearest scope of the anchor.
  return nearestScopeForAnchor == nearestScopeForPositioned;
};

bool IsFullyStyleableTreeAbidingOrNotPseudoElement(const nsIFrame* aFrame) {
  if (!aFrame->Style()->IsPseudoElement()) {
    return true;
  }

  const PseudoStyleType pseudoElementType = aFrame->Style()->GetPseudoType();

  // See https://www.w3.org/TR/css-pseudo-4/#treelike
  return pseudoElementType == PseudoStyleType::before ||
         pseudoElementType == PseudoStyleType::after ||
         pseudoElementType == PseudoStyleType::marker;
}

size_t GetTopLayerIndex(const nsIFrame* aFrame) {
  MOZ_ASSERT(aFrame);

  const nsIContent* frameContent = aFrame->GetContent();

  if (!frameContent) {
    return 0;
  }

  // Within the array returned by Document::GetTopLayer,
  // a higher index means the layer sits higher in the stack,
  // matching Document::GetTopLayerTop()’s top-to-bottom logic.
  // See https://drafts.csswg.org/css-position-4/#in-a-higher-top-layer
  const nsTArray<dom::Element*>& topLayers =
      frameContent->OwnerDoc()->GetTopLayer();

  for (size_t index = 0; index < topLayers.Length(); ++index) {
    const auto& topLayer = topLayers.ElementAt(index);
    if (nsContentUtils::ContentIsFlattenedTreeDescendantOfForStyle(
            /* aPossibleDescendant */ frameContent,
            /* aPossibleAncestor */ topLayer)) {
      return 1 + index;
    }
  }

  return 0;
}

bool IsInitialContainingBlock(const nsIFrame* aContainingBlock) {
  // Initial containing block: The containing block of the root element.
  // https://drafts.csswg.org/css-display-4/#initial-containing-block
  return aContainingBlock == aContainingBlock->PresShell()
                                 ->FrameConstructor()
                                 ->GetDocElementContainingBlock();
}

bool IsContainingBlockGeneratedByElement(const nsIFrame* aContainingBlock) {
  // 2.1. Containing Blocks of Positioned Boxes
  // https://www.w3.org/TR/css-position-3/#def-cb
  return !(!aContainingBlock || aContainingBlock->IsViewportFrame() ||
           IsInitialContainingBlock(aContainingBlock));
}

bool IsAnchorLaidOutStrictlyBeforeElement(
    const nsIFrame* aPossibleAnchorFrame, const nsIFrame* aPositionedFrame,
    const nsTArray<const nsIFrame*>& aPositionedFrameAncestors) {
  // 1. positioned el is in a higher top layer than possible anchor,
  // see https://drafts.csswg.org/css-position-4/#in-a-higher-top-layer
  const size_t positionedTopLayerIndex = GetTopLayerIndex(aPositionedFrame);
  const size_t anchorTopLayerIndex = GetTopLayerIndex(aPossibleAnchorFrame);

  if (anchorTopLayerIndex != positionedTopLayerIndex) {
    return anchorTopLayerIndex < positionedTopLayerIndex;
  }

  // Note: The containing block of an absolutely positioned element
  // is just the parent frame.
  const nsIFrame* positionedContainingBlock = aPositionedFrame->GetParent();
  // Note(dshin, bug 1985654): Spec strictly uses the term "containing block,"
  // corresponding to `GetContainingBlock()`. However, this leads to cases
  // where an anchor's non-inline containing block prevents it from being a
  // valid anchor for a absolutely positioned element (Which can explicitly
  // have inline elements as a containing block). Some WPT rely on inline
  // containing blocks as well.
  // See also: https://github.com/w3c/csswg-drafts/issues/12674
  const nsIFrame* anchorContainingBlock = aPossibleAnchorFrame->GetParent();

  // 2. Both elements are in the same top layer but have different
  // containing blocks and positioned el's containing block is an
  // ancestor of possible anchor's containing block in the containing
  // block chain, aka one of the following:
  if (anchorContainingBlock != positionedContainingBlock) {
    // 2.1 positioned el's containing block is the viewport, and
    // possible anchor's containing block isn't.
    if (positionedContainingBlock->IsViewportFrame() &&
        !anchorContainingBlock->IsViewportFrame()) {
      return true;
    }

    auto isLastContainingBlockOrderable =
        [&aPositionedFrame, &aPositionedFrameAncestors, &anchorContainingBlock,
         &positionedContainingBlock]() -> bool {
      const nsIFrame* it = anchorContainingBlock;
      while (it) {
        const nsIFrame* parentContainingBlock = it->GetParent();
        if (!parentContainingBlock) {
          return false;
        }

        if (parentContainingBlock == positionedContainingBlock) {
          return !it->IsAbsolutelyPositioned() ||
                 nsLayoutUtils::CompareTreePosition(it, aPositionedFrame,
                                                    aPositionedFrameAncestors,
                                                    nullptr) < 0;
        }

        it = parentContainingBlock;
      }

      return false;
    };

    // 2.2 positioned el's containing block is the initial containing
    // block, and possible anchor's containing block is generated by an
    // element, and the last containing block in possible anchor's containing
    // block chain before reaching positioned el's containing block is either
    // not absolutely positioned or precedes positioned el in the tree order,
    const bool isAnchorContainingBlockGenerated =
        IsContainingBlockGeneratedByElement(anchorContainingBlock);
    if (isAnchorContainingBlockGenerated &&
        IsInitialContainingBlock(positionedContainingBlock)) {
      return isLastContainingBlockOrderable();
    }

    // 2.3 both elements' containing blocks are generated by elements,
    // and positioned el's containing block is an ancestor in the flat
    // tree to that of possible anchor's containing block, and the last
    // containing block in possible anchor’s containing block chain before
    // reaching positioned el’s containing block is either not absolutely
    // positioned or precedes positioned el in the tree order.
    if (isAnchorContainingBlockGenerated &&
        IsContainingBlockGeneratedByElement(positionedContainingBlock)) {
      return isLastContainingBlockOrderable();
    }

    return false;
  }

  // 3. Both elements are in the same top layer and have the same
  // containing block, and are both absolutely positioned, and possible
  // anchor is earlier in flat tree order than positioned el.
  const bool isAnchorAbsolutelyPositioned =
      aPossibleAnchorFrame->IsAbsolutelyPositioned();
  if (isAnchorAbsolutelyPositioned) {
    // We must have checked that the positioned element is absolutely
    // positioned by now.
    return nsLayoutUtils::CompareTreePosition(
               aPossibleAnchorFrame, aPositionedFrame,
               aPositionedFrameAncestors, nullptr) < 0;
  }

  // 4. Both elements are in the same top layer and have the same
  // containing block, but possible anchor isn't absolutely positioned.
  return !isAnchorAbsolutelyPositioned;
}

/**
 * https://drafts.csswg.org/css-contain-2/#skips-its-contents
 */
bool IsPositionedElementAlsoSkippedWhenAnchorIsSkipped(
    const nsIFrame* aPossibleAnchorFrame, const nsIFrame* aPositionedFrame) {
  // If potential anchor is skipped and a root of a visibility subtree,
  // it can never be acceptable.
  if (aPossibleAnchorFrame->HidesContentForLayout()) {
    return false;
  }

  // If possible anchor is in the skipped contents of another element,
  // then positioned el shall be in the skipped contents of that same element.
  const nsIFrame* visibilityAncestor = aPossibleAnchorFrame->GetParent();
  while (visibilityAncestor) {
    // If anchor is skipped via auto or hidden, it cannot be acceptable,
    // be it a root or a non-root of a visibility subtree.
    if (visibilityAncestor->HidesContentForLayout()) {
      break;
    }

    visibilityAncestor = visibilityAncestor->GetParent();
  }

  // If positioned el is skipped and a root of a visibility subtree,
  // an anchor can never be acceptable.
  if (aPositionedFrame->HidesContentForLayout()) {
    return false;
  }

  const nsIFrame* ancestor = aPositionedFrame;
  while (ancestor) {
    if (ancestor->HidesContentForLayout()) {
      return ancestor == visibilityAncestor;
    }

    ancestor = ancestor->GetParent();
  }

  return true;
}

struct LazyAncestorHolder {
  const nsIFrame* mFrame;
  Maybe<nsTArray<const nsIFrame*>> mAncestors;

  explicit LazyAncestorHolder(const nsIFrame* aFrame) : mFrame(aFrame) {}

  const nsTArray<const nsIFrame*>& GetAncestors() {
    if (!mAncestors) {
      AutoTArray<const nsIFrame*, 8> ancestors;
      nsLayoutUtils::FillAncestors(mFrame, nullptr, &ancestors);
      mAncestors.emplace(std::move(ancestors));
    }

    return *mAncestors;
  }
};

bool IsAcceptableAnchorElement(
    const nsIFrame* aPossibleAnchorFrame, const nsAtom* aName,
    const nsIFrame* aPositionedFrame,
    LazyAncestorHolder& aPositionedFrameAncestorHolder) {
  MOZ_ASSERT(aPossibleAnchorFrame);
  MOZ_ASSERT(aPositionedFrame);

  // An element possible anchor is an acceptable anchor element for an
  // absolutely positioned element positioned el if all of the following are
  // true:
  // - possible anchor is either an element or a fully styleable
  // tree-abiding pseudo-element.
  // - possible anchor is in scope for positioned el, per the effects of
  // anchor-scope on positioned el or its ancestors.
  // - possible anchor is laid out strictly before positioned el
  //
  // Note: Frames having an anchor name contain elements.
  // The phrase "element or a fully styleable tree-abiding pseudo-element"
  // used by the spec is taken to mean
  // "either not a pseudo-element or a pseudo-element of a specific kind".
  return (IsFullyStyleableTreeAbidingOrNotPseudoElement(aPossibleAnchorFrame) &&
          IsAnchorLaidOutStrictlyBeforeElement(
              aPossibleAnchorFrame, aPositionedFrame,
              aPositionedFrameAncestorHolder.GetAncestors()) &&
          IsAnchorInScopeForPositionedElement(aName, aPossibleAnchorFrame,
                                              aPositionedFrame) &&
          IsPositionedElementAlsoSkippedWhenAnchorIsSkipped(
              aPossibleAnchorFrame, aPositionedFrame));
}

}  // namespace

AnchorPosReferenceData::Result AnchorPosReferenceData::InsertOrModify(
    const nsAtom* aAnchorName, bool aNeedOffset) {
  bool exists = true;
  auto* result = &mMap.LookupOrInsertWith(aAnchorName, [&exists]() {
    exists = false;
    return Nothing{};
  });

  if (!exists) {
    return {false, result};
  }

  // We tried to resolve before.
  if (result->isNothing()) {
    // We know this reference is invalid.
    return {true, result};
  }
  // Previous resolution found a valid anchor.
  if (!aNeedOffset) {
    // Size is guaranteed to be populated on resolution.
    return {true, result};
  }

  // Previous resolution may have been for size only, in which case another
  // anchor resolution is still required.
  return {result->ref().mOffsetData.isSome(), result};
}

const AnchorPosReferenceData::Value* AnchorPosReferenceData::Lookup(
    const nsAtom* aAnchorName) const {
  return mMap.Lookup(aAnchorName).DataPtrOrNull();
}

AnchorPosDefaultAnchorCache::AnchorPosDefaultAnchorCache(
    const nsIFrame* aAnchor, const nsIFrame* aScrollContainer)
    : mAnchor{aAnchor}, mScrollContainer{aScrollContainer} {
  MOZ_ASSERT_IF(
      aAnchor,
      nsLayoutUtils::GetNearestScrollContainerFrame(
          const_cast<nsContainerFrame*>(aAnchor->GetParent()),
          nsLayoutUtils::SCROLLABLE_SAME_DOC |
              nsLayoutUtils::SCROLLABLE_INCLUDE_HIDDEN) == mScrollContainer);
}

nsIFrame* AnchorPositioningUtils::FindFirstAcceptableAnchor(
    const nsAtom* aName, const nsIFrame* aPositionedFrame,
    const nsTArray<nsIFrame*>& aPossibleAnchorFrames) {
  LazyAncestorHolder positionedFrameAncestorHolder(aPositionedFrame);
  const auto* positionedContent = aPositionedFrame->GetContent();

  for (auto it = aPossibleAnchorFrames.rbegin();
       it != aPossibleAnchorFrames.rend(); ++it) {
    const nsIFrame* possibleAnchorFrame = *it;
    if (!DoTreeScopedPropertiesOfElementApplyToContent(
            possibleAnchorFrame->GetContent(), positionedContent)) {
      // Skip anchors in different shadow trees.
      continue;
    }

    // Check if the possible anchor is an acceptable anchor element.
    if (IsAcceptableAnchorElement(*it, aName, aPositionedFrame,
                                  positionedFrameAncestorHolder)) {
      return *it;
    }
  }

  // If we reach here, we didn't find any acceptable anchor.
  return nullptr;
}

// Find the aContainer's child that is the ancestor of aDescendant.
static const nsIFrame* TraverseUpToContainerChild(const nsIFrame* aContainer,
                                                  const nsIFrame* aDescendant) {
  const auto* current = aDescendant;
  while (true) {
    const auto* parent = current->GetParent();
    if (!parent) {
      return nullptr;
    }
    if (parent == aContainer) {
      return current;
    }
    current = parent;
  }
}

static const nsIFrame* GetAnchorOf(const nsIFrame* aPositioned,
                                   const nsAtom* aAnchorName) {
  const auto* presShell = aPositioned->PresShell();
  MOZ_ASSERT(presShell, "No PresShell for frame?");
  return presShell->GetAnchorPosAnchor(aAnchorName, aPositioned);
}

Maybe<nsRect> AnchorPositioningUtils::GetAnchorPosRect(
    const nsIFrame* aAbsoluteContainingBlock, const nsIFrame* aAnchor,
    bool aCBRectIsvalid) {
  auto rect = [&]() -> Maybe<nsRect> {
    if (aCBRectIsvalid) {
      const nsRect result =
          nsLayoutUtils::GetCombinedFragmentRects(aAnchor, true);
      const auto offset =
          aAnchor->GetOffsetToIgnoringScrolling(aAbsoluteContainingBlock);
      // Easy, just use the existing function.
      return Some(result + offset);
    }

    // Ok, containing block doesn't have its rect fully resolved. Figure out
    // rect relative to the child of containing block that is also the ancestor
    // of the anchor, and manually compute the offset.
    // TODO(dshin): This wouldn't handle anchor in a previous top layer.
    const auto* containerChild =
        TraverseUpToContainerChild(aAbsoluteContainingBlock, aAnchor);
    if (!containerChild) {
      return Nothing{};
    }

    if (aAnchor == containerChild) {
      // Anchor is the direct child of anchor's CBWM.
      return Some(nsLayoutUtils::GetCombinedFragmentRects(aAnchor, false));
    }

    // TODO(dshin): Already traversed up to find `containerChild`, and we're
    // going to do it again here, which feels a little wasteful.
    const nsRect rectToContainerChild =
        nsLayoutUtils::GetCombinedFragmentRects(aAnchor, true);
    const auto offset = aAnchor->GetOffsetToIgnoringScrolling(containerChild);
    return Some(rectToContainerChild + offset + containerChild->GetPosition());
  }();
  return rect.map([&](const nsRect& aRect) {
    // We need to position the border box of the anchor within the abspos
    // containing block's size - So the rectangle's size (i.e. Anchor size)
    // stays the same, while "the outer rectangle" (i.e. The abspos cb size)
    // "shrinks" by shifting the position.
    const auto border = aAbsoluteContainingBlock->GetUsedBorder();
    const nsPoint borderTopLeft{border.left, border.top};
    const auto rect = aRect - borderTopLeft;
    return rect;
  });
}

Maybe<AnchorPosInfo> AnchorPositioningUtils::ResolveAnchorPosRect(
    const nsIFrame* aPositioned, const nsIFrame* aAbsoluteContainingBlock,
    const nsAtom* aAnchorName, bool aCBRectIsvalid,
    AnchorPosResolutionCache* aResolutionCache) {
  MOZ_ASSERT(aPositioned->HasAnyStateBits(NS_FRAME_OUT_OF_FLOW));
  MOZ_ASSERT(aPositioned->GetParent() == aAbsoluteContainingBlock);

  if (!aPositioned) {
    return Nothing{};
  }

  const auto* anchorName = GetUsedAnchorName(aPositioned, aAnchorName);
  if (!anchorName) {
    return Nothing{};
  }

  Maybe<AnchorPosResolutionData>* entry = nullptr;
  if (aResolutionCache) {
    const auto result =
        aResolutionCache->mReferenceData->InsertOrModify(anchorName, true);
    if (result.mAlreadyResolved) {
      MOZ_ASSERT(result.mEntry, "Entry exists but null?");
      return result.mEntry->map([&](const AnchorPosResolutionData& aData) {
        MOZ_ASSERT(aData.mOffsetData, "Missing anchor offset resolution.");
        const auto& offsetData = aData.mOffsetData.ref();
        return AnchorPosInfo{nsRect{offsetData.mOrigin, aData.mSize},
                             offsetData.mCompensatesForScroll};
      });
    }
    entry = result.mEntry;
  }

  const auto* anchor = GetAnchorOf(aPositioned, anchorName);
  if (!anchor) {
    // If we have a cached entry, just check that it resolved to nothing last
    // time as well.
    MOZ_ASSERT_IF(entry, entry->isNothing());
    return Nothing{};
  }

  const auto result =
      GetAnchorPosRect(aAbsoluteContainingBlock, anchor, aCBRectIsvalid);
  return result.map([&](const nsRect& aRect) {
    bool compensatesForScroll = false;
    DistanceToNearestScrollContainer distanceToNearestScrollContainer;
    if (aResolutionCache) {
      MOZ_ASSERT(entry);
      // Update the cache.
      compensatesForScroll = [&]() {
        auto& defaultAnchorCache = aResolutionCache->mDefaultAnchorCache;
        if (!aAnchorName) {
          // Explicitly resolved default anchor for the first time - populate
          // the cache.
          defaultAnchorCache.mAnchor = anchor;
          const auto [scrollContainer, distance] =
              AnchorPositioningUtils::GetNearestScrollFrame(anchor);
          distanceToNearestScrollContainer = distance;
          defaultAnchorCache.mScrollContainer = scrollContainer;
          aResolutionCache->mReferenceData->mDistanceToDefaultScrollContainer =
              distance;
          aResolutionCache->mReferenceData->mDefaultAnchorName = anchorName;
          // This is the default anchor, so scroll compensated by definition.
          return true;
        }
        if (defaultAnchorCache.mAnchor == anchor) {
          // This is referring to the default anchor, so scroll compensated by
          // definition.
          return true;
        }
        const auto [scrollContainer, distance] =
            AnchorPositioningUtils::GetNearestScrollFrame(anchor);
        distanceToNearestScrollContainer = distance;
        return scrollContainer ==
               aResolutionCache->mDefaultAnchorCache.mScrollContainer;
      }();
      // If a partially resolved entry exists, make sure that it matches what we
      // have now.
      MOZ_ASSERT_IF(*entry, entry->ref().mSize == aRect.Size());
      *entry = Some(AnchorPosResolutionData{
          aRect.Size(),
          Some(AnchorPosOffsetData{aRect.TopLeft(), compensatesForScroll,
                                   distanceToNearestScrollContainer}),
      });
    }
    return AnchorPosInfo{aRect, compensatesForScroll};
  });
}

Maybe<nsSize> AnchorPositioningUtils::ResolveAnchorPosSize(
    const nsIFrame* aPositioned, const nsAtom* aAnchorName,
    AnchorPosResolutionCache* aResolutionCache) {
  const auto* anchorName = GetUsedAnchorName(aPositioned, aAnchorName);
  if (!anchorName) {
    return Nothing{};
  }
  Maybe<AnchorPosResolutionData>* entry = nullptr;
  auto* referencedAnchors =
      aResolutionCache ? aResolutionCache->mReferenceData : nullptr;
  if (referencedAnchors) {
    const auto result = referencedAnchors->InsertOrModify(anchorName, false);
    if (result.mAlreadyResolved) {
      MOZ_ASSERT(result.mEntry, "Entry exists but null?");
      return result.mEntry->map(
          [](const AnchorPosResolutionData& aData) { return aData.mSize; });
    }
    entry = result.mEntry;
  }
  const auto* anchor = GetAnchorOf(aPositioned, anchorName);
  if (!anchor) {
    return Nothing{};
  }
  const auto size = nsLayoutUtils::GetCombinedFragmentRects(anchor).Size();
  if (entry) {
    *entry = Some(AnchorPosResolutionData{size, Nothing{}});
  }
  return Some(size);
}

/**
 * Returns an equivalent StylePositionArea that contains:
 * [
 *   [ left | center | right | span-left | span-right | span-all]
 *   [ top | center | bottom | span-top | span-bottom | span-all]
 * ]
 */
static StylePositionArea ToPhysicalPositionArea(StylePositionArea aPosArea,
                                                WritingMode aCbWM,
                                                WritingMode aPosWM) {
  StyleWritingMode cbwm{aCbWM.GetBits()};
  StyleWritingMode wm{aPosWM.GetBits()};
  Servo_PhysicalizePositionArea(&aPosArea, &cbwm, &wm);
  return aPosArea;
}

nsRect AnchorPositioningUtils::AdjustAbsoluteContainingBlockRectForPositionArea(
    const nsRect& aAnchorRect, const nsRect& aCBRect, WritingMode aPositionedWM,
    WritingMode aCBWM, const StylePositionArea& aPosArea,
    StylePositionArea* aOutResolvedArea) {
  // Get the boundaries of 3x3 grid in CB's frame space. The edges of the
  // default anchor box are clamped to the bounds of the CB, even if that
  // results in zero width/height cells.
  //
  //          ltrEdges[0]  ltrEdges[1]  ltrEdges[2]  ltrEdges[3]
  //              |            |            |            |
  // ttbEdges[0]  +------------+------------+------------+
  //              |            |            |            |
  // ttbEdges[1]  +------------+------------+------------+
  //              |            |            |            |
  // ttbEdges[2]  +------------+------------+------------+
  //              |            |            |            |
  // ttbEdges[3]  +------------+------------+------------+

  const nsRect gridRect = aCBRect.Union(aAnchorRect);
  nscoord ltrEdges[4] = {gridRect.x, aAnchorRect.x,
                         aAnchorRect.x + aAnchorRect.width,
                         gridRect.x + gridRect.width};
  nscoord ttbEdges[4] = {gridRect.y, aAnchorRect.y,
                         aAnchorRect.y + aAnchorRect.height,
                         gridRect.y + gridRect.height};
  ltrEdges[1] = std::clamp(ltrEdges[1], ltrEdges[0], ltrEdges[3]);
  ltrEdges[2] = std::clamp(ltrEdges[2], ltrEdges[0], ltrEdges[3]);
  ttbEdges[1] = std::clamp(ttbEdges[1], ttbEdges[0], ttbEdges[3]);
  ttbEdges[2] = std::clamp(ttbEdges[2], ttbEdges[0], ttbEdges[3]);

  nsRect res = gridRect;

  // PositionArea, resolved to only contain Left/Right/Top/Bottom values.
  StylePositionArea posArea =
      ToPhysicalPositionArea(aPosArea, aCBWM, aPositionedWM);
  *aOutResolvedArea = posArea;

  nscoord right = ltrEdges[3];
  if (posArea.first == StylePositionAreaKeyword::Left) {
    right = ltrEdges[1];
  } else if (posArea.first == StylePositionAreaKeyword::SpanLeft) {
    right = ltrEdges[2];
  } else if (posArea.first == StylePositionAreaKeyword::Center) {
    res.x = ltrEdges[1];
    right = ltrEdges[2];
  } else if (posArea.first == StylePositionAreaKeyword::SpanRight) {
    res.x = ltrEdges[1];
  } else if (posArea.first == StylePositionAreaKeyword::Right) {
    res.x = ltrEdges[2];
  } else if (posArea.first == StylePositionAreaKeyword::SpanAll) {
    // no adjustment
  } else {
    MOZ_ASSERT_UNREACHABLE("Bad value from ToPhysicalPositionArea");
  }
  res.width = right - res.x;

  nscoord bottom = ttbEdges[3];
  if (posArea.second == StylePositionAreaKeyword::Top) {
    bottom = ttbEdges[1];
  } else if (posArea.second == StylePositionAreaKeyword::SpanTop) {
    bottom = ttbEdges[2];
  } else if (posArea.second == StylePositionAreaKeyword::Center) {
    res.y = ttbEdges[1];
    bottom = ttbEdges[2];
  } else if (posArea.second == StylePositionAreaKeyword::SpanBottom) {
    res.y = ttbEdges[1];
  } else if (posArea.second == StylePositionAreaKeyword::Bottom) {
    res.y = ttbEdges[2];
  } else if (posArea.second == StylePositionAreaKeyword::SpanAll) {
    // no adjustment
  } else {
    MOZ_ASSERT_UNREACHABLE("Bad value from ToPhysicalPositionArea");
  }
  res.height = bottom - res.y;

  return res;
}

AnchorPositioningUtils::NearestScrollFrameInfo
AnchorPositioningUtils::GetNearestScrollFrame(const nsIFrame* aFrame) {
  if (!aFrame) {
    return {nullptr, {}};
  }
  uint32_t distance = 1;
  // `GetNearestScrollContainerFrame` will return the incoming frame if it's a
  // scroll frame, so nudge to parent.
  for (const nsIFrame* f = aFrame->GetParent(); f; f = f->GetParent()) {
    if (f->IsScrollContainerOrSubclass()) {
      return {f, DistanceToNearestScrollContainer{distance}};
    }
    distance++;
  }
  return {nullptr, {}};
}

nsPoint AnchorPositioningUtils::GetScrollOffsetFor(
    PhysicalAxes aAxes, const nsIFrame* aPositioned,
    const AnchorPosDefaultAnchorCache& aDefaultAnchorCache) {
  MOZ_ASSERT(aPositioned);
  if (!aDefaultAnchorCache.mAnchor || aAxes.isEmpty()) {
    return nsPoint{};
  }
  nsPoint offset;
  const bool trackHorizontal = aAxes.contains(PhysicalAxis::Horizontal);
  const bool trackVertical = aAxes.contains(PhysicalAxis::Vertical);
  // TODO(dshin, bug 1991489): Traverse properly, in case anchor and positioned
  // elements are in different continuation frames of the absolute containing
  // block.
  const auto* absoluteContainingBlock = aPositioned->GetParent();
  if (GetNearestScrollFrame(aPositioned).mScrollContainer ==
      aDefaultAnchorCache.mScrollContainer) {
    // Would scroll together anyway, skip.
    return nsPoint{};
  }
  // Grab the accumulated offset up to, but not including, the abspos
  // container.
  for (const auto* f = aDefaultAnchorCache.mScrollContainer;
       f && f != absoluteContainingBlock; f = f->GetParent()) {
    if (const ScrollContainerFrame* scrollFrame = do_QueryFrame(f)) {
      const auto o = scrollFrame->GetScrollPosition();
      if (trackHorizontal) {
        offset.x += o.x;
      }
      if (trackVertical) {
        offset.y += o.y;
      }
    }
  }
  return offset;
}

// Out of line to avoid having to include AnchorPosReferenceData from nsIFrame.h
void DeleteAnchorPosReferenceData(AnchorPosReferenceData* aData) {
  delete aData;
}

const nsAtom* AnchorPositioningUtils::GetUsedAnchorName(
    const nsIFrame* aPositioned, const nsAtom* aAnchorName) {
  if (aAnchorName && !aAnchorName->IsEmpty()) {
    return aAnchorName;
  }

  const auto defaultAnchor = aPositioned->StylePosition()->mPositionAnchor;
  if (defaultAnchor.IsIdent()) {
    return defaultAnchor.AsIdent().AsAtom();
  }

  if (aPositioned->Style()->IsPseudoElement()) {
    return nsGkAtoms::AnchorPosImplicitAnchor;
  }

  if (const nsIContent* content = aPositioned->GetContent()) {
    if (const auto* element = content->AsElement()) {
      if (element->GetPopoverData()) {
        return nsGkAtoms::AnchorPosImplicitAnchor;
      }
    }
  }

  return nullptr;
}

const nsIFrame* AnchorPositioningUtils::GetAnchorPosImplicitAnchor(
    const nsIFrame* aFrame) {
  const auto* frameContent = aFrame->GetContent();
  const bool hasElement = frameContent && frameContent->IsElement();
  if (!aFrame->Style()->IsPseudoElement() && !hasElement) {
    return nullptr;
  }

  if (MOZ_LIKELY(hasElement)) {
    const auto* element = frameContent->AsElement();
    MOZ_ASSERT(element);
    const dom::PopoverData* popoverData = element->GetPopoverData();
    if (MOZ_UNLIKELY(popoverData)) {
      if (const RefPtr<dom::Element>& invoker = popoverData->GetInvoker()) {
        return invoker->GetPrimaryFrame();
      }
    }
  }

  const auto* pseudoRoot = aFrame->GetClosestNativeAnonymousSubtreeRoot();
  if (!pseudoRoot) {
    return nullptr;
  }

  const auto* pseudoRootFrame = pseudoRoot->GetPrimaryFrame();
  if (!pseudoRootFrame) {
    return nullptr;
  }

  return pseudoRootFrame->HasAnyStateBits(NS_FRAME_OUT_OF_FLOW)
             ? pseudoRootFrame->GetPlaceholderFrame()->GetParent()
             : pseudoRootFrame->GetParent();
}

AnchorPositioningUtils::ContainingBlockInfo
AnchorPositioningUtils::ContainingBlockInfo::ExplicitCBFrameSize(
    const nsRect& aContainingBlockRect) {
  // TODO(dshin, bug 1989292): Ideally, this takes both local containing rect +
  // scrollable containing rect, and one is picked here.
  return ContainingBlockInfo{aContainingBlockRect};
}

AnchorPositioningUtils::ContainingBlockInfo
AnchorPositioningUtils::ContainingBlockInfo::UseCBFrameSize(
    const nsIFrame* aPositioned) {
  // TODO(dshin, bug 1989292): This just gets local containing block.
  const auto* cb = aPositioned->GetParent();
  MOZ_ASSERT(cb);
  if (cb->Style()->GetPseudoType() == PseudoStyleType::scrolledContent) {
    cb = aPositioned->GetParent();
  }
  return ContainingBlockInfo{cb->GetPaddingRectRelativeToSelf()};
}

bool AnchorPositioningUtils::FitsInContainingBlock(
    const ContainingBlockInfo& aContainingBlockInfo,
    const nsIFrame* aPositioned, const AnchorPosReferenceData* aReferenceData) {
  MOZ_ASSERT(aPositioned->GetProperty(nsIFrame::AnchorPosReferences()) ==
             aReferenceData);
  const auto originalContainingBlockRect =
      aContainingBlockInfo.GetContainingBlockRect();
  const auto overflowCheckRect = aReferenceData->mContainingBlockRect -
                                 aReferenceData->mDefaultScrollShift;
  const auto rect = [&]() {
    auto rect = aPositioned->GetMarginRect();
    const auto* cb = aPositioned->GetParent();
    if (cb->Style()->GetPseudoType() != PseudoStyleType::scrolledContent) {
      return rect;
    }
    const ScrollContainerFrame* scrollContainer =
        do_QueryFrame(cb->GetParent());
    return rect - scrollContainer->GetScrollPosition();
  }();

  return overflowCheckRect.Intersect(originalContainingBlockRect)
      .Union(originalContainingBlockRect)
      .Contains(rect);
}

}  // namespace mozilla
