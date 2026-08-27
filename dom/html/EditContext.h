/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

#ifndef mozilla_dom_EditContext_h
#define mozilla_dom_EditContext_h

#include "mozilla/DOMEventTargetHelper.h"
#include "mozilla/WeakPtr.h"
#include "mozilla/dom/EditContextBinding.h"

class nsTextNode;

namespace mozilla::dom {

class EditContext final : public DOMEventTargetHelper, public SupportsWeakPtr {
 public:
  NS_DECL_ISUPPORTS_INHERITED
  NS_DECL_CYCLE_COLLECTION_CLASS_INHERITED(EditContext, DOMEventTargetHelper)

  JSObject* WrapObject(JSContext* aCx,
                       JS::Handle<JSObject*> aGivenProto) override;

  static already_AddRefed<EditContext> Constructor(const GlobalObject& aGlobal,
                                                   const EditContextInit& aInit,
                                                   ErrorResult& aRv);

  MOZ_CAN_RUN_SCRIPT void UpdateText(uint32_t aRangeStart, uint32_t aRangeEnd,
                                     const nsAString& aText, ErrorResult& aRv);
  MOZ_CAN_RUN_SCRIPT void UpdateSelection(uint32_t aStart, uint32_t aEnd);
  MOZ_CAN_RUN_SCRIPT void UpdateControlBounds(const DOMRect& aControlBounds);
  void UpdateSelectionBounds(const DOMRect& aSelectionBounds);
  void UpdateCharacterBounds(
      uint32_t aRangeStart,
      const Sequence<OwningNonNull<DOMRect>>& aCharacterBounds);
  void AttachedElements(nsTArray<RefPtr<nsGenericHTMLElement>>& aRetVal) {
    if (mAssociatedElement) {
      aRetVal.AppendElement(mAssociatedElement);
    }
  }

  void GetText(nsAString& aText) const;
  void GetTextSubstring(uint32_t aStart, uint32_t aEnd, nsAString& aText) const;
  uint32_t TextLength() const;
  uint32_t SelectionStart() const { return mSelectionStart; }
  uint32_t SelectionEnd() const { return mSelectionEnd; }

  // Selection start, clamped to <= length of text
  uint32_t SelectionStartClamped() const {
    // XXX: Perhaps selectionStart/End should already be clamped.
    //      See https://github.com/w3c/edit-context/issues/88
    return std::min(SelectionStart(), TextLength());
  }
  // Selection end, clamped to <= length of text
  uint32_t SelectionEndClamped() const {
    // XXX: Perhaps selectionStart/End should already be clamped.
    //      See https://github.com/w3c/edit-context/issues/88
    return std::min(SelectionEnd(), TextLength());
  }

  bool SelectionIsCollapsed() const {
    return SelectionStartClamped() == SelectionEndClamped();
  }

  // Minimum of selection start/end, clamped to <= length of text
  uint32_t SelectionMinClamped() const {
    return std::min(SelectionStartClamped(), SelectionEndClamped());
  }
  // Maximum of selection start/end, clamped to <= length of text
  uint32_t SelectionMaxClamped() const {
    return std::max(SelectionStartClamped(), SelectionEndClamped());
  }

  uint32_t CharacterBoundsRangeStart() const {
    return mCodepointRectsStartIndex;
  }
  uint32_t CharacterBoundsLength() const { return mCodepointRects.Length(); }
  void CharacterBounds(nsTArray<RefPtr<DOMRect>>& aRetVal) const;

  nsGenericHTMLElement* GetAssociatedElement() const {
    return mAssociatedElement;
  }
  void SetAssociatedElement(nsGenericHTMLElement* aElement);

  // Anonymous <div> element that holds the text being edited.
  nsGenericHTMLElement& TextContainer() { return *mTextContainer; }
  nsTextNode& TextNode() { return *mText; }

  // Get writing mode of associated element.
  mozilla::WritingMode WritingMode() const;

  // https://w3c.github.io/edit-context/#dfn-deactivate-an-editcontext
  MOZ_CAN_RUN_SCRIPT void Deactivate();

  IMPL_EVENT_HANDLER(characterboundsupdate);
  IMPL_EVENT_HANDLER(compositionstart);
  IMPL_EVENT_HANDLER(compositionend);
  IMPL_EVENT_HANDLER(textformatupdate);
  IMPL_EVENT_HANDLER(textupdate);

