/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * code for managing absolutely positioned children of a rendering
 * object that is a containing block for them
 */

#include "mozilla/AbsoluteContainingBlock.h"

#include "AnchorPositioningUtils.h"
#include "fmt/format.h"
#include "mozilla/CSSAlignUtils.h"
#include "mozilla/DebugOnly.h"
#include "mozilla/PresShell.h"
#include "mozilla/ReflowInput.h"
#include "mozilla/ScrollContainerFrame.h"
#include "mozilla/ViewportFrame.h"
#include "mozilla/dom/ViewTransition.h"
#include "nsCSSFrameConstructor.h"
#include "nsContainerFrame.h"
#include "nsGridContainerFrame.h"
#include "nsIFrameInlines.h"
#include "nsPlaceholderFrame.h"
#include "nsPresContext.h"
#include "nsPresContextInlines.h"

#ifdef DEBUG
#  include "nsBlockFrame.h"
#endif

using namespace mozilla;

void AbsoluteContainingBlock::SetInitialChildList(nsIFrame* aDelegatingFrame,
                                                  FrameChildListID aListID,
                                                  nsFrameList&& aChildList) {
  MOZ_ASSERT(mChildListID == aListID, "unexpected child list name");
#ifdef DEBUG
  nsIFrame::VerifyDirtyBitSet(aChildList);
  for (nsIFrame* f : aChildList) {
    MOZ_ASSERT(f->GetParent() == aDelegatingFrame, "Unexpected parent");
  }
#endif
  mAbsoluteFrames = std::move(aChildList);
}

void AbsoluteContainingBlock::AppendFrames(nsIFrame* aDelegatingFrame,
                                           FrameChildListID aListID,
                                           nsFrameList&& aFrameList) {
  NS_ASSERTION(mChildListID == aListID, "unexpected child list");

  // Append the frames to our list of absolutely positioned frames
#ifdef DEBUG
  nsIFrame::VerifyDirtyBitSet(aFrameList);
#endif
  mAbsoluteFrames.AppendFrames(nullptr, std::move(aFrameList));

  // no damage to intrinsic widths, since absolutely positioned frames can't
  // change them
  aDelegatingFrame->PresShell()->FrameNeedsReflow(
      aDelegatingFrame, IntrinsicDirty::None, NS_FRAME_HAS_DIRTY_CHILDREN);
}

void AbsoluteContainingBlock::InsertFrames(nsIFrame* aDelegatingFrame,
                                           FrameChildListID aListID,
                                           nsIFrame* aPrevFrame,
                                           nsFrameList&& aFrameList) {
  NS_ASSERTION(mChildListID == aListID, "unexpected child list");
  NS_ASSERTION(!aPrevFrame || aPrevFrame->GetParent() == aDelegatingFrame,
               "inserting after sibling frame with different parent");

#ifdef DEBUG
  nsIFrame::VerifyDirtyBitSet(aFrameList);
#endif
  mAbsoluteFrames.InsertFrames(nullptr, aPrevFrame, std::move(aFrameList));

  // no damage to intrinsic widths, since absolutely positioned frames can't
  // change them
  aDelegatingFrame->PresShell()->FrameNeedsReflow(
      aDelegatingFrame, IntrinsicDirty::None, NS_FRAME_HAS_DIRTY_CHILDREN);
}

void AbsoluteContainingBlock::RemoveFrame(FrameDestroyContext& aContext,
                                          FrameChildListID aListID,
                                          nsIFrame* aOldFrame) {
  NS_ASSERTION(mChildListID == aListID, "unexpected child list");

  if (!aOldFrame->PresContext()->FragmentainerAwarePositioningEnabled()) {
    if (nsIFrame* nif = aOldFrame->GetNextInFlow()) {
      nif->GetParent()->DeleteNextInFlowChild(aContext, nif, false);
    }
    mAbsoluteFrames.DestroyFrame(aContext, aOldFrame);
    return;
  }

  AutoTArray<nsIFrame*, 8> delFrames;
  for (nsIFrame* f = aOldFrame; f; f = f->GetNextInFlow()) {
    delFrames.AppendElement(f);
  }
  for (nsIFrame* delFrame : Reversed(delFrames)) {
    delFrame->GetParent()->GetAbsoluteContainingBlock()->StealFrame(delFrame);
    delFrame->Destroy(aContext);
  }
}

nsFrameList AbsoluteContainingBlock::StealPushedChildList() {
  return std::move(mPushedAbsoluteFrames);
}

bool AbsoluteContainingBlock::PrepareAbsoluteFrames(
    nsContainerFrame* aDelegatingFrame) {
  if (!aDelegatingFrame->PresContext()
           ->FragmentainerAwarePositioningEnabled()) {
    return HasAbsoluteFrames();
  }

  if (const nsIFrame* prevInFlow = aDelegatingFrame->GetPrevInFlow()) {
    AbsoluteContainingBlock* prevAbsCB =
        prevInFlow->GetAbsoluteContainingBlock();
    MOZ_ASSERT(prevAbsCB,
               "If this delegating frame has an absCB, its prev-in-flow must "
               "have one, too!");

    // Prepend the pushed absolute frames from the previous absCB to our
    // absolute child list.
    nsFrameList pushedFrames = prevAbsCB->StealPushedChildList();
    if (pushedFrames.NotEmpty()) {
      mAbsoluteFrames.InsertFrames(aDelegatingFrame, nullptr,
                                   std::move(pushedFrames));
    }
  }

  // Our pushed absolute child list might be non-empty if our next-in-flow
  // hasn't reflowed yet. Move any child in that list that is a first-in-flow,
  // or whose prev-in-flow is not in our absolute child list, into our absolute
  // child list.
  nsIFrame* child = mPushedAbsoluteFrames.FirstChild();
  while (child) {
    nsIFrame* next = child->GetNextInFlow();
    if (!child->GetPrevInFlow() ||
        child->GetPrevInFlow()->GetParent() != aDelegatingFrame) {
      mPushedAbsoluteFrames.RemoveFrame(child);
      mAbsoluteFrames.AppendFrame(nullptr, child);
    }
    child = next;
  }

  // TODO (Bug 1994346 or Bug 1997696): Consider stealing absolute frames from
  // our next-in-flow's absolute child list.

  return HasAbsoluteFrames();
}

void AbsoluteContainingBlock::StealFrame(nsIFrame* aFrame) {
  const DebugOnly<bool> frameRemoved =
      mAbsoluteFrames.StartRemoveFrame(aFrame) ||
      mPushedAbsoluteFrames.ContinueRemoveFrame(aFrame);
  MOZ_ASSERT(frameRemoved, "Failed to find aFrame from our child lists!");
}

static void MaybeMarkAncestorsAsHavingDescendantDependentOnItsStaticPos(
    nsIFrame* aFrame, nsIFrame* aContainingBlockFrame) {
  MOZ_ASSERT(aFrame->HasAnyStateBits(NS_FRAME_OUT_OF_FLOW));
  if (!aFrame->StylePosition()->NeedsHypotheticalPositionIfAbsPos()) {
    return;
  }
  // We should have set the bit when reflowing the previous continuations
  // already.
  if (aFrame->GetPrevContinuation()) {
    return;
  }

  auto* placeholder = aFrame->GetPlaceholderFrame();
  MOZ_ASSERT(placeholder);

  // Only fixed-pos frames can escape their containing block.
  if (!placeholder->HasAnyStateBits(PLACEHOLDER_FOR_FIXEDPOS)) {
    return;
  }

  for (nsIFrame* ancestor = placeholder->GetParent(); ancestor;
       ancestor = ancestor->GetParent()) {
    // Walk towards the ancestor's first continuation. That's the only one that
    // really matters, since it's the only one restyling will look at. We also
    // flag the following continuations just so it's caught on the first
    // early-return ones just to avoid walking them over and over.
    do {
      if (ancestor->DescendantMayDependOnItsStaticPosition()) {
        return;
      }
      // Moving the containing block or anything above it would move our static
      // position as well, so no need to flag it or any of its ancestors.
      if (aFrame == aContainingBlockFrame) {
        return;
      }
      ancestor->SetDescendantMayDependOnItsStaticPosition(true);
      nsIFrame* prev = ancestor->GetPrevContinuation();
      if (!prev) {
        break;
      }
      ancestor = prev;
    } while (true);
  }
}

static bool IsSnapshotContainingBlock(const nsIFrame* aFrame) {
  return aFrame->Style()->GetPseudoType() ==
         PseudoStyleType::mozSnapshotContainingBlock;
}

static PhysicalAxes CheckEarlyCompensatingForScroll(const nsIFrame* aKidFrame) {
  // Three conditions to compensate for scroll, once a default anchor
  // exists:
  // * Used alignment property is `anchor-center`,
  // * `position-area` is not `none`, or
  // * `anchor()` function refers to default anchor, or an anchor that
  //   shares the same scroller with it.
  // Second condition is checkable right now, so do that.
  if (!aKidFrame->StylePosition()->mPositionArea.IsNone()) {
    return PhysicalAxes{PhysicalAxis::Horizontal, PhysicalAxis::Vertical};
  }
  return PhysicalAxes{};
}

static AnchorPosResolutionCache PopulateAnchorResolutionCache(
    const nsIFrame* aKidFrame, AnchorPosReferenceData* aData) {
  MOZ_ASSERT(aKidFrame->HasAnchorPosReference());
  // If the default anchor exists, it will likely be referenced (Except when
  // authors then use `anchor()` without referring to anchors whose nearest
  // scroller that of the default anchor, but that seems
  // counter-productive). This is a prerequisite for scroll compensation. We
  // also need to check for `anchor()` resolutions, so cache information for
  // default anchor and its scrollers right now.
  AnchorPosResolutionCache result{aData, {}};
  // Let this call populate the cache.
  const auto defaultAnchorInfo = AnchorPositioningUtils::ResolveAnchorPosRect(
      aKidFrame, aKidFrame->GetParent(), nullptr, false, &result);
  if (defaultAnchorInfo) {
    aData->AdjustCompensatingForScroll(
        CheckEarlyCompensatingForScroll(aKidFrame));
  }
  return result;
}

