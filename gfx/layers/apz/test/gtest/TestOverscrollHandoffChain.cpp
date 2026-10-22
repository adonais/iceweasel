/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "APZCTreeManagerTester.h"
#include "APZTestCommon.h"
#include "InputUtils.h"
#include "apz/src/OverscrollHandoffState.h"
#include "gtest/gtest.h"

namespace {

// Define test input. //

enum class Scrollability : uint8_t {
  Room,     // has a scroll range, and room left in the gesture's direction
  AtEnd,    // has a scroll range, but no room left in the gesture's direction
  NoRange,  // no scroll range at all
};

constexpr Scrollability kRoom = Scrollability::Room;
constexpr Scrollability kAtEnd = Scrollability::AtEnd;
constexpr Scrollability kNoRange = Scrollability::NoRange;

struct FrameState {
  StyleOverscrollBehavior mBehavior;
  Scrollability mScrollability;
};

constexpr FrameState ObAuto(Scrollability aScrollability) {
  return {StyleOverscrollBehavior::Auto, aScrollability};
}
constexpr FrameState ObContain(Scrollability aScrollability) {
  return {StyleOverscrollBehavior::Contain, aScrollability};
}
constexpr FrameState ObChain(Scrollability aScrollability) {
  return {StyleOverscrollBehavior::Chain, aScrollability};
}
constexpr FrameState ObNone(Scrollability aScrollability) {
  return {StyleOverscrollBehavior::None, aScrollability};
}
// The state given to frames the scan never reaches.
constexpr FrameState kUnreached = ObAuto(kNoRange);

// Define test output. //

enum class ExpectedTarget : uint8_t { Inner, Middle, Root, NoApzc };

struct Outcome {
  ExpectedTarget mTarget;
  ScrollDirections mDirections;
};

constexpr Outcome kInner{ExpectedTarget::Inner, EitherScrollDirection};
constexpr Outcome kMiddle{ExpectedTarget::Middle, EitherScrollDirection};
constexpr Outcome kRoot{ExpectedTarget::Root, EitherScrollDirection};
constexpr Outcome kNone{ExpectedTarget::NoApzc, EitherScrollDirection};

// Each test case has FrameState as input and Outcome as output.
struct TestCase {
  FrameState mInner;
  FrameState mMiddle;
  FrameState mRoot;
  // FindScrollTarget() take a flag, |IncludeOverscroll|. Each case checks
  // the effect of that flag.
  Outcome mWithOverscroll;
  Outcome mWithoutOverscroll;
};

// FindScrollTarget() has three outcomes, referred to throughout this file
// as (a), (b) and (c):
//   (a) the scroll pass (inner to outer) returns a frame it can scroll;
//   (b) the overscroll pass (outer to inner) returns a frame that can only
//       overscroll;
//   (c) neither pass finds a frame, so nullptr is returned.
//
// The reported allowed scroll directions are the directions handoff still
// allowed on entry to the returned frame.
//
// A frame's state is only observable if the scan actually reaches it, which
// collapses the 12^3 combinations of (overscroll-behavior, scrollability)
// states into the rows below:
// clang-format off
static const TestCase kTestCases[] = {
    ////// The search ends at the innermost frame //////

    // The innermost frame has room, so it is returned by exit (a) and nothing
    // else about the chain matters.
    {ObAuto(kRoom),       kUnreached,          kUnreached,
     kInner,         kInner},
    {ObContain(kRoom),    kUnreached,          kUnreached,
     kInner,         kInner},
    {ObChain(kRoom),      kUnreached,          kUnreached,
     kInner,         kInner},
    {ObNone(kRoom),       kUnreached,          kUnreached,
     kInner,         kInner},

    // The innermost frame cannot scroll and blocks handoff, so the scan stops
    // there. The possibility of overscroll is checked.
    {ObContain(kAtEnd),   kUnreached,          kUnreached,
     kInner,       kNone},
    {ObNone(kAtEnd),      kUnreached,          kUnreached,
     kNone,        kNone},
    {ObContain(kNoRange), kUnreached,          kUnreached,
     kNone,        kNone},
    {ObNone(kNoRange),    kUnreached,          kUnreached,
     kNone,        kNone},

    ////// The search ends at the middle frame //////

    // Handoff reaches the middle frame, which then terminates the scroll pass
    // itself. The result now depends on the overscroll pass, which prefers the
    // outermost candidate: the middle frame if it can overscroll, otherwise
    // the innermost frame.
    {ObAuto(kAtEnd),      ObAuto(kRoom),       kUnreached,
     kMiddle,        kMiddle},
    {ObAuto(kAtEnd),      ObContain(kRoom),    kUnreached,
     kMiddle,        kMiddle},
    {ObAuto(kAtEnd),      ObChain(kRoom),      kUnreached,
     kMiddle,        kMiddle},
    {ObAuto(kAtEnd),      ObNone(kRoom),       kUnreached,
     kMiddle,        kMiddle},
    {ObAuto(kAtEnd),      ObContain(kAtEnd),   kUnreached,
     kMiddle,        kNone},
    {ObAuto(kAtEnd),      ObNone(kAtEnd),      kUnreached,
     kInner,         kNone},
    {ObAuto(kAtEnd),      ObContain(kNoRange), kUnreached,
     kInner,         kNone},
    {ObAuto(kAtEnd),      ObNone(kNoRange),    kUnreached,
     kInner,         kNone},

    // The cases where the innermost frames has no range.
    // Note that kInner is no longer returned this time, because it can't scroll.
    {ObAuto(kNoRange),    ObAuto(kRoom),       kUnreached,
     kMiddle,        kMiddle},
    {ObAuto(kNoRange),    ObContain(kRoom),    kUnreached,
     kMiddle,        kMiddle},
    {ObAuto(kNoRange),    ObChain(kRoom),      kUnreached,
     kMiddle,        kMiddle},
    {ObAuto(kNoRange),    ObNone(kRoom),       kUnreached,
     kMiddle,        kMiddle},
    {ObAuto(kNoRange),    ObContain(kAtEnd),   kUnreached,
     kMiddle,        kNone},
    {ObAuto(kNoRange),    ObNone(kAtEnd),      kUnreached,
     kNone,          kNone},
    {ObAuto(kNoRange),    ObContain(kNoRange), kUnreached,
     kNone,          kNone},
    {ObAuto(kNoRange),    ObNone(kNoRange),    kUnreached,
     kNone,          kNone},

    // Check `chain` on the innermost frame permits handoff just like `auto`.
    {ObChain(kAtEnd),     ObAuto(kRoom),       kUnreached,
     kMiddle,        kMiddle},
    {ObChain(kNoRange),   ObAuto(kRoom),       kUnreached,
     kMiddle,        kMiddle},

    ////// The search reaches to the root frame //////

    // Handoff reaches the root content frame. Pick { .mInner = ObAuto(kAtEnd),
    // .mMiddle = ObAuto(kAtEnd) } as a combination to realize that. Check all the 12
    // patterns of the root content frame.
    {ObAuto(kAtEnd),      ObAuto(kAtEnd),      ObAuto(kRoom),
     kRoot,          kRoot},
    {ObAuto(kAtEnd),      ObAuto(kAtEnd),      ObContain(kRoom),
     kRoot,          kRoot},
    {ObAuto(kAtEnd),      ObAuto(kAtEnd),      ObChain(kRoom),
     kRoot,          kRoot},
    {ObAuto(kAtEnd),      ObAuto(kAtEnd),      ObNone(kRoom),
     kRoot,          kRoot},
    {ObAuto(kAtEnd),      ObAuto(kAtEnd),      ObAuto(kAtEnd),
     kRoot,          kNone},
    {ObAuto(kAtEnd),      ObAuto(kAtEnd),      ObContain(kAtEnd),
     kRoot,          kNone},
    {ObAuto(kAtEnd),      ObAuto(kAtEnd),      ObChain(kAtEnd),
     kMiddle,        kNone},
    {ObAuto(kAtEnd),      ObAuto(kAtEnd),      ObNone(kAtEnd),
     kMiddle,        kNone},
    {ObAuto(kAtEnd),      ObAuto(kAtEnd),      ObAuto(kNoRange),
     kMiddle,        kNone},
    {ObAuto(kAtEnd),      ObAuto(kAtEnd),      ObContain(kNoRange),
     kMiddle,        kNone},
    {ObAuto(kAtEnd),      ObAuto(kAtEnd),      ObChain(kNoRange),
     kMiddle,        kNone},
    {ObAuto(kAtEnd),      ObAuto(kAtEnd),      ObNone(kNoRange),
     kMiddle,        kNone},
};
// clang-format on

static const char* Describe(StyleOverscrollBehavior aBehavior) {
  switch (aBehavior) {
    case StyleOverscrollBehavior::Auto:
      return "Auto";
    case StyleOverscrollBehavior::Contain:
      return "Contain";
    case StyleOverscrollBehavior::Chain:
      return "Chain";
    case StyleOverscrollBehavior::None:
      return "None";
  }
  return "?";
}

static const char* Describe(Scrollability aScrollability) {
  switch (aScrollability) {
    case Scrollability::Room:
      return "Room";
    case Scrollability::AtEnd:
      return "AtEnd";
    case Scrollability::NoRange:
      return "NoRange";
  }
  return "?";
}

static std::string Describe(const FrameState& aState) {
  return std::string(Describe(aState.mBehavior)) + "_" +
         Describe(aState.mScrollability);
}

static std::string Describe(ScrollDirections aDirections) {
  if (aDirections.isEmpty()) {
    return "{}";
  }
  std::string result = "{";
  if (aDirections.contains(ScrollDirection::eHorizontal)) {
    result += "horizontal";
  }
  if (aDirections.contains(ScrollDirection::eVertical)) {
    if (result.length() > 1) {
      result += ",";
    }
    result += "vertical";
  }
  return result + "}";
}

class APZFindScrollTargetTester : public APZCTreeManagerTester {
 protected:
  UniquePtr<ScopedLayerTreeRegistration> registration;

