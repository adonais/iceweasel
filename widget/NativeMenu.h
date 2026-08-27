/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_widget_NativeMenu_h
#define mozilla_widget_NativeMenu_h

#include "Units.h"
#include "nsISupportsImpl.h"

class nsIURI;
class nsIFrame;
class nsMenuPopupFrame;
class nsPresContext;

namespace mozilla {
using Modifiers = uint16_t;
class ErrorResult;
class ComputedStyle;

namespace dom {
class Element;
}

namespace widget {

struct NativeMenuIcon {
  RefPtr<nsIURI> mURI;
  RefPtr<const ComputedStyle> mStyle;

  explicit operator bool() const { return !!mURI; }
};

class NativeMenu {
 public:
  NS_INLINE_DECL_REFCOUNTING(NativeMenu)

  // Given a <menu> or <menuitem> element, get the relevant icon's URI.
  static NativeMenuIcon GetIcon(dom::Element&);

  // Show this menu anchored to the specified rect and position.
  // This call assumes that the popupshowing event for the root popup has
  // already been sent and "approved", i.e. preventDefault() was not called.
  virtual void ShowMenuAnchored(nsIFrame* aClickedFrame,
                                const nsMenuPopupFrame* aPopupFrame) = 0;

  // Show this menu at the specified position.
  // This call assumes that the popupshowing event for the root popup has
  // already been sent and "approved", i.e. preventDefault() was not called.
  virtual void ShowMenuAtPosition(nsIFrame* aClickedFrame,
                                  const CSSIntPoint& aPosition,
                                  bool aIsContextMenu) = 0;

  // Close the menu and synchronously fire popuphiding / popuphidden events.
  // Returns false if the menu wasn't open.
  virtual bool Close() = 0;

  // Activate aItemElement and close this menu.
  // aItemElement can be nested arbitrarily deeply within submenus inside this
  // menu. Only works while this menu (and any submenus on the path to the
  // item) is open, otherwise aRv reports an error.
  virtual void ActivateItem(dom::Element* aItemElement, Modifiers aModifiers,
                            int16_t aButton, ErrorResult& aRv) = 0;

  // Open, or simulate the opening of, a submenu.
  // aMenuElement can be nested arbitrarily deeply within submenus inside this
  // menu. Only works while this menu (and any submenus on the path to the
  // submenu) is open.
  virtual void OpenSubmenu(dom::Element* aMenuElement) = 0;

  // Closing, or simulate the closing of, a submenu.
  // aMenuElement can be nested arbitrarily deeply within submenus inside this
  // menu. Only works while this menu (and any submenus on the path to the
  // submenu) is open.
  virtual void CloseSubmenu(dom::Element* aMenuElement) = 0;

  // Return this NativeMenu's DOM element.
  virtual RefPtr<dom::Element> Element() = 0;

  // Notifications to the popup manager, if this menu is the one it is
  // currently showing.
  void OnOpened();
  void OnClosed();
  void OnSubMenuWillOpen(dom::Element* aPopupElement);
  void OnSubMenuDidOpen(dom::Element* aPopupElement);
  void OnSubMenuClosed(dom::Element* aPopupElement);
  void OnWillActivateItem(dom::Element* aMenuItemElement);

 protected:
  virtual ~NativeMenu() = default;
};

}  // namespace widget
}  // namespace mozilla

#endif  // mozilla_widget_NativeMenu_h
