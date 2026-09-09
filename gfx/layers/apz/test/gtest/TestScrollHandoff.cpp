/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "APZCTreeManagerTester.h"
#include "APZTestCommon.h"
#include "InputUtils.h"

class APZScrollHandoffTester : public APZCTreeManagerTester {
 protected:
  UniquePtr<ScopedLayerTreeRegistration> registration;
  TestAsyncPanZoomController* rootApzc;

  void CreateScrollHandoffLayerTree1() {
    const char* treeShape = "x(x)";
    LayerIntRect layerVisibleRect[] = {LayerIntRect(0, 0, 100, 100),
                                       LayerIntRect(0, 50, 100, 50)};
    CreateScrollData(treeShape, layerVisibleRect);
    SetScrollableFrameMetrics(root, START_SCROLL_ID, CSSRect(0, 0, 200, 200));
    SetScrollableFrameMetrics(layers[1], START_SCROLL_ID + 1,
                              CSSRect(0, 0, 100, 100));
    SetScrollHandoff(layers[1], root);
    registration = MakeUnique<ScopedLayerTreeRegistration>(LayersId{0}, mcc);
    UpdateHitTestingTree();
    rootApzc = ApzcOf(root);
    rootApzc->GetFrameMetrics().SetIsRootContent(
        true);  // make root APZC zoomable
  }

  void CreateScrollHandoffLayerTree2() {
    const char* treeShape = "x(x(x))";
    LayerIntRect layerVisibleRect[] = {LayerIntRect(0, 0, 100, 100),
                                       LayerIntRect(0, 0, 100, 100),
                                       LayerIntRect(0, 50, 100, 50)};
    CreateScrollData(treeShape, layerVisibleRect);
    SetScrollableFrameMetrics(root, START_SCROLL_ID, CSSRect(0, 0, 200, 200));
    SetScrollableFrameMetrics(layers[1], START_SCROLL_ID + 2,
                              CSSRect(-100, -100, 200, 200));
    SetScrollableFrameMetrics(layers[2], START_SCROLL_ID + 1,
                              CSSRect(0, 0, 100, 100));
    SetScrollHandoff(layers[1], root);
    SetScrollHandoff(layers[2], layers[1]);
    // No ScopedLayerTreeRegistration as that just needs to be done once per
    // test and this is the second layer tree for a particular test.
    MOZ_ASSERT(registration);
    UpdateHitTestingTree();
    rootApzc = ApzcOf(root);
  }

  void CreateScrollHandoffLayerTree3() {
    const char* treeShape = "x(x(x)x(x))";
    LayerIntRect layerVisibleRect[] = {
        LayerIntRect(0, 0, 100, 100),  // root
        LayerIntRect(0, 0, 100, 50),   // scrolling parent 1
        LayerIntRect(0, 0, 100, 50),   // scrolling child 1
        LayerIntRect(0, 50, 100, 50),  // scrolling parent 2
        LayerIntRect(0, 50, 100, 50)   // scrolling child 2
    };
    CreateScrollData(treeShape, layerVisibleRect);
    SetScrollableFrameMetrics(layers[0], START_SCROLL_ID,
                              CSSRect(0, 0, 100, 100));
    SetScrollableFrameMetrics(layers[1], START_SCROLL_ID + 1,
                              CSSRect(0, 0, 100, 100));
    SetScrollableFrameMetrics(layers[2], START_SCROLL_ID + 2,
                              CSSRect(0, 0, 100, 100));
    SetScrollableFrameMetrics(layers[3], START_SCROLL_ID + 3,
                              CSSRect(0, 50, 100, 100));
    SetScrollableFrameMetrics(layers[4], START_SCROLL_ID + 4,
                              CSSRect(0, 50, 100, 100));
    SetScrollHandoff(layers[1], layers[0]);
    SetScrollHandoff(layers[3], layers[0]);
    SetScrollHandoff(layers[2], layers[1]);
    SetScrollHandoff(layers[4], layers[3]);
    registration = MakeUnique<ScopedLayerTreeRegistration>(LayersId{0}, mcc);
    UpdateHitTestingTree();
  }

  // Creates a layer tree with a parent layer that is only scrollable
  // horizontally, and a child layer that is only scrollable vertically.
  void CreateScrollHandoffLayerTree4() {
    const char* treeShape = "x(x)";
    LayerIntRect layerVisibleRect[] = {LayerIntRect(0, 0, 100, 100),
                                       LayerIntRect(0, 0, 100, 100)};
    CreateScrollData(treeShape, layerVisibleRect);
    SetScrollableFrameMetrics(root, START_SCROLL_ID, CSSRect(0, 0, 200, 100));
    SetScrollableFrameMetrics(layers[1], START_SCROLL_ID + 1,
                              CSSRect(0, 0, 100, 200));
    SetScrollHandoff(layers[1], root);
    registration = MakeUnique<ScopedLayerTreeRegistration>(LayersId{0}, mcc);
    UpdateHitTestingTree();
    rootApzc = ApzcOf(root);
  }

  // Creates a layer tree with a parent layer that is not scrollable, and a
  // child layer that is only scrollable vertically.
  void CreateScrollHandoffLayerTree5() {
    const char* treeShape = "x(x)";
    LayerIntRect layerVisibleRect[] = {
        LayerIntRect(0, 0, 100, 100),  // scrolling parent
        LayerIntRect(0, 50, 100, 50)   // scrolling child
    };
    CreateScrollData(treeShape, layerVisibleRect);
    SetScrollableFrameMetrics(root, START_SCROLL_ID, CSSRect(0, 0, 100, 100));
    SetScrollableFrameMetrics(layers[1], START_SCROLL_ID + 1,
                              CSSRect(0, 0, 100, 200));
    SetScrollHandoff(layers[1], root);
    registration = MakeUnique<ScopedLayerTreeRegistration>(LayersId{0}, mcc);
    UpdateHitTestingTree();
    rootApzc = ApzcOf(root);
  }

  // Creates a layer tree with a parent layer that is only scrollable
  // vertically, and a child layer that is only scrollable horizontally.
  void CreateScrollHandoffLayerTree6() {
    const char* treeShape = "x(x)";
    LayerIntRect layerVisibleRect[] = {LayerIntRect(0, 0, 100, 100),
                                       LayerIntRect(0, 0, 100, 1000)};
    CreateScrollData(treeShape, layerVisibleRect);
    SetScrollableFrameMetrics(root, START_SCROLL_ID, CSSRect(0, 0, 100, 1000));
    SetScrollableFrameMetrics(layers[1], START_SCROLL_ID + 1,
                              CSSRect(0, 0, 200, 1000));
    SetScrollHandoff(layers[1], root);
    registration = MakeUnique<ScopedLayerTreeRegistration>(LayersId{0}, mcc);
    UpdateHitTestingTree();
    rootApzc = ApzcOf(root);
  }