  static constexpr int kFrameSize = 100;
  static constexpr int kScrollRange = 100;

  TestAsyncPanZoomController* mInner = nullptr;
  TestAsyncPanZoomController* mMiddle = nullptr;
  TestAsyncPanZoomController* mRoot = nullptr;

  void CreateThreeLevelChain() {
    const char* treeShape = "x(x(x))";
    LayerIntRect layerVisibleRect[] = {
        LayerIntRect(0, 0, kFrameSize, kFrameSize),
        LayerIntRect(0, 0, kFrameSize, kFrameSize),
        LayerIntRect(0, 0, kFrameSize, kFrameSize),
    };
    CreateScrollData(treeShape, layerVisibleRect);

    const CSSRect scrollableRect(0, 0, kFrameSize, kFrameSize + kScrollRange);
    SetScrollableFrameMetrics(root, ScrollableLayerGuid::START_SCROLL_ID,
                              scrollableRect);
    SetScrollableFrameMetrics(
        layers[1], ScrollableLayerGuid::START_SCROLL_ID + 1, scrollableRect);
    SetScrollableFrameMetrics(
        layers[2], ScrollableLayerGuid::START_SCROLL_ID + 2, scrollableRect);
    SetScrollHandoff(layers[1], root);
    SetScrollHandoff(layers[2], layers[1]);

    registration = MakeUnique<ScopedLayerTreeRegistration>(LayersId{0}, mcc);
    UpdateHitTestingTree();

    mRoot = ApzcOf(root);
    mMiddle = ApzcOf(layers[1]);
    mInner = ApzcOf(layers[2]);
    mRoot->GetFrameMetrics().SetIsRootContent(true);
  }

