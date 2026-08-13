/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

#include "EditContext.h"

#include "mozilla/ClearOnShutdown.h"
#include "mozilla/ErrorResult.h"
#include "mozilla/EventDispatcher.h"
#include "mozilla/HTMLEditor.h"
#include "mozilla/IMEContentObserver.h"
#include "mozilla/IMEStateManager.h"
#include "mozilla/InputEventOptions.h"
#include "mozilla/MiscEvents.h"
#include "mozilla/TextEvents.h"
#include "mozilla/dom/AnonymousContent.h"
#include "mozilla/dom/CharacterBoundsUpdateEvent.h"
#include "mozilla/dom/Document.h"
#include "mozilla/dom/DocumentInlines.h"
#include "mozilla/dom/Element.h"
#include "mozilla/dom/Text.h"
#include "mozilla/dom/TextFormatUpdateEvent.h"
#include "mozilla/dom/TextUpdateEvent.h"
#include "mozilla/intl/Segmenter.h"
#include "nsDOMCSSDeclaration.h"
#include "nsGenericHTMLElement.h"
#include "nsLayoutUtils.h"
#include "nsTextNode.h"

namespace mozilla::dom {

using InlineDir = WritingMode::InlineDir;
using LineStyle = TextRangeStyle::LineStyle;

NS_IMPL_ADDREF_INHERITED(EditContext, DOMEventTargetHelper)
NS_IMPL_RELEASE_INHERITED(EditContext, DOMEventTargetHelper)
NS_IMPL_CYCLE_COLLECTION_INHERITED(EditContext, DOMEventTargetHelper,
                                   mAssociatedElement, mText, mTextContainer)

NS_INTERFACE_MAP_BEGIN_CYCLE_COLLECTION(EditContext)
NS_INTERFACE_MAP_END_INHERITING(DOMEventTargetHelper)

already_AddRefed<EditContext> EditContext::Constructor(
    const GlobalObject& aGlobal, const EditContextInit& aInit,
    ErrorResult& aRv) {
  nsCOMPtr<nsIGlobalObject> global = do_QueryInterface(aGlobal.GetAsSupports());
  if (!global) {
    aRv.Throw(NS_ERROR_FAILURE);
    return nullptr;
  }
  RefPtr<EditContext> context = new EditContext(global, aInit, aRv);
  if (aRv.Failed()) {
    return nullptr;
  }
  return context.forget();
}

JSObject* EditContext::WrapObject(JSContext* aCx,
                                  JS::Handle<JSObject*> aGivenProto) {
  return EditContext_Binding::Wrap(aCx, this, aGivenProto);
}

static StaticAutoPtr<nsTHashMap<const Element*, RefPtr<EditContext>>>
    sEditContextHashMap;

// static
EditContext* EditContext::GetForElement(const Element& aElement) {
  MOZ_ASSERT(NS_IsMainThread());
  if (!sEditContextHashMap || !aElement.HasFlag(ELEMENT_HAS_EDIT_CONTEXT)) {
    return nullptr;
  }
  auto entry = sEditContextHashMap->Lookup(&aElement);
  MOZ_ASSERT(entry,
             "Should be in hash map if ELEMENT_HAS_EDIT_CONTEXT is set.");
  return entry.Data();
}

// static
void EditContext::SetForElement(const Element& aElement,
                                mozilla::dom::EditContext* aEditContext) {
  MOZ_ASSERT(NS_IsMainThread());
  if (!sEditContextHashMap) {
    if (!aEditContext) {
      return;
    }
    sEditContextHashMap = new nsTHashMap<const Element*, RefPtr<EditContext>>;
    ClearOnShutdown(&sEditContextHashMap);
  }
  if (aEditContext) {
    sEditContextHashMap->InsertOrUpdate(&aElement, aEditContext);
  } else {
    sEditContextHashMap->Remove(&aElement);
  }
}

void EditContext::Deactivate() {
  // https://w3c.github.io/edit-context/#dfn-deactivate-an-editcontext

  // https://github.com/w3c/edit-context/pull/123
  if (!mIsComposing) {
    return;
  }

  // 1. Set editContext's is composing to false.
  // 2. Fire an event named compositionend at editContext using
  //    CompositionEvent.
  // TODO
}

bool EditContext::IsActive() const {
  return mAssociatedElement &&
         mAssociatedElement->OwnerDoc()->GetActiveEditContext() == this;
}

// static
bool EditContext::IsAnyAttached() {
  MOZ_ASSERT(NS_IsMainThread());
  return sEditContextHashMap && !sEditContextHashMap->IsEmpty();
}

EditContext::EditContext(nsIGlobalObject* aGlobalObject,
                         const EditContextInit& aInit, ErrorResult& aRv)
    : DOMEventTargetHelper(aGlobalObject) {
  auto window = aGlobalObject->GetAsInnerWindow();
  MOZ_ASSERT(window);
  auto* document = window->GetDoc();
  MOZ_ASSERT(document);
  RefPtr<AnonymousContent> anonymousContent =
      document->InsertAnonymousContent(aRv);
  if (NS_WARN_IF(!anonymousContent)) {
    return;
  }
  RefPtr<Element> textContainer =
      document->CreateElem(u"div"_ns, nullptr, kNameSpaceID_XHTML);
  if (NS_WARN_IF(!textContainer)) {
    aRv.Throw(NS_ERROR_FAILURE);
    return;
  }
  mTextContainer = nsGenericHTMLElement::FromNode(textContainer);
  MOZ_ASSERT(mTextContainer);
  mText = document->CreateTextNode(u""_ns);
  mText->MarkAsMaybeModifiedFrequently();
  mTextContainer->AppendChild(*mText, IgnoreErrors());
  anonymousContent->Root()->AppendChild(*mTextContainer, IgnoreErrors());
  mText->SetEditableFlag(true);
  mTextContainer->SetEditableFlag(true);
  mTextContainer->Style()->SetProperty("visibility"_ns, "hidden"_ns, ""_ns,
                                       IgnoreErrors());
  UpdateSelection(aInit.mSelectionStart, aInit.mSelectionEnd);
  UpdateText(0, 0, aInit.mText, aRv);
}

void EditContext::SetAssociatedElement(nsGenericHTMLElement* aElement) {
  mAssociatedElement = aElement;
  if (aElement && aElement->IsHTMLElement(nsGkAtoms::canvas)) {
    aElement->OwnerDoc()->SetUseCounter(eUseCounter_custom_EditContextCanvas);
  }
}

void EditContext::GetText(nsAString& aText) const { mText->GetData(aText); }

void EditContext::GetTextSubstring(uint32_t aStart, uint32_t aEnd,
                                   nsAString& aText) {
  mText->SubstringData(aStart, aEnd - aStart, aText, IgnoreErrors());
}

RefPtr<DOMRect> EditContext::ToDOMRect(const Rect& aCopy) const {
  return MakeRefPtr<DOMRect>(GetRelevantGlobal(), aCopy.x, aCopy.y, aCopy.width,
                             aCopy.height);
}

auto EditContext::ToRect(const DOMRect& aRect) const -> Rect {
  return Rect(aRect.X(), aRect.Y(), aRect.Width(), aRect.Height());
}

LayoutDeviceIntRect EditContext::ToRootRelativeDeviceRect(
    const nsPresContext& aPresContext, const Rect& aRect) {
  CSSIntRect cssRect;
  aRect.ToIntRect(&cssRect);
  return ToRootRelativeDeviceRect(aPresContext, Rect::ToAppUnits(cssRect));
}

LayoutDeviceIntRect EditContext::ToRootRelativeDeviceRect(
    const nsPresContext& aPresContext, const nsRect& aRect) {
  nsRect rect = aRect;
  if (!aPresContext.IsRoot()) {
    nsPresContext* rootPC = aPresContext.GetRootPresContext();
    if (NS_WARN_IF(!rootPC)) {
      return {0, 0, 1, 1};
    }
    nsIFrame* documentRootFrame = aPresContext.PresShell()->GetRootFrame();
    nsIFrame* topLevelRootFrame = rootPC->PresShell()->GetRootFrame();
    if (NS_WARN_IF(!documentRootFrame) || NS_WARN_IF(!topLevelRootFrame)) {
      return {0, 0, 1, 1};
    }
    rect = nsLayoutUtils::TransformFrameRectToAncestor(documentRootFrame, rect,
                                                       topLevelRootFrame);
  }
  LayoutDeviceIntRect deviceRect = LayoutDeviceIntRect::FromAppUnitsToOutside(
      rect, aPresContext.AppUnitsPerDevPixel());
  // ContentCache, etc. is confused if the rectangles are empty,
  // so ensure that they aren't.
  deviceRect.width = std::max(1, deviceRect.width);
  deviceRect.height = std::max(1, deviceRect.height);
  return deviceRect;
}

void EditContext::UpdateSelection(uint32_t aStart, uint32_t aEnd) {
  if (aStart == mSelectionStart && aEnd == mSelectionEnd) {
    return;
  }
  mSelectionStart = aStart;
  mSelectionEnd = aEnd;
  // Changing selection, so there may now be different
  // text around the caret.
  mTextNextToCaretChangedByTextUpdateHandler = true;

  if (IsActive()) {
    if (IMEContentObserver* observer =
            IMEStateManager::GetActiveContentObserver()) {
      observer->EditContextSelectionChanged();
    }
  }
}

void EditContext::UpdateCharacterBounds(
    uint32_t aRangeStart,
    const Sequence<OwningNonNull<DOMRect>>& aCharacterBounds) {
  mCodepointRectsStartIndex = aRangeStart;
  mCodepointRects.Clear();
  mCodepointRects.SetCapacity(aCharacterBounds.Length());
  for (const auto& rect : aCharacterBounds) {
    mCodepointRects.AppendElement(ToRect(rect));
  }

  mCodepointRectsTextChanged = false;
  mControlBoundsAtLastUpdateCharacterBounds = GetControlBoundsOrClientRect();

  if (!mExpectingCharacterBounds && IsActive()) {
    // Web app sent new character bounds of its own accord, without
    // a characterboundsupdate event - inform IME that position may
    // have changed
    if (IMEContentObserver* observer =
            IMEStateManager::GetActiveContentObserver()) {
      observer->EditContextPositionChanged();
    }
  }
}

void EditContext::CharacterBounds(nsTArray<RefPtr<DOMRect>>& aRetVal) const {
  aRetVal.SetCapacity(mCodepointRects.Length());
  for (const Rect& rect : mCodepointRects) {
    aRetVal.AppendElement(ToDOMRect(rect));
  }
}

uint32_t EditContext::TextLength() const { return mText->TextLength(); }

WritingMode EditContext::WritingMode() const {
  if (!mAssociatedElement) {
    return mozilla::WritingMode();
  }
  nsIFrame* frame = mAssociatedElement->GetPrimaryFrame();
  if (!frame) {
    return mozilla::WritingMode();
  }
  return frame->GetWritingMode();
}

void EditContext::UpdateText(uint32_t aRangeStart, uint32_t aRangeEnd,
                             const nsAString& aText, ErrorResult& aRv) {
  if (NS_WARN_IF(!mText->DataBuffer().CanGrowBy(aText.Length()))) {
    aRv.Throw(NS_ERROR_OUT_OF_MEMORY);
    return;
  }
  const uint32_t prevSelectionStart = SelectionStartClamped();
  const uint32_t prevSelectionEnd = SelectionEndClamped();
  uint32_t start = std::min(aRangeStart, aRangeEnd);
  start = std::min(start, TextLength());
  uint32_t end = std::max(aRangeStart, aRangeEnd);
  end = std::min(end, TextLength());
  if (mSelectionStart == mSelectionEnd && start <= mSelectionStart &&
      end >= mSelectionStart) {
    // The character before or after the caret has changed.
    // This may affect how we render the caret for BiDi text.
    mTextNextToCaretChangedByTextUpdateHandler = true;
  }
  mText->ReplaceData(start, end - start, aText, IgnoreErrors());
  // Check if the existing codepoint rects are affected by this change.
  // If the text being changed is after the last stored codepoint rect,
  // then the codepoint rects most likely won't be affected, so we don't
  // need to fire characterboundsupdate again.
  if (start < mCodepointRectsStartIndex + mCodepointRects.Length()) {
    mCodepointRectsTextChanged = true;
  }
  // XXX: Perhaps mSelectionStart/End should be clamped to new length
  //      of text? See https://github.com/w3c/edit-context/issues/88
  if (IsActive()) {
    if (IMEContentObserver* observer =
            IMEStateManager::GetActiveContentObserver()) {
      if (SelectionStartClamped() != prevSelectionStart ||
          SelectionEndClamped() != prevSelectionEnd) {
        observer->EditContextSelectionChanged();
      }
      observer->EditContextTextChanged(start, end, aText);
    }
  }
}

void EditContext::UpdateControlBounds(DOMRect& aControlBounds) {
  mControlBounds = Some(ToRect(aControlBounds));
}

void EditContext::UpdateSelectionBounds(DOMRect& aSelectionBounds) {
  mSelectionBounds = Some(ToRect(aSelectionBounds));
}

void EditContext::UpdateTextAndFireEvent(
    uint32_t aStart, uint32_t aEnd, const nsAString& aString,
    PreventSetSelection aPreventSetSelection) {
  aStart = std::min(aStart, TextLength());
  aEnd = std::min(aEnd, TextLength());
  if (aStart == aEnd && aString.IsEmpty()) {
    // Edit doesn't change anything
    return;
  }
  if (aStart > aEnd) {
    std::swap(aStart, aEnd);
  }
  IgnoredErrorResult rv;
  UpdateText(aStart, aEnd, aString, rv);
  if (rv.Failed()) {
    return;
  }
  if (aPreventSetSelection == PreventSetSelection::Yes) {
    // Don't move selection to end of replaced text - just
    // fix up the offsets if they are inside/after the replaced text.
    for (uint32_t* offset : {&mSelectionStart, &mSelectionEnd}) {
      if (*offset >= aStart && *offset < aEnd) {
        *offset = aStart;
      } else if (*offset >= aEnd) {
        *offset += aString.Length() - (aEnd - aStart);
      }
    }
  } else {
    mSelectionStart = mSelectionEnd = aStart + aString.Length();
  }
  TextUpdateEventInit options;
  options.mText = aString;
  options.mSelectionStart = mSelectionStart;
  options.mSelectionEnd = mSelectionEnd;
  options.mUpdateRangeStart = aStart;
  options.mUpdateRangeEnd = aEnd;
  options.mBubbles = false;
  options.mCancelable = true;
  RefPtr<TextUpdateEvent> e =
      TextUpdateEvent::Constructor(this, u"textupdate"_ns, options);
  e->SetTrusted(true);
  mTextNextToCaretChangedByTextUpdateHandler = false;
  // textupdate can be fired recursively if the editor is blurred
  // during a composition (since that cancels the composition).
  // XXX: Some web apps may not handle this properly
  //      - perhaps add mPendingTextUpdateEvent/TextFormatUpdateEvent?
  AutoRestore restore(mIsFiringTextUpdate);
  mIsFiringTextUpdate = true;
  DispatchEvent(*e);
}

void EditContext::StartComposition(const WidgetCompositionEvent& aEvent) {
  MOZ_ASSERT(!mIsComposing);
  WidgetCompositionEvent event(aEvent);
  RefPtr presContext = mText->OwnerDoc()->GetPresContext();
  EventDispatcher::Dispatch(this, presContext, &event);
  mIsComposing = true;
}

void EditContext::EndComposition(const WidgetCompositionEvent& aEvent) {
  MOZ_ASSERT(mIsComposing);
  WidgetCompositionEvent event(aEvent);
  RefPtr presContext = mText->OwnerDoc()->GetPresContext();
  EventDispatcher::Dispatch(this, presContext, &event);
  mIsComposing = false;
}

void EditContext::DoContentCommandReplaceText(
    WidgetContentCommandEvent& aEvent) {
  MOZ_ASSERT(aEvent.mMessage == eContentCommandReplaceText);
  MOZ_ASSERT(aEvent.mString);
  if (!aEvent.mString) {
    aEvent.mSucceeded = false;
    return;
  }
  MOZ_ASSERT(IsActive(), "Should be the active EditContext.");
  nsAutoString text;
  const uint32_t replaceOffset = aEvent.mSelection.mOffset;
  const uint32_t replaceLength = aEvent.mSelection.mReplaceSrcString.Length();
  mText->SubstringData(replaceOffset, replaceLength, text, IgnoreErrors());
  if (text != aEvent.mSelection.mReplaceSrcString) {
    // String to replace doesn't match the text.
    aEvent.mSucceeded = false;
    return;
  }
  // Dispatch beforeinput
  // XXX: We can't really determine the target ranges here.
  //      See https://github.com/w3c/edit-context/issues/133
  InputEventOptions options(*aEvent.mString,
                            InputEventOptions::NeverCancelable::No);
  nsEventStatus status = nsEventStatus_eIgnore;
  RefPtr<nsGenericHTMLElement> associatedElement = GetAssociatedElement();
  MOZ_ASSERT(associatedElement);
  RefPtr<HTMLEditor> htmlEditor =
      associatedElement->OwnerDoc()->GetHTMLEditor();
  MOZ_ASSERT(htmlEditor);
  // We are using the insertText inputType instead of insertReplacementText,
  // since insertReplacementText is used for spellcheck with no textupdate
  // fired, so editors with spellcheck enabled will do the replacement
  // twice if we fire both insertReplacementText and textupdate.
  nsresult rv = nsContentUtils::DispatchInputEvent(
      associatedElement, eEditorBeforeInput, EditorInputType::eInsertText,
      htmlEditor, std::move(options), &status);
  if (NS_FAILED(rv) || status == nsEventStatus_eConsumeNoDefault ||
      !IsActive()) {
    aEvent.mSucceeded = false;
    return;
  }
  // Dispatch textupdate
  UpdateTextAndFireEvent(
      replaceOffset, replaceOffset + replaceLength, *aEvent.mString,
      aEvent.mSelection.mPreventSetSelection ? PreventSetSelection::Yes
                                             : PreventSetSelection::No);
  aEvent.mSucceeded = true;
}

static UnderlineStyle ToDOMStyle(LineStyle aStyle) {
  switch (aStyle) {
    case LineStyle::None:
      return UnderlineStyle::None;
    case LineStyle::Dashed:
      return UnderlineStyle::Dashed;
    case LineStyle::Dotted:
      return UnderlineStyle::Dotted;
    case LineStyle::Wavy:
      return UnderlineStyle::Wavy;
    case LineStyle::Solid:
      return UnderlineStyle::Solid;
    case LineStyle::Double:
      // Current EditContext spec doesn't have "double" style.
      return UnderlineStyle::Solid;
  }
  MOZ_CRASH("Invalid LineStyle.");
  return UnderlineStyle::None;
}

void EditContext::FireTextFormatUpdate(const TextRangeArray* aRanges,
                                       uint32_t aCompositionOffset) {
  TextFormatUpdateEventInit eventOptions;
  eventOptions.mBubbles = false;
  eventOptions.mCancelable = true;
  if (aRanges) {
    for (const TextRange& range : *aRanges) {
      if (range.Length() == 0) {
        // Empty ranges probably aren't useful?
        continue;
      }
      TextFormatInit formatOptions;
      formatOptions.mRangeStart = range.mStartOffset + aCompositionOffset;
      formatOptions.mRangeEnd = range.mEndOffset + aCompositionOffset;
      if (mText->OwnerDoc()->ShouldResistFingerprinting(RFPTarget::IMEStyle)) {
        // Don't expose details of how IME styles text to the web app.
        // Instead, always use thick solid underline for selected clause,
        // and thin solid underline for other clauses.
        formatOptions.mUnderlineStyle = UnderlineStyle::Solid;
        formatOptions.mUnderlineThickness =
            range.mRangeType == TextRangeType::eSelectedClause ||
                    range.mRangeType == TextRangeType::eSelectedRawClause
                ? UnderlineThickness::Thick
                : UnderlineThickness::Thin;
      } else if (range.mRangeStyle.IsLineStyleDefined() &&
                 range.mRangeStyle.mLineStyle != LineStyle::None) {
        formatOptions.mUnderlineStyle =
            ToDOMStyle(range.mRangeStyle.mLineStyle);
        formatOptions.mUnderlineThickness = range.mRangeStyle.mIsBoldLine
                                                ? UnderlineThickness::Thick
                                                : UnderlineThickness::Thin;
      }
      OwningNonNull<TextFormat> format =
          MakeRefPtr<TextFormat>(GetRelevantGlobal(), formatOptions);
      [[maybe_unused]] auto* element =
          eventOptions.mTextFormats.AppendElement(std::move(format), fallible);
      NS_WARNING_ASSERTION(element, "TextFormat array allocation failed");
    }
  }
  RefPtr<TextFormatUpdateEvent> e = MakeRefPtr<TextFormatUpdateEvent>(
      this, u"textformatupdate"_ns, eventOptions);
  e->SetTrusted(true);
  DispatchEvent(*e);
}

static InlineDir ReverseInlineDir(InlineDir dir) {
  switch (dir) {
    case InlineDir::LTR:
      return InlineDir::RTL;
    case InlineDir::RTL:
      return InlineDir::LTR;
    case InlineDir::BTT:
      return InlineDir::TTB;
    case InlineDir::TTB:
      return InlineDir::BTT;
  }
  MOZ_ASSERT(false, "invalid InlineDir");
  return InlineDir::LTR;
}

nsresult EditContext::FireCharacterBoundsUpdateIfNeededAndGetRects(
    uint32_t aStart, uint32_t aEnd, nsTArray<LayoutDeviceIntRect>& aRects) {
  MOZ_ASSERT(aRects.IsEmpty());
  aStart = std::min(aStart, TextLength());
  aEnd = std::min(aEnd, TextLength());
  enum class CollapseDirection {
    // Don't collapse returned rectangle
    None,
    // Collapse returned rectangle in the direction of the previous character
    // (e.g. for LTR, set width = 0)
    Previous,
    // Collapse returned rectangle in the direction of the next character
    // (e.g. for LTR, set x += width, width = 0)
    Next,
  };
  CollapseDirection collapse = CollapseDirection::None;
  if (aStart == aEnd) {
    // In this case, ContentEventHandler still wants a rectangle for the caret
    if (TextLength() == 0) {
      aRects.AppendElement(FallbackBounds());
      return NS_OK;
    }
    if (aEnd < TextLength()) {
      // If requested range is before end of text, query the next character,
      // and collapse its rectangle in the opposite direction of the writing.
      aEnd++;
      collapse = CollapseDirection::Previous;
    } else {
      // If requested range is at end of text, query the previous character,
      // and collapse its rectangle in the direction of the writing.
      MOZ_ASSERT(aStart > 0);
      aStart--;
      collapse = CollapseDirection::Next;
    }
  }
  MOZ_ASSERT(aStart < aEnd);

  // Extend requested range to grapheme cluster boundaries,
  // in case web app has poor handling of ranges starting/ending
  // in the middle of a grapheme cluster.
  uint32_t startExtendedToGraphemeCluster = aStart;
  // Number of code units of context to use when determining the
  // grapheme cluster boundaries.
  constexpr uint32_t kContext = 16;
  {
    nsAutoString startText;
    uint32_t startTextOffset = std::max(aStart, kContext) - kContext;
    GetTextSubstring(startTextOffset, std::min(aStart + kContext, TextLength()),
                     startText);
    intl::GraphemeClusterBreakIteratorUtf16 iter(startText);
    // find first grapheme cluster break before or equal to aStart
    while (Maybe<uint32_t> i = iter.Next()) {
      if (startTextOffset + *i > aStart) {
        break;
      }
      startExtendedToGraphemeCluster = startTextOffset + *i;
    }
  }
  uint32_t endExtendedToGraphemeCluster = aEnd;
  {
    nsAutoString endText;
    uint32_t endTextOffset = std::max(aEnd, kContext) - kContext;
    GetTextSubstring(endTextOffset, std::min(aEnd + kContext, TextLength()),
                     endText);
    // find first grapheme cluster break after or equal to aEnd
    intl::GraphemeClusterBreakIteratorUtf16 iter(endText);
    while (Maybe<uint32_t> i = iter.Next()) {
      if (endTextOffset + *i >= aEnd) {
        endExtendedToGraphemeCluster = endTextOffset + *i;
        break;
      }
    }
  }

  RefPtr<nsPresContext> presContext = mText->OwnerDoc()->GetPresContext();

  // If we already have the requested character bounds and nothing relevant has
  // changed, don't fire characterboundsupdate again.
  if (mCodepointRectsTextChanged ||
      mControlBoundsAtLastUpdateCharacterBounds !=
          GetControlBoundsOrClientRect() ||
      aStart < mCodepointRectsStartIndex ||
      aEnd > mCodepointRectsStartIndex + mCodepointRects.Length()) {
    CharacterBoundsUpdateEventInit eventOptions;
    eventOptions.mBubbles = false;
    eventOptions.mCancelable = true;
    eventOptions.mRangeStart = startExtendedToGraphemeCluster;
    eventOptions.mRangeEnd = endExtendedToGraphemeCluster;
    AutoRestore restore(mExpectingCharacterBounds);
    mExpectingCharacterBounds = true;
    RefPtr event = CharacterBoundsUpdateEvent::Constructor(
        this, u"characterboundsupdate"_ns, eventOptions);
    event->SetTrusted(true);
    DispatchEvent(*event);
  }
  aRects.SetCapacity(aEnd - aStart);
  for (uint32_t i = aStart; i < aEnd; i++) {
    CheckedUint32 indexInCodepointRects =
        CheckedUint32(i) - mCodepointRectsStartIndex;
    if (!indexInCodepointRects.isValid() ||
        indexInCodepointRects.value() >= mCodepointRects.Length()) {
      // Web app did not provide correct character bounds synchronously in the
      // event handler.
      // XXX: Should we emit a console warning about this?
      return NS_ERROR_FAILURE;
    }
    Rect cssRect = mCodepointRects[indexInCodepointRects.value()];
    LayoutDeviceIntRect deviceRect =
        ToRootRelativeDeviceRect(*presContext, cssRect);
    aRects.AppendElement(deviceRect);
  }
  if (collapse != CollapseDirection::None) {
    // collapse should only be set when we just want one rectangle
    MOZ_ASSERT(aRects.Length() == 1);
    if (aRects.IsEmpty()) {
      // Don't index out of bounds
      return NS_ERROR_FAILURE;
    }
    LayoutDeviceIntRect& rect = aRects[0];
    InlineDir dir = WritingMode().GetInlineDir();
    if (collapse == CollapseDirection::Next) {
      dir = ReverseInlineDir(dir);
    }
    switch (dir) {
      case InlineDir::LTR:
        // Collapse rect to the left.
        rect.width = 1;
        break;
      case InlineDir::RTL:
        // Collapse rect to the right.
        rect.x += rect.width;
        rect.width = 1;
        break;
      case InlineDir::BTT:
        // Collapse rect to the bottom.
        rect.y += rect.height;
        rect.height = 1;
        break;
      case InlineDir::TTB:
        // Collapse rect to the top.
        rect.height = 1;
        break;
    }
  }
  return NS_OK;
}

Maybe<LayoutDeviceIntRect> EditContext::GetControlBounds() const {
  nsPresContext* presContext = mText->OwnerDoc()->GetPresContext();
  if (!presContext || !mControlBounds) {
    // Control bounds were never set.
    return Nothing();
  }
  return Some(ToRootRelativeDeviceRect(*presContext, *mControlBounds));
}

Maybe<LayoutDeviceIntRect> EditContext::GetSelectionBounds() const {
  nsPresContext* presContext = mText->OwnerDoc()->GetPresContext();
  if (!presContext || !mSelectionBounds) {
    // Selection bounds were never set.
    return Nothing();
  }
  return Some(ToRootRelativeDeviceRect(*presContext, *mSelectionBounds));
}

Maybe<nsRect> EditContext::GetControlBoundsOrClientRect() const {
  if (mControlBounds) {
    CSSIntRect intRect;
    mControlBounds->ToIntRect(&intRect);
    return Some(Rect::ToAppUnits(intRect));
  }
  if (!mAssociatedElement || !mAssociatedElement->GetPrimaryFrame()) {
    return Nothing();
  }
  return Some(mAssociatedElement->GetPrimaryFrame()->GetRect());
}

LayoutDeviceIntRect EditContext::FallbackBounds() const {
  if (Maybe<LayoutDeviceIntRect> bounds = GetSelectionBounds()) {
    return *bounds;
  }
  if (Maybe<LayoutDeviceIntRect> bounds = GetControlBounds()) {
    return *bounds;
  }
  Maybe<nsRect> appUnitsRect = GetControlBoundsOrClientRect();
  if (NS_WARN_IF(!appUnitsRect)) {
    // Nothing good we can return here.
    return {0, 0, 1, 1};
  }
  nsPresContext* presContext =
      mAssociatedElement->GetPrimaryFrame()->PresContext();
  return ToRootRelativeDeviceRect(*presContext, *appUnitsRect);
}

}  // namespace mozilla::dom