  void TestCrossApzcAxisLock() {
    SCOPED_GFX_PREF_INT("apz.axis_lock.mode", 1);

    CreateScrollHandoffLayerTree1();

    RefPtr<TestAsyncPanZoomController> childApzc = ApzcOf(layers[1]);
    Pan(childApzc, ScreenIntPoint(10, 60), ScreenIntPoint(15, 90),
        PanOptions::KeepFingerDown | PanOptions::ExactCoordinates);

    childApzc->AssertAxisLocked(ScrollDirection::eVertical);
    childApzc->AssertStateIsPanningLockedY();
  }
};

class APZScrollHandoffTesterMock : public APZScrollHandoffTester {
 public:
  APZScrollHandoffTesterMock() { CreateMockHitTester(); }
};

class APZCNestedFlingScrollHandoffTester : public APZCTreeManagerTester {
 protected:
  void SetUp() {
    APZCTreeManagerTester::SetUp();
    const char* treeShape = "x(x)";
    LayerIntRect layerVisibleRect[] = {
        LayerIntRect(0, 0, 800, 1000),
        LayerIntRect(0, 0, 100, 100),
    };

    CreateScrollData(treeShape, layerVisibleRect);

    SetScrollableFrameMetrics(root, START_SCROLL_ID, CSSRect(0, 0, 800, 50000));
    SetScrollableFrameMetrics(layers[1], START_SCROLL_ID + 1,
                              CSSRect(0, 0, 800, 100));

    SetScrollHandoff(layers[1], root);

    // Scroll somewhere into the middle of the scroll range, so that we have
    // lots of space to scroll in both directions.
    ModifyFrameMetrics(root, [](ScrollMetadata& aSm, FrameMetrics& aMetrics) {
      aMetrics.SetVisualScrollUpdateType(ScrollOffsetUpdateType::MainThread);
      aMetrics.SetVisualDestination(CSSPoint(0, 25000));
    });

    registration = MakeUnique<ScopedLayerTreeRegistration>(LayersId{0}, mcc);
    UpdateHitTestingTree();

    subframeApzc = ApzcOf(layers[1]);
  }

  void ExecuteDirectionChangingPanGesture(
      const ScreenIntPoint& aStartPoint,
      std::initializer_list<int32_t> aXDeltas,
      std::initializer_list<int32_t> aYDeltas) {
    APZEventResult result = TouchDown(subframeApzc, aStartPoint, mcc->Time());

    // Allowed touch behaviours must be set after sending touch-start.
    if (result.GetStatus() != nsEventStatus_eConsumeNoDefault) {
      SetDefaultAllowedTouchBehavior(subframeApzc, result.mInputBlockId);
    }

    const TimeDuration kTouchTimeDelta100Hz =
        TimeDuration::FromMilliseconds(10);

    ScreenIntPoint currentLocation = aStartPoint;
    for (int32_t delta : aXDeltas) {
      mcc->AdvanceBy(kTouchTimeDelta100Hz);
      if (delta != 0) {
        currentLocation.x += delta;
        (void)TouchMove(subframeApzc, currentLocation, mcc->Time());
      }
    }

    ExecuteWait(TimeDuration::FromMilliseconds(255));

    for (int32_t delta : aYDeltas) {
      mcc->AdvanceBy(kTouchTimeDelta100Hz);
      if (delta != 0) {
        currentLocation.y += delta;
        (void)TouchMove(subframeApzc, currentLocation, mcc->Time());
      }
    }

    (void)TouchUp(subframeApzc, currentLocation, mcc->Time());
  }

  void ExecuteWait(const TimeDuration& aDuration) {
    TimeDuration remaining = aDuration;
    const TimeDuration TIME_BETWEEN_FRAMES =
        TimeDuration::FromSeconds(1) / int64_t(60);
    while (remaining.ToMilliseconds() > 0) {
      mcc->AdvanceBy(TIME_BETWEEN_FRAMES);
      subframeApzc->AdvanceAnimations(mcc->GetSampleTime());
      remaining -= TIME_BETWEEN_FRAMES;
    }
  }

  RefPtr<TestAsyncPanZoomController> subframeApzc;
  UniquePtr<ScopedLayerTreeRegistration> registration;
};

