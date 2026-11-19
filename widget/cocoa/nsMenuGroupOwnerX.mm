/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsMenuGroupOwnerX.h"
#include "nsCocoaUtils.h"
#include "nsCocoaWindow.h"
#include "nsMenuBarX.h"
#include "nsMenuItemX.h"
#include "nsMenuUtilsX.h"
#include "nsMenuX.h"

#include "nsCOMPtr.h"
#include "nsObjCExceptions.h"
#include "nsString.h"
#include "nsThreadUtils.h"

#include "mozilla/AutoRestore.h"
#include "mozilla/dom/Document.h"
#include "mozilla/dom/Element.h"
#include "mozilla/dom/Event.h"
#include "mozilla/dom/XULCommandEvent.h"
#include "nsGkAtoms.h"
#include "nsIWidget.h"

#include "nsINode.h"

using namespace mozilla;

NS_IMPL_ISUPPORTS(nsMenuGroupOwnerX, nsIObserver, nsIMutationObserver,
                  nsIDOMEventListener)

nsMenuGroupOwnerX::nsMenuGroupOwnerX(mozilla::dom::Element* aElement,
                                     nsMenuBarX* aMenuBarIfMenuBar)
    : mContent(aElement), mMenuBar(aMenuBarIfMenuBar) {
  mRepresentedObject =
      [[MOZMenuItemRepresentedObject alloc] initWithMenuGroupOwner:this];
}

nsMenuGroupOwnerX::~nsMenuGroupOwnerX() {
  MOZ_ASSERT(mContentToObserverTable.Count() == 0,
             "have outstanding mutation observers!\n");
  if (mObservingMutationsOnRoot && mContent) {
    mContent->RemoveMutationObserver(this);
  }
  [mRepresentedObject setMenuGroupOwner:nullptr];
  [mRepresentedObject release];
}

static void SetOrUnsetAttr(dom::Element* aElement, nsAtom* aName,
                           const Maybe<nsString>& aValue) {
  if (aValue) {
    if (!aElement->AttrValueIs(kNameSpaceID_None, aName, *aValue,
                               eCaseMatters)) {
      aElement->SetAttr(kNameSpaceID_None, aName, *aValue, true,
                        dom::IsKnownNewAttr::No);
    }
  } else if (aElement->HasAttr(aName)) {
    aElement->UnsetAttr(kNameSpaceID_None, aName, true);
  }
}

// The attributes holding a key element's shortcut: the ones Gecko reads, and
// the copies that keep the built-in shortcut while an assignment from System
// Settings is written over them.
struct KeyElementAttributeNames {
  nsStaticAtom* mKey;
  nsStaticAtom* mKeyCode;
  nsStaticAtom* mModifiers;
  nsStaticAtom* mL10nId;
};
static const KeyElementAttributeNames kLiveAttributes = {
    nsGkAtoms::key, nsGkAtoms::keycode, nsGkAtoms::modifiers,
    nsGkAtoms::datal10nid};
static const KeyElementAttributeNames kBuiltInAttributes = {
    nsGkAtoms::databuiltinkey, nsGkAtoms::databuiltinkeycode,
    nsGkAtoms::databuiltinmodifiers, nsGkAtoms::databuiltinl10nid};

static nsMenuGroupOwnerX::KeyElementAttributes ReadKeyElementAttributes(
    dom::Element* aKeyElement, const KeyElementAttributeNames& aNames) {
  nsMenuGroupOwnerX::KeyElementAttributes attributes;
  auto read = [&](nsAtom* aName, Maybe<nsString>& aValue) {
    nsString value;
    if (aKeyElement->GetAttr(aName, value)) {
      aValue.emplace(std::move(value));
    }
  };
  read(aNames.mKey, attributes.mKey);
  read(aNames.mKeyCode, attributes.mKeyCode);
  read(aNames.mModifiers, attributes.mModifiers);
  read(aNames.mL10nId, attributes.mL10nId);
  return attributes;
}