void AbsoluteContainingBlock::Reflow(nsContainerFrame* aDelegatingFrame,
                                     nsPresContext* aPresContext,
                                     const ReflowInput& aReflowInput,
                                     nsReflowStatus& aReflowStatus,
                                     const nsRect& aContainingBlock,
                                     AbsPosReflowFlags aFlags,
                                     OverflowAreas* aOverflowAreas) {
  // PageContentFrame replicates fixed pos children so we really don't want
  // them contributing to overflow areas because that means we'll create new
  // pages ad infinitum if one of them overflows the page.
  if (aDelegatingFrame->IsPageContentFrame()) {
    MOZ_ASSERT(mChildListID == FrameChildListID::Fixed);
    aOverflowAreas = nullptr;
  }

  const auto scrollableContainingBlock = [&]() -> nsRect {
    switch (aDelegatingFrame->Style()->GetPseudoType()) {
      case PseudoStyleType::scrolledContent:
      case PseudoStyleType::scrolledCanvas: {
        // FIXME(bug 2004432): This is close enough to what we want. In practice
        // we don't want to account for relative positioning and so on, but this
        // seems good enough for now.
        ScrollContainerFrame* sf = do_QueryFrame(aDelegatingFrame->GetParent());
        // Clamp to the scrollable range.
        return sf->GetUnsnappedScrolledRectInternal(
            aOverflowAreas->ScrollableOverflow(), aContainingBlock.Size());
      }
      default:
        break;
    }
    return aContainingBlock;
  }();

  nsReflowStatus reflowStatus;
  const bool reflowAll = aReflowInput.ShouldReflowAllKids();
  const bool cbWidthChanged = aFlags.contains(AbsPosReflowFlag::CBWidthChanged);
  const bool cbHeightChanged =
      aFlags.contains(AbsPosReflowFlag::CBHeightChanged);
  nsOverflowContinuationTracker tracker(aDelegatingFrame, true);
  for (nsIFrame* kidFrame : mAbsoluteFrames) {
    Maybe<AnchorPosResolutionCache> anchorPosResolutionCache;
    if (kidFrame->HasAnchorPosReference()) {
      auto* referenceData = kidFrame->SetOrUpdateDeletableProperty(
          nsIFrame::AnchorPosReferences());
      anchorPosResolutionCache =
          Some(PopulateAnchorResolutionCache(kidFrame, referenceData));
    } else {
      kidFrame->RemoveProperty(nsIFrame::AnchorPosReferences());
    }

    bool kidNeedsReflow =
        reflowAll || kidFrame->IsSubtreeDirty() ||
        FrameDependsOnContainer(kidFrame, cbWidthChanged, cbHeightChanged,
                                anchorPosResolutionCache.ptrOr(nullptr));
    if (kidFrame->IsSubtreeDirty()) {
      MaybeMarkAncestorsAsHavingDescendantDependentOnItsStaticPos(
          kidFrame, aDelegatingFrame);
    }
    const nscoord availBSize = aReflowInput.AvailableBSize();
    const WritingMode containerWM = aReflowInput.GetWritingMode();
    if (!kidNeedsReflow && availBSize != NS_UNCONSTRAINEDSIZE) {
      // If we need to redo pagination on the kid, we need to reflow it.
      // This can happen either if the available height shrunk and the
      // kid (or its overflow that creates overflow containers) is now
      // too large to fit in the available height, or if the available
      // height has increased and the kid has a next-in-flow that we
      // might need to pull from.
      WritingMode kidWM = kidFrame->GetWritingMode();
      if (containerWM.GetBlockDir() != kidWM.GetBlockDir()) {
        // Not sure what the right test would be here.
        kidNeedsReflow = true;
      } else {
        nscoord kidBEnd =
            kidFrame->GetLogicalRect(aContainingBlock.Size()).BEnd(kidWM);
        nscoord kidOverflowBEnd =
            LogicalRect(containerWM,
                        // Use ...RelativeToSelf to ignore transforms
                        kidFrame->ScrollableOverflowRectRelativeToSelf() +
                            kidFrame->GetPosition(),
                        aContainingBlock.Size())
                .BEnd(containerWM);
        NS_ASSERTION(kidOverflowBEnd >= kidBEnd,
                     "overflow area should be at least as large as frame rect");
        if (kidOverflowBEnd > availBSize ||
            (kidBEnd < availBSize && kidFrame->GetNextInFlow())) {
          kidNeedsReflow = true;
        }
      }
    }
    if (kidNeedsReflow && !aPresContext->HasPendingInterrupt()) {
      // Reflow the frame
      nsReflowStatus kidStatus;
      ReflowAbsoluteFrame(aDelegatingFrame, aPresContext, aReflowInput,
                          aContainingBlock, scrollableContainingBlock, aFlags,
                          kidFrame, kidStatus, aOverflowAreas,
                          anchorPosResolutionCache.ptrOr(nullptr));
      MOZ_ASSERT(!kidStatus.IsInlineBreakBefore(),
                 "ShouldAvoidBreakInside should prevent this from happening");
      nsIFrame* nextFrame = kidFrame->GetNextInFlow();
      if (aPresContext->FragmentainerAwarePositioningEnabled()) {
        if (!kidStatus.IsFullyComplete()) {
          if (!nextFrame) {
            nextFrame = aPresContext->PresShell()
                            ->FrameConstructor()
                            ->CreateContinuingFrame(kidFrame, aDelegatingFrame);
            mPushedAbsoluteFrames.AppendFrame(nullptr, nextFrame);
          } else if (nextFrame->GetParent() !=
                     aDelegatingFrame->GetNextInFlow()) {
            nextFrame->GetParent()->GetAbsoluteContainingBlock()->StealFrame(
                nextFrame);
            mPushedAbsoluteFrames.AppendFrame(nullptr, nextFrame);
          }
          reflowStatus.MergeCompletionStatusFrom(kidStatus);
        } else if (nextFrame) {
          // kidFrame is fully-complete. Delete all its next-in-flows.
          FrameDestroyContext context(aPresContext->PresShell());
          nextFrame->GetParent()->GetAbsoluteContainingBlock()->RemoveFrame(
              context, FrameChildListID::Absolute, nextFrame);
        }
      } else {
        if (!kidStatus.IsFullyComplete() &&
            aDelegatingFrame->CanContainOverflowContainers()) {
          // Need a continuation
          if (!nextFrame) {
            nextFrame = aPresContext->PresShell()
                            ->FrameConstructor()
                            ->CreateContinuingFrame(kidFrame, aDelegatingFrame);
          }
          // Add it as an overflow container.
          // XXXfr This is a hack to fix some of our printing dataloss.
          // See bug 154892. Not sure how to do it "right" yet; probably want
          // to keep continuations within an AbsoluteContainingBlock eventually.
          //
          // NOTE(TYLin): we're now trying to conditionally do this "right" in
          // the other branch here, inside of the StaticPrefs pref-check.
          tracker.Insert(nextFrame, kidStatus);
          reflowStatus.MergeCompletionStatusFrom(kidStatus);
        } else if (nextFrame) {
          // Delete any continuations
          nsOverflowContinuationTracker::AutoFinish fini(&tracker, kidFrame);
          FrameDestroyContext context(aPresContext->PresShell());
          nextFrame->GetParent()->DeleteNextInFlowChild(context, nextFrame,
                                                        true);
        }
      }
    } else {
      if (aOverflowAreas) {
        if (!aPresContext->FragmentainerAwarePositioningEnabled()) {
          tracker.Skip(kidFrame, reflowStatus);
        }
        aDelegatingFrame->ConsiderChildOverflow(*aOverflowAreas, kidFrame);
      }
    }

    // Make a CheckForInterrupt call, here, not just HasPendingInterrupt.  That
    // will make sure that we end up reflowing aDelegatingFrame in cases when
    // one of our kids interrupted.  Otherwise we'd set the dirty or
    // dirty-children bit on the kid in the condition below, and then when
    // reflow completes and we go to mark dirty bits on all ancestors of that
    // kid we'll immediately bail out, because the kid already has a dirty bit.
    // In particular, we won't set any dirty bits on aDelegatingFrame, so when
    // the following reflow happens we won't reflow the kid in question.  This
    // might be slightly suboptimal in cases where |kidFrame| itself did not
    // interrupt, since we'll trigger a reflow of it too when it's not strictly
    // needed.  But the logic to not do that is enough more complicated, and
    // the case enough of an edge case, that this is probably better.
    if (kidNeedsReflow && aPresContext->CheckForInterrupt(aDelegatingFrame)) {
      if (aDelegatingFrame->HasAnyStateBits(NS_FRAME_IS_DIRTY)) {
        kidFrame->MarkSubtreeDirty();
      } else {
        kidFrame->AddStateBits(NS_FRAME_HAS_DIRTY_CHILDREN);
      }
    }
  }

  // Abspos frames can't cause their parent to be incomplete,
  // only overflow incomplete.
  if (reflowStatus.IsIncomplete()) {
    reflowStatus.SetOverflowIncomplete();
    reflowStatus.SetNextInFlowNeedsReflow();
  }

  aReflowStatus.MergeCompletionStatusFrom(reflowStatus);
}

