/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef WINDOWS_UI_ELEMENT_H_
#define WINDOWS_UI_ELEMENT_H_

#include <objbase.h>
#include <uiautomation.h>
#include <windows.h>

#include "mozilla/Maybe.h"
#include "mozilla/RefPtr.h"
#include "nsISupportsImpl.h"
#include "WindowsUIOverlayImage.h"

namespace mozilla {

/**
 * Wraps a UI Automation element and its containing window, exposing
 * higher-level operations.
 */
class WindowsUIElement final {
 public:
  NS_INLINE_DECL_THREADSAFE_REFCOUNTING(WindowsUIElement)

  /**
   * Constructor.
   *
   * @param aWindow Window containing the element.
   * @param aElement UI Automation element.
   */
  explicit WindowsUIElement(HWND aWindow,
                            RefPtr<IUIAutomationElement> aElement);

  /**
   * Returns whether the element is moving.
   *
   * @retval Some(true)  Whether the element is moving.
   * @retval Some(false) Whether the element is still.
   * @retval Nothing()   Whether the element is invalid.
   */
  mozilla::Maybe<bool> IsMoving();

  /**
   * Focus the element.
   */
  void Focus() const;

  /**
   * Creates an overlay image for the element.
   *
   * @param aDisplayMode Display mode, which can be static or animated.
   * @return Overlay image.
   */
  RefPtr<WindowsUIOverlayImage> CreateOverlayImage(
      WindowsUIOverlayImage::DisplayMode aDisplayMode) const;

  // Non-copyable and non-movable
  WindowsUIElement(const WindowsUIElement&) = delete;
  WindowsUIElement(WindowsUIElement&&) = delete;
  WindowsUIElement& operator=(const WindowsUIElement&) = delete;
  WindowsUIElement& operator=(WindowsUIElement&&) = delete;

 private:
  ~WindowsUIElement() = default;

  HWND mWindow;
  RefPtr<IUIAutomationElement> mElement;
  RECT mRect;
};

}  // namespace mozilla

#endif