  static EditContext* GetForElement(const Element& aElement);
  static void SetForElement(const Element& aElement, EditContext* aEditContext);
  /*
   * Returns whether there is any EditContext attached to any element
   * in this process.
   */
  static bool IsAnyAttached();

  bool IsActive() const;

  // If PreventSetSelection::No is passed to UpdateTextAndFireEvent, the
  // selection will be moved to the end of the replaced text.
  // If PreventSetSelection::Yes is passed, the selection will not change.
  enum class PreventSetSelection { No, Yes };
  MOZ_CAN_RUN_SCRIPT void UpdateTextAndFireEvent(
      uint32_t aStart, uint32_t aEnd, const nsAString& aString,
      PreventSetSelection aPreventSetSelection = PreventSetSelection::No);
  MOZ_CAN_RUN_SCRIPT void StartComposition(
      const WidgetCompositionEvent& aEvent);
  MOZ_CAN_RUN_SCRIPT void EndComposition(const WidgetCompositionEvent& aEvent);

  // Handle eContentCommandReplaceText content command (used by certain IMEs).
  MOZ_CAN_RUN_SCRIPT void DoContentCommandReplaceText(
      WidgetContentCommandEvent& aEvent);

  // Handle eSetSelection event (used by certain input methods).
  MOZ_CAN_RUN_SCRIPT void DoSetSelection(WidgetSelectionEvent& aEvent);

  MOZ_CAN_RUN_SCRIPT void FireTextFormatUpdate(const TextRangeArray* aRanges,
                                               uint32_t aCompositionOffset);
  // Get the control bounds for the EditContext,
  // or Nothing if updateControlBounds has not been called.
  Maybe<LayoutDeviceIntRect> GetControlBounds() const;
  // Get the selection bounds for the EditContext,
  // or Nothing if updateSelectionBounds has not been called.
  Maybe<LayoutDeviceIntRect> GetSelectionBounds() const;
  /**
   * Returns bounds to use as a fallback:
   * - selection bounds if they have been set,
   * - otherwise, control bounds if they have been set,
   * - otherwise, associated element client bounding rect.
   */
  LayoutDeviceIntRect FallbackBounds() const;

  bool WasTextNextToCaretChangedByTextUpdateHandler() const {
    return mTextNextToCaretChangedByTextUpdateHandler;
  }

  bool IsFiringTextUpdate() const { return mIsFiringTextUpdate; }

  static MOZ_CAN_RUN_SCRIPT void NotifyActiveEditContextChanged(
      Document& aDocument);

  void LastRelease() override { UnsuppressNotifyingIME(); }

  // Returns true if this is a canvas-based EditContext.
  bool IsCanvas() const;

  // Get character bounds between aStart and aEnd, or as close as possible,
  // without firing characterboundsupdate.
  nsresult GetCharacterBounds(uint32_t aStart, uint32_t aEnd,
                              nsTArray<LayoutDeviceIntRect>& aRects) const;

 private:
  EditContext(nsIGlobalObject* aGlobalObject, const EditContextInit& aInit,
              ErrorResult& aRv);
  ~EditContext() = default;

  enum class IsFromFocus : bool { No, Yes };
  // Suppress IME notifications until updateCharacterBounds() is called.
  // (However, we give up and unsuppress after a timeout.)
  void SuppressNotifyingIME(IsFromFocus aIsFromFocus);

  // Fire characterboundsupdate event if new character bounds are requested.
  // This also suppresses IME notifications until updateCharacterBounds()
  // is called, or a timeout elapses.
  MOZ_CAN_RUN_SCRIPT void FireCharacterBoundsUpdateIfNeeded(
      IsFromFocus aIsFromFocus = IsFromFocus::No);

  // Fire textupdate event.
  MOZ_CAN_RUN_SCRIPT void FireTextUpdate(uint32_t aUpdateRangeStart,
                                         uint32_t aUpdateRangeEnd,
                                         const nsAString& aText);

  using Rect = gfx::RectTyped<CSSPixel, double>;

  RefPtr<DOMRect> ToDOMRect(const Rect& aCopy) const;
  Rect ToRect(const DOMRect& aRect) const;
  // Returns bounds set by UpdateControlBounds(), or else associated
  // element client rectangle if that's not available, or Nothing()
  // if there is no associated element or it's not framed.
  Maybe<nsRect> GetControlBoundsOrClientRect() const;