static inline bool IsFixedPaddingSize(const LengthPercentage& aCoord) {
  return aCoord.ConvertsToLength();
}
static inline bool IsFixedMarginSize(const AnchorResolvedMargin& aCoord) {
  return aCoord->ConvertsToLength();
}
static inline bool IsFixedOffset(const AnchorResolvedInset& aInset) {
  // For anchor positioning functions, even if the computed value may be a
  // fixed length, it depends on the absolute containing block's size.
  return aInset->ConvertsToLength();
}

bool AbsoluteContainingBlock::FrameDependsOnContainer(
    nsIFrame* f, bool aCBWidthChanged, bool aCBHeightChanged,
    AnchorPosResolutionCache* aAnchorPosResolutionCache) {
  const nsStylePosition* pos = f->StylePosition();
  // See if f's position might have changed because it depends on a
  // placeholder's position.
  if (pos->NeedsHypotheticalPositionIfAbsPos()) {
    return true;
  }
  if (!aCBWidthChanged && !aCBHeightChanged) {
    // skip getting style data
    return false;
  }
  const nsStylePadding* padding = f->StylePadding();
  const nsStyleMargin* margin = f->StyleMargin();
  WritingMode wm = f->GetWritingMode();
  const auto anchorResolutionParams =
      AnchorPosResolutionParams::From(f, aAnchorPosResolutionCache);
  if (wm.IsVertical() ? aCBHeightChanged : aCBWidthChanged) {
    // See if f's inline-size might have changed.
    // If margin-inline-start/end, padding-inline-start/end,
    // inline-size, min/max-inline-size are all lengths, 'none', or enumerated,
    // then our frame isize does not depend on the parent isize.
    // Note that borders never depend on the parent isize.
    // XXX All of the enumerated values except -moz-available are ok too.
    if (nsStylePosition::ISizeDependsOnContainer(
            pos->ISize(wm, anchorResolutionParams)) ||
        nsStylePosition::MinISizeDependsOnContainer(
            pos->MinISize(wm, anchorResolutionParams)) ||
        nsStylePosition::MaxISizeDependsOnContainer(
            pos->MaxISize(wm, anchorResolutionParams)) ||
        !IsFixedPaddingSize(padding->mPadding.GetIStart(wm)) ||
        !IsFixedPaddingSize(padding->mPadding.GetIEnd(wm))) {
      return true;
    }

    // See if f's position might have changed. If we're RTL then the
    // rules are slightly different. We'll assume percentage or auto
    // margins will always induce a dependency on the size
    if (!IsFixedMarginSize(margin->GetMargin(LogicalSide::IStart, wm,
                                             anchorResolutionParams)) ||
        !IsFixedMarginSize(
            margin->GetMargin(LogicalSide::IEnd, wm, anchorResolutionParams))) {
      return true;
    }
  }
  if (wm.IsVertical() ? aCBWidthChanged : aCBHeightChanged) {
    // See if f's block-size might have changed.
    // If margin-block-start/end, padding-block-start/end,
    // min-block-size, and max-block-size are all lengths or 'none',
    // and bsize is a length or bsize and bend are auto and bstart is not auto,
    // then our frame bsize does not depend on the parent bsize.
    // Note that borders never depend on the parent bsize.
    //
    // FIXME(emilio): Should the BSize(wm).IsAuto() check also for the extremum
    // lengths?
    const auto bSize = pos->BSize(wm, anchorResolutionParams);
    const auto anchorOffsetResolutionParams =
        AnchorPosOffsetResolutionParams::UseCBFrameSize(anchorResolutionParams);
    if ((nsStylePosition::BSizeDependsOnContainer(bSize) &&
         !(bSize->IsAuto() &&
           pos->GetAnchorResolvedInset(LogicalSide::BEnd, wm,
                                       anchorOffsetResolutionParams)
               ->IsAuto() &&
           !pos->GetAnchorResolvedInset(LogicalSide::BStart, wm,
                                        anchorOffsetResolutionParams)
                ->IsAuto())) ||
        nsStylePosition::MinBSizeDependsOnContainer(
            pos->MinBSize(wm, anchorResolutionParams)) ||
        nsStylePosition::MaxBSizeDependsOnContainer(
            pos->MaxBSize(wm, anchorResolutionParams)) ||
        !IsFixedPaddingSize(padding->mPadding.GetBStart(wm)) ||
        !IsFixedPaddingSize(padding->mPadding.GetBEnd(wm))) {
      return true;
    }

    // See if f's position might have changed.
    if (!IsFixedMarginSize(margin->GetMargin(LogicalSide::BStart, wm,
                                             anchorResolutionParams)) ||
        !IsFixedMarginSize(
            margin->GetMargin(LogicalSide::BEnd, wm, anchorResolutionParams))) {
      return true;
    }
  }

  // Since we store coordinates relative to top and left, the position
  // of a frame depends on that of its container if it is fixed relative
  // to the right or bottom, or if it is positioned using percentages
  // relative to the left or top.  Because of the dependency on the
  // sides (left and top) that we use to store coordinates, these tests
  // are easier to do using physical coordinates rather than logical.
  if (aCBWidthChanged) {
    const auto anchorOffsetResolutionParams =
        AnchorPosOffsetResolutionParams::UseCBFrameSize(anchorResolutionParams);
    if (!IsFixedOffset(pos->GetAnchorResolvedInset(
            eSideLeft, anchorOffsetResolutionParams))) {
      return true;
    }
    // Note that even if 'left' is a length, our position can still
    // depend on the containing block width, because if our direction or
    // writing-mode moves from right to left (in either block or inline
    // progression) and 'right' is not 'auto', we will discard 'left'
    // and be positioned relative to the containing block right edge.
    // 'left' length and 'right' auto is the only combination we can be
    // sure of.
    if ((wm.GetInlineDir() == WritingMode::InlineDir::RTL ||
         wm.GetBlockDir() == WritingMode::BlockDir::RL) &&
        !pos->GetAnchorResolvedInset(eSideRight, anchorOffsetResolutionParams)
             ->IsAuto()) {
      return true;
    }
  }
  if (aCBHeightChanged) {
    const auto anchorOffsetResolutionParams =
        AnchorPosOffsetResolutionParams::UseCBFrameSize(anchorResolutionParams);
    if (!IsFixedOffset(pos->GetAnchorResolvedInset(
            eSideTop, anchorOffsetResolutionParams))) {
      return true;
    }
    // See comment above for width changes.
    if (wm.GetInlineDir() == WritingMode::InlineDir::BTT &&
        !pos->GetAnchorResolvedInset(eSideBottom, anchorOffsetResolutionParams)
             ->IsAuto()) {
      return true;
    }
  }

  return false;
}

void AbsoluteContainingBlock::DestroyFrames(DestroyContext& aContext) {
  mAbsoluteFrames.DestroyFrames(aContext);
  mPushedAbsoluteFrames.DestroyFrames(aContext);
}

void AbsoluteContainingBlock::MarkSizeDependentFramesDirty() {
  DoMarkFramesDirty(false);
}

void AbsoluteContainingBlock::MarkAllFramesDirty() { DoMarkFramesDirty(true); }

void AbsoluteContainingBlock::DoMarkFramesDirty(bool aMarkAllDirty) {
  for (nsIFrame* kidFrame : mAbsoluteFrames) {
    if (aMarkAllDirty) {
      kidFrame->MarkSubtreeDirty();
    } else if (FrameDependsOnContainer(kidFrame, true, true)) {
      // Add the weakest flags that will make sure we reflow this frame later
      kidFrame->AddStateBits(NS_FRAME_HAS_DIRTY_CHILDREN);
    }
  }
}

// Given an out-of-flow frame, this method returns the parent frame of its
// placeholder frame or null if it doesn't have a placeholder for some reason.
static nsContainerFrame* GetPlaceholderContainer(nsIFrame* aPositionedFrame) {
  nsIFrame* placeholder = aPositionedFrame->GetPlaceholderFrame();
  return placeholder ? placeholder->GetParent() : nullptr;
}

struct NonAutoAlignParams {
  nscoord mCurrentStartInset;
  nscoord mCurrentEndInset;

  NonAutoAlignParams(nscoord aStartInset, nscoord aEndInset)
      : mCurrentStartInset(aStartInset), mCurrentEndInset(aEndInset) {}
};

/**
 * This function returns the offset of an abs/fixed-pos child's static
 * position, with respect to the "start" corner of its alignment container,
 * according to CSS Box Alignment.  This function only operates in a single
 * axis at a time -- callers can choose which axis via the |aAbsPosCBAxis|
 * parameter. This is called under two scenarios:
 * 1. We're statically positioning this absolutely positioned box, meaning
 *    that the offsets are auto and will change depending on the alignment
 *    of the box.
 * 2. The offsets are non-auto, but the element may not fill the inset-reduced
 *    containing block, so its margin box needs to be aligned in that axis.
 *    This is the step 4 of [1]. Should also be noted that, unlike static
 *    positioning, where we may confine the alignment area for flex/grid
 *    parent containers, we explicitly align to the inset-reduced absolute
 *    container size.
 *
 * [1]: https://drafts.csswg.org/css-position-3/#abspos-layout
 *
 * @param aKidReflowInput The ReflowInput for the to-be-aligned abspos child.
 * @param aKidSizeInAbsPosCBWM The child frame's size (after it's been given
 *                             the opportunity to reflow), in terms of
 *                             aAbsPosCBWM.
 * @param aAbsPosCBSize The abspos CB size, in terms of aAbsPosCBWM.
 * @param aPlaceholderContainer The parent of the child frame's corresponding
 *                              placeholder frame, cast to a nsContainerFrame.
 *                              (This will help us choose which alignment enum
 *                              we should use for the child.)
 * @param aAbsPosCBWM The child frame's containing block's WritingMode.
 * @param aAbsPosCBAxis The axis (of the containing block) that we should
 *                      be doing this computation for.
 * @param aNonAutoAlignParams Parameters, if specified, indicating that we're
 *                            handling scenario 2.
 */
