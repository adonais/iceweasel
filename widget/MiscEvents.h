/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_MiscEvents_h_
#define mozilla_MiscEvents_h_

#include <stdint.h>

#include "mozilla/BasicEvents.h"
#include "mozilla/Maybe.h"
#include "nsAtom.h"
#include "nsCOMPtr.h"
#include "nsGkAtoms.h"
#include "nsITransferable.h"
#include "nsString.h"

namespace mozilla {

namespace dom {
class PBrowserParent;
class PBrowserChild;
}  // namespace dom

/******************************************************************************
 * mozilla::WidgetContentCommandEvent
 ******************************************************************************/

class WidgetContentCommandEvent final : public WidgetGUIEvent {
 public:
  NS_DEFINE_AS_EVENT_OVERRIDE(Widget, ContentCommandEvent);

  WidgetContentCommandEvent(
      bool aIsTrusted, EventMessage aMessage, nsIWidget* aWidget,
      OnlyEnabledCheck aOnlyEnabledCheck = OnlyEnabledCheck::No)
      : WidgetGUIEvent(aIsTrusted, aMessage, aWidget,
                       eContentCommandEventClass),
        mOnlyEnabledCheck(aOnlyEnabledCheck),
        mSucceeded(false),
        mIsEnabled(false) {}

  NS_DEFINE_VIRTUAL_DESTRUCTOR_CHECKING_CLASS_VALUE(WidgetContentCommandEvent,
                                                    eContentCommandEventClass,
                                                    eGUIEventClass)

  virtual WidgetEvent* Duplicate() const override {
    // This event isn't an internal event of any DOM event.
    NS_ASSERTION(!IsAllowedToDispatchDOMEvent(),
                 "WidgetQueryContentEvent needs to support Duplicate()");
    MOZ_CRASH("WidgetQueryContentEvent doesn't support Duplicate()");
    return nullptr;
  }

  [[nodiscard]] bool ShouldCheckEnabledOnly() const {
    return mOnlyEnabledCheck == OnlyEnabledCheck::Yes;
  }

  /**
   * Return true if this event is dispatched by valid dispatcher. Some events
   * which are related to text editing must be dispatched by
   * TextEventDispatcher. So, if such events are dispatched by nsIWidget
   * directly, this returns false.
   */
  [[nodiscard]] bool DispatchedByValidDispatcher() const {
    // If this event is dispatched in another process, TextEventDispatcher in
    // this process does not need to get involved.
    if (mFlags.CameFromAnotherProcess()) {
      return true;
    }
    switch (mMessage) {
      case eContentCommandCut:
      case eContentCommandCopy:
      case eContentCommandPaste:
      case eContentCommandDelete:
      case eContentCommandUndo:
      case eContentCommandRedo:
      case eContentCommandInsertText:
      case eContentCommandReplaceText:
      case eContentCommandPasteTransferable:
        // The commands which related to text editing must be dispatched by
        // TextEventDispatcher.
        return mDispatchedByTextEventDispatcher;
      default:
        // The other events can be dispatched by widget directly.
        return true;
    }
  }

  // eContentCommandInsertText and eContentCommandReplaceText
  mozilla::Maybe<nsString> mString;  // [in]

  // eContentCommandPasteTransferable
  nsCOMPtr<nsITransferable> mTransferable;  // [in]

  // eContentCommandScroll
  // for mScroll.mUnit
  enum { eCmdScrollUnit_Line, eCmdScrollUnit_Page, eCmdScrollUnit_Whole };

  struct ScrollInfo {
    ScrollInfo()
        : mAmount(0), mUnit(eCmdScrollUnit_Line), mIsHorizontal(false) {}

    int32_t mAmount;     // [in]
    uint8_t mUnit;       // [in]
    bool mIsHorizontal;  // [in]
  } mScroll;

  // eContentCommandReplaceText
  struct Selection {
    [[nodiscard]] bool ShouldPreventSetSelection() const {
      return mPreventSetSelection == PreventSetSelection::Yes;
    }