static void WriteKeyElementAttributes(
    dom::Element* aKeyElement, const KeyElementAttributeNames& aNames,
    const nsMenuGroupOwnerX::KeyElementAttributes& aAttributes) {
  SetOrUnsetAttr(aKeyElement, aNames.mKey, aAttributes.mKey);
  SetOrUnsetAttr(aKeyElement, aNames.mKeyCode, aAttributes.mKeyCode);
  SetOrUnsetAttr(aKeyElement, aNames.mModifiers, aAttributes.mModifiers);
  // Fluent translates the element again when its id comes back, so this goes
  // last, once the attributes already hold the values it will write.
  SetOrUnsetAttr(aKeyElement, aNames.mL10nId, aAttributes.mL10nId);
}

// Expresses the key equivalent of aNativeMenuItem as XUL key element
// attributes. Returns false for a key that XUL cannot express.
static bool KeyElementAttributesForNativeMenuItem(
    NSMenuItem* aNativeMenuItem,
    nsMenuGroupOwnerX::KeyElementAttributes& aAttributes) {
  NSString* keyEquivalent = aNativeMenuItem.keyEquivalent;
  if (keyEquivalent.length != 1) {
    return false;
  }
  unichar character = [keyEquivalent characterAtIndex:0];
  NSEventModifierFlags modifierMask = aNativeMenuItem.keyEquivalentModifierMask;

  // AppKit represents function keys with characters from the Unicode private
  // use area, NSF1FunctionKey and friends.
  bool isFunctionKey = character >= 0xF700 && character <= 0xF8FF;
  if (character > ' ' && character != NSDeleteCharacter && !isFunctionKey) {
    NSString* lowercase = keyEquivalent.lowercaseString;
    if (![lowercase isEqualToString:keyEquivalent]) {
      // AppKit expresses Shift through an uppercase key equivalent.
      modifierMask |= NSEventModifierFlagShift;
    }
    aAttributes.mKey.emplace();
    nsCocoaUtils::GetStringForNSString(lowercase, *aAttributes.mKey);
  } else {
    nsAutoString keyCodeName;
    if (!nsCocoaUtils::GetGeckoKeyCodeNameForMacCharCode(character,
                                                         keyCodeName)) {
      return false;
    }
    aAttributes.mKeyCode.emplace(keyCodeName);
  }

  nsAutoString modifiers;
  auto append = [&](NSEventModifierFlags aFlag, const char* aName) {
    if (modifierMask & aFlag) {
      if (!modifiers.IsEmpty()) {
        modifiers.Append(',');
      }
      modifiers.AppendASCII(aName);
    }
  };
  append(NSEventModifierFlagCommand, "meta");
  append(NSEventModifierFlagOption, "alt");
  append(NSEventModifierFlagControl, "control");
  append(NSEventModifierFlagShift, "shift");
  if (!modifiers.IsEmpty()) {
    aAttributes.mModifiers.emplace(modifiers);
  }
  return true;
}

/* static */
void nsMenuGroupOwnerX::CopyUserKeyEquivalentToKeyElement(
    NSMenuItem* aNativeMenuItem, dom::Element* aMenuItemElement) {
  NS_OBJC_BEGIN_TRY_ABORT_BLOCK;

  // Writing the attributes below makes the menu item recompute its built-in
  // shortcut, and AppKit posts NSMenuDidChangeItemNotification for a native
  // item whose shortcut changes, which leads back here. The writes are ordered
  // so that the built-in shortcut reads the same at every step, but a copy
  // never runs inside another one.
  static bool sIsCopying = false;
  if (sIsCopying || !aNativeMenuItem || !aMenuItemElement) {
    return;
  }
  AutoRestore<bool> restoreIsCopying(sIsCopying);
  sIsCopying = true;
  dom::Document* document = aMenuItemElement->GetUncomposedDoc();
  if (!document) {
    return;
  }
  nsAutoString keyElementId;
  aMenuItemElement->GetAttr(nsGkAtoms::key, keyElementId);
  if (keyElementId.IsEmpty()) {
    return;
  }
  RefPtr<dom::Element> keyElement = document->GetElementById(keyElementId);
  if (!keyElement) {
    return;
  }

  bool isOverridden = keyElement->HasAttr(nsGkAtoms::datahassystemshortcut);
  if (aNativeMenuItem.userKeyEquivalent.length == 0) {
    if (isOverridden) {
      // Put the built-in shortcut back before dropping the marker, so that the
      // built-in layer reads the same throughout, then drop the copies.
      WriteKeyElementAttributes(
          keyElement, kLiveAttributes,
          ReadKeyElementAttributes(keyElement, kBuiltInAttributes));
      keyElement->UnsetAttr(kNameSpaceID_None, nsGkAtoms::datahassystemshortcut,
                            true);
      WriteKeyElementAttributes(keyElement, kBuiltInAttributes, {});
    }
    return;
  }

  KeyElementAttributes attributes;
  if (!KeyElementAttributesForNativeMenuItem(aNativeMenuItem, attributes)) {
    return;
  }
  if (!isOverridden) {
    // Copy the built-in shortcut aside and set the marker before writing the
    // assigned shortcut over it, so that the built-in layer reads the same
    // throughout.
    WriteKeyElementAttributes(
        keyElement, kBuiltInAttributes,
        ReadKeyElementAttributes(keyElement, kLiveAttributes));
    keyElement->SetAttr(kNameSpaceID_None, nsGkAtoms::datahassystemshortcut,
                        u"true"_ns, true, dom::IsKnownNewAttr::No);
  }
  WriteKeyElementAttributes(keyElement, kLiveAttributes, attributes);

  NS_OBJC_END_TRY_ABORT_BLOCK;
}