// Android uses WidgetOverscrollEffect, which swallows residual deltas
// instead of returning them to the handoff chain.
#ifndef MOZ_WIDGET_ANDROID
// Scenario from Bug 2046702 (mirrored vertically so the residual delta is
// positive): The subframe sits at its top, the root near its bottom extent.
// Panning down pins the subframe at its top and hands the delta off to the
// root, making the root the input block's "scrolled APZC". Reversing the pan
// within the same touch block drives the root back into its bottom extent;
// the root can consume neither the residual delta (overscroll-behavior: none)
// nor hand it off further, so the residual flows back to the subframe. The
// subframe is not scrolled to the edge the residual overscroll belongs to (it
// sits at its top, while the residual is a downward overscroll), and it is not
// downchain of the scrolled APZC, so applying the residual as a local
// overscroll effect there triggered the debug assertion in Axis::OverscrollBy
// ("composition end is not equal (within error) to page end").
// Additionally, CallDispatchScroll left aEndPoint stale when the
// handoff target scrolled, inflating that residual.
TEST_F(APZScrollHandoffTesterMock, OverscrollDropsDelta_Bug2046702) {
  SCOPED_GFX_PREF_BOOL("apz.overscroll.enabled", true);
  SCOPED_GFX_PREF_FLOAT("apz.touch_start_tolerance", 0.0f);
  SCOPED_GFX_PREF_FLOAT("apz.touch_move_tolerance", 0.0f);

  // Both the root and the subframe are tall vertical-only scrollers,
  // so the subframe can scroll to its extent and hand the remaining delta
  // off to the root. The root has overscroll-behavior: none,
  // so it can scroll but can neither hand off nor show a local overscroll
  // effect; residual deltas it cannot consume flow back to the subframe.
  const char* treeShape = "x(x)";
  LayerIntRect layerVisibleRect[] = {LayerIntRect(0, 0, 100, 100),
                                     LayerIntRect(0, 0, 100, 100)};
  CreateScrollData(treeShape, layerVisibleRect);
  SetScrollableFrameMetrics(root, ScrollableLayerGuid::START_SCROLL_ID,
                            CSSRect(0, 0, 100, 1000));
  SetScrollableFrameMetrics(layers[1], ScrollableLayerGuid::START_SCROLL_ID + 1,
                            CSSRect(0, 0, 100, 1000));
  SetScrollHandoff(layers[1], root);
  ModifyFrameMetrics(root, [](ScrollMetadata& aSm, FrameMetrics&) {
    OverscrollBehaviorInfo behavior;
    behavior.mBehaviorX = OverscrollBehavior::None;
    behavior.mBehaviorY = OverscrollBehavior::None;
    aSm.SetOverscrollBehavior(behavior);
  });
  registration = MakeUnique<ScopedLayerTreeRegistration>(LayersId{0}, mcc);
  UpdateHitTestingTree();
  rootApzc = ApzcOf(root);
  rootApzc->GetFrameMetrics().SetIsRootContent(true);

  RefPtr<TestAsyncPanZoomController> child = ApzcOf(layers[1]);

  // Scroll the root near its bottom extent, leaving a small amount of room.
  rootApzc->GetFrameMetrics().SetVisualScrollOffset(CSSPoint(0, 890));

  // The child stays scrolled all the way to its top.
  EXPECT_EQ(child->GetFrameMetrics().GetVisualScrollOffset().y, 0);

  ScrollableLayerGuid::ViewID subframeScrollId =
      ScrollableLayerGuid::START_SCROLL_ID + 1;

  QueueMockHitResult(subframeScrollId);
  APZEventResult result = TouchDown(manager, {10, 20}, mcc->Time());
  SetDefaultAllowedTouchBehavior(manager, result.mInputBlockId);

  // Move the finger down (content scrolls up): the child is pinned at its
  // top, so the delta hands off to the root, which scrolls 890 -> 810 and
  // becomes the block's scrolled APZC.
  for (int y = 40; y <= 100; y += 20) {
    mcc->AdvanceByMillis(16);
    TouchMove(manager, {10, y}, mcc->Time());
  }
  EXPECT_EQ(child->GetFrameMetrics().GetVisualScrollOffset().y, 0);
  EXPECT_LT(rootApzc->GetFrameMetrics().GetVisualScrollOffset().y, 890);

  // Reverse the motion within the same touch block, by more than the room
  // the root has left. The child stays frozen (it is not downchain of the
  // scrolled APZC), the root scrolls back down and hits its extent, and the
  // residual delta flows back to the child. Before the fix, the child then
  // applies the residual as a local overscroll effect while not scrolled to
  // its end, firing the assertion.
  for (int y = 80; y >= 0; y -= 20) {
    mcc->AdvanceByMillis(16);
    TouchMove(manager, {10, y}, mcc->Time());
  }

  // With the fix, the residual delta is dropped: the child never moved or
  // overscrolled, and the root is pinned at its extent without an overscroll
  // effect (overscroll-behavior: none).
  EXPECT_EQ(child->GetFrameMetrics().GetVisualScrollOffset().y, 0);
  EXPECT_EQ(rootApzc->GetFrameMetrics().GetVisualScrollOffset().y, 900);
  EXPECT_FALSE(child->IsOverscrolled());
  EXPECT_FALSE(rootApzc->IsOverscrolled());

  // Release and let animations settle; nothing should remain overscrolled.
  mcc->AdvanceByMillis(16);
  TouchUp(manager, {10, 0}, mcc->Time());

  child->AdvanceAnimationsUntilEnd();
  rootApzc->AdvanceAnimationsUntilEnd();

  EXPECT_FALSE(child->IsOverscrolled());
  EXPECT_FALSE(rootApzc->IsOverscrolled());
}

// Models the reproducer page attached to Bug 2046702 (attachment 9596335) as
// closely as a layer tree allows, because the test above does not exercise the
// same code: it relies on overscroll-behavior: none to stop the root absorbing
// the residual, while the page has no overscroll-behavior at all. Unlike the
// test above, this one is oriented the same way round as the page.
//
// The subframe sits at its bottom and the root a little below its top. Panning
// the finger up pins the subframe at its bottom and hands the delta off to the
// root, making the root the input block's scrolled APZC. Reversing the pan
// within the same touch block drives the root back into its top extent, and
// the residual delta flows back to the subframe, which is at the opposite edge
// from the one that residual belongs to.
TEST_F(APZScrollHandoffTesterMock, OverscrollDropsDelta_Bug2046702_Reproducer) {
  SCOPED_GFX_PREF_BOOL("apz.overscroll.enabled", true);
  SCOPED_GFX_PREF_FLOAT("apz.touch_start_tolerance", 0.0f);
  SCOPED_GFX_PREF_FLOAT("apz.touch_move_tolerance", 0.0f);

  const char* treeShape = "x(x)";
  LayerIntRect layerVisibleRect[] = {LayerIntRect(0, 0, 400, 1000),
                                     LayerIntRect(0, 400, 400, 400)};
  CreateScrollData(treeShape, layerVisibleRect);
  SetScrollableFrameMetrics(root, ScrollableLayerGuid::START_SCROLL_ID,
                            CSSRect(0, 0, 400, 4000));
  SetScrollableFrameMetrics(layers[1], ScrollableLayerGuid::START_SCROLL_ID + 1,
                            CSSRect(0, 0, 400, 1600));
  SetScrollHandoff(layers[1], root);
  registration = MakeUnique<ScopedLayerTreeRegistration>(LayersId{0}, mcc);
  UpdateHitTestingTree();
  rootApzc = ApzcOf(root);
  rootApzc->GetFrameMetrics().SetIsRootContent(true);

  RefPtr<TestAsyncPanZoomController> subframe = ApzcOf(layers[1]);

  // Scroll/pan the parent scroller by a small amount such that it is not
  // scrolled all the way to the top.
  rootApzc->GetFrameMetrics().SetVisualScrollOffset(CSSPoint(0, 20));

  // Scroll the child element all the way to the bottom.
  subframe->GetFrameMetrics().SetVisualScrollOffset(CSSPoint(0, 1200));

  ScrollableLayerGuid::ViewID subframeScrollId =
      ScrollableLayerGuid::START_SCROLL_ID + 1;

  // The pan drifts sideways as a hand-driven drag does. This is load-bearing,
  // not incidental: neither scroller has any horizontal scroll range, so
  // horizontal is absent from GetOverscrollableDirections() and
  // GenericOverscrollEffect::ConsumeOverscroll leaves the x component of the
  // residual alone. That keeps IsZero(overscroll) false, so the root reports
  // the delta as not consumed and the vertical remainder travels back to the
  // subframe. With a perfectly vertical pan the root zeroes the whole residual,
  // reports "consumed", and nothing ever reaches the subframe.
  int x = 200;
  QueueMockHitResult(subframeScrollId);
  APZEventResult result = TouchDown(manager, {x, 700}, mcc->Time());
  SetDefaultAllowedTouchBehavior(manager, result.mInputBlockId);

  // Do a panning motion (moving the mouse cursor up) such that the child
  // element keeps hitting the bottom and handing off scrolling to the parent.
  // The subframe is pinned at its bottom, so the root scrolls 20 -> 220 and
  // becomes the block's scrolled APZC.
  for (int y = 650; y >= 500; y -= 50) {
    mcc->AdvanceByMillis(16);
    x -= 4;
    TouchMove(manager, {x, y}, mcc->Time());
  }
  EXPECT_EQ(subframe->GetFrameMetrics().GetVisualScrollOffset().y, 1200);
  EXPECT_GT(rootApzc->GetFrameMetrics().GetVisualScrollOffset().y, 20);

  // "Once scroll-handoff to the parent happened and the parent began to
  // scroll, reverse the motion (moving the mouse cursor down)", by more than
  // the room the root has left.
  for (int y = 550; y <= 800; y += 50) {
    mcc->AdvanceByMillis(16);
    x -= 4;
    TouchMove(manager, {x, y}, mcc->Time());
  }

  // The subframe never moved and never overscrolled; the root is pinned at its
  // top extent. The root is allowed a local overscroll effect there, so its
  // overscroll state is not asserted on until the block has settled.
  EXPECT_EQ(subframe->GetFrameMetrics().GetVisualScrollOffset().y, 1200);
  EXPECT_EQ(rootApzc->GetFrameMetrics().GetVisualScrollOffset().y, 0);
  EXPECT_FALSE(subframe->IsOverscrolled());

  // Release and let animations settle; nothing should remain overscrolled.
  mcc->AdvanceByMillis(16);
  TouchUp(manager, {x, 800}, mcc->Time());

  subframe->AdvanceAnimationsUntilEnd();
  rootApzc->AdvanceAnimationsUntilEnd();

  EXPECT_FALSE(subframe->IsOverscrolled());
  EXPECT_FALSE(rootApzc->IsOverscrolled());
}
#endif

