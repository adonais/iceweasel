/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#import <Cocoa/Cocoa.h>

#include "Units.h"
#include "gtest/gtest.h"
#include "mozilla/RefPtr.h"
#include "nsCocoaWindow.h"

using namespace mozilla;
using namespace mozilla::widget;

// Whether the Picture-in-Picture player is composited onto another
// application's native-fullscreen Space is decided entirely by three
// properties of its NSWindow, and all three are necessary (bug 1688932):
//
//   1. NSWindowStyleMaskNonactivatingPanel is set, which is what lets the
//      window take clicks without activating Firefox and pulling the user off
//      the Space they are looking at. AppKit strips that bit from any window
//      whose class is not an NSPanel, so seeing it on a BaseWindow is also the
//      assertion that the +_validateStyleMask: override works,
//   2. the collection behaviour includes FullScreenAuxiliary, which is what
//      allows a window onto another application's fullscreen Space, and
//   3. it does NOT include FullScreenPrimary. A FullScreenPrimary window is
//      given a Space of its own instead of being composited onto someone
//      else's.
//
// The Space assignment itself cannot be observed from the test harness: the
// mochitest harness injects events into the widget rather than going through
// the window server, and native Space transitions do not complete without a
// focused display session. These tests therefore assert the configuration that
// the behaviour follows from, which is what a regression would change.
namespace {

static RefPtr<nsCocoaWindow> CreateWindow(PiPType aPiPType) {
  RefPtr<nsCocoaWindow> window = new nsCocoaWindow();

  InitData initData;
  // Mirrors how PictureInPicture.sys.mjs opens the player: a resizable,
  // always-on-top chrome dialog. nsAppShellService turns the CHROME_MEDIA_PIP
  // flag it passes into PiPType::MediaPiP.
  initData.mWindowType = WindowType::Dialog;
  initData.mAlwaysOnTop = true;
  initData.mResizable = true;
  initData.mPiPType = aPiPType;

  DesktopIntRect rect(0, 0, 300, 300);
  if (NS_FAILED(window->Create(nullptr, rect, initData))) {
    return nullptr;
  }
  return window;
}

TEST(PiPWindowSpaceBehavior, PlayerIsConfiguredToFloatOverFullscreenSpaces)
{
  RefPtr<nsCocoaWindow> window = CreateWindow(PiPType::MediaPiP);
  ASSERT_NE(nullptr, window);
  NSWindow* native = window->GetCocoaWindow();
  ASSERT_NE(nullptr, native);

  EXPECT_TRUE([native isKindOfClass:[BaseWindow class]])
      << "the player is an ordinary BaseWindow, not a panel";
  EXPECT_TRUE(native.styleMask & NSWindowStyleMaskNonactivatingPanel)
      << "without the nonactivating bit the window server does not composite "
         "the player onto another application's fullscreen Space";
  EXPECT_TRUE(native.collectionBehavior &
              NSWindowCollectionBehaviorFullScreenAuxiliary)
      << "the player has to be Auxiliary to appear on someone else's Space";
  EXPECT_FALSE(native.collectionBehavior &
               NSWindowCollectionBehaviorFullScreenPrimary)
      << "FullScreenPrimary would give the player a Space of its own instead";

  // Both of these regress silently: the first shows up only as a debug
  // assertion in DestroyNativeWindow, the second as the player vanishing
  // whenever Firefox deactivates, which is exactly the state it is in while
  // floating over another application's Space.
  EXPECT_TRUE(native.releasedWhenClosed)
      << "DestroyNativeWindow relies on -close releasing the window";
  EXPECT_FALSE(native.hidesOnDeactivate)
      << "the player must stay visible while another application is active";

  window->Destroy();
}

TEST(PiPWindowSpaceBehavior, OrdinaryWindowsAreUnchanged)
{
  // The nonactivating bit is confined to the player; every other window is
  // unchanged by bug 1688932.
  RefPtr<nsCocoaWindow> window = CreateWindow(PiPType::NoPiP);
  ASSERT_NE(nullptr, window);
  NSWindow* native = window->GetCocoaWindow();
  ASSERT_NE(nullptr, native);

  EXPECT_FALSE(native.styleMask & NSWindowStyleMaskNonactivatingPanel)
      << "only the player should be nonactivating";

  window->Destroy();
}

}  // namespace