/* static */
nsMenuGroupOwnerX::KeyElementAttributes
nsMenuGroupOwnerX::BuiltInKeyElementAttributes(dom::Element* aKeyElement) {
  return ReadKeyElementAttributes(
      aKeyElement, aKeyElement->HasAttr(nsGkAtoms::datahassystemshortcut)
                       ? kBuiltInAttributes
                       : kLiveAttributes);
}

void nsMenuGroupOwnerX::InstallOrUninstallRootMutationObserver() {
  if (!mContent) {
    return;
  }

  // The mutation observer on mContent will be notified for all changes in
  // mContent's subtree.
  // We keep it registered as long as we have at least one content observer.
  bool shouldObserveMutationsOnRoot = !mContentToObserverTable.IsEmpty();
  if (!mObservingMutationsOnRoot && shouldObserveMutationsOnRoot) {
    mContent->AddMutationObserver(this);
    mObservingMutationsOnRoot = true;
  } else if (mObservingMutationsOnRoot && !shouldObserveMutationsOnRoot) {
    mContent->RemoveMutationObserver(this);
    mObservingMutationsOnRoot = false;
  }
}

//
// nsIMutationObserver
//

void nsMenuGroupOwnerX::CharacterDataWillChange(
    nsIContent* aContent, const CharacterDataChangeInfo&) {}

void nsMenuGroupOwnerX::CharacterDataChanged(nsIContent* aContent,
                                             const CharacterDataChangeInfo&) {}

void nsMenuGroupOwnerX::ContentAppended(nsIContent* aFirstNewContent,
                                        const ContentAppendInfo& aInfo) {
  nsCOMPtr<nsIMutationObserver> kungFuDeathGrip(this);
  for (nsIContent* cur = aFirstNewContent; cur; cur = cur->GetNextSibling()) {
    ContentInserted(cur, aInfo);
  }
}

void nsMenuGroupOwnerX::NodeWillBeDestroyed(nsINode* aNode) {}

void nsMenuGroupOwnerX::AttributeWillChange(dom::Element*, int32_t, nsAtom*,
                                            AttrModType) {}

void nsMenuGroupOwnerX::AttributeChanged(dom::Element* aElement, int32_t,
                                         nsAtom* aAttribute, AttrModType,
                                         const nsAttrValue*) {
  nsCOMPtr<nsIMutationObserver> kungFuDeathGrip(this);
  nsChangeObserver* obs = LookupContentChangeObserver(aElement);
  if (obs) {
    obs->ObserveAttributeChanged(aElement->OwnerDoc(), aElement, aAttribute);
  }
}