#ifndef MOZ_WIDGET_ANDROID  // Currently fails on Android
// Here we test that if the processing of a touch block is deferred while we
// wait for content to send a prevent-default message, overscroll is still
// handed off correctly when the block is processed.
TEST_F(APZScrollHandoffTester, DeferredInputEventProcessing) {
  SCOPED_GFX_PREF_BOOL("apz.allow_immediate_handoff", true);

  // Set up the APZC tree.
  CreateScrollHandoffLayerTree1();

  RefPtr<TestAsyncPanZoomController> childApzc = ApzcOf(layers[1]);

  // Enable touch-listeners so that we can separate the queueing of input
  // events from them being processed.
  childApzc->SetWaitForMainThread();

  // Queue input events for a pan.
  uint64_t blockId = 0;
  Pan(childApzc, 90, 30, PanOptions::NoFling, nullptr, nullptr, &blockId);

  // Allow the pan to be processed.
  childApzc->ContentReceivedInputBlock(blockId, false);
  childApzc->ConfirmTarget(blockId);

  // Make sure overscroll was handed off correctly.
  EXPECT_EQ(50, childApzc->GetFrameMetrics().GetVisualScrollOffset().y);
  EXPECT_EQ(10, rootApzc->GetFrameMetrics().GetVisualScrollOffset().y);
}
#endif

#ifndef MOZ_WIDGET_ANDROID  // Currently fails on Android
// Here we test that if the layer structure changes in between two input
// blocks being queued, and the first block is only processed after the second
// one has been queued, overscroll handoff for the first block follows
// the original layer structure while overscroll handoff for the second block
// follows the new layer structure.
TEST_F(APZScrollHandoffTester, LayerStructureChangesWhileEventsArePending) {
  SCOPED_GFX_PREF_BOOL("apz.allow_immediate_handoff", true);

  // Set up an initial APZC tree.
  CreateScrollHandoffLayerTree1();

  RefPtr<TestAsyncPanZoomController> childApzc = ApzcOf(layers[1]);

  // Enable touch-listeners so that we can separate the queueing of input
  // events from them being processed.
  childApzc->SetWaitForMainThread();

  // Queue input events for a pan.
  uint64_t blockId = 0;
  Pan(childApzc, 90, 30, PanOptions::NoFling, nullptr, nullptr, &blockId);

  // Modify the APZC tree to insert a new APZC 'middle' into the handoff chain
  // between the child and the root.
  CreateScrollHandoffLayerTree2();
  WebRenderLayerScrollData* middle = layers[1];
  childApzc->SetWaitForMainThread();
  TestAsyncPanZoomController* middleApzc = ApzcOf(middle);

  // Queue input events for another pan.
  uint64_t secondBlockId = 0;
  Pan(childApzc, 30, 90, PanOptions::NoFling, nullptr, nullptr, &secondBlockId);

  // Allow the first pan to be processed.
  childApzc->ContentReceivedInputBlock(blockId, false);
  childApzc->ConfirmTarget(blockId);

  // Make sure things have scrolled according to the handoff chain in
  // place at the time the touch-start of the first pan was queued.
  EXPECT_EQ(50, childApzc->GetFrameMetrics().GetVisualScrollOffset().y);
  EXPECT_EQ(10, rootApzc->GetFrameMetrics().GetVisualScrollOffset().y);
  EXPECT_EQ(0, middleApzc->GetFrameMetrics().GetVisualScrollOffset().y);

  // Allow the second pan to be processed.
  childApzc->ContentReceivedInputBlock(secondBlockId, false);
  childApzc->ConfirmTarget(secondBlockId);

  // Make sure things have scrolled according to the handoff chain in
  // place at the time the touch-start of the second pan was queued.
  EXPECT_EQ(0, childApzc->GetFrameMetrics().GetVisualScrollOffset().y);
  EXPECT_EQ(10, rootApzc->GetFrameMetrics().GetVisualScrollOffset().y);
  EXPECT_EQ(-10, middleApzc->GetFrameMetrics().GetVisualScrollOffset().y);
}
#endif

