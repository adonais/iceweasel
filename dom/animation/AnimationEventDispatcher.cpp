/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "mozilla/AnimationEventDispatcher.h"

#include "mozilla/AnimationUtils.h"
#include "mozilla/Assertions.h"
#include "mozilla/ContentEvents.h"
#include "mozilla/EventDispatcher.h"
#include "mozilla/EventListenerManager.h"
#include "mozilla/dom/Animation.h"
#include "mozilla/dom/AnimationEffect.h"
#include "mozilla/dom/AnimationPlaybackEvent.h"
#include "mozilla/dom/CSSAnimation.h"
#include "mozilla/dom/CSSTransition.h"
#include "nsCSSProps.h"
#include "nsGlobalWindowInner.h"
#include "nsPresContext.h"
#include "nsRefreshDriver.h"

using namespace mozilla;

namespace geckoprofiler::markers {

struct CSSAnimationMarker : public BaseMarkerType<CSSAnimationMarker> {
  static constexpr const char* Name = "CSSAnimation";
  using MS = MarkerSchema;
  static constexpr MS::Location Locations[] = {
      MS::Location::MarkerChart,
      MS::Location::MarkerTable,
  };
  static constexpr MS::PayloadField PayloadFields[] = {
      {"Name", MS::InputType::CString},
      {"Target", MS::InputType::CString},
      {"properties", MS::InputType::CString, "Animated Properties"},
      {"oncompositor", MS::InputType::CString, "Can Run on Compositor"},
  };
  static constexpr const char* ChartLabel = "{marker.data.Name}";
  static constexpr const char* TableLabel =
      "{marker.data.Name}: {marker.data.properties}";
  // The name tells an animation apart from one of its iterations.
  static constexpr bool ETWStoreName = true;
};

struct CSSTransitionMarker : public BaseMarkerType<CSSTransitionMarker> {
  static constexpr const char* Name = "CSSTransition";
  using MS = MarkerSchema;
  static constexpr MS::Location Locations[] = {
      MS::Location::MarkerChart,
      MS::Location::MarkerTable,
  };
  static constexpr MS::PayloadField PayloadFields[] = {
      {"Target", MS::InputType::CString},
      {"property", MS::InputType::CString, "Animated Property"},
      {"oncompositor", MS::InputType::Boolean, "Can Run on Compositor"},
      {"Canceled", MS::InputType::Boolean},
  };
  static constexpr const char* ChartLabel = "{marker.data.property}";
  static constexpr const char* TableLabel = "{marker.data.property}";
  static void StreamJSONMarkerData(baseprofiler::SpliceableJSONWriter& aWriter,
                                   const ProfilerString8View& aTarget,
                                   const ProfilerString8View& aProperty,
                                   bool aOnCompositor, bool aCanceled) {
    StreamJSONMarkerDataImpl(aWriter, aTarget, aProperty, aOnCompositor);
    if (aCanceled) {
      aWriter.BoolProperty("Canceled", aCanceled);
    }
  }
};

}  // namespace geckoprofiler::markers

