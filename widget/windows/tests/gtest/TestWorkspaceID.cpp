/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "gtest/gtest.h"
#include "mozilla/SpinEventLoopUntil.h"
#include "nsWindow.h"

using namespace mozilla;
using namespace mozilla::widget;

// GetWindowDesktopId sometimes never returns (bug 2080829). The hung query is
// left blocked until the process exits, so the XPCOM shutdown at the end of
// the gtest run hangs if it ever waits for it.
TEST(WinWorkspaceID, HungQueryDoesNotBlockShutdown)
{
  AssertIsOnMainThread();
  if (nsWindow::sDesktopIdHangForTesting) {
    GTEST_SKIP() << "An earlier run left the desktop ID thread blocked";
  }

  RefPtr<nsWindow> window = MakeRefPtr<nsWindow>();
  ASSERT_TRUE(
      NS_SUCCEEDED(window->Create(nullptr, LayoutDeviceIntRect(), InitData())));

  window->AsyncUpdateWorkspaceID();
  ASSERT_TRUE(window->mDesktopIdUpdatePending);
  SpinEventLoopUntil("TEST(WinWorkspaceID, HungQueryDoesNotBlockShutdown)"_ns,
                     [&] {
                       AssertIsOnMainThread();
                       return !window->mDesktopIdUpdatePending;
                     });

  nsWindow::sDesktopIdHangForTesting = true;
  const uint32_t requestsInFlight = nsWindow::sDesktopIdRequestsInFlight;
  for (int i = 0; i < 10; i++) {
    window->AsyncUpdateWorkspaceID();
  }
  EXPECT_TRUE(window->mDesktopIdUpdatePending);
  EXPECT_EQ(nsWindow::sDesktopIdRequestsInFlight, requestsInFlight + 1);
}