#ifndef MOZ_WIDGET_ANDROID  // Currently fails on Android
// Test that putting a second finger down on an APZC while a down-chain APZC
// is overscrolled doesn't result in being stuck in overscroll.
TEST_F(APZScrollHandoffTesterMock, StuckInOverscroll_Bug1073250) {
  // Enable overscrolling.
  SCOPED_GFX_PREF_BOOL("apz.overscroll.enabled", true);
  SCOPED_GFX_PREF_FLOAT("apz.fling_min_velocity_threshold", 0.0f);

  CreateScrollHandoffLayerTree1();

  TestAsyncPanZoomController* child = ApzcOf(layers[1]);

  // Pan, causing the parent APZC to overscroll.
  QueueMockHitResult(START_SCROLL_ID);
  Pan(manager, 10, 40, PanOptions::KeepFingerDown);
  EXPECT_FALSE(child->IsOverscrolled());
  EXPECT_TRUE(rootApzc->IsOverscrolled());

  // Put a second finger down.
  MultiTouchInput secondFingerDown =
      CreateMultiTouchInput(MultiTouchInput::MULTITOUCH_START, mcc->Time());
  // Use the same touch identifier for the first touch (0) as Pan(). (A bit
  // hacky.)
  secondFingerDown.mTouches.AppendElement(
      SingleTouchData(0, ScreenIntPoint(10, 40), ScreenSize(0, 0), 0, 0));
  secondFingerDown.mTouches.AppendElement(
      SingleTouchData(1, ScreenIntPoint(30, 20), ScreenSize(0, 0), 0, 0));
  manager->ReceiveInputEvent(secondFingerDown);

  // Release the fingers.
  MultiTouchInput fingersUp = secondFingerDown;
  fingersUp.mType = MultiTouchInput::MULTITOUCH_END;
  manager->ReceiveInputEvent(fingersUp);

  // Allow any animations to run their course.
  child->AdvanceAnimationsUntilEnd();
  rootApzc->AdvanceAnimationsUntilEnd();

  // Make sure nothing is overscrolled.
  EXPECT_FALSE(child->IsOverscrolled());
  EXPECT_FALSE(rootApzc->IsOverscrolled());
}
#endif

#ifndef MOZ_WIDGET_ANDROID  // Currently fails on Android
// This is almost exactly like StuckInOverscroll_Bug1073250, except the
// APZC receiving the input events for the first touch block is the child
// (and thus not the same APZC that overscrolls, which is the parent).
TEST_F(APZScrollHandoffTesterMock, StuckInOverscroll_Bug1231228) {
  // Enable overscrolling.
  SCOPED_GFX_PREF_BOOL("apz.overscroll.enabled", true);
  SCOPED_GFX_PREF_FLOAT("apz.fling_min_velocity_threshold", 0.0f);

  CreateScrollHandoffLayerTree1();

  TestAsyncPanZoomController* child = ApzcOf(layers[1]);

  // Pan, causing the parent APZC to overscroll.
  QueueMockHitResult(START_SCROLL_ID + 1);
  Pan(manager, 60, 90, PanOptions::KeepFingerDown);
  EXPECT_FALSE(child->IsOverscrolled());
  EXPECT_TRUE(rootApzc->IsOverscrolled());

  // Put a second finger down.
  MultiTouchInput secondFingerDown =
      CreateMultiTouchInput(MultiTouchInput::MULTITOUCH_START, mcc->Time());
  // Use the same touch identifier for the first touch (0) as Pan(). (A bit
  // hacky.)
  secondFingerDown.mTouches.AppendElement(
      SingleTouchData(0, ScreenIntPoint(10, 40), ScreenSize(0, 0), 0, 0));
  secondFingerDown.mTouches.AppendElement(
      SingleTouchData(1, ScreenIntPoint(30, 20), ScreenSize(0, 0), 0, 0));
  manager->ReceiveInputEvent(secondFingerDown);

  // Release the fingers.
  MultiTouchInput fingersUp = secondFingerDown;
  fingersUp.mType = MultiTouchInput::MULTITOUCH_END;
  manager->ReceiveInputEvent(fingersUp);

  // Allow any animations to run their course.
  child->AdvanceAnimationsUntilEnd();
  rootApzc->AdvanceAnimationsUntilEnd();

  // Make sure nothing is overscrolled.
  EXPECT_FALSE(child->IsOverscrolled());
  EXPECT_FALSE(rootApzc->IsOverscrolled());
}
#endif

#ifndef MOZ_WIDGET_ANDROID  // Currently fails on Android
TEST_F(APZScrollHandoffTester, StuckInOverscroll_Bug1240202a) {
  // Enable overscrolling.
  SCOPED_GFX_PREF_BOOL("apz.overscroll.enabled", true);

  CreateScrollHandoffLayerTree1();

  TestAsyncPanZoomController* child = ApzcOf(layers[1]);

  // Pan, causing the parent APZC to overscroll.
  Pan(manager, 60, 90, PanOptions::KeepFingerDown);
  EXPECT_FALSE(child->IsOverscrolled());
  EXPECT_TRUE(rootApzc->IsOverscrolled());

  // Lift the finger, triggering an overscroll animation
  // (but don't allow it to run).
  TouchUp(manager, ScreenIntPoint(10, 90), mcc->Time());

  // Put the finger down again, interrupting the animation
  // and entering the TOUCHING state.
  TouchDown(manager, ScreenIntPoint(10, 90), mcc->Time());

  // Lift the finger once again.
  TouchUp(manager, ScreenIntPoint(10, 90), mcc->Time());

  // Allow any animations to run their course.
  child->AdvanceAnimationsUntilEnd();
  rootApzc->AdvanceAnimationsUntilEnd();

  // Make sure nothing is overscrolled.
  EXPECT_FALSE(child->IsOverscrolled());
  EXPECT_FALSE(rootApzc->IsOverscrolled());
}
#endif

#ifndef MOZ_WIDGET_ANDROID  // Currently fails on Android
TEST_F(APZScrollHandoffTesterMock, StuckInOverscroll_Bug1240202b) {
  // Enable overscrolling.
  SCOPED_GFX_PREF_BOOL("apz.overscroll.enabled", true);

  CreateScrollHandoffLayerTree1();

  TestAsyncPanZoomController* child = ApzcOf(layers[1]);

  // Pan, causing the parent APZC to overscroll.
  QueueMockHitResult(START_SCROLL_ID + 1);
  Pan(manager, 60, 90, PanOptions::KeepFingerDown);
  EXPECT_FALSE(child->IsOverscrolled());
  EXPECT_TRUE(rootApzc->IsOverscrolled());

  // Lift the finger, triggering an overscroll animation
  // (but don't allow it to run).
  TouchUp(manager, ScreenIntPoint(10, 90), mcc->Time());

  // Put the finger down again, interrupting the animation
  // and entering the TOUCHING state.
  QueueMockHitResult(START_SCROLL_ID + 1);
  TouchDown(manager, ScreenIntPoint(10, 90), mcc->Time());

  // Put a second finger down. Since we're in the TOUCHING state,
  // the "are we panned into overscroll" check will fail and we
  // will not ignore the second finger, instead entering the
  // PINCHING state.
  MultiTouchInput secondFingerDown(MultiTouchInput::MULTITOUCH_START, 0,
                                   mcc->Time(), 0);
  // Use the same touch identifier for the first touch (0) as TouchDown(). (A
  // bit hacky.)
  secondFingerDown.mTouches.AppendElement(
      SingleTouchData(0, ScreenIntPoint(10, 90), ScreenSize(0, 0), 0, 0));
  secondFingerDown.mTouches.AppendElement(
      SingleTouchData(1, ScreenIntPoint(10, 80), ScreenSize(0, 0), 0, 0));
  QueueMockHitResult(START_SCROLL_ID + 1);
  QueueMockHitResult(START_SCROLL_ID + 1);
  manager->ReceiveInputEvent(secondFingerDown);

  // Release the fingers.
  MultiTouchInput fingersUp = secondFingerDown;
  fingersUp.mType = MultiTouchInput::MULTITOUCH_END;
  manager->ReceiveInputEvent(fingersUp);

  // Allow any animations to run their course.
  child->AdvanceAnimationsUntilEnd();
  rootApzc->AdvanceAnimationsUntilEnd();

  // Make sure nothing is overscrolled.
  EXPECT_FALSE(child->IsOverscrolled());
  EXPECT_FALSE(rootApzc->IsOverscrolled());
}
#endif