static nscoord OffsetToAlignedStaticPos(
    const ReflowInput& aKidReflowInput, const LogicalSize& aKidSizeInAbsPosCBWM,
    const LogicalSize& aAbsPosCBSize,
    const nsContainerFrame* aPlaceholderContainer, WritingMode aAbsPosCBWM,
    LogicalAxis aAbsPosCBAxis, Maybe<NonAutoAlignParams> aNonAutoAlignParams,
    const StylePositionArea& aPositionArea) {
  if (!aPlaceholderContainer) {
    // (The placeholder container should be the thing that kicks this whole
    // process off, by setting PLACEHOLDER_STATICPOS_NEEDS_CSSALIGN.  So it
    // should exist... but bail gracefully if it doesn't.)
    NS_ERROR(
        "Missing placeholder-container when computing a "
        "CSS Box Alignment static position");
    return 0;
  }

  // (Most of this function is simply preparing args that we'll pass to
  // AlignJustifySelf at the end.)

  // NOTE: Our alignment container is aPlaceholderContainer's content-box
  // (or an area within it, if aPlaceholderContainer is a grid). So, we'll
  // perform most of our arithmetic/alignment in aPlaceholderContainer's
  // WritingMode. For brevity, we use the abbreviation "pc" for "placeholder
  // container" in variables below.
  WritingMode pcWM = aPlaceholderContainer->GetWritingMode();
  LogicalSize absPosCBSizeInPCWM = aAbsPosCBSize.ConvertTo(pcWM, aAbsPosCBWM);

  // Find what axis aAbsPosCBAxis corresponds to, in placeholder's parent's
  // writing-mode.
  const LogicalAxis pcAxis = aAbsPosCBWM.ConvertAxisTo(aAbsPosCBAxis, pcWM);
  const LogicalSize alignAreaSize = [&]() {
    if (!aNonAutoAlignParams) {
      const bool placeholderContainerIsContainingBlock =
          aPlaceholderContainer == aKidReflowInput.mCBReflowInput->mFrame;

      LayoutFrameType parentType = aPlaceholderContainer->Type();
      LogicalSize alignAreaSize(pcWM);
      if (parentType == LayoutFrameType::FlexContainer) {
        // We store the frame rect in FinishAndStoreOverflow, which runs _after_
        // reflowing the absolute frames, so handle the special case of the
        // frame being the actual containing block here, by getting the size
        // from aAbsPosCBSize.
        //
        // The alignment container is the flex container's content box.
        if (placeholderContainerIsContainingBlock) {
          alignAreaSize = aAbsPosCBSize.ConvertTo(pcWM, aAbsPosCBWM);
          // aAbsPosCBSize is the padding-box, so substract the padding to get
          // the content box.
          alignAreaSize -=
              aPlaceholderContainer->GetLogicalUsedPadding(pcWM).Size(pcWM);
        } else {
          alignAreaSize = aPlaceholderContainer->GetLogicalSize(pcWM);
          LogicalMargin pcBorderPadding =
              aPlaceholderContainer->GetLogicalUsedBorderAndPadding(pcWM);
          alignAreaSize -= pcBorderPadding.Size(pcWM);
        }
        return alignAreaSize;
      }
      if (parentType == LayoutFrameType::GridContainer) {
        // This abspos elem's parent is a grid container. Per CSS Grid 10.1
        // & 10.2:
        //  - If the grid container *also* generates the abspos containing block
        //  (a
        // grid area) for this abspos child, we use that abspos containing block
        // as the alignment container, too. (And its size is aAbsPosCBSize.)
        //  - Otherwise, we use the grid's padding box as the alignment
        //  container.
        // https://drafts.csswg.org/css-grid/#static-position
        if (placeholderContainerIsContainingBlock) {
          // The alignment container is the grid area that we're using as the
          // absolute containing block.
          alignAreaSize = aAbsPosCBSize.ConvertTo(pcWM, aAbsPosCBWM);
        } else {
          // The alignment container is a the grid container's content box
          // (which we can get by subtracting away its border & padding from
          // frame's size):
          alignAreaSize = aPlaceholderContainer->GetLogicalSize(pcWM);
          LogicalMargin pcBorderPadding =
              aPlaceholderContainer->GetLogicalUsedBorderAndPadding(pcWM);
          alignAreaSize -= pcBorderPadding.Size(pcWM);
        }
        return alignAreaSize;
      }
    }
    // Either we're in scenario 1 but within a non-flex/grid parent, or in
    // scenario 2.
    return aAbsPosCBSize.ConvertTo(pcWM, aAbsPosCBWM);
  }();

  const nscoord existingOffset = aNonAutoAlignParams
                                     ? aNonAutoAlignParams->mCurrentStartInset +
                                           aNonAutoAlignParams->mCurrentEndInset
                                     : 0;
  const nscoord alignAreaSizeInAxis =
      ((pcAxis == LogicalAxis::Inline) ? alignAreaSize.ISize(pcWM)
                                       : alignAreaSize.BSize(pcWM)) -
      existingOffset;

  using AlignJustifyFlag = CSSAlignUtils::AlignJustifyFlag;
  CSSAlignUtils::AlignJustifyFlags flags(AlignJustifyFlag::IgnoreAutoMargins);
  // Given that scenario 2 ignores the parent container type, special handling
  // of absolutely-positioned child is also ignored.
  StyleAlignFlags alignConst =
      aNonAutoAlignParams
          ? aPlaceholderContainer
                ->CSSAlignmentForAbsPosChildWithinContainingBlock(
                    aKidReflowInput, pcAxis, aPositionArea, absPosCBSizeInPCWM)
          : aPlaceholderContainer->CSSAlignmentForAbsPosChild(aKidReflowInput,
                                                              pcAxis);
  // If the safe bit in alignConst is set, set the safe flag in |flags|.
  const auto safetyBits =
      alignConst & (StyleAlignFlags::SAFE | StyleAlignFlags::UNSAFE);
  alignConst &= ~StyleAlignFlags::FLAG_BITS;
  if (safetyBits & StyleAlignFlags::SAFE) {
    flags += AlignJustifyFlag::OverflowSafe;
  }

  // Find out if placeholder-container & the OOF child have the same start-sides
  // in the placeholder-container's pcAxis.
  WritingMode kidWM = aKidReflowInput.GetWritingMode();
  if (pcWM.ParallelAxisStartsOnSameSide(pcAxis, kidWM)) {
    flags += AlignJustifyFlag::SameSide;
  }

  if (aNonAutoAlignParams) {
    flags += AlignJustifyFlag::AligningMarginBox;
  }

  // (baselineAdjust is unused. CSSAlignmentForAbsPosChild() should've
  // converted 'baseline'/'last baseline' enums to their fallback values.)
  const nscoord baselineAdjust = nscoord(0);

  // AlignJustifySelf operates in the kid's writing mode, so we need to
  // represent the child's size and the desired axis in that writing mode:
  LogicalSize kidSizeInOwnWM =
      aKidSizeInAbsPosCBWM.ConvertTo(kidWM, aAbsPosCBWM);
  const LogicalAxis kidAxis = aAbsPosCBWM.ConvertAxisTo(aAbsPosCBAxis, kidWM);

  // Build an Inset Modified anchor info from the anchor which can be used to
  // align to the anchor-center, if AlignJustifySelf is AnchorCenter.
  Maybe<CSSAlignUtils::AnchorAlignInfo> anchorAlignInfo;
  if (alignConst == StyleAlignFlags::ANCHOR_CENTER &&
      aKidReflowInput.mAnchorPosResolutionCache) {
    const auto* referenceData =
        aKidReflowInput.mAnchorPosResolutionCache->mReferenceData;
    if (referenceData) {
      const auto* cachedData =
          referenceData->Lookup(referenceData->mDefaultAnchorName);
      if (cachedData && *cachedData) {
        const auto& data = cachedData->ref();
        if (data.mOffsetData) {
          const nsSize containerSize =
              aAbsPosCBSize.GetPhysicalSize(aAbsPosCBWM);
          const nsRect anchorRect(data.mOffsetData->mOrigin, data.mSize);
          const LogicalRect logicalAnchorRect{aAbsPosCBWM, anchorRect,
                                              containerSize};
          const auto axisInAbsPosCBWM =
              kidWM.ConvertAxisTo(kidAxis, aAbsPosCBWM);
          const auto anchorStart =
              logicalAnchorRect.Start(axisInAbsPosCBWM, aAbsPosCBWM);
          const auto anchorSize =
              logicalAnchorRect.Size(axisInAbsPosCBWM, aAbsPosCBWM);
          anchorAlignInfo =
              Some(CSSAlignUtils::AnchorAlignInfo{anchorStart, anchorSize});
          if (aNonAutoAlignParams) {
            anchorAlignInfo->mAnchorStart -=
                aNonAutoAlignParams->mCurrentStartInset;
          }
        }
      }
    }
  }

  nscoord offset = CSSAlignUtils::AlignJustifySelf(
      alignConst, kidAxis, flags, baselineAdjust, alignAreaSizeInAxis,
      aKidReflowInput, kidSizeInOwnWM, anchorAlignInfo);

  // Safe alignment clamping for anchor-center.
  // When using anchor-center with the safe keyword, or when both insets are
  // auto (which defaults to safe behavior), clamp the element to stay within
  // the containing block.
  if ((!aNonAutoAlignParams || (safetyBits & StyleAlignFlags::SAFE)) &&
      alignConst == StyleAlignFlags::ANCHOR_CENTER) {
    const auto cbSize = aAbsPosCBSize.Size(aAbsPosCBAxis, aAbsPosCBWM);
    const auto kidSize = aKidSizeInAbsPosCBWM.Size(aAbsPosCBAxis, aAbsPosCBWM);

    if (aNonAutoAlignParams) {
      const nscoord currentStartInset = aNonAutoAlignParams->mCurrentStartInset;
      const nscoord finalStart = currentStartInset + offset;
      const nscoord clampedStart =
          CSSMinMax(finalStart, nscoord(0), cbSize - kidSize);
      offset = clampedStart - currentStartInset;
    } else {
      offset = CSSMinMax(offset, nscoord(0), cbSize - kidSize);
    }
  }

  const auto rawAlignConst =
      (pcAxis == LogicalAxis::Inline)
          ? aKidReflowInput.mStylePosition->mJustifySelf._0
          : aKidReflowInput.mStylePosition->mAlignSelf._0;
  if (aNonAutoAlignParams && !safetyBits &&
      rawAlignConst != StyleAlignFlags::AUTO) {
    // No `safe` or `unsafe` specified - "in-between" behaviour for relevant
    // alignment values: https://drafts.csswg.org/css-position-3/#abspos-layout
    // Skip if the raw self alignment for this element is `auto` to preserve
    // legacy behaviour.
    // Follows https://drafts.csswg.org/css-align-3/#auto-safety-position
    const auto cbSize = aAbsPosCBSize.Size(aAbsPosCBAxis, aAbsPosCBWM);
    // IMCB stands for "Inset-Modified Containing Block."
    const auto imcbStart = aNonAutoAlignParams->mCurrentStartInset;
    const auto imcbEnd = cbSize - aNonAutoAlignParams->mCurrentEndInset;
    const auto kidSize = aKidSizeInAbsPosCBWM.Size(aAbsPosCBAxis, aAbsPosCBWM);
    const auto kidStart = aNonAutoAlignParams->mCurrentStartInset + offset;
    const auto kidEnd = kidStart + kidSize;
    // "[...] the overflow limit rect is the bounding rectangle of the alignment
    // subject’s inset-modified containing block and its original containing
    // block."
    const auto overflowLimitRectStart = std::min(0, imcbStart);
    const auto overflowLimitRectEnd = std::max(cbSize, imcbEnd);

    if (kidStart >= imcbStart && kidEnd <= imcbEnd) {
      // 1. We fit inside the IMCB, no action needed.
    } else if (kidSize <= overflowLimitRectEnd - overflowLimitRectStart) {
      // 2. We overflowed IMCB, try to cover IMCB completely, if it's not.
      if (kidStart <= imcbStart && kidEnd >= imcbEnd) {
        // IMCB already covered, ensure that we aren't escaping the limit rect.
        if (kidStart < overflowLimitRectStart) {
          offset += overflowLimitRectStart - kidStart;
        } else if (kidEnd > overflowLimitRectEnd) {
          offset -= kidEnd - overflowLimitRectEnd;
        }
      } else if (kidEnd < imcbEnd && kidStart < imcbStart) {
        // Space to end, overflowing on start - nudge to end.
        offset += std::min(imcbStart - kidStart, imcbEnd - kidEnd);
      } else if (kidStart > imcbStart && kidEnd > imcbEnd) {
        // Space to start, overflowing on end - nudge to start.
        offset -= std::min(kidEnd - imcbEnd, kidStart - imcbStart);
      }
    } else {
      // 3. We'll overflow the limit rect. Start align the subject int overflow
      // limit rect.
      offset =
          -aNonAutoAlignParams->mCurrentStartInset + overflowLimitRectStart;
    }
  }

  // "offset" is in terms of the CSS Box Alignment container (i.e. it's in
  // terms of pcWM). But our return value needs to in terms of the containing
  // block's writing mode, which might have the opposite directionality in the
  // given axis. In that case, we just need to negate "offset" when returning,
  // to make it have the right effect as an offset for coordinates in the
  // containing block's writing mode.
  if (!pcWM.ParallelAxisStartsOnSameSide(pcAxis, aAbsPosCBWM)) {
    return -offset;
  }
  return offset;
}

