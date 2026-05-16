/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "ScrollTimeline.h"

#include "mozilla/AnimationTarget.h"
#include "mozilla/DisplayPortUtils.h"
#include "mozilla/ElementAnimationData.h"
#include "mozilla/PresShell.h"
#include "mozilla/ScrollContainerFrame.h"
#include "mozilla/ServoStyleConsts.h"
#include "mozilla/dom/Animation.h"
#include "mozilla/dom/AnimationTimelinesController.h"
#include "mozilla/dom/Document.h"
#include "mozilla/dom/DocumentInlines.h"
#include "mozilla/dom/ElementInlines.h"
#include "nsIFrame.h"
#include "nsLayoutUtils.h"
#include "nsRefreshDriver.h"

namespace mozilla::dom {

// ---------------------------------
// Methods of ScrollTimeline
// ---------------------------------

NS_IMPL_CYCLE_COLLECTION_CLASS(ScrollTimeline)
NS_IMPL_CYCLE_COLLECTION_UNLINK_BEGIN_INHERITED(ScrollTimeline,
                                                AnimationTimeline)
  tmp->Teardown();
  NS_IMPL_CYCLE_COLLECTION_UNLINK(mDocument)
  NS_IMPL_CYCLE_COLLECTION_UNLINK(mScrollerInfo.ElementForCycleCollection())
NS_IMPL_CYCLE_COLLECTION_UNLINK_END
NS_IMPL_CYCLE_COLLECTION_TRAVERSE_BEGIN_INHERITED(ScrollTimeline,
                                                  AnimationTimeline)
  NS_IMPL_CYCLE_COLLECTION_TRAVERSE(mDocument)
  NS_IMPL_CYCLE_COLLECTION_TRAVERSE(mScrollerInfo.ElementForCycleCollection())
NS_IMPL_CYCLE_COLLECTION_TRAVERSE_END

NS_IMPL_ISUPPORTS_CYCLE_COLLECTION_INHERITED_0(ScrollTimeline,
                                               AnimationTimeline)

ScrollTimeline::ScrollTimeline(Document* aDocument,
                               const ScrollerInfo& aScrollerInfo,
                               StyleScrollAxis aAxis)
    : AnimationTimeline(aDocument->GetParentObject(),
                        aDocument->GetScopeObject()->GetRTPCallerType()),
      mDocument(aDocument),
      mScrollerInfo(aScrollerInfo),
      mAxis(aAxis) {
  MOZ_ASSERT(aDocument);

  mDocument->TimelinesController().AddScrollTimeline(*this);
}

/* static */
std::pair<const Element*, PseudoStyleRequest>
ScrollTimeline::FindNearestScroller(Element* aSubject,
                                    const PseudoStyleRequest& aPseudoRequest) {
  MOZ_ASSERT(aSubject);
  if (!aSubject->GetPrimaryFrame()) {
    return {nullptr, PseudoStyleRequest{}};
  }
  Element* subject = aSubject->GetPseudoElement(aPseudoRequest);
  if (!subject) {
    return {nullptr, PseudoStyleRequest{}};
  }
  Element* curr = subject->GetFlattenedTreeParentElement();
  Element* root = subject->OwnerDoc()->GetDocumentElement();
  while (curr && curr != root) {
    const ComputedStyle* style = Servo_Element_GetMaybeOutOfDateStyle(curr);
    MOZ_ASSERT(style, "The ancestor should be styled.");
    if (style->StyleDisplay()->IsScrollableOverflow()) {
      break;
    }
    curr = curr->GetFlattenedTreeParentElement();
  }
  // If there is no scroll container, we use root.
  if (!curr) {
    return {root, PseudoStyleRequest::NotPseudo()};
  }
  return AnimationUtils::GetElementPseudoPair(curr);
}

/* static */
already_AddRefed<ScrollTimeline> ScrollTimeline::MakeAnonymous(
    Document* aDocument, const NonOwningAnimationTarget& aTarget,
    StyleScrollAxis aAxis, StyleScroller aScroller) {
  MOZ_ASSERT(aTarget);
  auto scroller = ScrollerInfo::Anonymous(aScroller, aTarget);
  // Each use of scroll() corresponds to its own instance of ScrollTimeline in
  // the Web Animations API, even if multiple elements use scroll() to refer to
  // the same scroll container with the same arguments.
  // https://drafts.csswg.org/scroll-animations-1/#scroll-notation
  return MakeAndAddRef<ScrollTimeline>(aDocument, scroller, aAxis);
}

/* static*/
already_AddRefed<ScrollTimeline> ScrollTimeline::MakeNamed(
    Document* aDocument, Element* aReferenceElement,
    const PseudoStyleRequest& aPseudoRequest,
    const StyleScrollTimeline& aStyleTimeline) {
  MOZ_ASSERT(NS_IsMainThread());

  ScrollerInfo scroller =
      ScrollerInfo::Named(aReferenceElement, aPseudoRequest);
  return MakeAndAddRef<ScrollTimeline>(aDocument, std::move(scroller),
                                       aStyleTimeline.GetAxis());
}

Nullable<TimeDuration> ScrollTimeline::GetCurrentTimeAsDuration() const {
  const auto& data = ComputeTimelineData();
  if (!data) {
    return nullptr;
  }

  // FIXME: Scroll offsets on the RTL container is complicated specifically on
  // mobile, see https://github.com/w3c/csswg-drafts/issues/12893. For now, we
  // use the absoluate value to make things simple.
  const double progress =
      static_cast<double>(std::abs(data->mPosition) - data->mStart) /
      static_cast<double>(data->mEnd - data->mStart);
  return TimeDuration::FromMilliseconds(progress *
                                        PROGRESS_TIMELINE_DURATION_MILLISEC);
}

void ScrollTimeline::WillRefresh() {
  UpdateCachedCurrentTime();

  if (!mDocument->GetPresShell()) {
    // If we're not displayed, don't tick animations.
    return;
  }

  if (mAnimationOrder.isEmpty()) {
    return;
  }

  // FIXME: Bug 1737927: Need to check the animation mutation observers for
  // animations with scroll timelines.
  // nsAutoAnimationMutationBatch mb(mDocument);

  TickState dummyState;
  Tick(dummyState);
}

bool ScrollTimeline::SourceMatches(
    const Element* aElement, const PseudoStyleRequest& aPseudoRequest) const {
  if (mScrollerInfo.IsAnonymous()) {
    // Anonymous timelines are considered unique.
    return false;
  }
  const auto source = mScrollerInfo.Source();
  return source.mElement == aElement && source.mPseudoRequest == aPseudoRequest;
}

layers::ScrollDirection ScrollTimeline::State::Axis() const {
  const auto* e = mSource.mElement;
  MOZ_ASSERT(e && e->GetPrimaryFrame());
  const WritingMode wm = e->GetPrimaryFrame()->GetWritingMode();
  return mAxis == StyleScrollAxis::X ||
                 (!wm.IsVertical() && mAxis == StyleScrollAxis::Inline) ||
                 (wm.IsVertical() && mAxis == StyleScrollAxis::Block)
             ? layers::ScrollDirection::eHorizontal
             : layers::ScrollDirection::eVertical;
}

StyleOverflow ScrollTimeline::State::SourceScrollStyle() const {
  DebugOnly<const Element*> e = mSource.mElement;
  MOZ_ASSERT(e && e->GetPrimaryFrame());

  const ScrollContainerFrame* scrollContainerFrame = GetScrollContainerFrame();
  MOZ_ASSERT(scrollContainerFrame);

  const ScrollStyles scrollStyles = scrollContainerFrame->GetScrollStyles();

  return Axis() == layers::ScrollDirection::eHorizontal
             ? scrollStyles.mHorizontal
             : scrollStyles.mVertical;
}

bool ScrollTimeline::State::APZIsActiveForSource() const {
  auto* e = mSource.mElement;
  MOZ_ASSERT(e);
  return gfxPlatform::AsyncPanZoomEnabled() &&
         !nsLayoutUtils::ShouldDisableApzForElement(e) &&
         DisplayPortUtils::HasNonMinimalNonZeroDisplayPort(e);
}

bool ScrollTimeline::State::ScrollingDirectionIsAvailable() const {
  const ScrollContainerFrame* scrollContainerFrame = GetScrollContainerFrame();
  MOZ_ASSERT(scrollContainerFrame);
  return scrollContainerFrame->GetAvailableScrollingDirections().contains(
      Axis());
}

const ScrollContainerFrame* ScrollTimeline::State::GetScrollContainerFrame()
    const {
  auto* e = mSource.mElement;
  if (!e) {
    return nullptr;
  }

  if (mIsRoot) {
    if (const PresShell* presShell = e->OwnerDoc()->GetPresShell()) {
      return presShell->GetRootScrollContainerFrame();
    }
    return nullptr;
  }
  return nsLayoutUtils::FindScrollContainerFrameFor(e);
}

void ScrollTimeline::ReplacePropertiesWith(
    const Element* aReferenceElement, const PseudoStyleRequest& aPseudoRequest,
    const StyleScrollTimeline& aNew) {
  MOZ_ASSERT(!mScrollerInfo.IsAnonymous());
  MOZ_ASSERT(aReferenceElement == mScrollerInfo.Source().mElement &&
             aPseudoRequest == mScrollerInfo.Source().mPseudoRequest);
  mAxis = aNew.GetAxis();

  for (auto* anim = mAnimationOrder.getFirst(); anim;
       anim = static_cast<LinkedListElement<Animation>*>(anim)->getNext()) {
    MOZ_ASSERT(anim->GetTimeline() == this);
    // Set this so we just PostUpdate() for this animation.
    anim->SetTimeline(this);
  }
}

ScrollTimeline::~ScrollTimeline() { Teardown(); }

void ScrollTimeline::UpdateCachedCurrentTime() {
  const auto prevCachedCurrentTime = std::move(mCachedCurrentTime);

  mCachedCurrentTime.reset();

  const auto state = GetState();
  // If no layout box, this timeline is inactive.
  if (const auto* e = state.mSource.mElement; !e || !e->GetPrimaryFrame()) {
    return;
  }

  // if this is not a scroller container, this timeline is inactive.
  const ScrollContainerFrame* scrollContainerFrame =
      state.GetScrollContainerFrame();
  if (!scrollContainerFrame) {
    return;
  }

  const auto orientation = state.Axis();

  // If there is no scrollable overflow, then the ScrollTimeline is inactive.
  // https://drafts.csswg.org/scroll-animations-1/#scrolltimeline-interface
  if (!scrollContainerFrame->GetAvailableScrollingDirections().contains(
          orientation)) {
    return;
  }

  const nsPoint& scrollPosition = scrollContainerFrame->GetScrollPosition();
  const nsRect& scrollRange = scrollContainerFrame->GetScrollRange();

  mCachedCurrentTime.emplace(CurrentTimeData{
      orientation == layers::ScrollDirection::eHorizontal ? scrollPosition.x
                                                          : scrollPosition.y,
      orientation == layers::ScrollDirection::eHorizontal
          ? scrollRange.width
          : scrollRange.height});

  if (!prevCachedCurrentTime || mCachedCurrentTime->mMaxScrollOffset !=
                                    prevCachedCurrentTime->mMaxScrollOffset) {
    TimelineDataDidChange();
  }
}

void ScrollTimeline::TimelineDataDidChange() {
  for (auto* anim = mAnimationOrder.getFirst(); anim;
       anim = static_cast<LinkedListElement<Animation>*>(anim)->getNext()) {
    anim->UpdateNormalizedTimingForTimelineDataChange();
  }
}

std::pair<double, double> ScrollTimeline::IntervalForAttachmentRange(
    const AnimationRange& aStyleRange) const {
  if (!mCachedCurrentTime || aStyleRange.IsNormal()) {
    return {0.0, 1.0};
  }

  auto computeRangeEdgeAsPercentage =
      [&](const StyleGenericAnimationRangeValue<StyleLengthPercentage>&
              aValue) {
        const auto range = mCachedCurrentTime->mMaxScrollOffset;
        return static_cast<double>(aValue.lp.Resolve(range)) /
               static_cast<double>(range);
      };
  // We skip the unsupported timeline range anmes here. The spec doesn't address
  // this but other browsers agree with this behavior now.
  return {computeRangeEdgeAsPercentage(aStyleRange.mStart),
          computeRangeEdgeAsPercentage(aStyleRange.mEnd)};
};

void ScrollTimeline::AutoAlignStartTime() {
  for (Animation* animation : mAnimations) {
    animation->AutoAlignStartTime();
  }
}

Maybe<ScrollTimeline::ComputedTimelineData>
ScrollTimeline::ComputeTimelineData() const {
  return mCachedCurrentTime
             ? Some(ComputedTimelineData{mCachedCurrentTime->mPosition, 0,
                                         mCachedCurrentTime->mMaxScrollOffset})
             : Nothing();
}

static nsRefreshDriver* GetRefreshDriver(Document* aDocument) {
  nsPresContext* presContext = aDocument->GetPresContext();
  if (MOZ_UNLIKELY(!presContext)) {
    return nullptr;
  }
  return presContext->RefreshDriver();
}

void ScrollTimeline::NotifyAnimationUpdated(Animation& aAnimation) {
  AnimationTimeline::NotifyAnimationUpdated(aAnimation);

  if (!mAnimationOrder.isEmpty()) {
    if (auto* rd = GetRefreshDriver(mDocument)) {
      MOZ_ASSERT(isInList(),
                 "We should not register with the refresh driver if we are not"
                 " in the document's list of timelines");
      rd->EnsureAnimationUpdate();
    }
  }
}

void ScrollTimeline::NotifyAnimationContentVisibilityChanged(
    Animation* aAnimation, bool aIsVisible) {
  AnimationTimeline::NotifyAnimationContentVisibilityChanged(aAnimation,
                                                             aIsVisible);
  if (auto* rd = GetRefreshDriver(mDocument)) {
    MOZ_ASSERT(isInList(),
               "We should not register with the refresh driver if we are not"
               " in the document's list of timelines");
    rd->EnsureAnimationUpdate();
  }
}

NonOwningAnimationTarget ScrollTimeline::ScrollerInfo::Source() const {
  switch (mType) {
    case Type::Name:
      return NonOwningAnimationTarget{mTarget};
    case Type::Nearest: {
      auto [element, pseudo] =
          FindNearestScroller(mTarget.mElement, mTarget.mPseudoRequest);
      return {const_cast<Element*>(element), pseudo};
    }
    case Type::Self:
      return NonOwningAnimationTarget{mTarget};
    case Type::Root:
      break;
    default:
      MOZ_ASSERT_UNREACHABLE("Unhandled timeline type");
  }
  // Specifies to use the document viewport as the scroll container.
  //
  // We use the owner doc of the animation target. This may be different
  // from |mDocument| after we implement ScrollTimeline interface for
  // script.
  return {mTarget.mElement->OwnerDoc()->GetDocumentElement(),
          PseudoStyleRequest{}};
}

}  // namespace mozilla::dom