void nsMenuGroupOwnerX::ContentWillBeRemoved(nsIContent* aChild,
                                             const ContentRemoveInfo&) {
  nsIContent* container = aChild->GetParent();
  if (!container) {
    return;
  }

  nsCOMPtr<nsIMutationObserver> kungFuDeathGrip(this);
  nsChangeObserver* obs = LookupContentChangeObserver(container);
  if (obs) {
    obs->ObserveContentRemoved(aChild->OwnerDoc(), container, aChild);
  } else if (container != mContent) {
    // We do a lookup on the parent container in case things were removed
    // under a "menupopup" item. That is basically a wrapper for the contents
    // of a "menu" node.
    nsCOMPtr<nsIContent> parent = container->GetParent();
    if (parent) {
      obs = LookupContentChangeObserver(parent);
      if (obs) {
        obs->ObserveContentRemoved(aChild->OwnerDoc(), container, aChild);
      }
    }
  }
}

void nsMenuGroupOwnerX::ContentInserted(nsIContent* aChild,
                                        const ContentInsertInfo&) {
  nsIContent* container = aChild->GetParent();
  if (!container) {
    return;
  }

  nsCOMPtr<nsIMutationObserver> kungFuDeathGrip(this);
  nsChangeObserver* obs = LookupContentChangeObserver(container);
  if (obs) {
    obs->ObserveContentInserted(aChild->OwnerDoc(), container, aChild);
  } else if (container != mContent) {
    // We do a lookup on the parent container in case things were inserted
    // under a "menupopup" item. That is basically a wrapper for the contents
    // of a "menu" node.
    nsCOMPtr<nsIContent> parent = container->GetParent();
    if (parent) {
      obs = LookupContentChangeObserver(parent);
      if (obs) {
        obs->ObserveContentInserted(aChild->OwnerDoc(), container, aChild);
      }
    }
  }
}

void nsMenuGroupOwnerX::ParentChainChanged(nsIContent* aContent) {}

// For change management, we don't use a |nsSupportsHashtable| because
// we know that the lifetime of all these items is bounded by the
// lifetime of the menubar. No need to add any more strong refs to the
// picture because the containment hierarchy already uses strong refs.
void nsMenuGroupOwnerX::RegisterForContentChanges(
    nsIContent* aContent, nsChangeObserver* aMenuObject) {
  if (mContentToObserverTable.Contains(aContent)) {
    return;
  }

  mContentToObserverTable.InsertOrUpdate(aContent, aMenuObject);

  if (!mContent || !aContent->IsInclusiveDescendantOf(mContent)) {
    // If aContent is outside mContent's subtree, for example if it's a
    // <command> element, we need to add a mutation observer.
    // Anything in mContent's subtree is already covered by the mutation
    // observer we add with InstallOrUninstallRootMutationObserver().
    aContent->AddMutationObserver(this);
  }

  InstallOrUninstallRootMutationObserver();
}

void nsMenuGroupOwnerX::UnregisterForContentChanges(nsIContent* aContent) {
  if (!mContentToObserverTable.Contains(aContent)) {
    return;
  }

  mContentToObserverTable.Remove(aContent);

  if (!mContent || !aContent->IsInclusiveDescendantOf(mContent)) {
    // Remove the mutation observer that was added in RegisterForContentChanges.
    aContent->RemoveMutationObserver(this);
  }

  InstallOrUninstallRootMutationObserver();
}

void nsMenuGroupOwnerX::RegisterForLocaleChanges() {
  nsCOMPtr<nsIObserverService> obs = mozilla::services::GetObserverService();
  if (obs) {
    obs->AddObserver(this, "intl:app-locales-changed", false);
  }
}

void nsMenuGroupOwnerX::UnregisterForLocaleChanges() {
  nsCOMPtr<nsIObserverService> obs = mozilla::services::GetObserverService();
  if (obs) {
    obs->RemoveObserver(this, "intl:app-locales-changed");
  }
}

void nsMenuGroupOwnerX::RegisterForKeyCommands() {
  if (mContent) {
    mContent->OwnerDoc()->AddSystemEventListener(u"command"_ns, this, true,
                                                 false);
  }
}

void nsMenuGroupOwnerX::UnregisterForKeyCommands() {
  if (mContent) {
    mContent->OwnerDoc()->RemoveSystemEventListener(u"command"_ns, this, true);
  }
}

void nsMenuGroupOwnerX::RegisterKeyElement(dom::Element* aKeyElement,
                                           nsMenuItemX* aMenuItem) {
  mKeyElementToMenuItemTable.InsertOrUpdate(aKeyElement, aMenuItem);
}

