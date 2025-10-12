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

nsIFrame* AnchorPositioningUtils::FindFirstAcceptableAnchor(
    const nsAtom* aName, const nsIFrame* aPositionedFrame,
    const nsTArray<nsIFrame*>& aPossibleAnchorFrames) {
  LazyAncestorHolder positionedFrameAncestorHolder(aPositionedFrame);
  for (auto it = aPossibleAnchorFrames.rbegin();
       it != aPossibleAnchorFrames.rend(); ++it) {
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
      const nsRect result = aAnchor->GetRectRelativeToSelf();
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
      return Some(aAnchor->GetRect());
    }

    // TODO(dshin): Already traversed up to find `containerChild`, and we're
    // going to do it again here, which feels a little wasteful.
    const nsRect rectToContainerChild = aAnchor->GetRectRelativeToSelf();
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

}  // namespace mozilla
