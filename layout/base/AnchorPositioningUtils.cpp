/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "AnchorPositioningUtils.h"

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
  return {result->ref().mOrigin.isSome(), result};
}

const AnchorPosReferenceData::Value* AnchorPosReferenceData::Lookup(
    const nsAtom* aAnchorName) const {
  return mMap.Lookup(aAnchorName).DataPtrOrNull();
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

Maybe<AnchorPosInfo> AnchorPositioningUtils::GetAnchorPosRect(
    const nsIFrame* aAbsoluteContainingBlock, const nsIFrame* aAnchor,
    bool aCBRectIsvalid,
    Maybe<AnchorPosResolutionData>* aReferencedAnchorsEntry) {
  auto rect = [&]() -> Maybe<nsRect> {
    if (aCBRectIsvalid) {
      const nsRect result =
          nsLayoutUtils::GetCombinedFragmentRects(aAnchor, true);
      const auto offset = aAnchor->GetOffsetTo(aAbsoluteContainingBlock);
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
    const auto offset = aAnchor->GetOffsetTo(containerChild);
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
    if (aReferencedAnchorsEntry) {
      // If a partially resolved entry exists, make sure that it matches what we
      // have now.
      MOZ_ASSERT_IF(*aReferencedAnchorsEntry,
                    aReferencedAnchorsEntry->ref().mSize == rect.Size());
      *aReferencedAnchorsEntry = Some(AnchorPosResolutionData{
          rect.Size(),
          Some(rect.TopLeft()),
      });
    }
    return AnchorPosInfo{
        .mRect = rect,
        .mContainingBlock = aAbsoluteContainingBlock,
    };
  });
}

/**
 * Strips the Span and SelfWM flags from a position-area keyword value.
 */
static inline StylePositionAreaKeyword StripSpanAndSelfWMFlags(
    StylePositionAreaKeyword aValue) {
  return StylePositionAreaKeyword(uint8_t(aValue) &
                                  ~(uint8_t(StylePositionAreaKeyword::Span) |
                                    uint8_t(StylePositionAreaKeyword::SelfWM)));
}

static inline uint8_t SpanAndSelfWM(StylePositionAreaKeyword aValue) {
  return uint8_t(aValue) & (uint8_t(StylePositionAreaKeyword::Span) |
                            uint8_t(StylePositionAreaKeyword::SelfWM));
}

/**
 * Returns the given PositionArea with the second keyword converted to the
 * implied keyword if it was not specified (its value is `None`).
 */
static inline StylePositionArea MakeMissingSecondExplicit(
    StylePositionArea aPositionArea) {
  auto first = aPositionArea.first;
  if (aPositionArea.second == StylePositionAreaKeyword::None) {
    switch (StripSpanAndSelfWMFlags(first)) {
      // Per spec, if the single specified keyword is ambiguous about its axis
      // then it is repeated.
      case StylePositionAreaKeyword::Center:
      case StylePositionAreaKeyword::SpanAll:
      case StylePositionAreaKeyword::Start:
      case StylePositionAreaKeyword::End:
        return {first, first};

      // Otherwise, the other keyword is `span-all`. The "first" keyword may
      // actually belong canonically in the second position, depending which
      // axis it refers to, but that will be resolved later.
      default:
        return {first, StylePositionAreaKeyword::SpanAll};
    }
  }
  return aPositionArea;
}

static StylePositionAreaKeyword FlipInAxis(StylePositionAreaKeyword aKw,
                                           PhysicalAxis aAxis) {
  auto bits = SpanAndSelfWM(aKw);
  auto stripped = StripSpanAndSelfWMFlags(aKw);
  switch (stripped) {
    case StylePositionAreaKeyword::Top:
    case StylePositionAreaKeyword::Bottom:
      if (aAxis != PhysicalAxis::Vertical) {
        break;
      }
      return StylePositionAreaKeyword(
          uint8_t(stripped == StylePositionAreaKeyword::Top
                      ? StylePositionAreaKeyword::Bottom
                      : StylePositionAreaKeyword::Top) |
          bits);
    case StylePositionAreaKeyword::Left:
    case StylePositionAreaKeyword::Right:
      if (aAxis != PhysicalAxis::Horizontal) {
        break;
      }
      return StylePositionAreaKeyword(
          uint8_t(stripped == StylePositionAreaKeyword::Left
                      ? StylePositionAreaKeyword::Right
                      : StylePositionAreaKeyword::Left) |
          bits);
    case StylePositionAreaKeyword::Center:
    case StylePositionAreaKeyword::SpanAll:
      break;
    default:
      MOZ_ASSERT_UNREACHABLE("Expected a physical position area");
      break;
  }
  return aKw;
}

static void FlipInAxis(StylePositionArea& aArea, PhysicalAxis aAxis) {
  aArea.first = FlipInAxis(aArea.first, aAxis);
  aArea.second = FlipInAxis(aArea.second, aAxis);
}

static void FlipStartsAndEnds(StylePositionArea& aArea, WritingMode aWM) {
  auto flipAxes = [](StylePositionAreaKeyword aKw,
                     WritingMode aWM) -> StylePositionAreaKeyword {
    auto bits = SpanAndSelfWM(aKw);
    auto stripped = StripSpanAndSelfWMFlags(aKw);
    // If stripped value is a physical side, convert it to a logical side.
    Maybe<LogicalSide> logicalSide;
    switch (stripped) {
      case StylePositionAreaKeyword::Top:
        logicalSide = Some(aWM.LogicalSideForPhysicalSide(Side::eSideTop));
        break;
      case StylePositionAreaKeyword::Bottom:
        logicalSide = Some(aWM.LogicalSideForPhysicalSide(Side::eSideBottom));
        break;
      case StylePositionAreaKeyword::Left:
        logicalSide = Some(aWM.LogicalSideForPhysicalSide(Side::eSideLeft));
        break;
      case StylePositionAreaKeyword::Right:
        logicalSide = Some(aWM.LogicalSideForPhysicalSide(Side::eSideRight));
        break;
      case StylePositionAreaKeyword::Center:
      case StylePositionAreaKeyword::SpanAll:
        break;
      default:
        MOZ_ASSERT_UNREACHABLE("expected a physical positon-area");
        break;
    }
    if (logicalSide) {
      // Swap inline/block axes and convert back to physical side.
      mozilla::Side side;
      switch (*logicalSide) {
        case LogicalSide::IStart:
          side = aWM.PhysicalSide(LogicalSide::BStart);
          break;
        case LogicalSide::IEnd:
          side = aWM.PhysicalSide(LogicalSide::BEnd);
          break;
        case LogicalSide::BStart:
          side = aWM.PhysicalSide(LogicalSide::IStart);
          break;
        case LogicalSide::BEnd:
          side = aWM.PhysicalSide(LogicalSide::IEnd);
          break;
      }
      switch (side) {
        case eSideTop:
          stripped = StylePositionAreaKeyword::Top;
          break;
        case eSideBottom:
          stripped = StylePositionAreaKeyword::Bottom;
          break;
        case eSideLeft:
          stripped = StylePositionAreaKeyword::Left;
          break;
        case eSideRight:
          stripped = StylePositionAreaKeyword::Right;
          break;
      }
    }
    return StylePositionAreaKeyword(uint8_t(stripped) | bits);
  };

  aArea.first = flipAxes(aArea.first, aWM);
  aArea.second = flipAxes(aArea.second, aWM);

  std::swap(aArea.first, aArea.second);
}

static void ApplyFallbackTactic(
    StylePositionArea& aPhysicalArea,
    StylePositionTryFallbacksTryTacticKeyword aTactic, WritingMode aWM) {
  switch (aTactic) {
    case StylePositionTryFallbacksTryTacticKeyword::None:
      return;
    case StylePositionTryFallbacksTryTacticKeyword::FlipBlock:
      FlipInAxis(aPhysicalArea, aWM.PhysicalAxis(LogicalAxis::Block));
      return;
    case StylePositionTryFallbacksTryTacticKeyword::FlipInline:
      FlipInAxis(aPhysicalArea, aWM.PhysicalAxis(LogicalAxis::Inline));
      return;
    case StylePositionTryFallbacksTryTacticKeyword::FlipStart:
      FlipStartsAndEnds(aPhysicalArea, aWM);
      return;
  }
}

static void ApplyFallbackTactic(StylePositionArea& aArea,
                                StylePositionTryFallbacksTryTactic aTactic,
                                WritingMode aWM) {
  ApplyFallbackTactic(aArea, aTactic._0, aWM);
  ApplyFallbackTactic(aArea, aTactic._1, aWM);
  ApplyFallbackTactic(aArea, aTactic._2, aWM);
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
  aPosArea = MakeMissingSecondExplicit(aPosArea);

  auto toPhysical = [=](StylePositionAreaKeyword aValue,
                        bool aImplicitIsBlock) -> StylePositionAreaKeyword {
    if (aValue < StylePositionAreaKeyword::Left) {
      return aValue;
    }

    // Extract the `span` and `selfWM` bits and mask them out of aValue.
    uint8_t span = uint8_t(aValue) & uint8_t(StylePositionAreaKeyword::Span);
    uint8_t selfWM =
        uint8_t(aValue) & uint8_t(StylePositionAreaKeyword::SelfWM);
    aValue = StripSpanAndSelfWMFlags(aValue);

    // Determine which logical side, if any, is used.
    Maybe<LogicalSide> ls;
    WritingMode wm = selfWM ? aPosWM : aCbWM;
    switch (aValue) {
      case StylePositionAreaKeyword::Start:
        ls = Some(aImplicitIsBlock ? LogicalSide::BStart : LogicalSide::IStart);
        break;
      case StylePositionAreaKeyword::End:
        ls = Some(aImplicitIsBlock ? LogicalSide::BEnd : LogicalSide::IEnd);
        break;

      case StylePositionAreaKeyword::BlockStart:
        ls = Some(LogicalSide::BStart);
        break;
      case StylePositionAreaKeyword::BlockEnd:
        ls = Some(LogicalSide::BEnd);
        break;
      case StylePositionAreaKeyword::InlineStart:
        ls = Some(LogicalSide::IStart);
        break;
      case StylePositionAreaKeyword::InlineEnd:
        ls = Some(LogicalSide::IEnd);
        break;

      case StylePositionAreaKeyword::XStart:
        ls = Some(wm.IsVertical() ? LogicalSide::BStart : LogicalSide::IStart);
        break;
      case StylePositionAreaKeyword::XEnd:
        ls = Some(wm.IsVertical() ? LogicalSide::BEnd : LogicalSide::IEnd);
        break;
      case StylePositionAreaKeyword::YStart:
        ls = Some(wm.IsVertical() ? LogicalSide::IStart : LogicalSide::BStart);
        break;
      case StylePositionAreaKeyword::YEnd:
        ls = Some(wm.IsVertical() ? LogicalSide::IEnd : LogicalSide::BEnd);
        break;

      default:
        break;
    }

    // If a logical side was used, resolve it to physical using the appropriate
    // writing-mode.
    if (ls.isSome()) {
      switch (wm.PhysicalSide(ls.ref())) {
        case Side::eSideLeft:
          aValue = StylePositionAreaKeyword::Left;
          break;
        case Side::eSideRight:
          aValue = StylePositionAreaKeyword::Right;
          break;
        case Side::eSideTop:
          aValue = StylePositionAreaKeyword::Top;
          break;
        case Side::eSideBottom:
          aValue = StylePositionAreaKeyword::Bottom;
          break;
      }
    }

    // Restore the `span` component of the value, if present originally.
    return StylePositionAreaKeyword(uint8_t(aValue) | span);
  };

  aPosArea.first = toPhysical(aPosArea.first, /* aImplicitIsBlock = */ true);
  aPosArea.second = toPhysical(aPosArea.second, /* aImplicitIsBlock = */ false);

  // Ensure the physical values are in the expected order, with Left or Right
  // in the first position, Top or Bottom in second. (Center and SpanAll may
  // occur in either slot.)
  switch (StripSpanAndSelfWMFlags(aPosArea.first)) {
    case StylePositionAreaKeyword::Top:
    case StylePositionAreaKeyword::Bottom:
      std::swap(aPosArea.first, aPosArea.second);
      break;

    case StylePositionAreaKeyword::Center:
    case StylePositionAreaKeyword::SpanAll:
      switch (StripSpanAndSelfWMFlags(aPosArea.second)) {
        case StylePositionAreaKeyword::Left:
        case StylePositionAreaKeyword::Right:
          std::swap(aPosArea.first, aPosArea.second);
          break;
        default:
          break;
      }
      break;

    default:
      break;
  }
  return aPosArea;
}

nsRect AnchorPositioningUtils::AdjustAbsoluteContainingBlockRectForPositionArea(
    nsIFrame* aPositionedFrame, nsIFrame* aContainingBlock,
    const nsRect& aCBRect, AnchorPosReferenceData* aAnchorPosReferenceData,
    const StylePositionArea& aPosArea,
    const StylePositionTryFallbacksTryTactic* aFallbackTactic) {
  // TODO: We need a single, unified way of getting the anchor, unifying
  // GetUsedAnchorName etc.
  const auto& defaultAnchor =
      aPositionedFrame->StylePosition()->mPositionAnchor;
  if (!defaultAnchor.IsIdent()) {
    return aCBRect;
  }
  const nsAtom* anchorName = defaultAnchor.AsIdent().AsAtom();

  nsRect anchorRect;
  const auto result = aAnchorPosReferenceData->InsertOrModify(anchorName, true);
  if (result.mAlreadyResolved) {
    MOZ_ASSERT(result.mEntry, "Entry exists but null?");
    if (result.mEntry->isNothing()) {
      return aCBRect;
    }
    const auto& data = result.mEntry->value();
    MOZ_ASSERT(data.mOrigin, "Missing anchor offset resolution.");
    anchorRect = nsRect{data.mOrigin.ref(), data.mSize};
  } else {
    Maybe<AnchorPosResolutionData>* entry = result.mEntry;
    PresShell* presShell = aPositionedFrame->PresShell();
    const auto* anchor =
        presShell->GetAnchorPosAnchor(anchorName, aPositionedFrame);
    if (!anchor) {
      // If we have a cached entry, just check that it resolved to nothing last
      // time as well.
      MOZ_ASSERT_IF(entry, entry->isNothing());
      return aCBRect;
    }
    const auto info = AnchorPositioningUtils::GetAnchorPosRect(
        aContainingBlock, anchor, false, entry);
    if (info.isNothing()) {
      return aCBRect;
    }
    anchorRect = info.ref().mRect;
  }

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

  nscoord ltrEdges[4] = {aCBRect.x, anchorRect.x,
                         anchorRect.x + anchorRect.width,
                         aCBRect.x + aCBRect.width};
  nscoord ttbEdges[4] = {aCBRect.y, anchorRect.y,
                         anchorRect.y + anchorRect.height,
                         aCBRect.y + aCBRect.height};
  ltrEdges[1] = std::clamp(ltrEdges[1], ltrEdges[0], ltrEdges[3]);
  ltrEdges[2] = std::clamp(ltrEdges[2], ltrEdges[0], ltrEdges[3]);
  ttbEdges[1] = std::clamp(ttbEdges[1], ttbEdges[0], ttbEdges[3]);
  ttbEdges[2] = std::clamp(ttbEdges[2], ttbEdges[0], ttbEdges[3]);

  WritingMode cbWM = aContainingBlock->GetWritingMode();
  WritingMode posWM = aPositionedFrame->GetWritingMode();

  nsRect res = aCBRect;

  // PositionArea, resolved to only contain Left/Right/Top/Bottom values.
  StylePositionArea posArea = ToPhysicalPositionArea(aPosArea, cbWM, posWM);
  if (aFallbackTactic) {
    // See https://github.com/w3c/csswg-drafts/issues/12869 for which WM to use
    // here.
    ApplyFallbackTactic(posArea, *aFallbackTactic, posWM);
  }

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

// Out of line to avoid having to include AnchorPosReferenceData from nsIFrame.h
void DeleteAnchorPosReferenceData(AnchorPosReferenceData* aData) {
  delete aData;
}

}  // namespace mozilla