  void SetScrollability(TestAsyncPanZoomController* aApzc,
                        Scrollability aScrollability) {
    FrameMetrics& metrics = aApzc->GetFrameMetrics();
    switch (aScrollability) {
      case Scrollability::Room:
        metrics.SetScrollableRect(
            CSSRect(0, 0, kFrameSize, kFrameSize + kScrollRange));
        metrics.SetVisualScrollOffset(CSSPoint(0, 0));
        break;
      case Scrollability::AtEnd:
        metrics.SetScrollableRect(
            CSSRect(0, 0, kFrameSize, kFrameSize + kScrollRange));
        metrics.SetVisualScrollOffset(CSSPoint(0, kScrollRange));
        break;
      case Scrollability::NoRange:
        metrics.SetScrollableRect(CSSRect(0, 0, kFrameSize, kFrameSize));
        metrics.SetVisualScrollOffset(CSSPoint(0, 0));
        break;
    }
  }

  void SetHorizontalRangeOnly(TestAsyncPanZoomController* aApzc) {
    FrameMetrics& metrics = aApzc->GetFrameMetrics();
    metrics.SetScrollableRect(
        CSSRect(0, 0, kFrameSize + kScrollRange, kFrameSize));
    metrics.SetVisualScrollOffset(CSSPoint(0, 0));
  }