void AbsoluteContainingBlock::ResolveSizeDependentOffsets(
    ReflowInput& aKidReflowInput, const LogicalSize& aCBSize,
    const LogicalSize& aKidSize, const LogicalMargin& aMargin,
    const StylePositionArea& aResolvedPositionArea, LogicalMargin& aOffsets) {
  WritingMode outerWM = aKidReflowInput.mParentReflowInput->GetWritingMode();

  // Now that we know the child's size, we resolve any sentinel values in its
  // IStart/BStart offset coordinates that depend on that size.
  //  * NS_AUTOOFFSET indicates that the child's position in the given axis
  // is determined by its end-wards offset property, combined with its size and
  // available space. e.g.: "top: auto; height: auto; bottom: 50px"
  //  * m{I,B}OffsetsResolvedAfterSize indicate that the child is using its
  // static position in that axis, *and* its static position is determined by
  // the axis-appropriate css-align property (which may require the child's
  // size, e.g. to center it within the parent).
  if ((NS_AUTOOFFSET == aOffsets.IStart(outerWM)) ||
      (NS_AUTOOFFSET == aOffsets.BStart(outerWM)) ||
      aKidReflowInput.mFlags.mIOffsetsNeedCSSAlign ||
      aKidReflowInput.mFlags.mBOffsetsNeedCSSAlign) {
    // placeholderContainer is used in each of the m{I,B}OffsetsNeedCSSAlign
    // clauses. We declare it at this scope so we can avoid having to look
    // it up twice (and only look it up if it's needed).
    nsContainerFrame* placeholderContainer = nullptr;

    if (NS_AUTOOFFSET == aOffsets.IStart(outerWM)) {
      NS_ASSERTION(NS_AUTOOFFSET != aOffsets.IEnd(outerWM),
                   "Can't solve for both start and end");
      aOffsets.IStart(outerWM) =
          aCBSize.ISize(outerWM) - aOffsets.IEnd(outerWM) -
          aMargin.IStartEnd(outerWM) - aKidSize.ISize(outerWM);
    } else if (aKidReflowInput.mFlags.mIOffsetsNeedCSSAlign) {
      placeholderContainer = GetPlaceholderContainer(aKidReflowInput.mFrame);
      nscoord offset = OffsetToAlignedStaticPos(
          aKidReflowInput, aKidSize, aCBSize, placeholderContainer, outerWM,
          LogicalAxis::Inline, Nothing{}, aResolvedPositionArea);
      // Shift IStart from its current position (at start corner of the
      // alignment container) by the returned offset.  And set IEnd to the
      // distance between the kid's end edge to containing block's end edge.
      aOffsets.IStart(outerWM) += offset;
      aOffsets.IEnd(outerWM) =
          aCBSize.ISize(outerWM) -
          (aOffsets.IStart(outerWM) + aKidSize.ISize(outerWM));
    }

    if (NS_AUTOOFFSET == aOffsets.BStart(outerWM)) {
      aOffsets.BStart(outerWM) =
          aCBSize.BSize(outerWM) - aOffsets.BEnd(outerWM) -
          aMargin.BStartEnd(outerWM) - aKidSize.BSize(outerWM);
    } else if (aKidReflowInput.mFlags.mBOffsetsNeedCSSAlign) {
      if (!placeholderContainer) {
        placeholderContainer = GetPlaceholderContainer(aKidReflowInput.mFrame);
      }
      nscoord offset = OffsetToAlignedStaticPos(
          aKidReflowInput, aKidSize, aCBSize, placeholderContainer, outerWM,
          LogicalAxis::Block, Nothing{}, aResolvedPositionArea);
      // Shift BStart from its current position (at start corner of the
      // alignment container) by the returned offset.  And set BEnd to the
      // distance between the kid's end edge to containing block's end edge.
      aOffsets.BStart(outerWM) += offset;
      aOffsets.BEnd(outerWM) =
          aCBSize.BSize(outerWM) -
          (aOffsets.BStart(outerWM) + aKidSize.BSize(outerWM));
    }
    aKidReflowInput.SetComputedLogicalOffsets(outerWM, aOffsets);
  }
}