#ifndef MOZ_WIDGET_ANDROID  // Currently fails on Android
TEST_F(APZScrollHandoffTester, OpposingConstrainedAxes_Bug1201098) {
  // Enable overscrolling.
  SCOPED_GFX_PREF_BOOL("apz.overscroll.enabled", true);

  CreateScrollHandoffLayerTree4();

  RefPtr<TestAsyncPanZoomController> childApzc = ApzcOf(layers[1]);

  // Pan, causing the child APZC to overscroll.
  Pan(childApzc, 50, 60);

  // Make sure only the child is overscrolled.
  EXPECT_TRUE(childApzc->IsOverscrolled());
  EXPECT_FALSE(rootApzc->IsOverscrolled());
}
#endif

// Test the behaviour when flinging diagonally and there is room to scroll in
// one direction but not the other. In the direction where there is room to
// scroll, the fling should continue. In the direction where there is no room
// to scroll, the fling should stop without being handed off to the parent.
TEST_F(APZScrollHandoffTesterMock, DiagonalFlingNoHandoff) {
  SCOPED_GFX_PREF_FLOAT("apz.fling_min_velocity_threshold", 0.0f);

  CreateScrollHandoffLayerTree1();

  // Fling up and to the left. The child APZC has room to scroll up, but not
  // to the left.
  QueueMockHitResult(START_SCROLL_ID + 1);
  Pan(manager, ScreenIntPoint(90, 90), ScreenIntPoint(55, 55));

  RefPtr<TestAsyncPanZoomController> parent = ApzcOf(layers[0]);
  RefPtr<TestAsyncPanZoomController> child = ApzcOf(layers[1]);

  // Advance the child's fling animation once to give any potential handoff
  // a chance to occur.
  mcc->AdvanceByMillis(10);
  child->AdvanceAnimations(mcc->GetSampleTime());

  // Assert that the child is still flinging but the parent is not (no handoff
  // occurred).
  child->AssertStateIsFling();
  parent->AssertStateIsReset();
}

// Here we test that if two flings are happening simultaneously, overscroll
// is handed off correctly for each.
TEST_F(APZScrollHandoffTester, SimultaneousFlings) {
  SCOPED_GFX_PREF_BOOL("apz.allow_immediate_handoff", true);
  SCOPED_GFX_PREF_FLOAT("apz.fling_min_velocity_threshold", 0.0f);

  // Set up an initial APZC tree.
  CreateScrollHandoffLayerTree3();

  RefPtr<TestAsyncPanZoomController> parent1 = ApzcOf(layers[1]);
  RefPtr<TestAsyncPanZoomController> child1 = ApzcOf(layers[2]);
  RefPtr<TestAsyncPanZoomController> parent2 = ApzcOf(layers[3]);
  RefPtr<TestAsyncPanZoomController> child2 = ApzcOf(layers[4]);

  // Pan on the lower child.
  Pan(child2, 45, 5);

  // Pan on the upper child.
  Pan(child1, 95, 55);

  // Check that child1 and child2 are in a FLING state.
  child1->AssertStateIsFling();
  child2->AssertStateIsFling();

  // Advance the animations on child1 and child2 until their end.
  child1->AdvanceAnimationsUntilEnd();
  child2->AdvanceAnimationsUntilEnd();

  // Check that the flings have been handed off to the parents.
  child1->AssertStateIsReset();
  parent1->AssertStateIsFling();
  child2->AssertStateIsReset();
  parent2->AssertStateIsFling();
}

TEST_F(APZScrollHandoffTester, ImmediateHandoffDisallowed_Pan) {
  SCOPED_GFX_PREF_BOOL("apz.allow_immediate_handoff", false);

  CreateScrollHandoffLayerTree1();

  RefPtr<TestAsyncPanZoomController> parentApzc = ApzcOf(layers[0]);
  RefPtr<TestAsyncPanZoomController> childApzc = ApzcOf(layers[1]);

  // Pan on the child, enough to scroll it to its end and have scroll
  // left to hand off. Since immediate handoff is disallowed, we expect
  // the leftover scroll not to be handed off.
  Pan(childApzc, 60, 5);

  // Verify that the parent has not scrolled.
  EXPECT_EQ(50, childApzc->GetFrameMetrics().GetVisualScrollOffset().y);
  EXPECT_EQ(0, parentApzc->GetFrameMetrics().GetVisualScrollOffset().y);

  // Pan again on the child. This time, since the child was scrolled to
  // its end when the gesture began, we expect the scroll to be handed off.
  Pan(childApzc, 60, 50);

  // Verify that the parent scrolled.
  EXPECT_EQ(10, parentApzc->GetFrameMetrics().GetVisualScrollOffset().y);
}