  void SetAtEndOnBothAxes(TestAsyncPanZoomController* aApzc) {
    FrameMetrics& metrics = aApzc->GetFrameMetrics();
    metrics.SetScrollableRect(
        CSSRect(0, 0, kFrameSize + kScrollRange, kFrameSize + kScrollRange));
    metrics.SetVisualScrollOffset(CSSPoint(kScrollRange, kScrollRange));
  }

  void SetOverscrollBehavior(TestAsyncPanZoomController* aApzc,
                             StyleOverscrollBehavior aX,
                             StyleOverscrollBehavior aY) {
    OverscrollBehaviorInfo behavior;
    behavior.mBehaviorX = aX;
    behavior.mBehaviorY = aY;
    aApzc->GetScrollMetadata().SetOverscrollBehavior(behavior);
  }

  void ApplyFrameState(TestAsyncPanZoomController* aApzc,
                       const FrameState& aState) {
    SetScrollability(aApzc, aState.mScrollability);
    SetOverscrollBehavior(aApzc, aState.mBehavior, aState.mBehavior);
  }

  RefPtr<const OverscrollHandoffChain> BuildChain() {
    return mInner->BuildOverscrollHandoffChain();
  }

  PanGestureInput DownwardPan() {
    return PanGestureInput(PanGestureInput::PANGESTURE_PAN, mcc->Time(),
                           ScreenPoint(50, 50), ScreenPoint(0, 10),
                           MODIFIER_NONE);
  }

  PanGestureInput DiagonalPan() {
    return PanGestureInput(PanGestureInput::PANGESTURE_PAN, mcc->Time(),
                           ScreenPoint(50, 50), ScreenPoint(10, 10),
                           MODIFIER_NONE);
  }

  AsyncPanZoomController* ApzcForTarget(ExpectedTarget aTarget) {
    switch (aTarget) {
      case ExpectedTarget::Inner:
        return mInner;
      case ExpectedTarget::Middle:
        return mMiddle;
      case ExpectedTarget::Root:
        return mRoot;
      case ExpectedTarget::NoApzc:
        return nullptr;
    }
    MOZ_ASSERT_UNREACHABLE("bad ExpectedTarget");
    return nullptr;
  }

