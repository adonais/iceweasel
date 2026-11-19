/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "gtest/gtest.h"
#include "nsWindowTaskbarConcealer.h"

class TaskbarConcealerTest : public ::testing::Test {
 protected:
  using WindowInfo = nsWindow::TaskbarConcealer::WindowInfo;

  static nsTArray<HWND> GetWindowsHidingTaskbar(
      const nsTArray<WindowInfo>& aWindows) {
    return nsWindow::TaskbarConcealer::GetWindowsHidingTaskbar(aWindows);
  }

  // The handles are never dereferenced, so arbitrary distinct values suffice.
  static HWND FakeHwnd(uintptr_t aId) { return reinterpret_cast<HWND>(aId); }
  static HMONITOR FakeMonitor(uintptr_t aId) {
    return reinterpret_cast<HMONITOR>(aId);
  }

  static WindowInfo NormalWin(uintptr_t aWindow, uintptr_t aMonitor = 1) {
    return {FakeHwnd(aWindow), FakeMonitor(aMonitor), false, false};
  }

  static WindowInfo FullscreenWin(uintptr_t aWindow, uintptr_t aMonitor = 1) {
    return {FakeHwnd(aWindow), FakeMonitor(aMonitor), true, false};
  }

  static WindowInfo AlwaysOnTopWin(uintptr_t aWindow, uintptr_t aMonitor = 1) {
    return {FakeHwnd(aWindow), FakeMonitor(aMonitor), false, true};
  }

  static WindowInfo FullscreenAlwaysOnTopWin(uintptr_t aWindow,
                                             uintptr_t aMonitor = 1) {
    return {FakeHwnd(aWindow), FakeMonitor(aMonitor), true, true};
  }

  static nsTArray<HWND> Hwnds(std::initializer_list<uintptr_t> aIds) {
    nsTArray<HWND> windows;
    for (uintptr_t id : aIds) {
      windows.AppendElement(FakeHwnd(id));
    }
    return windows;
  }
};

TEST_F(TaskbarConcealerTest, NoWindows) {
  EXPECT_EQ(GetWindowsHidingTaskbar({}), Hwnds({}));
}

TEST_F(TaskbarConcealerTest, SingleNormalWindow) {
  EXPECT_EQ(GetWindowsHidingTaskbar({NormalWin(1)}), Hwnds({}));
}

TEST_F(TaskbarConcealerTest, SingleFullscreenWindow) {
  EXPECT_EQ(GetWindowsHidingTaskbar({FullscreenWin(1)}), Hwnds({1}));
}

TEST_F(TaskbarConcealerTest, FullscreenAboveNormal) {
  EXPECT_EQ(GetWindowsHidingTaskbar({FullscreenWin(1), NormalWin(2)}),
            Hwnds({1}));
}

// Bug 2064173: a normal window brought in front of a fullscreen window should
// reveal the taskbar.
TEST_F(TaskbarConcealerTest, NormalAboveFullscreen) {
  EXPECT_EQ(GetWindowsHidingTaskbar({NormalWin(1), FullscreenWin(2)}),
            Hwnds({}));
}

// Bug 2085170 and bug 2065905: only the uppermost of several fullscreen
// windows should hide the taskbar.
TEST_F(TaskbarConcealerTest, TwoFullscreenWindows) {
  EXPECT_EQ(GetWindowsHidingTaskbar({FullscreenWin(1), FullscreenWin(2)}),
            Hwnds({1}));
}

// Bug 2048501: a PIP window above a fullscreen window should not stop it
// from hiding the taskbar.
TEST_F(TaskbarConcealerTest, AlwaysOnTopAboveFullscreen) {
  EXPECT_EQ(GetWindowsHidingTaskbar({AlwaysOnTopWin(1), FullscreenWin(2)}),
            Hwnds({2}));
}

TEST_F(TaskbarConcealerTest, AlwaysOnTopAboveNormalAboveFullscreen) {
  EXPECT_EQ(GetWindowsHidingTaskbar(
                {AlwaysOnTopWin(1), NormalWin(2), FullscreenWin(3)}),
            Hwnds({}));
}

TEST_F(TaskbarConcealerTest, FullscreenAlwaysOnTopWindow) {
  EXPECT_EQ(
      GetWindowsHidingTaskbar({FullscreenAlwaysOnTopWin(1), FullscreenWin(2)}),
      Hwnds({1}));
}

TEST_F(TaskbarConcealerTest, OnlyAlwaysOnTopWindows) {
  EXPECT_EQ(GetWindowsHidingTaskbar({AlwaysOnTopWin(1), AlwaysOnTopWin(2)}),
            Hwnds({}));
}

TEST_F(TaskbarConcealerTest, FullscreenOnEachMonitor) {
  EXPECT_EQ(GetWindowsHidingTaskbar({FullscreenWin(1, 1), FullscreenWin(2, 2)}),
            Hwnds({1, 2}));
}

TEST_F(TaskbarConcealerTest, MonitorsAreIndependent) {
  EXPECT_EQ(GetWindowsHidingTaskbar({NormalWin(1, 1), FullscreenWin(2, 2),
                                     FullscreenWin(3, 1), NormalWin(4, 2)}),
            Hwnds({2}));
}
