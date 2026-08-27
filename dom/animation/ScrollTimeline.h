/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_dom_ScrollTimeline_h
#define mozilla_dom_ScrollTimeline_h

#include "mozilla/AnimationTarget.h"
#include "mozilla/LinkedList.h"
#include "mozilla/WritingModes.h"
#include "mozilla/dom/AnimationTimeline.h"

namespace mozilla {
enum class StyleScrollAxis : uint8_t;
enum class StyleScroller : uint8_t;
enum class StyleOverflow : uint8_t;
}  // namespace mozilla

namespace mozilla::layers {
enum class ScrollDirection : uint8_t;
}  // namespace mozilla::layers

namespace mozilla::dom {
enum class ScrollAxis : uint8_t;
struct ScrollTimelineOptions;
}  // namespace mozilla::dom

#define PROGRESS_TIMELINE_DURATION_MILLISEC 100000

namespace mozilla {
class ScrollContainerFrame;
class ElementAnimationData;
namespace dom {
class Document;
class Element;
struct ScopedTimelineName;

/**
 * Implementation notes
 * --------------------
 *
 * ScrollTimelines do not observe refreshes the way DocumentTimelines do.
 * This is because the refresh driver keeps ticking while it has registered
 * refresh observers. For a DocumentTimeline, it's appropriate to keep the
 * refresh driver ticking as long as there are active animations, since the
 * animations need to be sampled on every frame. Scroll-linked animations,
 * however, only need to be sampled when scrolling has occurred, so keeping
 * the refresh driver ticking is wasteful.
 *
 * As a result, we schedule an animation restyle when
 * 1) there are any scroll offsets updated (from APZ or script), via
 *    ScrollContainerFrame, or
 * 2) there are any possible scroll range updated during the frame reflow.
 *
 * -------------
 * | Animation |
 * -------------
 *   ^
 *   | Call Animation::Tick() if there are any scroll updates.
 *   |
 * ------------------
 * | ScrollTimeline |
 * ------------------
 *   ^
 *   | Try schedule the scroll-driven animations, if there are any scroll
 *   | offsets changed or the scroll range changed [1].
 *   |
 * ------------------------
 * | ScrollContainerFrame |
 * ------------------------
 *
 * [1] ScrollContainerFrame uses its associated dom::Element to lookup the
 *     ScrollTimelineSet, and iterates the set to schedule the animations
 *     linked to the ScrollTimelines.
 */
class ScrollTimeline : public AnimationTimeline,
                       public LinkedListElement<ScrollTimeline> {
  template <typename T, typename... Args>
  friend already_AddRefed<T> mozilla::MakeAndAddRef(Args&&... aArgs);

 protected:
  struct ScrollerInfo {
    enum class Type : uint8_t {
      /// The scroller was provided as a DOM Element (see ScrollTimeline ctor)
      Provided,
      /// The scroller is the root scroller of the document
      Root,
      /// The scroller is the animation target's nearest ancestor scroller
      Nearest,
      /// The scroller is specified by name (scroll-timeline-name)
      Name,
      /// The scroller is the element being animated itself
      Self,
    };
    Type mType = Type::Root;

    static Type TypeFromStyleScroller(StyleScroller aType) {
      switch (aType) {
        case StyleScroller::Root:
          break;
        case StyleScroller::Nearest:
          return Type::Nearest;
        case StyleScroller::SelfElement:
          return Type::Self;
        default:
          MOZ_ASSERT_UNREACHABLE("Unhandled scroller type");
          break;
      }

      return Type::Root;
    }

   private:
    // This is the target (that is being animade) for:
    //   - Type::Root
    //   - Type::Nearest
    //   - Type::Self
    // It is the source (of the scroll progress) for:
    //   - Type::Provided
    //   - Type::Named
    // (In which case the scroll source is resolved lazily in Source().)
    OwningAnimationTarget mSourceOrTarget;
    ScrollerInfo(Type aType, Element* aElement,
                 const PseudoStyleRequest& aPseudoRequest)
        : mType{aType}, mSourceOrTarget{aElement, aPseudoRequest} {}

   public:
    ScrollerInfo() = default;

    bool IsAnonymous() const { return mType != Type::Name; }

    static ScrollerInfo Anonymous(Type aType, Element* aElement,
                                  const PseudoStyleRequest& aPseudoRequest) {
      return {aType, aElement, aPseudoRequest};
    }

    static ScrollerInfo Anonymous(StyleScroller aType,
                                  const NonOwningAnimationTarget& aTarget) {
      const auto type = TypeFromStyleScroller(aType);
      // Store the animation target - we will look up the source at evaluation
      // time.
      return {type, aTarget.mElement, aTarget.mPseudoRequest};
    }

    static ScrollerInfo Named(Element* aElement,
                              const PseudoStyleRequest& aPseudoRequest) {
      // This is assumed to be the source (pseudo) element.
      return {Type::Name, aElement, aPseudoRequest};
    }

    NonOwningAnimationTarget Source() const;
    RefPtr<Element>& ElementForCycleCollection() {
      return mSourceOrTarget.mElement;
    }
  };

 public:
  // A snapshot of the resolved scroll state of this timeline. The
  // frame-derived values are captured when the snapshot is built (while the
  // current time is sampled in UpdateCachedCurrentTime), rather than queried
  // lazily.
  class StateSnapshot {
    friend class ScrollTimeline;
    friend class ViewTimeline;

   public:
    // The default snapshot represents an inactive timeline.
    StateSnapshot() = default;

    // The physical scroll direction this timeline is linked to.
    layers::ScrollDirection Axis() const { return mPhysicalAxis; }
    StyleOverflow SourceScrollStyle() const { return mSourceScrollStyle; }
    bool APZIsActiveForSource() const { return mAPZIsActiveForSource; }
    // May return null if script created us.
    Element* SourceElement() const { return mSource.mElement; }
    bool ScrollingDirectionIsAvailable() const {
      return mScrollingDirectionAvailable;
    }
    // If the source of a ScrollTimeline is an element whose principal box does
    // not exist or is not a scroll container, then its phase is the timeline
    // inactive phase. It is otherwise in the active phase. This returns true if
    // the timeline is in active phase.
    // https://drafts.csswg.org/web-animations-1/#inactive-timeline
    bool IsActive() const { return mActive; }
    // Resolved live from the source element. Only used while building the
    // snapshot and while sampling the current time.
    const ScrollContainerFrame* GetScrollContainerFrame() const;

    RefPtr<Element>& SourceElementForCycleCollection() {
      return mSource.mElement;
    }

   private:
    StateSnapshot(const NonOwningAnimationTarget& aResolvedSource,
                  StyleScrollAxis aAxis, bool aIsRoot);

    layers::ScrollDirection ComputePhysicalAxis() const;

    OwningAnimationTarget mSource;
    StyleScrollAxis mAxis{};
    bool mIsRoot = false;

    // Values captured from the scroll container frame at construction. Only
    // meaningful when mActive is true.
    bool mActive = false;
    layers::ScrollDirection mPhysicalAxis{};
    bool mScrollingDirectionAvailable = false;
    StyleOverflow mSourceScrollStyle{};
    bool mAPZIsActiveForSource = false;
  };

  ScrollTimeline() = delete;

  static already_AddRefed<ScrollTimeline> MakeAnonymous(
      Document* aDocument, const NonOwningAnimationTarget& aTarget,
      StyleScrollAxis aAxis, StyleScroller aScroller);

  // Note: |aReferfenceElement| is used as the scroller which specifies
  // scroll-timeline-name property.
  static already_AddRefed<ScrollTimeline> MakeNamed(
      Document* aDocument, Element* aReferenceElement,
      const PseudoStyleRequest& aPseudoRequest, StyleScrollAxis aAxis);

  NS_DECL_ISUPPORTS_INHERITED
  NS_DECL_CYCLE_COLLECTION_CLASS_INHERITED(ScrollTimeline, AnimationTimeline)

  JSObject* WrapObject(JSContext* aCx,
                       JS::Handle<JSObject*> aGivenProto) override;

  // ScrollTimeline methods.
  MOZ_CAN_RUN_SCRIPT_BOUNDARY
  static already_AddRefed<ScrollTimeline> Constructor(
      const GlobalObject& aGlobal, const ScrollTimelineOptions& aOptions,
      ErrorResult& aRv);
  Element* GetSource() const;
  dom::ScrollAxis GetScrollAxis() const;

  // Returns the snapshot captured at the last UpdateCachedCurrentTime(). If we
  // haven't sampled yet, returns an inactive snapshot rather than recomputing
  // live.
  StateSnapshot GetSnapshot() const;

  // AnimationTimeline methods.
  void GetCurrentTime(Nullable<OwningCSSNumberish>& aRetVal) const override;
  Nullable<TimeDuration> GetCurrentTimeAsDuration() const override;
  bool TracksWallclockTime() const override { return false; }
  Nullable<TimeDuration> ToTimelineTime(
      const TimeStamp& aTimeStamp) const override {
    // It's unclear to us what should we do for this function now, so return
    // nullptr.
    return nullptr;
  }
  TimeStamp ToTimeStamp(const TimeDuration& aTimelineTime) const override {
    // It's unclear to us what should we do for this function now, so return
    // zero time.
    return {};
  }
  Document* GetDocument() const override { return mDocument; }
  bool IsMonotonicallyIncreasing() const override { return false; }
  bool IsScrollTimeline() const override { return true; }
  const ScrollTimeline* AsScrollTimeline() const override { return this; }
  bool IsViewTimeline() const override { return false; }

  Nullable<TimeDuration> TimelineDuration(
      const AnimationRange& aRange) const override {
    // We are using this magic number for progress-based timeline duration
    // because we don't support percentage for duration.
    const auto interval = IntervalForAttachmentRange(aRange);
    // FIXME: Bug 2006263. This function is used for computing the normalized
    // timing for each animation effect. Per spec, we should just return 100%.
    // However, we use TimeDuration to represent the duration now, so if the
    // interval is negative or zero when applying the animation attachment
    // range, we return 0 as the tentative solution.
    return TimeDuration::FromMilliseconds(
        (interval.second > interval.first ? interval.second - interval.first
                                          : 0.0) *
        PROGRESS_TIMELINE_DURATION_MILLISEC);
  }

  void WillRefresh();

  bool UpdateIfStale();

  // May return null if script created us.
  Element* SourceElement() const { return mScrollerInfo.Source().mElement; }

  virtual NonOwningAnimationTarget TimelineTarget() const {
    MOZ_ASSERT(!mScrollerInfo.IsAnonymous());
    return mScrollerInfo.Source();
  }

  bool SourceMatches(const Element* aElement,
                     const PseudoStyleRequest& aPseudoRequest) const;

  void ReplacePropertiesWith(const Element* aReferenceElement,
                             const PseudoStyleRequest& aPseudoRequest,
                             const dom::ScopedTimelineName& aName,
                             StyleScrollAxis aAxis);

  void NotifyAnimationUpdated(Animation& aAnimation) override;

  void NotifyAnimationContentVisibilityChanged(Animation* aAnimation,
                                               bool aIsVisible) override;

  // Updates mCachedCurrentTime. Returns true if the cached value changed.
  virtual bool UpdateCachedCurrentTime();

  virtual std::pair<double, double> IntervalForAttachmentRange(
      const AnimationRange& aStyleRange) const;

  void AutoAlignStartTime();

  bool IsReusableAnonymousTimeline(const StyleScrollFunction& aScroll) const;

 protected:
  virtual ~ScrollTimeline();
  ScrollTimeline(Document* aDocument, const ScrollerInfo& aScrollerInfo,
                 StyleScrollAxis aAxis);

  void TimelineDataDidChange();

  // Builds a fresh snapshot of the scroll state from the current layout.
  StateSnapshot ComputeSnapshot() const;

  // The timeline data used to represent the full range of the timeline.
  struct ComputedTimelineData {
    nscoord mPosition = 0;
    nscoord mStart = 0;
    nscoord mEnd = 0;
  };
  virtual Maybe<ComputedTimelineData> ComputeTimelineData() const;

  // Note: This function is required to be idempotent, as it can be called from
  // both cycleCollection::Unlink() and ~ScrollTimeline(). When modifying this
  // function, be sure to preserve this property.
  void Teardown() {
    if (isInList()) {
      remove();
    }
  }

  static std::pair<const Element*, PseudoStyleRequest> FindNearestScroller(
      Element* aSubject, const PseudoStyleRequest& aPseudoRequest);

  RefPtr<Document> mDocument;

  ScrollerInfo mScrollerInfo;
  StyleScrollAxis mAxis;

  // The scroll state captured when the current time was last sampled. Kept in
  // sync with mCachedCurrentTime by the UpdateCachedCurrentTime() overrides,
  // and returned by GetSnapshot().
  Maybe<StateSnapshot> mCachedStateSnapshot;

  struct CurrentTimeData {
    // The position of the scroller, and this may be negative for RTL or
    // sideways, e.g. the range of its value could be [0, -range]. The user
    // needs to take care of that.
    nscoord mPosition = 0;
    nscoord mMaxScrollOffset = 0;
    bool operator==(const CurrentTimeData& aOther) const {
      return mPosition == aOther.mPosition &&
             mMaxScrollOffset == aOther.mMaxScrollOffset;
    }
  };

 private:
  Maybe<CurrentTimeData> mCachedCurrentTime;
};

// A name-referenced timeline that is referring to a not-yet-existing timeline.
// Was formerly considered inactive timeline, but is now a separate concept:
// See https://github.com/w3c/csswg-drafts/issues/9256#issuecomment-4556112966.
// Feels that it should be derived from `AnimationTimeline`, but that adds a lot
// of special handling, and only finite (i.e. Scroll and view) timelines are
// referred to by name. Also, derived from scroll timeline in WebKit & Blink.
// Note that inactive timelines can be constructed through JS, like `new
// ScrollTimeline({source: null})`, but that doesn't refer to the timeline
// by name.
class UnresolvedTimeline final : public ScrollTimeline {
 public:
  Nullable<TimeDuration> GetCurrentTimeAsDuration() const override {
    // Inactive timeline, by definition.
    return {};
  }

  TimeStamp ToTimeStamp(const TimeDuration& aTimelineTime) const override {
    return {};
  }
  bool IsUnresolvedTimeline() const override { return true; }

  JSObject* WrapObject(JSContext*, JS::Handle<JSObject*>) override {
    // OM should return null for timeline, so this should be ok.
    return nullptr;
  }

  Nullable<TimeDuration> TimelineDuration(
      const AnimationRange&) const override {
    return TimeDuration::FromMilliseconds(PROGRESS_TIMELINE_DURATION_MILLISEC);
  }

  NS_DECL_ISUPPORTS_INHERITED
  NS_DECL_CYCLE_COLLECTION_CLASS_INHERITED(UnresolvedTimeline, ScrollTimeline)

 private:
  explicit UnresolvedTimeline(Document* aDocument);
  ~UnresolvedTimeline() override = default;

  // ctor is private because only dynamic allocation is permitted, so this is
  // fine.
  template <typename T, typename... Args>
  friend already_AddRefed<T> mozilla::MakeAndAddRef(Args&&... aArgs);
};

}  // namespace dom
}  // namespace mozilla

#endif  // mozilla_dom_ScrollTimeline_h