  void CheckOutcome(const OverscrollHandoffChain* aChain,
                    const InputData& aInput,
                    OverscrollHandoffChain::IncludeOverscroll aInclude,
                    const Outcome& aExpected) {
    ScrollDirections directions;
    RefPtr<AsyncPanZoomController> target =
        aChain->FindScrollTarget(aInput, &directions, aInclude);
    EXPECT_EQ(ApzcForTarget(aExpected.mTarget), target.get())
        << "unexpected target APZC";
    EXPECT_EQ(aExpected.mDirections, directions)
        << "expected allowed directions " << Describe(aExpected.mDirections)
        << ", got " << Describe(directions);
  }
};

class APZFindScrollTargetTableTester
    : public APZFindScrollTargetTester,
      public testing::WithParamInterface<TestCase> {
 public:
  static std::string PrintFromParam(
      const testing::TestParamInfo<TestCase>& aInfo) {
    return "inner_" + Describe(aInfo.param.mInner) + "__middle_" +
           Describe(aInfo.param.mMiddle) + "__root_" +
           Describe(aInfo.param.mRoot);
  }
};

TEST_P(APZFindScrollTargetTableTester, AllReachableChainStates) {
  SCOPED_GFX_PREF_BOOL("apz.overscroll.enabled", true);
  CreateThreeLevelChain();

  const TestCase& testCase = GetParam();
  ApplyFrameState(mInner, testCase.mInner);
  ApplyFrameState(mMiddle, testCase.mMiddle);
  ApplyFrameState(mRoot, testCase.mRoot);

  RefPtr<const OverscrollHandoffChain> chain = BuildChain();
  ASSERT_EQ(3u, chain->Length());  // just in case.
  PanGestureInput input = DownwardPan();

  {
    SCOPED_TRACE("IncludeOverscroll::Yes");
    CheckOutcome(chain, input, OverscrollHandoffChain::IncludeOverscroll::Yes,
                 testCase.mWithOverscroll);
  }
  {
    SCOPED_TRACE("IncludeOverscroll::No");
    CheckOutcome(chain, input, OverscrollHandoffChain::IncludeOverscroll::No,
                 testCase.mWithoutOverscroll);
  }
}

INSTANTIATE_TEST_SUITE_P(ReachableChainStates, APZFindScrollTargetTableTester,
                         testing::ValuesIn(kTestCases),
                         APZFindScrollTargetTableTester::PrintFromParam);

////////////////////////////////////////////////

// The table holds overscroll-behavior uniform across the two axes, so it never
// produces a partially narrowed aOutAllowedScrollDirections. The tests below
// cover the axes independently.
// FindScrollTarget() treats an axis individually in six places, and there is
// one test per place.
// One test per place is enough because the two axes are symmetric here.

// CanScroll(aInput) tests each axis against the event delta. Here, range
// on an axis the event does not move contributes nothing.
// (i.e. Axis::CanScroll(0) is false even with range)
TEST_F(APZFindScrollTargetTester, ScrollableOnTheOtherAxisIsSkipped) {
  SCOPED_GFX_PREF_BOOL("apz.overscroll.enabled", true);
  CreateThreeLevelChain();

  RefPtr<const OverscrollHandoffChain> chain = BuildChain();
  PanGestureInput input = DownwardPan();

  // The middle is scrollable on the other axis...
  ApplyFrameState(mInner, ObAuto(kNoRange));
  SetHorizontalRangeOnly(mMiddle);
  SetOverscrollBehavior(mMiddle, StyleOverscrollBehavior::Auto,
                        StyleOverscrollBehavior::Auto);
  ASSERT_TRUE(mMiddle->CanScroll(ScrollDirection::eHorizontal));
  ApplyFrameState(mRoot, ObAuto(kRoom));

  // ...but the expected is not kMiddle.
  CheckOutcome(chain, input, OverscrollHandoffChain::IncludeOverscroll::Yes,
               kRoot);
}

// GetOverscrollableDirections() is per axis: has range && o.b. != none
TEST_F(APZFindScrollTargetTester, ContainVsNoneAtRoot) {
  SCOPED_GFX_PREF_BOOL("apz.overscroll.enabled", true);
  CreateThreeLevelChain();

  RefPtr<const OverscrollHandoffChain> chain = BuildChain();
  PanGestureInput input = DownwardPan();

  ApplyFrameState(mInner, ObAuto(kNoRange));
  ApplyFrameState(mMiddle, ObAuto(kNoRange));
  SetScrollability(mRoot, Scrollability::AtEnd);

  SetOverscrollBehavior(mRoot, StyleOverscrollBehavior::Auto,
                        StyleOverscrollBehavior::Contain);
  CheckOutcome(chain, input, OverscrollHandoffChain::IncludeOverscroll::Yes,
               kRoot);

  SetOverscrollBehavior(mRoot, StyleOverscrollBehavior::Auto,
                        StyleOverscrollBehavior::None);
  CheckOutcome(chain, input, OverscrollHandoffChain::IncludeOverscroll::Yes,
               kNone);
}

// IsZero(delta) doesn't drop the axes the event has no delta on.
TEST_F(APZFindScrollTargetTester, ReportedDirectionsKeepZeroDeltaAxis) {
  SCOPED_GFX_PREF_BOOL("apz.overscroll.enabled", true);
  CreateThreeLevelChain();

  RefPtr<const OverscrollHandoffChain> chain = BuildChain();

  ApplyFrameState(mInner, ObAuto(kNoRange));
  ApplyFrameState(mMiddle, ObAuto(kNoRange));
  SetAtEndOnBothAxes(mRoot);
  SetOverscrollBehavior(mRoot, StyleOverscrollBehavior::Auto,
                        StyleOverscrollBehavior::Auto);

  ASSERT_EQ(EitherScrollDirection, mRoot->GetOverscrollableDirections());

  // Regardless of the direction with delta, the root frame is returned with
  // both directions.
  PanGestureInput verticalPan = DownwardPan();
  CheckOutcome(chain, verticalPan,
               OverscrollHandoffChain::IncludeOverscroll::Yes, kRoot);

  PanGestureInput diagonalPan = DiagonalPan();
  CheckOutcome(chain, diagonalPan,
               OverscrollHandoffChain::IncludeOverscroll::Yes, kRoot);
}

// The overscrollable set is intersected with what handoff still allows.
TEST_F(APZFindScrollTargetTester, RootOverscrollCannotRestoreBlockedAxis) {
  SCOPED_GFX_PREF_BOOL("apz.overscroll.enabled", true);
  CreateThreeLevelChain();

  RefPtr<const OverscrollHandoffChain> chain = BuildChain();
  PanGestureInput input = DiagonalPan();

  // The innermost frame blocks handoff vertically, leaving horizontal only.
  SetScrollability(mInner, Scrollability::NoRange);
  SetOverscrollBehavior(mInner, StyleOverscrollBehavior::Auto,
                        StyleOverscrollBehavior::None);
  ApplyFrameState(mMiddle, ObAuto(kNoRange));

  // The root can overscroll either way...
  SetAtEndOnBothAxes(mRoot);
  SetOverscrollBehavior(mRoot, StyleOverscrollBehavior::Auto,
                        StyleOverscrollBehavior::Auto);
  ASSERT_EQ(EitherScrollDirection, mRoot->GetOverscrollableDirections());

  // ...but vertical is no longer allowed.
  CheckOutcome(chain, input, OverscrollHandoffChain::IncludeOverscroll::Yes,
               Outcome{ExpectedTarget::Root, HorizontalScrollDirection});
}

// GetAllowedHandoffDirections() is per axis: o.b. == auto
TEST_F(APZFindScrollTargetTester, HandoffNarrowsToSingleDirection) {
  SCOPED_GFX_PREF_BOOL("apz.overscroll.enabled", true);
  CreateThreeLevelChain();

  RefPtr<const OverscrollHandoffChain> chain = BuildChain();
  PanGestureInput input = DiagonalPan();

  // The innermost frame blocks handoff horizontally, leaving vertical only.
  SetScrollability(mInner, Scrollability::NoRange);
  SetOverscrollBehavior(mInner, StyleOverscrollBehavior::None,
                        StyleOverscrollBehavior::Auto);
  ApplyFrameState(mMiddle, ObAuto(kRoom));

  CheckOutcome(chain, input, OverscrollHandoffChain::IncludeOverscroll::Yes,
               Outcome{ExpectedTarget::Middle, VerticalScrollDirection});
}

// The direction set becoming empty ends the scroll pass
TEST_F(APZFindScrollTargetTester, ProgressiveNarrowingEndsScrollPass) {
  SCOPED_GFX_PREF_BOOL("apz.overscroll.enabled", true);
  CreateThreeLevelChain();

  RefPtr<const OverscrollHandoffChain> chain = BuildChain();
  PanGestureInput input = DiagonalPan();

  SetScrollability(mInner, Scrollability::NoRange);
  SetOverscrollBehavior(mInner, StyleOverscrollBehavior::None,
                        StyleOverscrollBehavior::Auto);
  SetScrollability(mMiddle, Scrollability::NoRange);
  SetOverscrollBehavior(mMiddle, StyleOverscrollBehavior::Auto,
                        StyleOverscrollBehavior::None);
  ApplyFrameState(mRoot, ObAuto(kRoom));

  // The root content is scrollable...
  ASSERT_TRUE(mRoot->CanScroll(input));

  // ...but the scan doesn't reach to the root and it ends with kNone.
  CheckOutcome(chain, input, OverscrollHandoffChain::IncludeOverscroll::Yes,
               kNone);
}

////////////////////////////////////////////////

// Other edge cases.

// A zero-delta pan gesture cannot scroll anything either, so an innermost frame
// with overscroll-behavior: none ends the scan even though it has room.
TEST_F(APZFindScrollTargetTester, ZeroDeltaPanIsNotScrollable) {
  SCOPED_GFX_PREF_BOOL("apz.overscroll.enabled", true);
  CreateThreeLevelChain();

  RefPtr<const OverscrollHandoffChain> chain = BuildChain();

  ApplyFrameState(mInner, ObNone(kRoom));
  ApplyFrameState(mMiddle, ObAuto(kRoom));
  ApplyFrameState(mRoot, ObAuto(kRoom));

  PanGestureInput mayStart(PanGestureInput::PANGESTURE_MAYSTART, mcc->Time(),
                           ScreenPoint(50, 50), ScreenPoint(0, 0),
                           MODIFIER_NONE);
  CheckOutcome(chain, mayStart, OverscrollHandoffChain::IncludeOverscroll::Yes,
               kNone);

  // The frame is returned when the gesture has a delta.
  PanGestureInput pan = DownwardPan();
  CheckOutcome(chain, pan, OverscrollHandoffChain::IncludeOverscroll::Yes,
               kInner);
}

// Exit (b) is gated on the input being a pan gesture, so a wheel event with the
// same delta on the same chain does not get the root's overscroll treatment.
TEST_F(APZFindScrollTargetTester, WheelInputSkipsOverscrollBranch) {
  SCOPED_GFX_PREF_BOOL("apz.overscroll.enabled", true);
  CreateThreeLevelChain();

  RefPtr<const OverscrollHandoffChain> chain = BuildChain();

  ApplyFrameState(mInner, ObAuto(kNoRange));
  ApplyFrameState(mMiddle, ObAuto(kNoRange));
  ApplyFrameState(mRoot, ObAuto(kAtEnd));

  ScrollWheelInput downwardWheel(
      mcc->Time(), MODIFIER_NONE, ScrollWheelInput::SCROLLMODE_INSTANT,
      ScrollWheelInput::SCROLLDELTA_PIXEL, ScreenPoint(50, 50), 0, 10, false,
      WheelDeltaAdjustmentStrategy::eNone);
  CheckOutcome(chain, downwardWheel,
               OverscrollHandoffChain::IncludeOverscroll::Yes, kNone);

  // The identical chain does return the root for a pan gesture.
  PanGestureInput pan = DownwardPan();
  CheckOutcome(chain, pan, OverscrollHandoffChain::IncludeOverscroll::Yes,
               kRoot);
}

////////////////////////////////////////////////

// Tests involving pan gestures with a reversed direction.
//
// The two tests below pan past an edge and then reverse within the same block
// to observe which frame is left to take the reversal.

class APZOverscrollTargetTester : public APZFindScrollTargetTester {
 public:
  APZOverscrollTargetTester() { CreateMockHitTester(); }