  // Update text without firing characterboundsupdate.
  void UpdateTextInternal(uint32_t aRangeStart, uint32_t aRangeEnd,
                          const nsAString& aText, ErrorResult& aRv);

  // Convert aRect to a LayoutDeviceIntRect that is relative to the
  // top-level viewport (this is what QueryContentEvent is supposed
  // to return).
  static LayoutDeviceIntRect ToRootRelativeDeviceRect(
      const nsPresContext& aPresContext, const Rect& aRect);
  static LayoutDeviceIntRect ToRootRelativeDeviceRect(
      const nsPresContext& aPresContext, const nsRect& aRect);

  class AutoSuppressIMENotifications;

  // Cancel the timer to unsuppress IME notifications, and unsuppress
  // them immediately.
  void UnsuppressNotifyingIME();

  // Returns the end index of the codepoint rects, avoiding overflow
  // and clamping to the text length.
  uint32_t CodepointRectsEndIndex() const {
    // XXX: Maybe this should already be clamped to the text length?
    //      https://github.com/w3c/edit-context/issues/142
    CheckedUint32 end =
        CheckedUint32(mCodepointRectsStartIndex) + mCodepointRects.Length();
    return end.isValid() ? std::min(end.value(), TextLength()) : TextLength();
  }

  friend std::ostream& operator<<(std::ostream& aStream,
                                  const EditContext& aEditContext);
  struct TextRange {
    uint32_t mStart = 0;
    uint32_t mEnd = 0;
    bool operator==(const TextRange&) const = default;
    [[nodiscard]] bool IsContainedIn(uint32_t aStart, uint32_t aEnd) const {
      return mStart >= aStart && mEnd <= aEnd;
    }
    [[nodiscard]] bool IsContainedIn(const TextRange& aOther) const {
      return IsContainedIn(aOther.mStart, aOther.mEnd);
    }
  };

  // Expand this range so that its endpoints are on grapheme cluster
  // boundaries.
  [[nodiscard]] TextRange ExpandRangeToClusterBoundaries(
      TextRange aRange) const;

  // Returns true if we should fire a new characterboundsupdate event for
  // querying the character rectangles in aRange, or false if the existing
  // bounds can be used.
  bool ShouldFireNewCharacterBoundsUpdateForRange(TextRange aRange) const;

  RefPtr<nsGenericHTMLElement> mAssociatedElement;
  RefPtr<nsGenericHTMLElement> mTextContainer;
  // When character bounds are requested, we suppress notifying the IME
  // of anything until updateCharacterBounds() is called. However, if this
  // timer expires first, we give up and unsuppress notifications anyways.
  nsCOMPtr<nsITimer> mSuppressNotifyingIMETimer;
  nsTArray<Rect> mCodepointRects;
  Maybe<Rect> mControlBounds;
  Maybe<Rect> mSelectionBounds;
  // Control bounds or client rect of associated element when
  // characterboundsupdate was most recently fired. If this has changed, we
  // want to fire characterboundsupdate again the next time character bounds are
  // requested.
  Maybe<nsRect> mControlBoundsAtLastCharacterBoundsUpdate;
  RefPtr<nsTextNode> mText;
  uint32_t mSelectionStart = 0;
  uint32_t mSelectionEnd = 0;
  uint32_t mCodepointRectsStartIndex = 0;
  TextRange mLastRequestedCharacterBoundsRange;
  bool mIsComposing = false;
  bool mIsSuppressingFocusNotification = false;
  bool mTextNextToCaretChangedByTextUpdateHandler = false;
  bool mIsFiringCharacterBoundsUpdate = false;
  bool mIsFiringTextUpdate = false;
  // Set to true if the text which corresponds to mCodepointRects has changed.
  bool mCodepointRectsTextChanged = false;
  // Keeps track of whether we warned about character bounds not being
  // provided synchronously, so we don't spam the console.
  bool mWarnedAboutUpdateCharacterBoundsNotCalled = false;
};

}  // namespace mozilla::dom

template <>
struct fmt::formatter<mozilla::dom::EditContext> : fmt::ostream_formatter {};

#endif
