/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

#ifndef mozilla_dom_EditContext_h
#define mozilla_dom_EditContext_h

#include "mozilla/DOMEventTargetHelper.h"
#include "mozilla/dom/EditContextBinding.h"

class nsTextNode;

namespace mozilla::dom {

class EditContext final : public DOMEventTargetHelper {
 public:
  NS_DECL_ISUPPORTS_INHERITED
  NS_DECL_CYCLE_COLLECTION_CLASS_INHERITED(EditContext, DOMEventTargetHelper)

  JSObject* WrapObject(JSContext* aCx,
                       JS::Handle<JSObject*> aGivenProto) override;

  static already_AddRefed<EditContext> Constructor(const GlobalObject& aGlobal,
                                                   const EditContextInit& aInit,
                                                   ErrorResult& aRv);

  void UpdateText(uint32_t aRangeStart, uint32_t aRangeEnd,
                  const nsAString& aText, ErrorResult& aRv);
  void UpdateSelection(uint32_t aStart, uint32_t aEnd);
  void UpdateControlBounds(DOMRect& aControlBounds);
  void UpdateSelectionBounds(DOMRect& aSelectionBounds);
  void UpdateCharacterBounds(
      uint32_t aRangeStart,
      const Sequence<OwningNonNull<DOMRect>>& aCharacterBounds);
  void AttachedElements(nsTArray<RefPtr<nsGenericHTMLElement>>& aRetVal) {
    if (mAssociatedElement) {
      aRetVal.AppendElement(mAssociatedElement);
    }
  }

  void GetText(nsAString& aText) const;
  void GetTextSubstring(uint32_t aStart, uint32_t aEnd, nsAString& aText);
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

  MOZ_CAN_RUN_SCRIPT void FireTextFormatUpdate(const TextRangeArray* aRanges,
                                               uint32_t aCompositionOffset);
  MOZ_CAN_RUN_SCRIPT nsresult FireCharacterBoundsUpdateIfNeededAndGetRects(
      uint32_t aStart, uint32_t aEnd, nsTArray<LayoutDeviceIntRect>& aRects);
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

 private:
  EditContext(nsIGlobalObject* aGlobalObject, const EditContextInit& aInit,
              ErrorResult& aRv);
  ~EditContext() = default;

  using Rect = gfx::RectTyped<CSSPixel, double>;

  RefPtr<DOMRect> ToDOMRect(const Rect& aCopy) const;
  Rect ToRect(const DOMRect& aRect) const;
  // Returns bounds set by UpdateControlBounds(), or else associated
  // element client rectangle if that's not available, or Nothing()
  // if there is no associated element or it's not framed.
  Maybe<nsRect> GetControlBoundsOrClientRect() const;

  // Convert aRect to a LayoutDeviceIntRect that is relative to the
  // top-level viewport (this is what QueryContentEvent is supposed
  // to return).
  static LayoutDeviceIntRect ToRootRelativeDeviceRect(
      const nsPresContext& aPresContext, const Rect& aRect);
  static LayoutDeviceIntRect ToRootRelativeDeviceRect(
      const nsPresContext& aPresContext, const nsRect& aRect);

  RefPtr<nsGenericHTMLElement> mAssociatedElement;
  RefPtr<nsGenericHTMLElement> mTextContainer;
  nsTArray<Rect> mCodepointRects;
  Maybe<Rect> mControlBounds;
  Maybe<Rect> mSelectionBounds;
  // Control bounds or client rect of associated element when
  // updateCharacterBounds() was most recently called. If this has changed, we
  // want to fire characterboundsupdate again the next time character bounds are
  // requested.
  Maybe<nsRect> mControlBoundsAtLastUpdateCharacterBounds;
  RefPtr<nsTextNode> mText;
  uint32_t mSelectionStart = 0;
  uint32_t mSelectionEnd = 0;
  uint32_t mCodepointRectsStartIndex = 0;
  bool mIsComposing = false;
  bool mTextNextToCaretChangedByTextUpdateHandler = false;
  bool mExpectingCharacterBounds = false;
  bool mIsFiringTextUpdate = false;
  // Set to true if the text which corresponds to mCodepointRects has changed.
  bool mCodepointRectsTextChanged = false;
};

}  // namespace mozilla::dom

#endif