 protected:
#ifndef MOZ_WIDGET_ANDROID
  static constexpr float kPanDelta = 50;
#endif

  void PanOverInnerFrame(PanGestureInput::PanGestureType aType, float aDeltaY) {
    QueueMockHitResult(ScrollableLayerGuid::START_SCROLL_ID + 2);
    PanGesture(aType, manager, ScreenIntPoint(50, 50), ScreenPoint(0, aDeltaY),
               mcc->Time());
    mcc->AdvanceByMillis(10);
  }

  CSSCoord ScrollOffsetY(TestAsyncPanZoomController* aApzc) {
    return aApzc->GetFrameMetrics().GetVisualScrollOffset().y;
  }
};

#ifndef MOZ_WIDGET_ANDROID  // Only applies to GenericOverscrollEffect
TEST_F(APZOverscrollTargetTester, ReversalAfterRootTakesOverscroll) {
  SCOPED_GFX_PREF_BOOL("apz.overscroll.enabled", true);
  CreateThreeLevelChain();

  ApplyFrameState(mInner, ObAuto(kAtEnd));
  ApplyFrameState(mMiddle, ObAuto(kAtEnd));
  ApplyFrameState(mRoot, ObAuto(kAtEnd));

  // Pan downward past the end of all three frames. None of them can scroll, so
  // the root content frame takes the overscroll effect.
  PanOverInnerFrame(PanGestureInput::PANGESTURE_START, kPanDelta);
  PanOverInnerFrame(PanGestureInput::PANGESTURE_PAN, kPanDelta);

  EXPECT_TRUE(mRoot->IsOverscrolled());
  EXPECT_FALSE(mMiddle->IsOverscrolled());
  EXPECT_FALSE(mInner->IsOverscrolled());

  // Reverse without ending the block. The chain was rebuilt from the root
  // content frame, so the root is the only frame left to take the reversal,
  // even though the other two have just as much room to scroll back.
  PanOverInnerFrame(PanGestureInput::PANGESTURE_PAN, -kPanDelta);
  PanOverInnerFrame(PanGestureInput::PANGESTURE_PAN, -kPanDelta);
  PanOverInnerFrame(PanGestureInput::PANGESTURE_END, 0);

  EXPECT_LT(ScrollOffsetY(mRoot), kScrollRange);
  EXPECT_EQ(ScrollOffsetY(mMiddle), kScrollRange);
  EXPECT_EQ(ScrollOffsetY(mInner), kScrollRange);
}

TEST_F(APZOverscrollTargetTester, ReversalAfterNonRootTakesOverscroll) {
  SCOPED_GFX_PREF_BOOL("apz.overscroll.enabled", true);
  CreateThreeLevelChain();

  ApplyFrameState(mInner, ObAuto(kAtEnd));
  ApplyFrameState(mMiddle, ObAuto(kAtEnd));
  // The root content frame has no range, so it has no overscroll effect to
  // give, and the middle frame is the outermost one that has.
  ApplyFrameState(mRoot, ObAuto(kNoRange));

  PanOverInnerFrame(PanGestureInput::PANGESTURE_START, kPanDelta);
  PanOverInnerFrame(PanGestureInput::PANGESTURE_PAN, kPanDelta);

  // FindFirstScrollable() used to return nullptr for this chain, which left the
  // innermost frame the target, and with no handoff at dispatch time the
  // innermost frame was also the one that showed the effect.
  EXPECT_TRUE(mMiddle->IsOverscrolled());
  EXPECT_FALSE(mRoot->IsOverscrolled());
  EXPECT_FALSE(mInner->IsOverscrolled());

  // The same swap decides the reversal: the innermost frame used to still be
  // the target and scroll back, and it is out of the chain now.
  PanOverInnerFrame(PanGestureInput::PANGESTURE_PAN, -kPanDelta);
  PanOverInnerFrame(PanGestureInput::PANGESTURE_PAN, -kPanDelta);
  PanOverInnerFrame(PanGestureInput::PANGESTURE_END, 0);

  EXPECT_LT(ScrollOffsetY(mMiddle), kScrollRange);
  EXPECT_EQ(ScrollOffsetY(mInner), kScrollRange);
}
#endif  // MOZ_WIDGET_ANDROID

}  // namespace