void AbsoluteContainingBlock::ResolveAutoMarginsAfterLayout(
    ReflowInput& aKidReflowInput, const LogicalSize& aCBSize,
    const LogicalSize& aKidSize, LogicalMargin& aMargin,
    const LogicalMargin& aOffsets) {
  MOZ_ASSERT(aKidReflowInput.mFlags.mDeferAutoMarginComputation);

  WritingMode wm = aKidReflowInput.GetWritingMode();
  WritingMode outerWM = aKidReflowInput.mParentReflowInput->GetWritingMode();

  const LogicalSize cbSizeInWM = aCBSize.ConvertTo(wm, outerWM);
  const LogicalSize kidSizeInWM = aKidSize.ConvertTo(wm, outerWM);
  LogicalMargin marginInWM = aMargin.ConvertTo(wm, outerWM);
  LogicalMargin offsetsInWM = aOffsets.ConvertTo(wm, outerWM);

  // No need to substract border sizes because aKidSize has it included
  // already. Also, if any offset is auto, the auto margin resolves to zero.
  // https://drafts.csswg.org/css-position-3/#abspos-margins
  const bool autoOffset = offsetsInWM.BEnd(wm) == NS_AUTOOFFSET ||
                          offsetsInWM.BStart(wm) == NS_AUTOOFFSET;
  nscoord availMarginSpace =
      autoOffset ? 0
                 : cbSizeInWM.BSize(wm) - kidSizeInWM.BSize(wm) -
                       offsetsInWM.BStartEnd(wm) - marginInWM.BStartEnd(wm);

  const auto& styleMargin = aKidReflowInput.mStyleMargin;
  const auto anchorResolutionParams =
      AnchorPosResolutionParams::From(&aKidReflowInput);
  if (wm.IsOrthogonalTo(outerWM)) {
    ReflowInput::ComputeAbsPosInlineAutoMargin(
        availMarginSpace, outerWM,
        styleMargin
            ->GetMargin(LogicalSide::IStart, outerWM, anchorResolutionParams)
            ->IsAuto(),
        styleMargin
            ->GetMargin(LogicalSide::IEnd, outerWM, anchorResolutionParams)
            ->IsAuto(),
        aKidReflowInput.mFlags.mIAnchorCenter,
        aMargin);
  } else {
    ReflowInput::ComputeAbsPosBlockAutoMargin(
        availMarginSpace, outerWM,
        styleMargin
            ->GetMargin(LogicalSide::BStart, outerWM, anchorResolutionParams)
            ->IsAuto(),
        styleMargin
            ->GetMargin(LogicalSide::BEnd, outerWM, anchorResolutionParams)
            ->IsAuto(),
        aKidReflowInput.mFlags.mBAnchorCenter,
        aMargin);
  }

  aKidReflowInput.SetComputedLogicalMargin(outerWM, aMargin);
  aKidReflowInput.SetComputedLogicalOffsets(outerWM, aOffsets);

  nsMargin* propValue =
      aKidReflowInput.mFrame->GetProperty(nsIFrame::UsedMarginProperty());
  // InitOffsets should've created a UsedMarginProperty for us, if any margin is
  // auto.
  MOZ_ASSERT_IF(
      styleMargin->HasInlineAxisAuto(outerWM, anchorResolutionParams) ||
          styleMargin->HasBlockAxisAuto(outerWM, anchorResolutionParams),
      propValue);
  if (propValue) {
    *propValue = aMargin.GetPhysicalMargin(outerWM);
  }
}

struct None {};
using OldCacheState = Variant<None, AnchorPosResolutionCache::PositionTryBackup,
                              AnchorPosResolutionCache::PositionTryFullBackup>;

struct MOZ_STACK_CLASS MOZ_RAII AutoFallbackStyleSetter {
  AutoFallbackStyleSetter(nsIFrame* aFrame, ComputedStyle* aFallbackStyle,
                          AnchorPosResolutionCache* aCache, bool aIsFirstTry)
      : mFrame(aFrame), mCache{aCache}, mOldCacheState{None{}} {
    if (aFallbackStyle) {
      mOldStyle = aFrame->SetComputedStyleWithoutNotification(aFallbackStyle);
    }
    // We need to be able to "go back" to the old, first try (Which is not
    // necessarily base style) cache.
    if (!aIsFirstTry && aCache) {
      // New fallback could just be a flip keyword.
      if (mOldStyle && mOldStyle->StylePosition()->mPositionAnchor !=
                           aFrame->StylePosition()->mPositionAnchor) {
        mOldCacheState =
            OldCacheState{aCache->TryPositionWithDifferentDefaultAnchor()};
        *aCache = PopulateAnchorResolutionCache(aFrame, aCache->mReferenceData);
      } else {
        mOldCacheState =
            OldCacheState{aCache->TryPositionWithSameDefaultAnchor()};
        if (aCache->mDefaultAnchorCache.mAnchor) {
          aCache->mReferenceData->AdjustCompensatingForScroll(
              CheckEarlyCompensatingForScroll(aFrame));
        }
      }
    }
  }

  ~AutoFallbackStyleSetter() {
    if (mOldStyle) {
      mFrame->SetComputedStyleWithoutNotification(std::move(mOldStyle));
    }
    std::move(mOldCacheState)
        .match(
            [](None&&) {},
            [&](AnchorPosResolutionCache::PositionTryBackup&& aBackup) {
              mCache->UndoTryPositionWithSameDefaultAnchor(std::move(aBackup));
            },
            [&](AnchorPosResolutionCache::PositionTryFullBackup&& aBackup) {
              mCache->UndoTryPositionWithDifferentDefaultAnchor(
                  std::move(aBackup));
            });
  }

  void CommitCurrentFallback() {
    mOldCacheState = OldCacheState{None{}};
    // If we have a non-layout dependent margin / paddings, which are different
    // from our original style, we need to make sure to commit it into the frame
    // property so that it doesn't get lost after returning from reflow.
    nsMargin margin;
    if (mOldStyle &&
        !mOldStyle->StyleMargin()->MarginEquals(*mFrame->StyleMargin()) &&
        mFrame->StyleMargin()->GetMargin(margin)) {
      mFrame->SetOrUpdateDeletableProperty(nsIFrame::UsedMarginProperty(),
                                           margin);
    }
  }

 private:
  nsIFrame* const mFrame;
  RefPtr<ComputedStyle> mOldStyle;
  AnchorPosResolutionCache* const mCache;
  OldCacheState mOldCacheState;
};

struct AnchorShiftInfo {
  nsPoint mOffset;
  StylePositionArea mResolvedArea;
};

struct ContainingBlockRect {
  Maybe<AnchorShiftInfo> mAnchorShiftInfo;
  nsRect mMaybeScrollableRect;
  nsRect mFinalRect;

  explicit ContainingBlockRect(const nsRect& aRect)
      : mMaybeScrollableRect{aRect}, mFinalRect{aRect} {}
  ContainingBlockRect(const nsPoint& aOffset,
                      const StylePositionArea& aResolvedArea,
                      const nsRect& aMaybeScrollableRect,
                      const nsRect& aFinalRect)
      : mAnchorShiftInfo{Some(AnchorShiftInfo{aOffset, aResolvedArea})},
        mMaybeScrollableRect{aMaybeScrollableRect},
        mFinalRect{aFinalRect} {}

  StylePositionArea ResolvedPositionArea() const {
    return mAnchorShiftInfo
        .map([](const AnchorShiftInfo& aInfo) { return aInfo.mResolvedArea; })
        .valueOr(StylePositionArea{});
  }
};