    // Replacement source string. If not matched, failed
    nsString mReplaceSrcString;  // [in]
    // Start offset of selection
    uint32_t mOffset = 0;  // [in]
    // "No" if selection is end of replaced string
    PreventSetSelection mPreventSetSelection = PreventSetSelection::No;  // [in]
  } mSelection;

  // If set to "Yes", the event checks whether the command is enabled in the
  // process or not without executing the command.  I.e., if it's in the parent
  // process when a remote process has focus, mIsEnabled may be different from
  // the latest state of the command in the remote process.
  OnlyEnabledCheck mOnlyEnabledCheck;  // [in]

  bool mSucceeded;  // [out]

  // If the command is enabled, set to true.  Otherwise, false. This is set
  // synchronously in the process.  If it's in the parent process when a remote
  // process has focus, this returns the command state in the parent process
  // which may be different from the remote process.
  // XXX When mOnlyEnabledCheck is set to Yes, this may be always set to true
  // even when the command is disabled in the parent process.
  bool mIsEnabled;  // [out]

  // true if TextEventDispatcher dispatches this event.
  bool mDispatchedByTextEventDispatcher = false;

  void AssignContentCommandEventData(const WidgetContentCommandEvent& aEvent,
                                     bool aCopyTargets) {
    AssignGUIEventData(aEvent, aCopyTargets);

    mString = aEvent.mString;
    mScroll = aEvent.mScroll;
    mSelection = aEvent.mSelection;
    mOnlyEnabledCheck = aEvent.mOnlyEnabledCheck;
    mSucceeded = aEvent.mSucceeded;
    mIsEnabled = aEvent.mIsEnabled;
  }
};

/******************************************************************************
 * mozilla::WidgetCommandEvent
 *
 * This sends a command to chrome.  If you want to request what is performed
 * in focused content, you should use WidgetContentCommandEvent instead.
 *
 * XXX Should be |WidgetChromeCommandEvent|?
 ******************************************************************************/

class WidgetCommandEvent final : public WidgetGUIEvent {
 public:
  NS_DEFINE_AS_EVENT_OVERRIDE(Widget, CommandEvent);

 protected:
  WidgetCommandEvent(bool aIsTrusted, nsAtom* aEventType, nsAtom* aCommand,
                     nsIWidget* aWidget, const WidgetEventTime* aTime = nullptr)
      : WidgetGUIEvent(aIsTrusted, eUnidentifiedEvent, aWidget,
                       eCommandEventClass, aTime),
        mCommand(aCommand) {
    mSpecifiedEventType = aEventType;
  }

 public:
  /**
   * Constructor to initialize an app command.  This is the only case to
   * initialize this class as a command in C++ stack.
   */
  WidgetCommandEvent(bool aIsTrusted, nsAtom* aCommand, nsIWidget* aWidget,
                     const WidgetEventTime* aTime = nullptr)
      : WidgetCommandEvent(aIsTrusted, nsGkAtoms::onAppCommand, aCommand,
                           aWidget, aTime) {}

  /**
   * Constructor to initialize as internal event of dom::CommandEvent.
   */
  WidgetCommandEvent()
      : WidgetCommandEvent(false, nullptr, nullptr, nullptr, nullptr) {}

  NS_DEFINE_VIRTUAL_DESTRUCTOR_CHECKING_CLASS_VALUE(WidgetCommandEvent,
                                                    eCommandEventClass,
                                                    eGUIEventClass)

  virtual WidgetEvent* Duplicate() const override {
    MOZ_ASSERT(mClass == eCommandEventClass,
               "Duplicate() must be overridden by sub class");
    // Not copying widget, it is a weak reference.
    WidgetCommandEvent* result = new WidgetCommandEvent(
        false, mSpecifiedEventType, mCommand, nullptr, this);
    result->AssignCommandEventData(*this, true);
    result->mFlags = mFlags;
    return result;
  }

  RefPtr<nsAtom> mCommand;

  // XXX Not tested by test_assign_event_data.html
  void AssignCommandEventData(const WidgetCommandEvent& aEvent,
                              bool aCopyTargets) {
    AssignGUIEventData(aEvent, aCopyTargets);

    // mCommand must have been initialized with the constructor.
  }
};

}  // namespace mozilla

#endif  // mozilla_MiscEvents_h_
