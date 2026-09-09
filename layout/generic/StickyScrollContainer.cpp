/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * compute sticky positioning, both during reflow and when the scrolling
 * container scrolls
 */

#include "StickyScrollContainer.h"

#include "PresShell.h"
#include "mozilla/OverflowChangedTracker.h"
#include "mozilla/ScrollContainerFrame.h"
#include "mozilla/layers/LayersTypes.h"
#include "nsIFrame.h"
#include "nsIFrameInlines.h"
#include "nsLayoutUtils.h"

namespace mozilla {

StickyScrollContainer::StickyScrollContainer(
    ScrollContainerFrame* aScrollContainerFrame)
    : mScrollContainerFrame(aScrollContainerFrame) {}

static ScrollContainerFrame* GetScrollContainerForStickyFrame(
    const nsIFrame* aFrame) {
  return nsLayoutUtils::GetNearestScrollContainerFrame(
      aFrame->GetParent(), nsLayoutUtils::SCROLLABLE_SAME_DOC |
                               nsLayoutUtils::SCROLLABLE_STOP_AT_PAGE |
                               nsLayoutUtils::SCROLLABLE_INCLUDE_HIDDEN);
}

// static
StickyScrollContainer* StickyScrollContainer::GetOrCreateForFrame(
    nsIFrame* aFrame) {
  ScrollContainerFrame* scrollContainerFrame =
      GetScrollContainerForStickyFrame(aFrame);
  if (!scrollContainerFrame) {
    // We might not find any, for instance in the case of
    // <html style="position: fixed">
    return nullptr;
  }
  return &scrollContainerFrame->EnsureStickyContainer();
}

// static
StickyScrollContainer* StickyScrollContainer::GetForFrame(
    const nsIFrame* aFrame) {
  ScrollContainerFrame* scrollContainerFrame =
      GetScrollContainerForStickyFrame(aFrame);
  return scrollContainerFrame ? scrollContainerFrame->GetStickyContainer()
                              : nullptr;
}

static nscoord ComputeStickySideOffset(Side aSide,
                                       const nsStylePosition& aPosition,
                                       nscoord aPercentBasis) {
  // Guaranteed to resolve any use of anchor function as invalid.
  const auto& side = aPosition.GetAnchorResolvedInset(
      aSide, AnchorPosOffsetResolutionParams::UseCBFrameSize(
                 {nullptr, StylePositionProperty::Sticky}));
  if (side->IsAuto()) {
    return NS_AUTOOFFSET;
  }
  return nsLayoutUtils::ComputeCBDependentValue(aPercentBasis,
                                                side->AsLengthPercentage());
}

static nsSize GetScrollContainerSize(
    const ScrollContainerFrame* aScrollContainer) {
  if (aScrollContainer->IsRootScrollFrameOfDocument() &&
      aScrollContainer->PresContext()->IsRootContentDocumentCrossProcess()) {
    return aScrollContainer->PresShell()->GetFixedViewportSize();
  }
  return aScrollContainer->GetScrolledFrameSize();
}

// static
void StickyScrollContainer::ComputeStickyOffsets(nsIFrame* aFrame) {
  ScrollContainerFrame* scrollContainerFrame =
      nsLayoutUtils::GetNearestScrollContainerFrame(
          aFrame->GetParent(), nsLayoutUtils::SCROLLABLE_SAME_DOC |
                                   nsLayoutUtils::SCROLLABLE_INCLUDE_HIDDEN);

  if (!scrollContainerFrame) {
    // Bail.
    return;
  }

  nsSize scrollContainerSize = GetScrollContainerSize(scrollContainerFrame);
  nsMargin computedOffsets;
  const nsStylePosition* position = aFrame->StylePosition();

  computedOffsets.left =
      ComputeStickySideOffset(eSideLeft, *position, scrollContainerSize.width);
  computedOffsets.right =
      ComputeStickySideOffset(eSideRight, *position, scrollContainerSize.width);
  computedOffsets.top =
      ComputeStickySideOffset(eSideTop, *position, scrollContainerSize.height);
  computedOffsets.bottom = ComputeStickySideOffset(eSideBottom, *position,
                                                   scrollContainerSize.height);

  // Store the offset
  nsMargin* offsets = aFrame->GetProperty(nsIFrame::ComputedOffsetProperty());
  if (offsets) {
    *offsets = computedOffsets;
  } else {
    aFrame->SetProperty(nsIFrame::ComputedOffsetProperty(),
                        new nsMargin(computedOffsets));
  }
}

static constexpr nscoord gUnboundedNegative = nscoord_MIN / 2;
static constexpr nscoord gUnboundedExtent = nscoord_MAX;
static constexpr nscoord gUnboundedPositive =
    gUnboundedNegative + gUnboundedExtent;

void StickyScrollContainer::ComputeStickyLimits(nsIFrame* aFrame,
                                                nsRect* aStick,
                                                nsRect* aContain,
                                                StickyLimitSpace aSpace) const {
  NS_ASSERTION(nsLayoutUtils::IsFirstContinuationOrIBSplitSibling(aFrame),
               "Can't sticky position individual continuations");

  const nsPoint scrollPosition = aSpace == StickyLimitSpace::IgnoreCurrentScroll
                                     ? nsPoint()
                                     : mScrollPosition;

  aStick->SetRect(gUnboundedNegative, gUnboundedNegative, gUnboundedExtent,
                  gUnboundedExtent);
  aContain->SetRect(gUnboundedNegative, gUnboundedNegative, gUnboundedExtent,
                    gUnboundedExtent);

  const nsMargin* computedOffsets =
      aFrame->GetProperty(nsIFrame::ComputedOffsetProperty());
  if (!computedOffsets) {
    // We haven't reflowed the scroll frame yet, so offsets haven't been
    // computed. Bail.
    return;
  }

  nsIFrame* scrolledFrame = mScrollContainerFrame->GetScrolledFrame();
  nsIFrame* cbFrame = aFrame->GetContainingBlock();
  NS_ASSERTION(cbFrame == scrolledFrame ||
                   nsLayoutUtils::IsProperAncestorFrame(scrolledFrame, cbFrame),
               "Scroll frame should be an ancestor of the containing block");

  nsRect rect =
      nsLayoutUtils::GetAllInFlowRectsUnion(aFrame, aFrame->GetParent());

  // FIXME(bug 1421660): Table row groups aren't supposed to be containing
  // blocks, but we treat them as such (maybe it's the right thing to do!).
  // Anyway, not having this basically disables position: sticky on table cells,
  // which would be really unfortunate, and doesn't match what other browsers
  // do.
  if (cbFrame != scrolledFrame && cbFrame->IsTableRowGroupFrame()) {
    cbFrame = cbFrame->GetContainingBlock();
  }

  // Containing block limits for the position of aFrame relative to its parent.
  // The margin box of the sticky element stays within the content box of the
  // containing-block element.
  if (cbFrame == scrolledFrame) {
    // cbFrame is the scrolledFrame, and it won't have continuations. Unlike the
    // else clause, we consider scrollable overflow rect because the union of
    // its in-flow rects doesn't include the scrollable overflow area. We need
    // to subtract the padding however, which _is_ included in the scrollable
    // area, since we want the content box.
    MOZ_ASSERT(cbFrame->GetUsedBorder() == nsMargin(),
               "How did the ::-moz-scrolled-frame end up with border?");
    *aContain = cbFrame->ScrollableOverflowRectRelativeToSelf();
    aContain->Deflate(cbFrame->GetUsedPadding());
    nsLayoutUtils::TransformRect(cbFrame, aFrame->GetParent(), *aContain);
  } else {
    *aContain = nsLayoutUtils::GetAllInFlowRectsUnion(
        cbFrame, aFrame->GetParent(),
        nsLayoutUtils::GetAllInFlowRectsFlag::UseContentBox);
  }

  nsRect marginRect = nsLayoutUtils::GetAllInFlowRectsUnion(
      aFrame, aFrame->GetParent(),
      nsLayoutUtils::GetAllInFlowRectsFlag::UseMarginBoxWithAutoResolvedAsZero);

  // Deflate aContain by the difference between the union of aFrame's
  // continuations' margin boxes and the union of their border boxes, so that
  // by keeping aFrame within aContain, we keep the union of the margin boxes
  // within the containing block's content box.
  aContain->Deflate(marginRect - rect);

  // Deflate aContain by the border-box size, to form a constraint on the
  // upper-left corner of aFrame and continuations.
  aContain->Deflate(nsMargin(0, rect.width, rect.height, 0));

  nsMargin sfPadding = scrolledFrame->GetUsedPadding();
  nsPoint sfOffset = aFrame->GetParent()->GetOffsetTo(scrolledFrame);
  nsSize sfSize = GetScrollContainerSize(mScrollContainerFrame);
  StyleDirection direction = cbFrame->StyleVisibility()->mDirection;
  nsMargin effectiveOffsets = *computedOffsets;

  if (computedOffsets->top != NS_AUTOOFFSET &&
      computedOffsets->bottom != NS_AUTOOFFSET) {
    // Decrease the effective end-edge inset of the sticky view rectangle
    // when its height is less than the height of the border-box of the sticky
    // box.
    nscoord stickyViewHeight = sfSize.height - computedOffsets->TopBottom();
    if (rect.height > stickyViewHeight) {
      nscoord delta = rect.height - stickyViewHeight;
      effectiveOffsets.bottom -= delta;
    }
  }

  if (computedOffsets->left != NS_AUTOOFFSET &&
      computedOffsets->right != NS_AUTOOFFSET) {
    // Decrease the effective end-edge inset of the sticky view rectangle
    // when its width is less than the width of the border-box of the sticky
    // box.
    nscoord stickyViewWidth = sfSize.width - computedOffsets->LeftRight();
    if (rect.width > stickyViewWidth) {
      nscoord delta = rect.width - stickyViewWidth;
      if (direction == StyleDirection::Ltr) {
        effectiveOffsets.right -= delta;
      } else {
        effectiveOffsets.left -= delta;
      }
    }
  }

  // The limits have so far been computed for the "position" of the union of
  // aFrame and its continuations, but our consumers expect the limits to be
  // on the position of aFrame, so we need to shift the limits by the
  // difference.
  // - For |aContain| we're otherwise done, so we apply the offset directly.
  // - For |aStick| we apply the offset as part of setting |aStick| (applying
  //   it via `MoveBy` after we set |aStick| would trash any sentinel values).
  const nsPoint frameOffset = aFrame->GetPosition() - rect.TopLeft();

  aContain->MoveBy(frameOffset);

  // Top
  if (computedOffsets->top != NS_AUTOOFFSET) {
    aStick->SetTopEdge(scrollPosition.y + sfPadding.top + effectiveOffsets.top -
                       sfOffset.y + frameOffset.y);
  }

  // Bottom
  if (computedOffsets->bottom != NS_AUTOOFFSET) {
    aStick->SetBottomEdge(scrollPosition.y + sfPadding.top + sfSize.height -
                          effectiveOffsets.bottom - rect.height - sfOffset.y +
                          frameOffset.y);
  }

  // Left
  if (computedOffsets->left != NS_AUTOOFFSET) {
    aStick->SetLeftEdge(scrollPosition.x + sfPadding.left +
                        effectiveOffsets.left - sfOffset.x + frameOffset.x);
  }

  // Right
  if (computedOffsets->right != NS_AUTOOFFSET) {
    aStick->SetRightEdge(scrollPosition.x + sfPadding.left + sfSize.width -
                         effectiveOffsets.right - rect.width - sfOffset.x +
                         frameOffset.x);
  }
}

nsPoint StickyScrollContainer::ComputePosition(nsIFrame* aFrame) const {
  nsRect stick;
  nsRect contain;
  ComputeStickyLimits(aFrame, &stick, &contain);

  nsPoint position = aFrame->GetNormalPosition();

  // For each sticky direction (top, bottom, left, right), move the frame along
  // the appropriate axis, based on the scroll position, but limit this to keep
  // the element's margin box within the containing block.
  position.y = std::max(position.y, std::min(stick.y, contain.YMost()));
  position.y = std::min(position.y, std::max(stick.YMost(), contain.y));
  position.x = std::max(position.x, std::min(stick.x, contain.XMost()));
  position.x = std::min(position.x, std::max(stick.XMost(), contain.x));

  return position;
}

bool StickyScrollContainer::IsStuckInYDirection(nsIFrame* aFrame) const {
  nsPoint position = ComputePosition(aFrame);
  return position.y != aFrame->GetNormalPosition().y;
}

void StickyScrollContainer::GetScrollRanges(nsIFrame* aFrame,
                                            nsRectAbsolute* aOuter,
                                            nsRectAbsolute* aInner) const {
  // We need to use the first in flow; continuation frames should not move
  // relative to each other and should get identical scroll ranges.
  // Also, ComputeStickyLimits requires this.
  nsIFrame* firstCont =
      nsLayoutUtils::FirstContinuationOrIBSplitSibling(aFrame);

  nsRect stickRect;
  nsRect containRect;
  ComputeStickyLimits(firstCont, &stickRect, &containRect);

  nsRectAbsolute stick = nsRectAbsolute::FromRect(stickRect);
  nsRectAbsolute contain = nsRectAbsolute::FromRect(containRect);

  aOuter->SetBox(gUnboundedNegative, gUnboundedNegative, gUnboundedPositive,
                 gUnboundedPositive);
  aInner->SetBox(gUnboundedNegative, gUnboundedNegative, gUnboundedPositive,
                 gUnboundedPositive);

  const nsPoint normalPosition = firstCont->GetNormalPosition();

  // Bottom and top
  if (stick.YMost() != gUnboundedPositive) {
    aOuter->SetTopEdge(contain.Y() - stick.YMost());
    aInner->SetTopEdge(normalPosition.y - stick.YMost());
  }

  if (stick.Y() != gUnboundedNegative) {
    aInner->SetBottomEdge(normalPosition.y - stick.Y());
    aOuter->SetBottomEdge(contain.YMost() - stick.Y());
  }

  // Right and left
  if (stick.XMost() != gUnboundedPositive) {
    aOuter->SetLeftEdge(contain.X() - stick.XMost());
    aInner->SetLeftEdge(normalPosition.x - stick.XMost());
  }

  if (stick.X() != gUnboundedNegative) {
    aInner->SetRightEdge(normalPosition.x - stick.X());
    aOuter->SetRightEdge(contain.XMost() - stick.X());
  }

  // Make sure |inner| does not extend outside of |outer|. (The consumers of
  // the Layers API, to which this information is propagated, expect this
  // invariant to hold.) The calculated value of |inner| can sometimes extend
  // outside of |outer|, for example due to margin collapsing, since
  // GetNormalPosition() returns the actual position after margin collapsing,
  // while |contain| is calculated based on the frame's GetUsedMargin() which
  // is pre-collapsing.
  // Note that this doesn't necessarily solve all problems stemming from
  // comparing pre- and post-collapsing margins (TODO: find a proper solution).
  *aInner = aInner->Intersect(*aOuter);
  if (aInner->IsEmpty()) {
    // This might happen if aInner didn't intersect aOuter at all initially,
    // in which case aInner is empty and outside aOuter. Make sure it doesn't
    // extend outside aOuter.
    *aInner = aInner->MoveInsideAndClamp(*aOuter);
  }
}

StickyScrollContainer::StickyScrollRanges
StickyScrollContainer::GetStickyScrollRangesForAxis(
    const nsIFrame* aFrame, layers::ScrollDirection aAxis) const {
  StickyScrollRanges result;

  nsIFrame* firstCont =
      nsLayoutUtils::FirstContinuationOrIBSplitSibling(aFrame);

  const nsMargin* computedOffsets =
      firstCont->GetProperty(nsIFrame::ComputedOffsetProperty());
  if (!computedOffsets) {
    return result;
  }

  const bool isVertical = aAxis == layers::ScrollDirection::eVertical;
  const nscoord startInset =
      isVertical ? computedOffsets->top : computedOffsets->left;
  const nscoord endInset =
      isVertical ? computedOffsets->bottom : computedOffsets->right;
  if (startInset == NS_AUTOOFFSET && endInset == NS_AUTOOFFSET) {
    return result;
  }

  nsRect stick;
  nsRect contain;
  ComputeStickyLimits(firstCont, &stick, &contain,
                      StickyLimitSpace::IgnoreCurrentScroll);

  const nsPoint normalPosition = firstCont->GetNormalPosition();
  const nscoord normal = isVertical ? normalPosition.y : normalPosition.x;

  // Sticking to a side begins/ends at the scroll offset where the
  // (scroll-invariant) stick edge reaches the frame's normal position.
  if (startInset != NS_AUTOOFFSET) {
    const nscoord stickStart = isVertical ? stick.Y() : stick.X();
    MOZ_ASSERT(stickStart != gUnboundedNegative,
               "A non-auto start inset implies a bounded stick edge");
    const nscoord containEnd = isVertical ? contain.YMost() : contain.XMost();
    result.mStartSide.emplace(StickyScrollRange{
        normal - stickStart, std::max(0, containEnd - normal)});
  }

  if (endInset != NS_AUTOOFFSET) {
    const nscoord stickEnd = isVertical ? stick.YMost() : stick.XMost();
    MOZ_ASSERT(stickEnd != gUnboundedPositive,
               "A non-auto end inset implies a bounded stick edge");
    const nscoord containStart = isVertical ? contain.Y() : contain.X();
    result.mEndSide.emplace(StickyScrollRange{
        normal - stickEnd, std::max(0, normal - containStart)});
  }

  if (result.mStartSide && result.mEndSide &&
      result.mEndSide->mScrollPosition > result.mStartSide->mScrollPosition) {
    MOZ_ASSERT_UNREACHABLE(
        "End-side sticking should end before start-side sticking begins");
    result = {};
  }

  return result;
}

void StickyScrollContainer::PositionContinuations(nsIFrame* aFrame) {
  NS_ASSERTION(nsLayoutUtils::IsFirstContinuationOrIBSplitSibling(aFrame),
               "Should be starting from the first continuation");
  bool hadProperty;
  nsPoint translation =
      ComputePosition(aFrame) - aFrame->GetNormalPosition(&hadProperty);
  if (NS_WARN_IF(!hadProperty)) {
    // If the frame was never relatively positioned, don't move its position
    // dynamically. There are a variety of frames for which `position` doesn't
    // really apply like frames inside svg which would get here and be sticky
    // only in one direction.
    return;
  }

  // Move all continuation frames by the same amount.
  for (nsIFrame* cont = aFrame; cont;
       cont = nsLayoutUtils::GetNextContinuationOrIBSplitSibling(cont)) {
    cont->SetPosition(cont->GetNormalPosition() + translation);
  }
}

void StickyScrollContainer::UpdatePositions(nsPoint aScrollPosition,
                                            nsIFrame* aSubtreeRoot) {
#ifdef DEBUG
  {
    nsIFrame* scrollFrameAsFrame = do_QueryFrame(mScrollContainerFrame);
    NS_ASSERTION(!aSubtreeRoot || aSubtreeRoot == scrollFrameAsFrame,
                 "If reflowing, should be reflowing the scroll frame");
  }
#endif
  mScrollPosition = aScrollPosition;

  OverflowChangedTracker oct;
  oct.SetSubtreeRoot(aSubtreeRoot);
  // We need to position ancestors before children, so iter from shallowest.
  // Collect a list of frames to be removed, so that we don't invalidate the
  // iterator while we're using it.
  AutoTArray<nsIFrame*, 8> framesToRemove;
  for (nsIFrame* f : mFrames.IterFromShallowest()) {
    if (!nsLayoutUtils::IsFirstContinuationOrIBSplitSibling(f)) {
      // This frame was added in nsIFrame::DidSetComputedStyle before we knew it
      // wasn't the first ib-split-sibling.
      framesToRemove.AppendElement(f);
      continue;
    }
    if (aSubtreeRoot) {
      // Reflowing the scroll frame, so recompute offsets.
      ComputeStickyOffsets(f);
    }
    // mFrames will only contain first continuations, because we filter in
    // nsIFrame::DidSetComputedStyle.
    PositionContinuations(f);

    f = f->GetParent();
    if (f != aSubtreeRoot) {
      for (nsIFrame* cont = f; cont;
           cont = nsLayoutUtils::GetNextContinuationOrIBSplitSibling(cont)) {
        oct.AddFrame(cont, OverflowChangedTracker::CHILDREN_CHANGED);
      }
    }
  }
  for (nsIFrame* f : framesToRemove) {
    mFrames.Remove(f);
  }
  oct.Flush();
}

void StickyScrollContainer::MarkFramesForReflow() {
  PresShell* ps = mScrollContainerFrame->PresShell();
  for (nsIFrame* frame : mFrames.IterFromShallowest()) {
    ps->FrameNeedsReflow(frame, IntrinsicDirty::None, NS_FRAME_IS_DIRTY);
  }
}
}  // namespace mozilla