TEST_F(APZScrollHandoffTester, ImmediateHandoffDisallowed_Fling) {
  SCOPED_GFX_PREF_BOOL("apz.allow_immediate_handoff", false);
  SCOPED_GFX_PREF_FLOAT("apz.fling_min_velocity_threshold", 0.0f);

  CreateScrollHandoffLayerTree1();

  RefPtr<TestAsyncPanZoomController> parentApzc = ApzcOf(layers[0]);
  RefPtr<TestAsyncPanZoomController> childApzc = ApzcOf(layers[1]);

  // Pan on the child, enough to get very close to the end, so that the
  // subsequent fling reaches the end and has leftover velocity to hand off.
  Pan(childApzc, 60, 2);

  // Allow the fling to run its course.
  childApzc->AdvanceAnimationsUntilEnd();
  parentApzc->AdvanceAnimationsUntilEnd();

  // Verify that the parent has not scrolled.
  // The first comparison needs to be an ASSERT_NEAR because the fling
  // computations are such that the final scroll position can be within
  // COORDINATE_EPSILON of the end rather than right at the end.
  ASSERT_NEAR(50, childApzc->GetFrameMetrics().GetVisualScrollOffset().y,
              COORDINATE_EPSILON);
  EXPECT_EQ(0, parentApzc->GetFrameMetrics().GetVisualScrollOffset().y);

  // Pan again on the child. This time, since the child was scrolled to
  // its end when the gesture began, we expect the scroll to be handed off.
  Pan(childApzc, 60, 40);

  // Allow the fling to run its course. The fling should also be handed off.
  childApzc->AdvanceAnimationsUntilEnd();
  parentApzc->AdvanceAnimationsUntilEnd();

  // Verify that the parent scrolled from the fling.
  EXPECT_GT(parentApzc->GetFrameMetrics().GetVisualScrollOffset().y, 10);
}

TEST_F(APZScrollHandoffTester, CrossApzcAxisLock_TouchAction) {
  TestCrossApzcAxisLock();
}

TEST_F(APZScrollHandoffTesterMock, WheelHandoffAfterDirectionReversal) {
  // Explicitly set the wheel transaction timeout pref because the test relies
  // on its value.
  SCOPED_GFX_PREF_INT("mousewheel.transaction.timeout", 1500);

  // Set up a basic scroll handoff layer tree.
  CreateScrollHandoffLayerTree1();

  rootApzc = ApzcOf(layers[0]);
  RefPtr<TestAsyncPanZoomController> childApzc = ApzcOf(layers[1]);
  FrameMetrics& rootMetrics = rootApzc->GetFrameMetrics();
  FrameMetrics& childMetrics = childApzc->GetFrameMetrics();
  CSSRect childScrollRange = childMetrics.CalculateScrollRange();

  EXPECT_EQ(0, rootMetrics.GetVisualScrollOffset().y);
  EXPECT_EQ(0, childMetrics.GetVisualScrollOffset().y);

  ScreenIntPoint cursorLocation(10, 60);  // positioned to hit the subframe
  ScreenPoint upwardDelta(0, -10);
  ScreenPoint downwardDelta(0, 10);

  // First wheel upwards. This will have no effect because we're already
  // scrolled to the top.
  QueueMockHitResult(START_SCROLL_ID + 1);
  Wheel(manager, cursorLocation, upwardDelta, mcc->Time());
  EXPECT_EQ(0, rootMetrics.GetVisualScrollOffset().y);
  EXPECT_EQ(0, childMetrics.GetVisualScrollOffset().y);

  // Now wheel downwards 6 times. This should scroll the child, and get it
  // to the bottom of its 50px scroll range.
  for (size_t i = 0; i < 6; ++i) {
    mcc->AdvanceByMillis(100);
    QueueMockHitResult(START_SCROLL_ID + 1);
    Wheel(manager, cursorLocation, downwardDelta, mcc->Time());
  }
  EXPECT_EQ(0, rootMetrics.GetVisualScrollOffset().y);
  EXPECT_EQ(childScrollRange.YMost(), childMetrics.GetVisualScrollOffset().y);

  // Wheel downwards an additional 16 times, with 100ms increments.
  // This should be enough to overcome the 1500ms wheel transaction timeout
  // and start scrolling the root.
  for (size_t i = 0; i < 16; ++i) {
    mcc->AdvanceByMillis(100);
    QueueMockHitResult(START_SCROLL_ID + 1);
    Wheel(manager, cursorLocation, downwardDelta, mcc->Time());
  }
  EXPECT_EQ(childScrollRange.YMost(), childMetrics.GetVisualScrollOffset().y);
  EXPECT_GT(rootMetrics.GetVisualScrollOffset().y, 0);
}

TEST_F(APZScrollHandoffTesterMock, WheelHandoffNonscrollable) {
  // Set up a basic scroll layer tree.
  CreateScrollHandoffLayerTree5();

  RefPtr<TestAsyncPanZoomController> childApzc = ApzcOf(layers[1]);
  FrameMetrics& childMetrics = childApzc->GetFrameMetrics();

  EXPECT_EQ(0, childMetrics.GetVisualScrollOffset().y);

  ScreenPoint downwardDelta(0, 10);
  // Positioned to hit the nonscrollable parent frame
  ScreenIntPoint nonscrollableLocation(40, 10);
  // Positioned to hit the scrollable subframe
  ScreenIntPoint scrollableLocation(40, 60);

  // Start the wheel transaction on a nonscrollable parent frame.
  QueueMockHitResult(START_SCROLL_ID);
  Wheel(manager, nonscrollableLocation, downwardDelta, mcc->Time());
  EXPECT_EQ(0, childMetrics.GetVisualScrollOffset().y);

  // Mouse moves to a scrollable subframe. This should end the transaction.
  mcc->AdvanceByMillis(100);
  MouseInput mouseInput(MouseInput::MOUSE_MOVE,
                        MouseInput::ButtonType::PRIMARY_BUTTON, 0, 0,
                        scrollableLocation, mcc->Time(), 0);
  WidgetMouseEvent mouseEvent =
      mouseInput.ToWidgetEvent<WidgetMouseEvent>(nullptr);
  QueueMockHitResult(START_SCROLL_ID + 1);
  ((APZInputBridge*)manager.get())->ReceiveInputEvent(mouseEvent);

  // Wheel downward should scroll the subframe.
  mcc->AdvanceByMillis(100);
  QueueMockHitResult(START_SCROLL_ID + 1);
  Wheel(manager, scrollableLocation, downwardDelta, mcc->Time());
  EXPECT_GT(childMetrics.GetVisualScrollOffset().y, 0);
}