namespace mozilla {

NS_IMPL_CYCLE_COLLECTION_CLASS(AnimationEventDispatcher)
NS_IMPL_CYCLE_COLLECTION_UNLINK_BEGIN(AnimationEventDispatcher)
  tmp->ClearEventQueue();
NS_IMPL_CYCLE_COLLECTION_UNLINK_END
NS_IMPL_CYCLE_COLLECTION_TRAVERSE_BEGIN(AnimationEventDispatcher)
  for (auto& info : tmp->mPendingEvents) {
    if (OwningAnimationTarget* target = info.GetOwningAnimationTarget()) {
      ImplCycleCollectionTraverse(
          cb, target->mElement,
          "mozilla::AnimationEventDispatcher.mPendingEvents.mTarget");
    }
    ImplCycleCollectionTraverse(
        cb, info.mAnimation,
        "mozilla::AnimationEventDispatcher.mPendingEvents.mAnimation");
  }
NS_IMPL_CYCLE_COLLECTION_TRAVERSE_END

void AnimationEventDispatcher::Disconnect() {
  ClearEventQueue();
  mPresContext = nullptr;
}

void AnimationEventDispatcher::QueueEvent(AnimationEventInfo&& aEvent) {
  const bool wasEmpty = mPendingEvents.IsEmpty();
  mPendingEvents.AppendElement(std::move(aEvent));
  mIsSorted = wasEmpty;
  if (wasEmpty) {
    ScheduleDispatch();
  }
}

void AnimationEventDispatcher::QueueEvents(
    nsTArray<AnimationEventInfo>&& aEvents) {
  if (aEvents.IsEmpty()) {
    return;
  }
  const bool wasEmpty = mPendingEvents.IsEmpty();
  mPendingEvents.AppendElements(std::move(aEvents));
  mIsSorted = false;
  if (wasEmpty) {
    ScheduleDispatch();
  }
}

void AnimationEventDispatcher::ScheduleDispatch() {
  MOZ_ASSERT(mPresContext, "The pres context should be valid");
  mPresContext->RefreshDriver()->ScheduleRenderingPhase(
      RenderingPhase::UpdateAnimationsAndSendEvents);
}

void AnimationEventInfo::MaybeAddMarker() const {
  // The scheduled event timestamp can be null (for example, for a pending
  // animation with an unresolved start time, a paused animation, or an
  // animation driven by a non-wallclock timeline). Without it we can't compute
  // a meaningful marker interval, so skip emitting the marker.
  if (mScheduledEventTimeStamp.IsNull()) {
    return;
  }
  if (mData.is<CssAnimationData>()) {
    const auto& data = mData.as<CssAnimationData>();
    const EventMessage message = data.mMessage;
    if (message != eAnimationCancel && message != eAnimationEnd &&
        message != eAnimationIteration) {
      return;
    }
    nsAutoCString name;
    data.mAnimationName->ToUTF8String(name);
    const TimeStamp startTime = [&] {
      if (message == eAnimationIteration) {
        if (auto* effect = mAnimation->GetEffect()) {
          return mScheduledEventTimeStamp -
                 TimeDuration(effect->GetComputedTiming().mDuration);
        }
      }
      return mScheduledEventTimeStamp -
             TimeDuration::FromSeconds(data.mElapsedTime);
    }();

    AnimatedPropertyIDSet propertySet;
    nsAutoString target;
    if (dom::AnimationEffect* effect = mAnimation->GetEffect()) {
      if (dom::KeyframeEffect* keyFrameEffect = effect->AsKeyframeEffect()) {
        keyFrameEffect->GetTarget()->Describe(
            target, dom::Element::DescriptionKind::IdAndClass);
        for (const AnimationProperty& property : keyFrameEffect->Properties()) {
          propertySet.AddProperty(property.mProperty);
        }
      }
    }
    nsAutoCString properties;
    nsAutoCString oncompositor;
    for (const CSSPropertyId& property : propertySet) {
      if (!properties.IsEmpty()) {
        properties.AppendLiteral(", ");
        oncompositor.AppendLiteral(", ");
      }
      nsAutoCString prop;
      property.ToString(prop);
      properties.Append(prop);
      oncompositor.Append(
          !property.IsCustom() &&
                  nsCSSProps::PropHasFlags(property.mId,
                                           CSSPropFlags::CanAnimateOnCompositor)
              ? "true"
              : "false");
    }
    PROFILER_MARKER(
        message == eAnimationIteration
            ? ProfilerString8View("CSS animation iteration")
            : ProfilerString8View("CSS animation"),
        DOM,
        MarkerOptions(
            MarkerTiming::Interval(startTime, mScheduledEventTimeStamp),
            mAnimation->GetOwnerWindow()
                ? MarkerInnerWindowId(mAnimation->GetOwnerWindow()->WindowID())
                : MarkerInnerWindowId::NoId()),
        CSSAnimationMarker, name, NS_ConvertUTF16toUTF8(target), properties,
        oncompositor);
    return;
  }

  if (!mData.is<CssTransitionData>()) {
    return;
  }

  const auto& data = mData.as<CssTransitionData>();
  const EventMessage message = data.mMessage;
  if (message != eTransitionEnd && message != eTransitionCancel) {
    return;
  }

  nsAutoString target;
  if (dom::AnimationEffect* effect = mAnimation->GetEffect()) {
    if (dom::KeyframeEffect* keyFrameEffect = effect->AsKeyframeEffect()) {
      keyFrameEffect->GetTarget()->Describe(
          target, dom::Element::DescriptionKind::IdAndClass);
    }
  }
  nsAutoCString property;
  data.mProperty.ToString(property);

  // FIXME: This doesn't _really_ reflect whether the animation is actually run
  // in the compositor. The effect has that information and we should use it
  // probably.
  const bool onCompositor =
      !data.mProperty.IsCustom() &&
      nsCSSProps::PropHasFlags(data.mProperty.mId,
                               CSSPropFlags::CanAnimateOnCompositor);
  PROFILER_MARKER(
      "CSS transition", DOM,
      MarkerOptions(
          MarkerTiming::Interval(
              mScheduledEventTimeStamp -
                  TimeDuration::FromSeconds(data.mElapsedTime),
              mScheduledEventTimeStamp),
          mAnimation->GetOwnerWindow()
              ? MarkerInnerWindowId(mAnimation->GetOwnerWindow()->WindowID())
              : MarkerInnerWindowId::NoId()),
      CSSTransitionMarker, NS_ConvertUTF16toUTF8(target), property,
      onCompositor, message == eTransitionCancel);
}

void AnimationEventInfo::Dispatch(nsPresContext* aPresContext) {
  if (mData.is<WebAnimationData>()) {
    const auto& data = mData.as<WebAnimationData>();
    EventListenerManager* elm = mAnimation->GetExistingListenerManager();
    if (!elm || !elm->HasListenersFor(data.mOnEvent)) {
      return;
    }

    dom::AnimationPlaybackEventInit init;
    const bool progressBased = mAnimation->AcceptsPercentageBasedTime();
    nsIGlobalObject* global = mAnimation->GetParentObject();
    if (!data.mCurrentTime.IsNull()) {
      AnimationUtils::DoubleToCSSNumberish(data.mCurrentTime.Value(),
                                           progressBased, global,
                                           init.mCurrentTime.SetValue());
    }
    if (!data.mTimelineTime.IsNull()) {
      AnimationUtils::DoubleToCSSNumberish(data.mTimelineTime.Value(),
                                           progressBased, global,
                                           init.mTimelineTime.SetValue());
    }
    MOZ_ASSERT(nsDependentAtomString(data.mOnEvent).Find(u"on"_ns) == 0,
               "mOnEvent atom should start with 'on'!");
    RefPtr<dom::AnimationPlaybackEvent> event =
        dom::AnimationPlaybackEvent::Constructor(
            mAnimation, Substring(nsDependentAtomString(data.mOnEvent), 2),
            init);
    event->SetTrusted(true);
    event->WidgetEventPtr()->AssignEventTime(
        WidgetEventTime(data.mEventEnqueueTimeStamp));
    RefPtr target = mAnimation;
    EventDispatcher::DispatchDOMEvent(target, nullptr /* WidgetEvent */, event,
                                      aPresContext,
                                      nullptr /* nsEventStatus */);
    return;
  }

  if (mData.is<CssTransitionData>()) {
    const auto& data = mData.as<CssTransitionData>();
    nsPIDOMWindowInner* win =
        data.mTarget.mElement->OwnerDoc()->GetInnerWindow();
    if (win && !win->HasTransitionEventListeners()) {
      MOZ_ASSERT(data.mMessage == eTransitionStart ||
                 data.mMessage == eTransitionRun ||
                 data.mMessage == eTransitionEnd ||
                 data.mMessage == eTransitionCancel);
      return;
    }

    InternalTransitionEvent event(true, data.mMessage);
    data.mProperty.ToString(event.mPropertyName);
    event.mElapsedTime = data.mElapsedTime;
    event.mAnimation = mAnimation->AsCSSTransition();
    data.mTarget.mPseudoRequest.ToString(event.mPseudoElement);
    event.AssignEventTime(WidgetEventTime(data.mEventEnqueueTimeStamp));
    RefPtr target = data.mTarget.mElement;
    EventDispatcher::Dispatch(target, aPresContext, &event);
    return;
  }

  const auto& data = mData.as<CssAnimationData>();
  InternalAnimationEvent event(true, data.mMessage);
  data.mAnimationName->ToString(event.mAnimationName);
  event.mElapsedTime = data.mElapsedTime;
  event.mAnimation = mAnimation->AsCSSAnimation();
  data.mTarget.mPseudoRequest.ToString(event.mPseudoElement);
  event.AssignEventTime(WidgetEventTime(data.mEventEnqueueTimeStamp));
  RefPtr target = data.mTarget.mElement;
  EventDispatcher::Dispatch(target, aPresContext, &event);
}

}  // namespace mozilla