// XXX Optimize the case where it's a resize reflow and the absolutely
// positioned child has the exact same size and position and skip the
// reflow...
void AbsoluteContainingBlock::ReflowAbsoluteFrame(
    nsContainerFrame* aDelegatingFrame, nsPresContext* aPresContext,
    const ReflowInput& aReflowInput, const nsRect& aOriginalContainingBlockRect,
    const nsRect& aOriginalScrollableContainingBlockRect,
    AbsPosReflowFlags aFlags, nsIFrame* aKidFrame, nsReflowStatus& aStatus,
    OverflowAreas* aOverflowAreas,
    AnchorPosResolutionCache* aAnchorPosResolutionCache) {
  MOZ_ASSERT(aStatus.IsEmpty(), "Caller should pass a fresh reflow status!");

#ifdef DEBUG
  if (nsBlockFrame::gNoisyReflow) {
    nsIFrame::IndentBy(stdout, nsBlockFrame::gNoiseIndent);
    fmt::println(
        FMT_STRING("abspos {}: begin reflow: availSize={}, orig cbRect={}"),
        aKidFrame->ListTag(), ToString(aReflowInput.AvailableSize()),
        ToString(aOriginalContainingBlockRect));
  }
  AutoNoisyIndenter indent(nsBlockFrame::gNoisy);
#endif  // DEBUG

  const bool isGrid = aFlags.contains(AbsPosReflowFlag::IsGridContainerCB);
  // TODO(bug 1989059): position-try-order.
  auto fallbacks =
      aKidFrame->StylePosition()->mPositionTryFallbacks._0.AsSpan();
  Maybe<uint32_t> currentFallbackIndex;
  const StylePositionTryFallbacksItem* currentFallback = nullptr;
  RefPtr<ComputedStyle> currentFallbackStyle;

  auto SeekFallbackTo = [&](uint32_t aIndex) -> bool {
    if (aIndex >= fallbacks.Length()) {
      return false;
    }
    const StylePositionTryFallbacksItem* nextFallback;
    RefPtr<ComputedStyle> nextFallbackStyle;
    while (true) {
      nextFallback = &fallbacks[aIndex];
      nextFallbackStyle = aPresContext->StyleSet()->ResolvePositionTry(
          *aKidFrame->GetContent()->AsElement(), *aKidFrame->Style(),
          *nextFallback);
      if (!nextFallbackStyle) {
        // No @position-try rule for this name was found, per spec we should
        // skip it.
        aIndex++;
        if (aIndex >= fallbacks.Length()) {
          return false;
        }
      }
      break;
    }
    currentFallbackIndex = Some(aIndex);
    currentFallback = nextFallback;
    currentFallbackStyle = std::move(nextFallbackStyle);
    return true;
  };

  auto TryAdvanceFallback = [&]() -> bool {
    if (fallbacks.IsEmpty()) {
      return false;
    }
    uint32_t nextFallbackIndex =
        currentFallbackIndex ? *currentFallbackIndex + 1 : 0;
    return SeekFallbackTo(nextFallbackIndex);
  };

  Maybe<uint32_t> firstTryIndex;
  Maybe<nsPoint> firstTryNormalPosition;
  // TODO(emilio): Right now fallback only applies to position-area, which only
  // makes a difference with a default anchor... Generalize it?
  if (aAnchorPosResolutionCache) {
    const auto* lastSuccessfulPosition =
        aKidFrame->GetProperty(nsIFrame::LastSuccessfulPositionFallback());
    if (lastSuccessfulPosition) {
      if (!SeekFallbackTo(lastSuccessfulPosition->mIndex)) {
        aKidFrame->RemoveProperty(nsIFrame::LastSuccessfulPositionFallback());
      } else {
        firstTryIndex = Some(lastSuccessfulPosition->mIndex);
      }
    }
  }

  // Assume we *are* overflowing the CB and if we find a fallback that doesn't
  // overflow, we set this to false and break the loop.
  bool isOverflowingCB = true;

  do {
    AutoFallbackStyleSetter fallback(aKidFrame, currentFallbackStyle,
                                     aAnchorPosResolutionCache,
                                     firstTryIndex == currentFallbackIndex);
    auto cb = [&]() {
      if (aAnchorPosResolutionCache) {
        const auto defaultAnchorInfo =
            AnchorPositioningUtils::ResolveAnchorPosRect(
                aKidFrame, aDelegatingFrame, nullptr, false,
                aAnchorPosResolutionCache);
        if (defaultAnchorInfo) {
          auto positionArea = aKidFrame->StylePosition()->mPositionArea;
          if (!positionArea.IsNone()) {
            // Offset should be up to, but not including the containing block's
            // scroll offset.
            const auto offset = AnchorPositioningUtils::GetScrollOffsetFor(
                aAnchorPosResolutionCache->mReferenceData
                    ->CompensatingForScrollAxes(),
                aKidFrame, aAnchorPosResolutionCache->mDefaultAnchorCache);
            // Imagine an abspos container with a scroller in it, and then an
            // anchor in it, where the anchor is visually in the middle of the
            // scrollport. Then, when the scroller moves such that the anchor's
            // left edge is on that of the scrollports, w.r.t. containing block,
            // the anchor is zero left offset horizontally. The position-area
            // grid needs to account for this.
            const auto scrolledAnchorRect = defaultAnchorInfo->mRect - offset;
            StylePositionArea resolvedPositionArea{};
            const auto scrolledAnchorCb = AnchorPositioningUtils::
                AdjustAbsoluteContainingBlockRectForPositionArea(
                    scrolledAnchorRect + aOriginalContainingBlockRect.TopLeft(),
                    aOriginalScrollableContainingBlockRect,
                    aKidFrame->GetWritingMode(),
                    aDelegatingFrame->GetWritingMode(), positionArea,
                    &resolvedPositionArea);
            return ContainingBlockRect{
                offset, resolvedPositionArea,
                aOriginalScrollableContainingBlockRect,
                // Unscroll the CB by canceling out the previously applied
                // scroll offset (See above), the offset will be applied later.
                scrolledAnchorCb + offset};
          }
          return ContainingBlockRect{aOriginalScrollableContainingBlockRect};
        }
      }

      if (isGrid) {
        // TODO(emilio, bug 2004596): This adjustment is supposed to also
        // restrict the position-area rect above...
        const auto border = aDelegatingFrame->GetUsedBorder();
        const nsPoint borderShift{border.left, border.top};
        // Shift in by border of the overall grid container.
        return ContainingBlockRect{nsGridContainerFrame::GridItemCB(aKidFrame) +
                                   borderShift};
      }

      if (ViewportFrame* viewport = do_QueryFrame(aDelegatingFrame)) {
        if (!IsSnapshotContainingBlock(aKidFrame)) {
          return ContainingBlockRect{
              viewport->GetContainingBlockAdjustedForScrollbars(aReflowInput)};
        }
        return ContainingBlockRect{
            dom::ViewTransition::SnapshotContainingBlockRect(
                viewport->PresContext())};
      }
      return ContainingBlockRect{aOriginalContainingBlockRect};
    }();
    if (aAnchorPosResolutionCache) {
      const auto& originalCb = cb.mMaybeScrollableRect;
      aAnchorPosResolutionCache->mReferenceData->mOriginalContainingBlockRect =
          originalCb;
      // Stash the adjusted containing block as well, since the insets need to
      // resolve against the adjusted CB, e.g. With `position-area: bottom
      // right;`, + `left: anchor(right);`
      // resolves to 0.
      aAnchorPosResolutionCache->mReferenceData->mAdjustedContainingBlock =
          cb.mFinalRect;
    }
    const WritingMode outerWM = aReflowInput.GetWritingMode();
    const WritingMode wm = aKidFrame->GetWritingMode();
    const LogicalSize cbSize(outerWM, cb.mFinalRect.Size());

    ReflowInput::InitFlags initFlags;
    const bool staticPosIsCBOrigin = [&] {
      if (aFlags.contains(AbsPosReflowFlag::IsGridContainerCB)) {
        // When a grid container generates the abs.pos. CB for a *child* then
        // the static position is determined via CSS Box Alignment within the
        // abs.pos. CB (a grid area, i.e. a piece of the grid). In this
        // scenario, due to the multiple coordinate spaces in play, we use a
        // convenience flag to simply have the child's ReflowInput give it a
        // static position at its abs.pos. CB origin, and then we'll align &
        // offset it from there.
        nsIFrame* placeholder = aKidFrame->GetPlaceholderFrame();
        if (placeholder && placeholder->GetParent() == aDelegatingFrame) {
          return true;
        }
      }
      if (aKidFrame->IsMenuPopupFrame()) {
        // Popups never use their static pos.
        return true;
      }
      // TODO(emilio): Either reparent the top layer placeholder frames to the
      // viewport, or return true here for top layer frames more generally (not
      // only menupopups), see https://github.com/w3c/csswg-drafts/issues/8040.
      return false;
    }();

    if (staticPosIsCBOrigin) {
      initFlags += ReflowInput::InitFlag::StaticPosIsCBOrigin;
    }

    const bool kidFrameMaySplit =
        aReflowInput.AvailableBSize() != NS_UNCONSTRAINEDSIZE &&

        // Don't split if told not to (e.g. for fixed frames)
        aFlags.contains(AbsPosReflowFlag::AllowFragmentation) &&

        // XXX we don't handle splitting frames for inline absolute containing
        // blocks yet
        !aDelegatingFrame->IsInlineFrame() &&

        // Bug 1588623: Support splitting absolute positioned multicol
        // containers.
        !aKidFrame->IsColumnSetWrapperFrame() &&

        // Don't split things below the fold. (Ideally we shouldn't *have*
        // anything totally below the fold, but we can't position frames
        // across next-in-flow breaks yet. (Bug 1994346)
        (aKidFrame->GetLogicalRect(cb.mFinalRect.Size()).BStart(wm) <=
         aReflowInput.AvailableBSize());

    // Get the border values
    const LogicalMargin border =
        aDelegatingFrame->GetLogicalUsedBorder(outerWM).ApplySkipSides(
            aDelegatingFrame->PreReflowBlockLevelLogicalSkipSides());

    const nsIFrame* kidPrevInFlow = aKidFrame->GetPrevInFlow();
    nscoord availBSize;
    if (kidFrameMaySplit) {
      availBSize = aReflowInput.AvailableBSize();
      // If aKidFrame is a first-in-flow, we subtract our containing block's
      // border-block-start, to consider the available space as starting at the
      // containing block's padding-edge.
      //
      // If aKidFrame is *not* a first-in-flow, then we don't need to subtract
      // the containing block's border. Instead, we consider this whole fragment
      // as our available space, i.e., we allow abspos continuations to overlap
      // any border that their containing block parent might have (including
      // borders generated by 'box-decoration-break:clone').
      if (!kidPrevInFlow) {
        availBSize -= border.BStart(outerWM);
      }
    } else {
      availBSize = NS_UNCONSTRAINEDSIZE;
    }
    const LogicalSize availSize(outerWM, cbSize.ISize(outerWM), availBSize);
    ReflowInput kidReflowInput(aPresContext, aReflowInput, aKidFrame,
                               availSize.ConvertTo(wm, outerWM),
                               Some(cbSize.ConvertTo(wm, outerWM)), initFlags,
                               {}, {}, aAnchorPosResolutionCache);

    // ReflowInput's constructor may change the available block-size to
    // unconstrained, e.g. in orthogonal reflow, so we retrieve it again and
    // account for kid's constraints in its own writing-mode if needed.
    if (!kidPrevInFlow) {
      nscoord kidAvailBSize = kidReflowInput.AvailableBSize();
      if (kidAvailBSize != NS_UNCONSTRAINEDSIZE) {
        kidAvailBSize -= kidReflowInput.ComputedLogicalMargin(wm).BStart(wm);
        const nscoord kidOffsetBStart =
            kidReflowInput.ComputedLogicalOffsets(wm).BStart(wm);
        if (kidOffsetBStart != NS_AUTOOFFSET) {
          kidAvailBSize -= kidOffsetBStart;
        }
        kidReflowInput.SetAvailableBSize(kidAvailBSize);
      }
    }

    // Do the reflow
    ReflowOutput kidDesiredSize(kidReflowInput);
    aKidFrame->Reflow(aPresContext, kidDesiredSize, kidReflowInput, aStatus);

    if (aKidFrame->IsMenuPopupFrame()) {
      // Do nothing. Popup frame will handle its own positioning.
    } else if (kidPrevInFlow) {
      // aKidFrame is a next-in-flow. Place it at the block-edge start of its
      // containing block, with the same inline-position as its prev-in-flow.
      const nsSize cbBorderBoxSize =
          (cbSize + border.Size(outerWM)).GetPhysicalSize(outerWM);
      const LogicalPoint kidPos(
          outerWM, kidPrevInFlow->IStart(outerWM, cbBorderBoxSize), 0);
      const LogicalSize kidSize = kidDesiredSize.Size(outerWM);
      const LogicalRect kidRect(outerWM, kidPos, kidSize);
      aKidFrame->SetRect(outerWM, kidRect, cbBorderBoxSize);
    } else {
      // Position the child relative to our padding edge.
      const LogicalSize kidSize = kidDesiredSize.Size(outerWM);

      LogicalMargin offsets = kidReflowInput.ComputedLogicalOffsets(outerWM);
      LogicalMargin margin = kidReflowInput.ComputedLogicalMargin(outerWM);

      // If we're doing CSS Box Alignment in either axis, that will apply the
      // margin for us in that axis (since the thing that's aligned is the
      // margin box).  So, we clear out the margin here to avoid applying it
      // twice.
      if (kidReflowInput.mFlags.mIOffsetsNeedCSSAlign) {
        margin.IStart(outerWM) = margin.IEnd(outerWM) = 0;
      }
      if (kidReflowInput.mFlags.mBOffsetsNeedCSSAlign) {
        margin.BStart(outerWM) = margin.BEnd(outerWM) = 0;
      }

      // If we're solving for start in either inline or block direction,
      // then compute it now that we know the dimensions.
      ResolveSizeDependentOffsets(kidReflowInput, cbSize, kidSize, margin,
                                  cb.ResolvedPositionArea(), offsets);

      if (kidReflowInput.mFlags.mDeferAutoMarginComputation) {
        ResolveAutoMarginsAfterLayout(kidReflowInput, cbSize, kidSize, margin,
                                      offsets);
      }

      // If the inset is constrained as non-auto, we may have a child that does
      // not fill out the inset-reduced containing block. In this case, we need
      // to align the child by its margin box:
      // https://drafts.csswg.org/css-position-3/#abspos-layout
      const auto* stylePos = aKidFrame->StylePosition();
      const auto anchorResolutionParams =
          AnchorPosOffsetResolutionParams::ExplicitCBFrameSize(
              AnchorPosResolutionParams::From(aKidFrame,
                                              aAnchorPosResolutionCache),
              &cbSize);
      const bool iStartInsetAuto =
          stylePos
              ->GetAnchorResolvedInset(LogicalSide::IStart, outerWM,
                                       anchorResolutionParams)
              ->IsAuto();
      const bool iEndInsetAuto =
          stylePos
              ->GetAnchorResolvedInset(LogicalSide::IEnd, outerWM,
                                       anchorResolutionParams)
              ->IsAuto();
      const bool iInsetAuto = iStartInsetAuto || iEndInsetAuto;

      const bool bStartInsetAuto =
          stylePos
              ->GetAnchorResolvedInset(LogicalSide::BStart, outerWM,
                                       anchorResolutionParams)
              ->IsAuto();
      const bool bEndInsetAuto =
          stylePos
              ->GetAnchorResolvedInset(LogicalSide::BEnd, outerWM,
                                       anchorResolutionParams)
              ->IsAuto();
      const bool bInsetAuto = bStartInsetAuto || bEndInsetAuto;
      const LogicalSize kidMarginBox{
          outerWM, margin.IStartEnd(outerWM) + kidSize.ISize(outerWM),
          margin.BStartEnd(outerWM) + kidSize.BSize(outerWM)};
      const auto* placeholderContainer =
          GetPlaceholderContainer(kidReflowInput.mFrame);

      if (!iInsetAuto || kidReflowInput.mFlags.mIAnchorCenter) {
        MOZ_ASSERT(
            !kidReflowInput.mFlags.mIOffsetsNeedCSSAlign ||
                kidReflowInput.mFlags.mIAnchorCenter,
            "Non-auto inline inset but requires CSS alignment for static "
            "position?");
        auto alignOffset = OffsetToAlignedStaticPos(
            kidReflowInput, kidMarginBox, cbSize, placeholderContainer, outerWM,
            LogicalAxis::Inline,
            Some(NonAutoAlignParams{
                offsets.IStart(outerWM),
                offsets.IEnd(outerWM),
            }),
            cb.ResolvedPositionArea());

        offsets.IStart(outerWM) += alignOffset;
        offsets.IEnd(outerWM) =
            cbSize.ISize(outerWM) -
            (offsets.IStart(outerWM) + kidMarginBox.ISize(outerWM));
      }
      if (!bInsetAuto || kidReflowInput.mFlags.mBAnchorCenter) {
        MOZ_ASSERT(!kidReflowInput.mFlags.mBOffsetsNeedCSSAlign ||
                       kidReflowInput.mFlags.mBAnchorCenter,
                   "Non-auto block inset but requires CSS alignment for static "
                   "position?");
        auto alignOffset = OffsetToAlignedStaticPos(
            kidReflowInput, kidMarginBox, cbSize, placeholderContainer, outerWM,
            LogicalAxis::Block,
            Some(NonAutoAlignParams{
                offsets.BStart(outerWM),
                offsets.BEnd(outerWM),
            }),
            cb.ResolvedPositionArea());
        offsets.BStart(outerWM) += alignOffset;
        offsets.BEnd(outerWM) =
            cbSize.BSize(outerWM) -
            (offsets.BStart(outerWM) + kidMarginBox.BSize(outerWM));
      }

      LogicalRect rect(
          outerWM, offsets.StartOffset(outerWM) + margin.StartOffset(outerWM),
          kidSize);
      nsRect r = rect.GetPhysicalRect(outerWM, cbSize.GetPhysicalSize(outerWM));

      // So far, we've positioned against the padding edge of the containing
      // block, which is necessary for inset computation. However, the position
      // of a frame originates against the border box.
      r += cb.mFinalRect.TopLeft();

      aKidFrame->SetRect(r);
    }

    aKidFrame->DidReflow(aPresContext, &kidReflowInput);

    [&]() {
      if (!aAnchorPosResolutionCache) {
        return;
      }
      auto* referenceData = aAnchorPosResolutionCache->mReferenceData;
      if (referenceData->CompensatingForScrollAxes().isEmpty()) {
        return;
      }
      // Now that all the anchor-related values are resolved, completing the
      // scroll compensation flag, compute the scroll offsets.
      const auto offset = [&]() {
        if (cb.mAnchorShiftInfo) {
          // Already resolved.
          return cb.mAnchorShiftInfo->mOffset;
        }
        return AnchorPositioningUtils::GetScrollOffsetFor(
            referenceData->CompensatingForScrollAxes(), aKidFrame,
            aAnchorPosResolutionCache->mDefaultAnchorCache);
      }();
      // Apply the hypothetical scroll offset.
      const auto position = aKidFrame->GetPosition();
      // Set initial scroll position. TODO(dshin, bug 1987962): Need
      // additional work for remembered scroll offset here.
      if (!firstTryNormalPosition) {
        firstTryNormalPosition = Some(position);
      }
      aKidFrame->SetProperty(nsIFrame::NormalPositionProperty(), position);
      if (offset != nsPoint{}) {
        aKidFrame->SetPosition(position - offset);
        // Ensure that the positioned frame's overflow is updated. Absolutely
        // containing block's overflow will be updated shortly below.
        aKidFrame->UpdateOverflow();
      }
      aAnchorPosResolutionCache->mReferenceData->mDefaultScrollShift = offset;
    }();

    // FIXME(bug 2004495): Per spec this should be the inset-modified
    // containing-block, see:
    // https://drafts.csswg.org/css-anchor-position-1/#fallback-apply
    const auto fits = aStatus.IsComplete() && cb.mMaybeScrollableRect.Contains(
                                                  aKidFrame->GetMarginRect());
    if (fallbacks.IsEmpty() || fits) {
      // We completed the reflow - Either we had a fallback that fit, or we
      // didn't have any to try in the first place.
      isOverflowingCB = !fits;
      fallback.CommitCurrentFallback();
      break;
    }

    if (!TryAdvanceFallback()) {
      // If there are no further fallbacks, we're done.
      break;
    }

    // Try with the next  fallback.
    aKidFrame->AddStateBits(NS_FRAME_IS_DIRTY);
    aStatus.Reset();
  } while (true);

  [&]() {
    if (!isOverflowingCB || !aAnchorPosResolutionCache ||
        !firstTryNormalPosition) {
      return;
    }
    // We gave up applying fallbacks. Recover previous values, if changed.
    // Because we rolled back to first try data, our cache should be up-to-date.
    const auto normalPosition = *firstTryNormalPosition;
    const auto oldNormalPosition = aKidFrame->GetNormalPosition();
    if (normalPosition != oldNormalPosition) {
      aKidFrame->SetProperty(nsIFrame::NormalPositionProperty(),
                             normalPosition);
    }
    const auto position =
        normalPosition -
        aAnchorPosResolutionCache->mReferenceData->mDefaultScrollShift;
    const auto oldPosition = aKidFrame->GetPosition();
    if (position == oldPosition) {
      return;
    }
    aKidFrame->SetPosition(position);
    aKidFrame->UpdateOverflow();
  }();

  if (currentFallbackIndex) {
    aKidFrame->SetOrUpdateDeletableProperty(
        nsIFrame::LastSuccessfulPositionFallback(), *currentFallbackIndex,
        isOverflowingCB);
  }

#ifdef DEBUG
  if (nsBlockFrame::gNoisyReflow) {
    nsIFrame::IndentBy(stdout, nsBlockFrame::gNoiseIndent - 1);
    fmt::println(FMT_STRING("abspos {}: rect {}"), aKidFrame->ListTag().get(),
                 ToString(aKidFrame->GetRect()));
  }
#endif
  // If author asked for `position-visibility: no-overflow` and we overflow
  // `usedCB`, treat as "strongly hidden". Note that for anchored frames this
  // happens in ComputePositionVisibility. But no-overflow also applies to
  // non-anchored frames.
  if (!aAnchorPosResolutionCache) {
    aKidFrame->AddOrRemoveStateBits(
        NS_FRAME_POSITION_VISIBILITY_HIDDEN,
        isOverflowingCB && aKidFrame->StylePosition()->mPositionVisibility &
                               StylePositionVisibility::NO_OVERFLOW);
  }

  if (aOverflowAreas) {
    aOverflowAreas->UnionWith(aKidFrame->GetOverflowAreasRelativeToParent());
  }
}