TEST_F(APZScrollHandoffTesterMock, ChildCloseToEndOfScrollRange) {
  SCOPED_GFX_PREF_BOOL("apz.overscroll.enabled", true);

  CreateScrollHandoffLayerTree1();

  RefPtr<TestAsyncPanZoomController> childApzc = ApzcOf(layers[1]);

  FrameMetrics& rootMetrics = rootApzc->GetFrameMetrics();
  FrameMetrics& childMetrics = childApzc->GetFrameMetrics();

  // Zoom the page in by 3x. This needs to be reflected in the zoom level
  // and composition bounds of both APZCs.
  rootMetrics.SetZoom(CSSToParentLayerScale(3.0));
  rootMetrics.SetCompositionBounds(ParentLayerRect(0, 0, 300, 300));
  childMetrics.SetZoom(CSSToParentLayerScale(3.0));
  childMetrics.SetCompositionBounds(ParentLayerRect(0, 150, 300, 150));

  // Scroll the child APZC very close to the end of the scroll range.
  // The scroll offset is chosen such that in CSS pixels it has 0.01 pixels
  // room to scroll (less than COORDINATE_EPSILON = 0.02), but in ParentLayer
  // pixels it has 0.03 pixels room (greater than COORDINATE_EPSILON).
  childMetrics.SetVisualScrollOffset(CSSPoint(0, 49.99));

  EXPECT_FALSE(childApzc->IsOverscrolled());

  CSSPoint childBefore = childApzc->GetFrameMetrics().GetVisualScrollOffset();
  CSSPoint parentBefore = rootApzc->GetFrameMetrics().GetVisualScrollOffset();

  // Synthesize a pan gesture that tries to scroll the child further down.
  PanGesture(PanGestureInput::PANGESTURE_START, childApzc,
             ScreenIntPoint(10, 20), ScreenPoint(0, 40), mcc->Time());
  mcc->AdvanceByMillis(5);
  childApzc->AdvanceAnimations(mcc->GetSampleTime());

  PanGesture(PanGestureInput::PANGESTURE_END, childApzc, ScreenIntPoint(10, 21),
             ScreenPoint(0, 0), mcc->Time());

  CSSPoint childAfter = childApzc->GetFrameMetrics().GetVisualScrollOffset();
  CSSPoint parentAfter = rootApzc->GetFrameMetrics().GetVisualScrollOffset();

  bool childScrolled = (childBefore != childAfter);
  bool parentScrolled = (parentBefore != parentAfter);

  // Check that either the child or the parent scrolled.
  // (With the current implementation of comparing quantities to
  // COORDINATE_EPSILON in CSS units, it will be the parent, but the important
  // thing is that at least one of the child or parent scroll, i.e. we're not
  // stuck in a situation where no scroll offset is changing).
  EXPECT_TRUE(childScrolled || parentScrolled);
}

TEST_F(APZScrollHandoffTesterMock, ScrollJump_Bug1812227) {
  // Set the touch start tolerance to 10 pixels.
  SCOPED_GFX_PREF_FLOAT("apz.touch_start_tolerance", 10 / manager->GetDPI());

  CreateScrollHandoffLayerTree6();
  RefPtr<TestAsyncPanZoomController> childApzc = ApzcOf(layers[1]);

  // Throughout the test, we record the composited vertical scroll position
  // of the root scroll frame after every event or animation frame.
  std::vector<CSSCoord> rootYScrollPositions;
  auto SampleScrollPosition = [&]() {
    rootYScrollPositions.push_back(
        rootApzc->GetFrameMetrics().GetVisualScrollOffset().y);
  };

  // Helper function to perform a light upward flick (finger moves upward
  // ==> page will scroll downward).
  auto DoLightUpwardFlick = [&](bool aSimulatePaint = false) {
    // Don't use Pan() because it decreases the touch start tolerance
    // to almost zero, and here we want to test a codepath related to
    // the touch start tolerance.

    mcc->AdvanceByMillis(16);
    QueueMockHitResult(START_SCROLL_ID + 1);
    TouchDown(manager, {30, 30}, mcc->Time());
    SampleScrollPosition();

    // If aSimulatePaint=true, simulate a main-thread paint arriving in between
    // the touch-down (when the input block is created and the cached value
    // InputBlockState::mTransformToApzc is set) and the first touch-move which
    // overcomes the touch-tolerance threshold and synthesizes an additional
    // touch-move event at the threshold. The paint has the effect of resetting
    // transform to the APZC to zero. The bug occurs if the synthesized
    // touch-move event incorrectly uses the up-to-date transform to the APZC
    // rather than the value cached in InputBlockState::mTrasnformToApzc.
    if (aSimulatePaint) {
      // For simplicity, simulate a paint with the latest metrics stored on the
      // APZC. In practice, what would be painted would be from a frame or two
      // ago, but for reproducing this bug it does not matter.
      ModifyFrameMetrics(root, [&](ScrollMetadata&, FrameMetrics& aMetrics) {
        aMetrics = rootApzc->GetFrameMetrics();
      });
      ModifyFrameMetrics(layers[1],
                         [&](ScrollMetadata&, FrameMetrics& aMetrics) {
                           aMetrics = childApzc->GetFrameMetrics();
                         });
      UpdateHitTestingTree();
    }

    mcc->AdvanceByMillis(16);
    TouchMove(manager, {30, 10}, mcc->Time());
    SampleScrollPosition();

    mcc->AdvanceByMillis(16);
    TouchUp(manager, {30, 10}, mcc->Time());
    SampleScrollPosition();

    // The root APZC should be flinging.
    rootApzc->AssertStateIsFling();
  };

  // Peform one flick.
  DoLightUpwardFlick();

  // Sample the resulting fling partway. Testing shows it goes well past
  // y=100, so sample it until y=100.
  while (SampleAnimationsOnce() && rootYScrollPositions.back() < 100) {
    SampleScrollPosition();
  }

  // Perform a second flick, this time simulating a paint in between
  // the touch-start and touch-move.
  DoLightUpwardFlick(true);

  // Sample the fling until its completion.
  while (SampleAnimationsOnce()) {
    SampleScrollPosition();
  }

  // Check that the vertical root scroll position is non-decreasing
  // throughout the course of the test, i.e. it never jumps back up.
  for (size_t i = 0; i < (rootYScrollPositions.size() - 1); ++i) {
    CSSCoord before = rootYScrollPositions[i];
    CSSCoord after = rootYScrollPositions[i + 1];
    EXPECT_LE(before, after);
  }
}

TEST_F(APZCNestedFlingScrollHandoffTester, FlingInOppositeDirection) {
  RefPtr<TestAsyncPanZoomController> rootApzc = ApzcOf(root);

  ParentLayerPoint startRootOffset = rootApzc->GetCurrentAsyncScrollOffset(
      AsyncTransformConsumer::eForEventHandling);
  ExecuteDirectionChangingPanGesture(
      ScreenIntPoint{569, 710},
      {-11, -2, -107, -18, -148, -57, -133, -159, -21}, {11, 2, 42, 107, 148});
  // Let any animation start and run for a few frames
  ExecuteWait(TimeDuration::FromMilliseconds(154));
  auto vel = subframeApzc->GetVelocityVector();

  ParentLayerPoint endRootOffset = rootApzc->GetCurrentAsyncScrollOffset(
      AsyncTransformConsumer::eForEventHandling);

  EXPECT_EQ(vel.y, 0.0);
  rootApzc->AssertStateIsReset();
  subframeApzc->AssertStateIsReset();
  EXPECT_EQ(startRootOffset.y, endRootOffset.y);
}
