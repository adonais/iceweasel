/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "WindowsUIElement.h"

#include <objbase.h>
#include <uiautomation.h>
#include <windows.h>

#include "mozilla/Maybe.h"
#include "mozilla/RefPtr.h"
#include "WindowsUIOverlayImage.h"

namespace mozilla {

WindowsUIElement::WindowsUIElement(HWND aWindow,
                                   RefPtr<IUIAutomationElement> aElement)
    : mWindow{aWindow}, mElement{aElement}, mRect{} {}

static mozilla::Maybe<RECT> GetBoundingRectangle(
    RefPtr<IUIAutomationElement> aElement) {
  RECT rect{};
  HRESULT hr{aElement->get_CurrentBoundingRectangle(&rect)};
  if (FAILED(hr)) {
    return mozilla::Nothing();
  }

  if (rect.right < rect.left || rect.bottom < rect.top) {
    return mozilla::Nothing();
  }

  return mozilla::Some(rect);
}

mozilla::Maybe<bool> WindowsUIElement::IsMoving() {
  mozilla::Maybe<RECT> rect{GetBoundingRectangle(mElement)};
  if (!rect) {
    mRect = RECT{};
    return mozilla::Nothing();
  }

  if (::EqualRect(&mRect, rect.ptr())) {
    return mozilla::Some(false);
  }

  mRect = *rect;

  return mozilla::Some(true);
}

static bool EnableFocusIndicators(HWND aWindow) {
  if (!::IsWindow(aWindow)) {
    return false;
  }
  return ::PostMessageW(aWindow, WM_UPDATEUISTATE,
                        MAKEWPARAM(UIS_CLEAR, UISF_HIDEFOCUS | UISF_HIDEACCEL),
                        0);
}

void WindowsUIElement::Focus() const {
  if (EnableFocusIndicators(mWindow)) {
    mElement->SetFocus();
  }
}

RefPtr<WindowsUIOverlayImage> WindowsUIElement::CreateOverlayImage(
    WindowsUIOverlayImage::DisplayMode aDisplayMode) const {
  return WindowsUIOverlayImage::Create(mWindow, mElement, aDisplayMode);
}

}  // namespace mozilla
