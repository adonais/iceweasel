/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef nsMenuGroupOwnerX_h_
#define nsMenuGroupOwnerX_h_

#import <Cocoa/Cocoa.h>

#include "mozilla/Maybe.h"
#include "mozilla/WeakPtr.h"

#include "nsHashKeys.h"
#include "nsIDOMEventListener.h"
#include "nsIObserver.h"
#include "nsMenuBarX.h"
#include "nsString.h"
#include "nsStubMutationObserver.h"
#include "nsTHashMap.h"

class nsMenuItemX;
class nsChangeObserver;
class nsIWidget;
class nsIContent;

@class MOZMenuItemRepresentedObject;

// Fixed command IDs that work even without a JS listener, for our fallback menu
// bar. Dynamic command IDs start counting from eCommand_ID_Last.
enum {
  eCommand_ID_About = 1,
  eCommand_ID_Prefs = 2,
  eCommand_ID_Quit = 3,
  eCommand_ID_HideApp = 4,
  eCommand_ID_HideOthers = 5,
  eCommand_ID_ShowAll = 6,
  eCommand_ID_Update = 7,
  eCommand_ID_TouchBar = 8,
  eCommand_ID_Account = 9,
  eCommand_ID_SetAsDefault = 10,
  eCommand_ID_ReferralsPage = 11,
  eCommand_ID_Last = 12
};

// The menu group owner observes DOM mutations, notifies registered
// nsChangeObservers, and manages command registration. There is one owner per
// menubar, and one per standalone native menu.
class nsMenuGroupOwnerX : public nsMultiMutationObserver,
                          public nsIObserver,
                          public nsIDOMEventListener {
 public:
  // Both parameters can be null.
  nsMenuGroupOwnerX(mozilla::dom::Element* aElement,
                    nsMenuBarX* aMenuBarIfMenuBar);

  void RegisterForContentChanges(nsIContent* aContent,
                                 nsChangeObserver* aMenuObject);
  void UnregisterForContentChanges(nsIContent* aContent);
  uint32_t RegisterForCommand(nsMenuItemX* aMenuItem);
  void UnregisterCommand(uint32_t aCommandID);
  nsMenuItemX* GetMenuItemForCommandID(uint32_t aCommandID);

  void RegisterForLocaleChanges();
  void UnregisterForLocaleChanges();

  // Listen for XUL key elements of the document running their command, to
  // highlight the menu item that shows the shortcut.
  void RegisterForKeyCommands();
  void UnregisterForKeyCommands();

  // Remember that aMenuItem shows the shortcut of aKeyElement. aMenuItem must
  // unregister before it goes away.
  void RegisterKeyElement(mozilla::dom::Element* aKeyElement,
                          nsMenuItemX* aMenuItem);
  void UnregisterKeyElement(mozilla::dom::Element* aKeyElement,
                            nsMenuItemX* aMenuItem);

  // The representedObject that's used for all menu items under this menu group
  // owner.
  MOZMenuItemRepresentedObject* GetRepresentedObject() {
    return mRepresentedObject;
  }

  // If this is the group owner for a menubar, return the menubar, otherwise
  // nullptr.
  nsMenuBarX* GetMenuBar() { return mMenuBar.get(); }

  // The attributes of a XUL key element that define its shortcut.
  struct KeyElementAttributes {
    mozilla::Maybe<nsString> mKey;
    mozilla::Maybe<nsString> mKeyCode;
    mozilla::Maybe<nsString> mModifiers;
    mozilla::Maybe<nsString> mL10nId;
  };

  // Makes the key element of aMenuItemElement carry the shortcut that
  // aNativeMenuItem has. When the user assigned a shortcut to the item in
  // System Settings, AppKit reports it as the item's key equivalent, and the
  // key element is rewritten to match: the built-in shortcut stops working in
  // Gecko and the front-end displays the assigned one. The element keeps its
  // own attributes in data-builtin-* and is marked with
  // data-has-system-shortcut while this lasts, and gets them back when the
  // assignment is removed.
  static void CopyUserKeyEquivalentToKeyElement(
      NSMenuItem* aNativeMenuItem, mozilla::dom::Element* aMenuItemElement);

  // The shortcut aKeyElement defines on its own, underneath a shortcut
  // assigned in System Settings that CopyUserKeyEquivalentToKeyElement wrote
  // over it.
  static KeyElementAttributes BuiltInKeyElementAttributes(
      mozilla::dom::Element* aKeyElement);

  NS_DECL_ISUPPORTS
  NS_DECL_NSIOBSERVER
  NS_DECL_NSIMUTATIONOBSERVER
  NS_DECL_NSIDOMEVENTLISTENER

 protected:
  virtual ~nsMenuGroupOwnerX();

  nsChangeObserver* LookupContentChangeObserver(nsIContent* aContent);

  void InstallOrUninstallRootMutationObserver();

  const RefPtr<nsIContent> mContent;

  // Unique command id (per menu-bar) to give to next item that asks.
  uint32_t mCurrentCommandID = eCommand_ID_Last;

  // stores observers for content change notification
  nsTHashMap<nsPtrHashKey<nsIContent>, nsChangeObserver*>
      mContentToObserverTable;

  // stores mapping of command IDs to menu objects
  nsTHashMap<nsUint32HashKey, nsMenuItemX*> mCommandToMenuObjectTable;

  // The menu item that shows each key element's shortcut.
  nsTHashMap<nsRefPtrHashKey<mozilla::dom::Element>, nsMenuItemX*>
      mKeyElementToMenuItemTable;

  MOZMenuItemRepresentedObject* mRepresentedObject = nil;  // [strong]
  mozilla::WeakPtr<nsMenuBarX> mMenuBar;

  bool mObservingMutationsOnRoot = false;
};

@interface MOZMenuItemRepresentedObject : NSObject
- (id)initWithMenuGroupOwner:(nsMenuGroupOwnerX*)aMenuGroupOwner;
- (void)setMenuGroupOwner:(nsMenuGroupOwnerX*)aMenuGroupOwner;
- (nsMenuGroupOwnerX*)menuGroupOwner;
@end

#endif  // nsMenuGroupOwner_h_