void nsMenuGroupOwnerX::UnregisterKeyElement(dom::Element* aKeyElement,
                                             nsMenuItemX* aMenuItem) {
  if (auto entry = mKeyElementToMenuItemTable.Lookup(aKeyElement)) {
    if (entry.Data() == aMenuItem) {
      entry.Remove();
    }
  }
}

// A command run through a XUL key element reaches the document either as the
// key element's own command event, or, when the key element names a command
// element, as the command element's event whose source event chain starts at
// the key element.
NS_IMETHODIMP
nsMenuGroupOwnerX::HandleEvent(dom::Event* aEvent) {
  RefPtr<dom::Element> keyElement;
  RefPtr<dom::Event> event = aEvent;
  while (event) {
    dom::Element* target =
        dom::Element::FromEventTargetOrNull(event->GetOriginalTarget());
    if (target && target->IsXULElement(nsGkAtoms::key)) {
      keyElement = target;
      break;
    }
    dom::XULCommandEvent* commandEvent = event->AsXULCommandEvent();
    event = commandEvent ? commandEvent->GetSourceEvent() : nullptr;
  }
  if (!keyElement) {
    return NS_OK;
  }

  if (nsMenuItemX* menuItem = mKeyElementToMenuItemTable.Get(keyElement)) {
    nsMenuBarX::HighlightNativeMenuItem(menuItem->NativeNSMenuItem());
  } else if (NSMenuItem* appMenuItem =
                 nsMenuBarX::ApplicationMenuItemForKeyElement(keyElement)) {
    nsMenuBarX::HighlightNativeMenuItem(appMenuItem);
  }
  return NS_OK;
}

NS_IMETHODIMP
nsMenuGroupOwnerX::Observe(nsISupports* aSubject, const char* aTopic,
                           const char16_t* aData) {
  if (mMenuBar && !strcmp(aTopic, "intl:app-locales-changed")) {
    // Rebuild the menu with the new locale strings.
    mMenuBar->SetNeedsRebuild();
  }
  return NS_OK;
}

nsChangeObserver* nsMenuGroupOwnerX::LookupContentChangeObserver(
    nsIContent* aContent) {
  nsChangeObserver* result;
  if (mContentToObserverTable.Get(aContent, &result)) {
    return result;
  }
  return nullptr;
}

// Given a menu item, creates a unique 4-character command ID and
// maps it to the item. Returns the id for use by the client.
uint32_t nsMenuGroupOwnerX::RegisterForCommand(nsMenuItemX* aMenuItem) {
  // no real need to check for uniqueness. We always start afresh with each
  // window at 1. Even if we did get close to the reserved Apple command id's,
  // those don't start until at least '    ', which is integer 538976288. If
  // we have that many menu items in one window, I think we have other
  // problems.

  // make id unique
  ++mCurrentCommandID;

  mCommandToMenuObjectTable.InsertOrUpdate(mCurrentCommandID, aMenuItem);

  return mCurrentCommandID;
}

// Removes the mapping between the given 4-character command ID
// and its associated menu item.
void nsMenuGroupOwnerX::UnregisterCommand(uint32_t aCommandID) {
  mCommandToMenuObjectTable.Remove(aCommandID);
}

nsMenuItemX* nsMenuGroupOwnerX::GetMenuItemForCommandID(uint32_t aCommandID) {
  nsMenuItemX* result;
  if (mCommandToMenuObjectTable.Get(aCommandID, &result)) {
    return result;
  }
  return nullptr;
}

@implementation MOZMenuItemRepresentedObject {
  nsMenuGroupOwnerX*
      mMenuGroupOwner;  // weak, cleared by nsMenuGroupOwnerX's destructor
}

- (id)initWithMenuGroupOwner:(nsMenuGroupOwnerX*)aMenuGroupOwner {
  self = [super init];
  if (!self) {
    return nil;
  }
  mMenuGroupOwner = aMenuGroupOwner;
  return self;
}

- (void)setMenuGroupOwner:(nsMenuGroupOwnerX*)aMenuGroupOwner {
  mMenuGroupOwner = aMenuGroupOwner;
}

- (nsMenuGroupOwnerX*)menuGroupOwner {
  return mMenuGroupOwner;
}

@end
