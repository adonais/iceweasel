/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "mozilla/dom/HTMLSelectElement.h"

#include "ButtonControlFrame.h"
#include "mozilla/BasicEvents.h"
#include "mozilla/Casting.h"
#include "mozilla/ClearOnShutdown.h"
#include "mozilla/EventDispatcher.h"
#include "mozilla/MappedDeclarationsBuilder.h"
#include "mozilla/MouseEvents.h"
#include "mozilla/PresShell.h"
#include "mozilla/PresState.h"
#include "mozilla/StaticPrefs_ui.h"
#include "mozilla/TextEvents.h"
#include "mozilla/dom/ContentList.h"
#include "mozilla/dom/Document.h"
#include "mozilla/dom/Element.h"
#include "mozilla/dom/FormData.h"
#include "mozilla/dom/HTMLOptGroupElement.h"
#include "mozilla/dom/HTMLOptionElement.h"
#include "mozilla/dom/HTMLSelectElementBinding.h"
#include "mozilla/dom/MouseEventBinding.h"
#include "mozilla/dom/UnionTypes.h"
#include "mozilla/dom/WindowGlobalChild.h"
#include "nsComboboxControlFrame.h"
#include "nsComputedDOMStyle.h"
#include "nsContentCreatorFunctions.h"
#include "nsContentUtils.h"
#include "nsError.h"
#include "nsGkAtoms.h"
#include "nsIFrame.h"
#include "nsLayoutUtils.h"
#include "nsListControlFrame.h"

#ifdef ACCESSIBILITY
#  include "nsAccessibilityService.h"
#endif

NS_IMPL_NS_NEW_HTML_ELEMENT_CHECK_PARSER(Select)

static bool IsOptionInteractivelySelectable(
    const mozilla::dom::HTMLSelectElement& aSelect,
    mozilla::dom::HTMLOptionElement& aOption) {
  if (aSelect.IsOptionDisabled(&aOption)) {
    return false;
  }
  if (!aSelect.IsCombobox()) {
    return aOption.GetPrimaryFrame();
  }
  for (mozilla::dom::Element* el = &aOption; el && el != &aSelect;
       el = el->GetParentElement()) {
    RefPtr style = nsComputedDOMStyle::GetComputedStyleNoFlush(el);
    if (!style) {
      return false;
    }
    auto display = style->StyleDisplay()->mDisplay;
    if (display == mozilla::StyleDisplay::None) {
      return false;
    }
  }
  return true;
}

static mozilla::StaticAutoPtr<nsString> sIncrementalString;
static mozilla::TimeStamp gLastKeyTime;
static uintptr_t sLastSelectKeyHandler = 0;

static nsString& GetIncrementalString() {
  MOZ_ASSERT(sLastSelectKeyHandler != 0);
  if (!sIncrementalString) {
    sIncrementalString = new nsString();
    mozilla::ClearOnShutdown(&sIncrementalString);
  }
  return *sIncrementalString;
}

namespace mozilla::dom {

//----------------------------------------------------------------------
//
// HTMLSelectElement
//

// construction, destruction

HTMLSelectElement::HTMLSelectElement(
    already_AddRefed<mozilla::dom::NodeInfo>&& aNodeInfo,
    FromParser aFromParser)
    : nsGenericHTMLFormControlElementWithState(
          std::move(aNodeInfo), aFromParser, FormControlType::Select),
      mOptions(new HTMLOptionsCollection(this, !!aFromParser)),
      mAutocompleteAttrState(nsContentUtils::eAutocompleteAttrState_Unknown),
      mAutocompleteInfoState(nsContentUtils::eAutocompleteAttrState_Unknown),
      mIsDoneAddingChildren(!aFromParser),
      mInhibitStateRestoration(!!(aFromParser & FROM_PARSER_FRAGMENT)) {
  SetHasWeirdParserInsertionMode();
  // Set up our default state: enabled, optional, and valid.
  AddStatesSilently(ElementState::ENABLED | ElementState::OPTIONAL_ |
                    ElementState::VALID);
  AddMutationObserver(this);
}

void HTMLSelectElement::SetupShadowTree() {
  AttachAndSetUAShadowRoot(NotifyUAWidget::No);
  RefPtr<ShadowRoot> sr = GetShadowRoot();
  if (NS_WARN_IF(!sr)) {
    return;
  }
  // For now, we append a <label> with a text node, a <span> (for the menulist
  // icon), and an hidden <slot> element.
  Document* doc = OwnerDoc();
  RefPtr label = doc->CreateHTMLElement(nsGkAtoms::label);
  label->SetPseudoElementType(PseudoStyleType::MozSelectContent);
  {
    // This matches ButtonControlFrame::EnsureNonEmptyLabel.
    RefPtr text = doc->CreateTextNode(u"\ufeff"_ns);
    label->AppendChildTo(text, false, IgnoreErrors());
  }
  sr->AppendChildTo(label, false, IgnoreErrors());
  RefPtr icon = doc->CreateHTMLElement(nsGkAtoms::span);
  icon->SetPseudoElementType(PseudoStyleType::PickerIcon);
  {
    RefPtr text = doc->CreateTextNode(u"\ufeff"_ns);
    icon->AppendChildTo(text, false, IgnoreErrors());
  }
  sr->AppendChildTo(icon, false, IgnoreErrors());

  RefPtr picker = doc->CreateHTMLElement(nsGkAtoms::div);
  picker->SetPseudoElementType(PseudoStyleType::Picker);
  picker->SetAttr(nsGkAtoms::name, u"select"_ns, IgnoreErrors());

  RefPtr slot = doc->CreateHTMLElement(nsGkAtoms::slot);
  picker->AppendChildTo(slot, false, IgnoreErrors());
  sr->AppendChildTo(picker, false, IgnoreErrors());
}

Text* HTMLSelectElement::GetSelectedContentText() const {
  auto* sr = GetShadowRoot();
  if (!sr) {
    MOZ_ASSERT(OwnerDoc()->IsStaticDocument() || !IsInComposedDoc());
    return nullptr;
  }
  auto* label = sr->GetFirstChild();
  MOZ_DIAGNOSTIC_ASSERT(label);
  MOZ_DIAGNOSTIC_ASSERT(label->IsHTMLElement(nsGkAtoms::label));
  MOZ_DIAGNOSTIC_ASSERT(label->GetFirstChild());
  MOZ_DIAGNOSTIC_ASSERT(label->GetFirstChild()->IsText());
  return label->GetFirstChild()->AsText();
}

// ISupports

NS_IMPL_CYCLE_COLLECTION_CLASS(HTMLSelectElement)

NS_IMPL_CYCLE_COLLECTION_TRAVERSE_BEGIN_INHERITED(
    HTMLSelectElement, nsGenericHTMLFormControlElementWithState)
  NS_IMPL_CYCLE_COLLECTION_TRAVERSE(mValidity)
  NS_IMPL_CYCLE_COLLECTION_TRAVERSE(mOptions)
  NS_IMPL_CYCLE_COLLECTION_TRAVERSE(mSelectedOptions)
NS_IMPL_CYCLE_COLLECTION_TRAVERSE_END
NS_IMPL_CYCLE_COLLECTION_UNLINK_BEGIN_INHERITED(
    HTMLSelectElement, nsGenericHTMLFormControlElementWithState)
  NS_IMPL_CYCLE_COLLECTION_UNLINK(mValidity)
  NS_IMPL_CYCLE_COLLECTION_UNLINK(mSelectedOptions)
NS_IMPL_CYCLE_COLLECTION_UNLINK_END

NS_IMPL_ISUPPORTS_CYCLE_COLLECTION_INHERITED(
    HTMLSelectElement, nsGenericHTMLFormControlElementWithState,
    nsIConstraintValidation)

// nsIDOMHTMLSelectElement

NS_IMPL_ELEMENT_CLONE(HTMLSelectElement)

void HTMLSelectElement::SetCustomValidity(const nsAString& aError) {
  ConstraintValidation::SetCustomValidity(aError);
  UpdateValidityElementStates(true);
}

// https://html.spec.whatwg.org/multipage/input.html#dom-input-showpicker
void HTMLSelectElement::ShowPicker(ErrorResult& aRv) {
  // Step 1. If this is not mutable, then throw an "InvalidStateError"
  // DOMException.
  if (IsDisabled()) {
    return aRv.ThrowInvalidStateError("This select is disabled.");
  }

  // Step 2. If this's relevant settings object's origin is not same origin with
  // this's relevant settings object's top-level origin, and this is a select
  // element, [...], then throw a "SecurityError" DOMException.
  nsPIDOMWindowInner* window = OwnerDoc()->GetInnerWindow();
  WindowGlobalChild* windowGlobalChild =
      window ? window->GetWindowGlobalChild() : nullptr;
  if (!windowGlobalChild || !windowGlobalChild->SameOriginWithTop()) {
    return aRv.ThrowSecurityError(
        "Call was blocked because the current origin isn't same-origin with "
        "top.");
  }

  // Step 3. If this's relevant global object does not have transient
  // activation, then throw a "NotAllowedError" DOMException.
  if (!OwnerDoc()->HasValidTransientUserGestureActivation()) {
    return aRv.ThrowNotAllowedError(
        "Call was blocked due to lack of user activation.");
  }

  // Step 4. If this is a select element, and this is not being rendered, then
  // throw a "NotSupportedError" DOMException.

  // Flush frames so that IsRendered returns up-to-date results.
  (void)GetPrimaryFrame(FlushType::Frames);
  if (!IsRendered()) {
    return aRv.ThrowNotSupportedError("This select isn't being rendered.");
  }

  // Step 5. Show the picker, if applicable, for this.
  // https://html.spec.whatwg.org/multipage/input.html#show-the-picker,-if-applicable
  // To show the picker, if applicable for an input element element:
  // We already checked if mutable and user activation earlier, so skip 1 & 2.

  // Step 3. Consume user activation given element's relevant global object.
  OwnerDoc()->ConsumeTransientUserGestureActivation();

  // Step 5. Otherwise, the user agent should show any relevant user interface
  // for selecting a value for element, in the way it normally would when the
  // user interacts with the control.
#if !defined(ANDROID)
  if (!IsCombobox()) {
    return;
  }
#endif

  if (!IsInActiveTab(OwnerDoc())) {
    return;
  }

  if (!OpenInParentProcess()) {
    RefPtr<Document> doc = OwnerDoc();
    nsContentUtils::DispatchChromeEvent(doc, this, u"mozshowdropdown"_ns,
                                        CanBubble::eYes, Cancelable::eNo);
  }
}

void HTMLSelectElement::GetAutocomplete(DOMString& aValue) {
  const nsAttrValue* attributeVal = GetParsedAttr(nsGkAtoms::autocomplete);

  mAutocompleteAttrState = nsContentUtils::SerializeAutocompleteAttribute(
      attributeVal, aValue, mAutocompleteAttrState);
}

void HTMLSelectElement::GetAutocompleteInfo(AutocompleteInfo& aInfo) {
  const nsAttrValue* attributeVal = GetParsedAttr(nsGkAtoms::autocomplete);
  mAutocompleteInfoState = nsContentUtils::SerializeAutocompleteAttribute(
      attributeVal, aInfo, mAutocompleteInfoState, true);
}

int32_t HTMLSelectElement::GetOptionIndexAt(nsIContent* aOptions) {
  // Search this node and below.
  // If not found, find the first one *after* this node.
  int32_t retval = GetFirstOptionIndex(aOptions);
  if (retval == -1) {
    retval = GetOptionIndexAfter(aOptions);
  }

  return retval;
}

int32_t HTMLSelectElement::GetOptionIndexAfter(nsIContent* aOptions) {
  // - If this is the select, the next option is the last.
  // - If not, search all the options after aOptions and up to the last option
  //   in the parent.
  // - If it's not there, search for the first option after the parent.
  if (aOptions == this) {
    return Length();
  }

  int32_t retval = -1;

  nsCOMPtr<nsIContent> parent = aOptions->GetParent();

  if (parent) {
    const int32_t index = parent->ComputeIndexOf_Deprecated(aOptions);
    const int32_t count = static_cast<int32_t>(parent->GetChildCount());

    retval = GetFirstChildOptionIndex(parent, index + 1, count);

    if (retval == -1) {
      retval = GetOptionIndexAfter(parent);
    }
  }

  return retval;
}

int32_t HTMLSelectElement::GetFirstOptionIndex(nsIContent* aOptions) {
  int32_t listIndex = -1;
  HTMLOptionElement* optElement = HTMLOptionElement::FromNode(aOptions);
  if (optElement) {
    mOptions->GetOptionIndex(optElement, 0, true, &listIndex);
    return listIndex;
  }

  listIndex = GetFirstChildOptionIndex(aOptions, 0, aOptions->GetChildCount());

  return listIndex;
}

int32_t HTMLSelectElement::GetFirstChildOptionIndex(nsIContent* aOptions,
                                                    int32_t aStartIndex,
                                                    int32_t aEndIndex) {
  int32_t retval = -1;

  for (int32_t i = aStartIndex; i < aEndIndex; ++i) {
    retval = GetFirstOptionIndex(aOptions->GetChildAt_Deprecated(i));
    if (retval != -1) {
      break;
    }
  }

  return retval;
}

nsListControlFrame* HTMLSelectElement::GetListBoxFrame() {
  return do_QueryFrame(GetPrimaryFrame());
}

void HTMLSelectElement::Add(
    const HTMLOptionElementOrHTMLOptGroupElement& aElement,
    const Nullable<HTMLElementOrLong>& aBefore, ErrorResult& aRv) {
  nsGenericHTMLElement& element =
      aElement.IsHTMLOptionElement() ? static_cast<nsGenericHTMLElement&>(
                                           aElement.GetAsHTMLOptionElement())
                                     : static_cast<nsGenericHTMLElement&>(
                                           aElement.GetAsHTMLOptGroupElement());

  if (aBefore.IsNull()) {
    Add(element, static_cast<nsGenericHTMLElement*>(nullptr), aRv);
  } else if (aBefore.Value().IsHTMLElement()) {
    Add(element, &aBefore.Value().GetAsHTMLElement(), aRv);
  } else {
    Add(element, aBefore.Value().GetAsLong(), aRv);
  }
}

void HTMLSelectElement::Add(nsGenericHTMLElement& aElement,
                            nsGenericHTMLElement* aBefore,
                            ErrorResult& aError) {
  if (!aBefore) {
    Element::AppendChild(aElement, aError);
    return;
  }

  // Just in case we're not the parent, get the parent of the reference
  // element
  nsCOMPtr<nsINode> parent = aBefore->Element::GetParentNode();
  if (!parent || !parent->IsInclusiveDescendantOf(this)) {
    // NOT_FOUND_ERR: Raised if before is not a descendant of the SELECT
    // element.
    aError.Throw(NS_ERROR_DOM_NOT_FOUND_ERR);
    return;
  }

  // If the before parameter is not null, we are equivalent to the
  // insertBefore method on the parent of before.
  nsCOMPtr<nsINode> refNode = aBefore;
  parent->InsertBefore(aElement, refNode, aError);
}

void HTMLSelectElement::Remove(int32_t aIndex) const {
  if (aIndex < 0) {
    return;
  }

  nsCOMPtr<nsINode> option = Item(static_cast<uint32_t>(aIndex));
  if (!option) {
    return;
  }

  option->Remove();
}

void HTMLSelectElement::GetType(nsAString& aType) {
  if (HasAttr(nsGkAtoms::multiple)) {
    aType.AssignLiteral("select-multiple");
  } else {
    aType.AssignLiteral("select-one");
  }
}

void HTMLSelectElement::SetLength(uint32_t aLength, ErrorResult& aRv) {
  constexpr uint32_t kMaxDynamicSelectLength = 100000;

  uint32_t curlen = Length();

  if (curlen > aLength) {  // Remove extra options
    for (uint32_t i = curlen; i > aLength; --i) {
      Remove(i - 1);
    }
  } else if (aLength > curlen) {
    if (aLength > kMaxDynamicSelectLength) {
      nsAutoString strOptionsLength;
      strOptionsLength.AppendInt(aLength);

      nsAutoString strLimit;
      strLimit.AppendInt(kMaxDynamicSelectLength);

      nsContentUtils::ReportToConsole(
          nsIScriptError::warningFlag, "DOM"_ns, OwnerDoc(),
          PropertiesFile::DOM_PROPERTIES,
          "SelectOptionsLengthAssignmentWarning", {strOptionsLength, strLimit});
      return;
    }

    RefPtr<mozilla::dom::NodeInfo> nodeInfo;

    nsContentUtils::QNameChanged(mNodeInfo, nsGkAtoms::option,
                                 getter_AddRefs(nodeInfo));

    nsCOMPtr<nsINode> node = NS_NewHTMLOptionElement(nodeInfo.forget());
    for (uint32_t i = curlen; i < aLength; i++) {
      nsINode::AppendChild(*node, aRv);
      if (aRv.Failed()) {
        return;
      }

      if (i + 1 < aLength) {
        node = node->CloneNode(true, aRv);
        if (aRv.Failed()) {
          return;
        }
        MOZ_ASSERT(node);
      }
    }
  }
}

/* static */
bool HTMLSelectElement::MatchSelectedOptions(Element* aElement,
                                             int32_t /* unused */,
                                             nsAtom* /* unused */,
                                             void* /* unused*/) {
  // FIXME(bug 2035253): This is missing validity checks.
  HTMLOptionElement* option = HTMLOptionElement::FromNode(aElement);
  return option && option->Selected();
}

HTMLCollection* HTMLSelectElement::SelectedOptions() {
  if (!mSelectedOptions) {
    mSelectedOptions = new ContentList(this, MatchSelectedOptions, nullptr,
                                       nullptr, /* deep */ true);
  }
  return mSelectedOptions;
}

HTMLOptionElement* HTMLSelectElement::GetSelectedOption(
    IgnoredOptionList aIgnored) const {
  uint32_t len = Length();
  for (uint32_t i = 0; i < len; ++i) {
    auto* option = Item(i);
    if (option->Selected() && !aIgnored.Contains(option)) {
      return option;
    }
  }
  return nullptr;
}

int32_t HTMLSelectElement::SelectedIndex() const {
  uint32_t len = Length();
  for (uint32_t i = 0; i < len; ++i) {
    if (Item(i)->Selected()) {
      return static_cast<int32_t>(i);
    }
  }
  return -1;
}

void HTMLSelectElement::SetSelectedIndexInternal(int32_t aIndex, bool aNotify) {
  OptionFlags mask{OptionFlag::IsSelected, OptionFlag::ClearAll,
                   OptionFlag::SetDisabled};
  if (aNotify) {
    mask += OptionFlag::Notify;
  }
  SetOptionsSelectedByIndex(aIndex, aIndex, mask);
  if (nsListControlFrame* listBoxFrame = GetListBoxFrame()) {
    listBoxFrame->OnSetSelectedIndex(aIndex);
  }
  OnSelectionChanged();
}

bool HTMLSelectElement::IsOptionSelectedByIndex(int32_t aIndex) const {
  HTMLOptionElement* option = Item(static_cast<uint32_t>(aIndex));
  return option && option->Selected();
}

void HTMLSelectElement::OnOptionSelected(int32_t aIndex, bool aSelected,
                                         bool aChangeOptionState,
                                         bool aNotify) {
  if (aChangeOptionState) {
    // Tell the option to get its bad self selected
    if (RefPtr option = Item(static_cast<uint32_t>(aIndex))) {
      option->SetSelectedInternal(aSelected, aNotify);
    }
  }

  OnSelectionChanged();

  // Let the frame know too
  if (auto* listBox = GetListBoxFrame()) {
    listBox->OnOptionSelected(aIndex, aSelected);
  }

#ifdef ACCESSIBILITY
  if (nsAccessibilityService* acc = GetAccService(); acc && IsCombobox()) {
    acc->ComboboxValueChanged(this);
  }
#endif

  UpdateSelectedOptions();
  UpdateValueMissingValidityState();
  UpdateValidityElementStates(aNotify);
}

// XXX Consider splitting this into two functions for ease of reading:
// SelectOptionsByIndex(startIndex, endIndex, clearAll, checkDisabled)
//   startIndex, endIndex - the range of options to turn on
//                          (-1, -1) will clear all indices no matter what.
//   clearAll - will clear all other options unless checkDisabled is on
//              and all the options attempted to be set are disabled
//              (note that if it is not multiple, and an option is selected,
//              everything else will be cleared regardless).
//   checkDisabled - if this is TRUE, and an option is disabled, it will not be
//                   changed regardless of whether it is selected or not.
//                   Generally the UI passes TRUE and JS passes FALSE.
//                   (setDisabled currently is the opposite)
// DeselectOptionsByIndex(startIndex, endIndex, checkDisabled)
//   startIndex, endIndex - the range of options to turn on
//                          (-1, -1) will clear all indices no matter what.
//   checkDisabled - if this is TRUE, and an option is disabled, it will not be
//                   changed regardless of whether it is selected or not.
//                   Generally the UI passes TRUE and JS passes FALSE.
//                   (setDisabled currently is the opposite)
//
// XXXbz the above comment is pretty confusing.  Maybe we should actually
// document the args to this function too, in addition to documenting what
// things might end up looking like?  In particular, pay attention to the
// setDisabled vs checkDisabled business.
bool HTMLSelectElement::SetOptionsSelectedByIndex(int32_t aStartIndex,
                                                  int32_t aEndIndex,
                                                  OptionFlags aOptionsMask) {
#if 0
  printf("SetOption(%d-%d, %c, ClearAll=%c)\n", aStartIndex, aEndIndex,
                                      (aOptionsMask.contains(OptionFlag::IsSelected) ? 'Y' : 'N'),
                                      (aOptionsMask.contains(OptionFlag::ClearAll) ? 'Y' : 'N'));
#endif
  // Don't bother if the select is disabled
  if (!aOptionsMask.contains(OptionFlag::SetDisabled) && IsDisabled()) {
    return false;
  }

  // Don't bother if there are no options
  uint32_t numItems = Length();
  if (numItems == 0) {
    return false;
  }

  // First, find out whether multiple items can be selected
  bool isMultiple = Multiple();

  // These variables tell us whether any options were selected
  // or deselected.
  bool optionsSelected = false;
  bool optionsDeselected = false;

  if (aOptionsMask.contains(OptionFlag::IsSelected)) {
    // Setting selectedIndex to an out-of-bounds index means -1. (HTML5)
    if (aStartIndex < 0 || AssertedCast<uint32_t>(aStartIndex) >= numItems ||
        aEndIndex < 0 || AssertedCast<uint32_t>(aEndIndex) >= numItems) {
      aStartIndex = -1;
      aEndIndex = -1;
    }

    // Only select the first value if it's not multiple
    if (!isMultiple) {
      aEndIndex = aStartIndex;
    }

    // This variable tells whether or not all of the options we attempted to
    // select are disabled.  If ClearAll is passed in as true, and we do not
    // select anything because the options are disabled, we will not clear the
    // other options.  (This is to make the UI work the way one might expect.)
    bool allDisabled = !aOptionsMask.contains(OptionFlag::SetDisabled);

    //
    // Select the requested indices
    //
    // If index is -1, everything will be deselected (bug 28143)
    if (aStartIndex != -1) {
      MOZ_ASSERT(aStartIndex >= 0);
      MOZ_ASSERT(aEndIndex >= 0);
      // Loop through the options and select them (if they are not disabled and
      // if they are not already selected).
      for (uint32_t optIndex = AssertedCast<uint32_t>(aStartIndex);
           optIndex <= AssertedCast<uint32_t>(aEndIndex); optIndex++) {
        RefPtr<HTMLOptionElement> option = Item(optIndex);

        // Ignore disabled options.
        if (!aOptionsMask.contains(OptionFlag::SetDisabled)) {
          if (option && IsOptionDisabled(option)) {
            continue;
          }
          allDisabled = false;
        }

        // If the index is already selected, ignore it. On the other hand when
        // the option has just been inserted we have to get in sync with it.
        if (option && (aOptionsMask.contains(OptionFlag::InsertingOptions) ||
                       !option->Selected())) {
          OnOptionSelected(optIndex, true, !option->Selected(),
                           aOptionsMask.contains(OptionFlag::Notify));
          optionsSelected = true;
        }
      }
    }

    // Next remove all other options if single select or all is clear
    // If index is -1, everything will be deselected (bug 28143)
    if (((!isMultiple && optionsSelected) ||
         (aOptionsMask.contains(OptionFlag::ClearAll) && !allDisabled) ||
         aStartIndex == -1)) {
      for (uint32_t optIndex = 0; optIndex < numItems; optIndex++) {
        if (static_cast<int32_t>(optIndex) < aStartIndex ||
            static_cast<int32_t>(optIndex) > aEndIndex) {
          HTMLOptionElement* option = Item(optIndex);
          // If the index is already deselected, ignore it.
          if (option && option->Selected()) {
            OnOptionSelected(optIndex, false, true,
                             aOptionsMask.contains(OptionFlag::Notify));
            optionsDeselected = true;

            // Only need to deselect one option if not multiple, or if we're
            // inserting options (if multiple of the options we're inserting are
            // selected we need to deselect them all but one).
            if (!isMultiple &&
                !aOptionsMask.contains(OptionFlag::InsertingOptions)) {
              break;
            }
          }
        }
      }
    }
  } else {
    // If we're deselecting, loop through all selected items and deselect
    // any that are in the specified range.
    for (int32_t optIndex = aStartIndex; optIndex <= aEndIndex; optIndex++) {
      HTMLOptionElement* option = Item(optIndex);
      if (!aOptionsMask.contains(OptionFlag::SetDisabled) &&
          IsOptionDisabled(option)) {
        continue;
      }

      // If the index is already selected, ignore it.
      if (option->Selected()) {
        OnOptionSelected(optIndex, false, true,
                         aOptionsMask.contains(OptionFlag::Notify));
        optionsDeselected = true;
      }
    }
  }

  // Make sure something is selected unless we were set to -1 (none)
  if (optionsDeselected && aStartIndex != -1 &&
      !aOptionsMask.contains(OptionFlag::NoReselect)) {
    optionsSelected =
        TrySelectSomething(aOptionsMask.contains(OptionFlag::Notify)) ||
        optionsSelected;
  }

  // Let the caller know whether anything was changed
  return optionsSelected || optionsDeselected;
}

NS_IMETHODIMP
HTMLSelectElement::IsOptionDisabled(int32_t aIndex, bool* aIsDisabled) {
  *aIsDisabled = false;
  RefPtr<HTMLOptionElement> option = Item(aIndex);
  NS_ENSURE_TRUE(option, NS_ERROR_FAILURE);

  *aIsDisabled = IsOptionDisabled(option);
  return NS_OK;
}

bool HTMLSelectElement::IsOptionDisabled(HTMLOptionElement* aOption) const {
  MOZ_ASSERT(aOption);
  if (aOption->Disabled()) {
    return true;
  }

  // Check for disabled optgroups
  // If there are no artifacts, there are no optgroups
  for (Element* node = aOption->GetParentElement(); node;
       node = node->GetParentElement()) {
    // If we reached the select element, we're done
    if (node->IsHTMLElement(nsGkAtoms::select)) {
      return false;
    }
    auto* optGroupElement = HTMLOptGroupElement::FromNode(node);
    if (!optGroupElement) {
      // If you put something else between you and the optgroup, you're a
      // moron and you deserve not to have optgroup disabling work.
      return false;
    }
    if (optGroupElement->Disabled()) {
      return true;
    }
  }
  return false;
}

void HTMLSelectElement::GetValue(nsAString& aValue) const {
  int32_t selectedIndex = SelectedIndex();
  if (selectedIndex < 0) {
    return;
  }

  RefPtr<HTMLOptionElement> option = Item(static_cast<uint32_t>(selectedIndex));

  if (!option) {
    return;
  }

  option->GetValue(aValue);
}

void HTMLSelectElement::SetValue(const nsAString& aValue) {
  uint32_t length = Length();

  for (uint32_t i = 0; i < length; i++) {
    RefPtr<HTMLOptionElement> option = Item(i);
    if (!option) {
      continue;
    }

    nsAutoString optionVal;
    option->GetValue(optionVal);
    if (optionVal.Equals(aValue)) {
      SetSelectedIndexInternal(int32_t(i), true);
      return;
    }
  }
  // No matching option was found.
  SetSelectedIndexInternal(-1, true);
}

int32_t HTMLSelectElement::TabIndexDefault() { return 0; }

bool HTMLSelectElement::IsHTMLFocusable(IsFocusableFlags aFlags,
                                        bool* aIsFocusable,
                                        int32_t* aTabIndex) {
  if (nsGenericHTMLFormControlElementWithState::IsHTMLFocusable(
          aFlags, aIsFocusable, aTabIndex)) {
    return true;
  }

  *aIsFocusable = !IsDisabled();

  return false;
}

bool HTMLSelectElement::TrySelectSomething(bool aNotify,
                                           IgnoredOptionList aIgnored) {
  if (!mIsDoneAddingChildren || !IsCombobox()) {
    return false;
  }
  uint32_t count = Length();
  Maybe<uint32_t> indexToSelect;
  for (uint32_t i = 0; i < count; i++) {
    HTMLOptionElement* option = Item(i);
    if (option->Selected() && !aIgnored.Contains(option)) {
      return false;
    }
    if (indexToSelect || IsOptionDisabled(option) ||
        aIgnored.Contains(option)) {
      continue;
    }
    indexToSelect.emplace(i);
    // Keep looping to see if we find an already-selected option, in which case
    // we should bail out.
  }
  if (indexToSelect) {
    // Intentionally not going through SetSelectedIndexInternal, to avoid
    // unselecting options that should be ignored (in aIgnored).
    OnOptionSelected(*indexToSelect, true, true, aNotify);
    UpdateValueMissingValidityState(aIgnored);
    UpdateValidityElementStates(aNotify);
    return true;
  }
  return false;
}

nsresult HTMLSelectElement::BindToTree(BindContext& aContext,
                                       nsINode& aParent) {
  MOZ_TRY(
      nsGenericHTMLFormControlElementWithState::BindToTree(aContext, aParent));

  // If there is a disabled fieldset in the parent chain, the element is now
  // barred from constraint validation.
  // XXXbz is this still needed now that fieldset changes always call
  // FieldSetDisabledChanged?
  UpdateBarredFromConstraintValidation();

  // And now make sure our state is up to date
  UpdateValidityElementStates(false);

  if (IsInComposedDoc()) {
    if (!GetShadowRoot()) {
      SetupShadowTree();
    }
    SelectedContentTextMightHaveChanged(false);
  }

  return NS_OK;
}

void HTMLSelectElement::UnbindFromTree(UnbindContext& aContext) {
  // We don't bother clearing up the shadow tree here if we already have it
  // around.
  nsGenericHTMLFormControlElementWithState::UnbindFromTree(aContext);

  // We might be no longer disabled because our parent chain changed.
  // XXXbz is this still needed now that fieldset changes always call
  // FieldSetDisabledChanged?
  UpdateBarredFromConstraintValidation();

  // And now make sure our state is up to date
  UpdateValidityElementStates(false);
}

void HTMLSelectElement::BeforeSetAttr(int32_t aNameSpaceID, nsAtom* aName,
                                      const nsAttrValue* aValue, bool aNotify) {
  if (aNameSpaceID == kNameSpaceID_None) {
    if (aName == nsGkAtoms::disabled) {
      if (aNotify) {
        mDisabledChanged = true;
      }
    } else if (aName == nsGkAtoms::multiple) {
      if (!aValue && aNotify) {
        // We're changing from being a multi-select to a single-select.
        // Make sure we only have one option selected before we do that.
        // Note that this needs to come before we really unset the attr,
        // since SetOptionsSelectedByIndex does some bail-out type
        // optimization for cases when the select is not multiple that
        // would lead to only a single option getting deselected.
        SetSelectedIndexInternal(SelectedIndex(), aNotify);
      }
    }
  }

  return nsGenericHTMLFormControlElementWithState::BeforeSetAttr(
      aNameSpaceID, aName, aValue, aNotify);
}

void HTMLSelectElement::AfterSetAttr(int32_t aNameSpaceID, nsAtom* aName,
                                     const nsAttrValue* aValue,
                                     const nsAttrValue* aOldValue,
                                     nsIPrincipal* aSubjectPrincipal,
                                     bool aNotify) {
  if (aNameSpaceID == kNameSpaceID_None) {
    if (aName == nsGkAtoms::disabled) {
      // This *has* to be called *before* validity state check because
      // UpdateBarredFromConstraintValidation and
      // UpdateValueMissingValidityState depend on our disabled state.
      UpdateDisabledState(aNotify);

      UpdateValueMissingValidityState();
      UpdateBarredFromConstraintValidation();
      UpdateValidityElementStates(aNotify);
    } else if (aName == nsGkAtoms::required) {
      // This *has* to be called *before* UpdateValueMissingValidityState
      // because UpdateValueMissingValidityState depends on our required
      // state.
      UpdateRequiredState(!!aValue, aNotify);
      UpdateValueMissingValidityState();
      UpdateValidityElementStates(aNotify);
    } else if (aName == nsGkAtoms::autocomplete) {
      // Clear the cached @autocomplete attribute and autocompleteInfo state.
      mAutocompleteAttrState = nsContentUtils::eAutocompleteAttrState_Unknown;
      mAutocompleteInfoState = nsContentUtils::eAutocompleteAttrState_Unknown;
    } else if (aName == nsGkAtoms::multiple) {
      if (!aValue && aNotify) {
        // We might have become a combobox; make sure _something_ gets
        // selected in that case
        TrySelectSomething(aNotify);
      }
    }
  }

  return nsGenericHTMLFormControlElementWithState::AfterSetAttr(
      aNameSpaceID, aName, aValue, aOldValue, aSubjectPrincipal, aNotify);
}

void HTMLSelectElement::DoneAddingChildren(bool aHaveNotified) {
  mIsDoneAddingChildren = true;

  // PrototypeDocumentContentSink and innerHTML (and maybe XMLContentSink?) may
  // not notify for all children during parsing, so mark the options list dirty
  // at this point.
  mOptions->SetDirty();

  if (nsIContent* firstChild = GetFirstChild()) {
    ContentAppendedOrInserted(firstChild, /* aIsAppend = */ true);
  }

  // If we foolishly tried to restore before we were done adding
  // content, restore the rest of the options proper-like
  if (mRestoreState) {
    RestoreStateTo(*mRestoreState);
    mRestoreState = nullptr;
  }

  // Notify the frame
  if (auto* listBoxFrame = GetListBoxFrame()) {
    listBoxFrame->DoneAddingChildren();
  }

  if (!mInhibitStateRestoration) {
    GenerateStateKey();
    RestoreFormControlState();
  }

  mDefaultSelectionSet = true;
}

bool HTMLSelectElement::ParseAttribute(int32_t aNamespaceID, nsAtom* aAttribute,
                                       const nsAString& aValue,
                                       nsIPrincipal* aMaybeScriptedPrincipal,
                                       nsAttrValue& aResult) {
  if (kNameSpaceID_None == aNamespaceID) {
    if (aAttribute == nsGkAtoms::size) {
      return aResult.ParsePositiveIntValue(aValue);
    }
    if (aAttribute == nsGkAtoms::autocomplete) {
      aResult.ParseAtomArray(aValue);
      return true;
    }
  }
  return nsGenericHTMLFormControlElementWithState::ParseAttribute(
      aNamespaceID, aAttribute, aValue, aMaybeScriptedPrincipal, aResult);
}

void HTMLSelectElement::MapAttributesIntoRule(
    MappedDeclarationsBuilder& aBuilder) {
  nsGenericHTMLFormControlElementWithState::MapImageAlignAttributeInto(
      aBuilder);
  nsGenericHTMLFormControlElementWithState::MapCommonAttributesInto(aBuilder);
}

nsChangeHint HTMLSelectElement::GetAttributeChangeHint(
    const nsAtom* aAttribute, AttrModType aModType) const {
  nsChangeHint retval =
      nsGenericHTMLFormControlElementWithState::GetAttributeChangeHint(
          aAttribute, aModType);
  if (aAttribute == nsGkAtoms::multiple || aAttribute == nsGkAtoms::size) {
    retval |= nsChangeHint_ReconstructFrame;
  }
  return retval;
}

NS_IMETHODIMP_(bool)
HTMLSelectElement::IsAttributeMapped(const nsAtom* aAttribute) const {
  static const MappedAttributeEntry* const map[] = {sCommonAttributeMap,
                                                    sImageAlignAttributeMap};

  return FindAttributeDependence(aAttribute, map);
}

nsMapRuleToAttributesFunc HTMLSelectElement::GetAttributeMappingFunction()
    const {
  return &MapAttributesIntoRule;
}

bool HTMLSelectElement::IsDisabledForEvents(WidgetEvent* aEvent) {
  return IsElementDisabledForEvents(aEvent, GetPrimaryFrame());
}

void HTMLSelectElement::GetEventTargetParent(EventChainPreVisitor& aVisitor) {
  aVisitor.mCanHandle = false;
  if (IsDisabledForEvents(aVisitor.mEvent)) {
    return;
  }

  nsGenericHTMLFormControlElementWithState::GetEventTargetParent(aVisitor);
}

void HTMLSelectElement::UpdateValidityElementStates(bool aNotify) {
  AutoStateChangeNotifier notifier(*this, aNotify);
  RemoveStatesSilently(ElementState::VALIDITY_STATES);
  if (!IsCandidateForConstraintValidation()) {
    return;
  }

  ElementState state;
  if (IsValid()) {
    state |= ElementState::VALID;
    if (mUserInteracted) {
      state |= ElementState::USER_VALID;
    }
  } else {
    state |= ElementState::INVALID;
    if (mUserInteracted) {
      state |= ElementState::USER_INVALID;
    }
  }

  AddStatesSilently(state);
}

void HTMLSelectElement::SaveState() {
  PresState* presState = GetPrimaryPresState();
  if (!presState) {
    return;
  }

  SelectContentData state;

  uint32_t len = Length();

  for (uint32_t optIndex = 0; optIndex < len; optIndex++) {
    HTMLOptionElement* option = Item(optIndex);
    if (option && option->Selected()) {
      nsAutoString value;
      option->GetValue(value);
      if (value.IsEmpty()) {
        state.indices().AppendElement(optIndex);
      } else {
        state.values().AppendElement(std::move(value));
      }
    }
  }

  presState->contentData() = std::move(state);

  if (mDisabledChanged) {
    // We do not want to save the real disabled state but the disabled
    // attribute.
    presState->disabled() = HasAttr(nsGkAtoms::disabled);
    presState->disabledSet() = true;
  }
}

bool HTMLSelectElement::RestoreState(PresState* aState) {
  // Get the presentation state object to retrieve our stuff out of.
  const PresContentData& state = aState->contentData();
  if (state.type() == PresContentData::TSelectContentData) {
    RestoreStateTo(state.get_SelectContentData());

    // Don't flush, if the frame doesn't exist yet it doesn't care if
    // we're reset or not.
    DispatchContentReset();
  }

  if (aState->disabledSet() && !aState->disabled()) {
    SetDisabled(false, IgnoreErrors());
  }

  return false;
}

void HTMLSelectElement::RestoreStateTo(const SelectContentData& aNewSelected) {
  if (!mIsDoneAddingChildren) {
    // Make a copy of the state for us to restore from in the future.
    mRestoreState = MakeUnique<SelectContentData>(aNewSelected);
    return;
  }

  uint32_t len = Length();
  OptionFlags mask{OptionFlag::IsSelected, OptionFlag::ClearAll,
                   OptionFlag::SetDisabled, OptionFlag::Notify};

  // First clear all
  SetOptionsSelectedByIndex(-1, -1, mask);

  bool selectedAny = false;
  // Select by index.
  for (uint32_t idx : aNewSelected.indices()) {
    if (idx < len) {
      SetOptionsSelectedByIndex(idx, idx,
                                {OptionFlag::IsSelected,
                                 OptionFlag::SetDisabled, OptionFlag::Notify});
      selectedAny = true;
    }
  }

  // Select by value.
  for (uint32_t i = 0; i < len; ++i) {
    HTMLOptionElement* option = Item(i);
    if (option) {
      nsAutoString value;
      option->GetValue(value);
      if (aNewSelected.values().Contains(value)) {
        SetOptionsSelectedByIndex(
            i, i,
            {OptionFlag::IsSelected, OptionFlag::SetDisabled,
             OptionFlag::Notify});
        selectedAny = true;
      }
    }
  }

  // Select something if we need to.
  if (!selectedAny) {
    TrySelectSomething(true);
  }
}

// nsIFormControl

NS_IMETHODIMP
HTMLSelectElement::Reset() {
  uint32_t numSelected = 0;

  //
  // Cycle through the options array and reset the options
  //
  uint32_t numOptions = Length();

  for (uint32_t i = 0; i < numOptions; i++) {
    RefPtr<HTMLOptionElement> option = Item(i);
    if (option) {
      //
      // Reset the option to its default value
      //

      OptionFlags mask = {OptionFlag::SetDisabled, OptionFlag::Notify,
                          OptionFlag::NoReselect};
      if (option->DefaultSelected()) {
        mask += OptionFlag::IsSelected;
        numSelected++;
      }

      SetOptionsSelectedByIndex(i, i, mask);
      option->SetSelectedChanged(false);
    }
  }

  // If nothing was selected and it's not multiple, select something
  if (numSelected == 0) {
    TrySelectSomething(true);
  }

  OnSelectionChanged();
  SetUserInteracted(false);

  // Let the frame know we were reset
  //
  // Don't flush, if there's no frame yet it won't care about us being
  // reset even if we forced it to be created now.
  //
  DispatchContentReset();

  return NS_OK;
}

NS_IMETHODIMP
HTMLSelectElement::SubmitNamesValues(FormData* aFormData) {
  //
  // Get the name (if no name, no submit)
  //
  nsAutoString name;
  GetAttr(nsGkAtoms::name, name);
  if (name.IsEmpty()) {
    return NS_OK;
  }

  //
  // Submit
  //
  uint32_t len = Length();

  for (uint32_t optIndex = 0; optIndex < len; optIndex++) {
    HTMLOptionElement* option = Item(optIndex);

    // Don't send disabled options
    if (!option || IsOptionDisabled(option)) {
      continue;
    }

    if (!option->Selected()) {
      continue;
    }

    nsString value;
    option->GetValue(value);

    aFormData->AddNameValuePair(name, value);
  }

  return NS_OK;
}

void HTMLSelectElement::DispatchContentReset() {
  if (nsListControlFrame* listFrame = GetListBoxFrame()) {
    listFrame->OnContentReset();
  }
}

bool HTMLSelectElement::IsValueMissing(IgnoredOptionList aIgnored) const {
  if (!Required()) {
    return false;
  }

  uint32_t length = Length();

  bool first = true;
  for (uint32_t i = 0; i < length; ++i) {
    RefPtr<HTMLOptionElement> option = Item(i);
    // Check for a placeholder label option, don't count it as a valid value.
    if (first) {
      if (aIgnored.Contains(option)) {
        // We need to eagerly check for aIgnored to keep `first` correct,
        // effectively.
        continue;
      }
      first = false;
      if (!Multiple() && Size() <= 1 && option->GetParent() == this) {
        nsAutoString value;
        option->GetValue(value);
        if (value.IsEmpty()) {
          continue;
        }
      }
    }
    if (!option->Selected() || aIgnored.Contains(option)) {
      continue;
    }
    return false;
  }

  return true;
}

void HTMLSelectElement::UpdateValueMissingValidityState(
    IgnoredOptionList aIgnored) {
  SetValidityState(VALIDITY_STATE_VALUE_MISSING, IsValueMissing(aIgnored));
}

nsresult HTMLSelectElement::GetValidationMessage(nsAString& aValidationMessage,
                                                 ValidityStateType aType) {
  switch (aType) {
    case VALIDITY_STATE_VALUE_MISSING: {
      nsAutoString message;
      nsresult rv = nsContentUtils::GetMaybeLocalizedString(
          PropertiesFile::DOM_PROPERTIES, "FormValidationSelectMissing",
          OwnerDoc(), message);
      aValidationMessage = message;
      return rv;
    }
    default: {
      return ConstraintValidation::GetValidationMessage(aValidationMessage,
                                                        aType);
    }
  }
}

void HTMLSelectElement::UpdateBarredFromConstraintValidation() {
  SetBarredFromConstraintValidation(
      HasFlag(ELEMENT_IS_DATALIST_OR_HAS_DATALIST_ANCESTOR) || IsDisabled());
}

void HTMLSelectElement::FieldSetDisabledChanged(bool aNotify) {
  // This *has* to be called before UpdateBarredFromConstraintValidation and
  // UpdateValueMissingValidityState because these two functions depend on our
  // disabled state.
  nsGenericHTMLFormControlElementWithState::FieldSetDisabledChanged(aNotify);

  UpdateValueMissingValidityState();
  UpdateBarredFromConstraintValidation();
  UpdateValidityElementStates(aNotify);
}

void HTMLSelectElement::OnSelectionChanged() {
  SelectedContentTextMightHaveChanged();
  if (!mDefaultSelectionSet) {
    return;
  }

  if (State().HasState(ElementState::AUTOFILL)) {
    RemoveStates(ElementState::AUTOFILL | ElementState::AUTOFILL_PREVIEW);
  }

  UpdateSelectedOptions();
}

void HTMLSelectElement::UpdateSelectedOptions() {
  if (mSelectedOptions) {
    mSelectedOptions->SetDirty();
  }
}

void HTMLSelectElement::SetUserInteracted(bool aInteracted) {
  if (mUserInteracted == aInteracted) {
    return;
  }
  mUserInteracted = aInteracted;
  UpdateValidityElementStates(true);
}

void HTMLSelectElement::SetPreviewValue(const nsAString& aValue) {
  mPreviewValue = aValue;
  nsContentUtils::RemoveNewlines(mPreviewValue);
  SelectedContentTextMightHaveChanged();
}

static void OptionValueMightHaveChanged(nsIContent* aMutatingNode) {
#ifdef ACCESSIBILITY
  if (nsAccessibilityService* acc = GetAccService()) {
    acc->ComboboxOptionMaybeChanged(aMutatingNode->OwnerDoc()->GetPresShell(),
                                    aMutatingNode);
  }
#endif
}

void HTMLSelectElement::SelectedContentTextMightHaveChanged(
    bool aNotify, IgnoredOptionList aIgnored) {
  RefPtr textNode = GetSelectedContentText();
  if (!textNode) {
    return;
  }
  nsAutoString newText;
  if (!mPreviewValue.IsEmpty()) {
    newText.Assign(mPreviewValue);
  } else if (auto* selectedOption = GetSelectedOption(aIgnored)) {
    selectedOption->GetRenderedLabel(newText);
  }
  ButtonControlFrame::EnsureNonEmptyLabel(newText);
  textNode->SetText(newText, aNotify);
#ifdef ACCESSIBILITY
  if (nsAccessibilityService* acc = GetAccService()) {
    if (nsIFrame* f = GetPrimaryFrame()) {
      acc->ScheduleAccessibilitySubtreeUpdate(f->PresShell(), this);
    }
  }
#endif
}

void HTMLSelectElement::UserFinishedInteracting(bool aChanged) {
  SetUserInteracted(true);
  if (!aChanged) {
    return;
  }

  // Dispatch the input event.
  DebugOnly<nsresult> rvIgnored = nsContentUtils::DispatchInputEvent(this);
  NS_WARNING_ASSERTION(NS_SUCCEEDED(rvIgnored),
                       "Failed to dispatch input event");

  // Dispatch the change event.
  nsContentUtils::DispatchTrustedEvent(OwnerDoc(), this, u"change"_ns,
                                       CanBubble::eYes, Cancelable::eNo);
}

void HTMLSelectElement::AttributeChanged(dom::Element* aElement,
                                         int32_t aNameSpaceID,
                                         nsAtom* aAttribute, AttrModType,
                                         const nsAttrValue* aOldValue) {
  if (aElement->IsHTMLElement(nsGkAtoms::option) &&
      aNameSpaceID == kNameSpaceID_None && aAttribute == nsGkAtoms::label) {
    // A11y has its own mutation listener for this so no need to do
    // OptionValueMightHaveChanged().
    SelectedContentTextMightHaveChanged();
  }
}

static bool InsideSelectedOption(nsIContent* aContent,
                                 HTMLSelectElement* aLimit) {
  for (nsIContent* cur = aContent->GetParent(); cur != aLimit;
       cur = cur->GetParent()) {
    if (auto* option = HTMLOptionElement::FromNode(cur)) {
      return option->Selected();
    }
  }
  return false;
}

void HTMLSelectElement::CharacterDataChanged(nsIContent* aContent,
                                             const CharacterDataChangeInfo&) {
  if (IsInComposedDoc() && IsCombobox() &&
      nsContentUtils::IsInSameAnonymousTree(this, aContent)) {
    OptionValueMightHaveChanged(aContent);
    if (InsideSelectedOption(aContent, this)) {
      SelectedContentTextMightHaveChanged();
    }
  }
}

using MutatedOptions = AutoTArray<RefPtr<HTMLOptionElement>, 8>;

// Collect all the options valid for `aSelect` in `aChild`'s subtree into
// `aOptions`. Returns true if there is any selected option.
static bool CollectOptions(const HTMLSelectElement& aSelect, nsIContent* aChild,
                           MutatedOptions& aOptions) {
  if (auto* option = HTMLOptionElement::FromNode(aChild)) {
    if (!HTMLOptionsCollection::IsValidOption(*option, aSelect)) {
      return false;
    }
    // Options inside options are not a thing.
    aOptions.AppendElement(option);
    return option->Selected();
  }
  bool anySelected = false;
  for (auto* c = aChild->GetFirstChild(); c; c = c->GetNextNode(aChild)) {
    auto* option = HTMLOptionElement::FromNode(c);
    if (!option || !HTMLOptionsCollection::IsValidOption(*option, aSelect)) {
      continue;
    }
    aOptions.AppendElement(option);
    if (option->Selected()) {
      anySelected = true;
    }
  }
  return anySelected;
}

void HTMLSelectElement::ContentWillBeRemoved(nsIContent* aChild,
                                             const ContentRemoveInfo& aInfo) {
  if (!nsContentUtils::IsInSameAnonymousTree(this, aChild)) {
    return;
  }
  MutatedOptions options;
  const bool anySelected = CollectOptions(*this, aChild, options);
  if (!options.IsEmpty()) {
    if (nsListControlFrame* listBox = GetListBoxFrame()) {
      auto index = options[0]->Index();
      for (size_t i = 0; i < options.Length(); ++i) {
        listBox->RemoveOption(index);
      }
    }
  }
  if (!Multiple() && anySelected) {
    // We're removing the selected option, switch the selection.
    if (!TrySelectSomething(true, options)) {
      // We might have lost our last selectable option.
      UpdateValueMissingValidityState(options);
      UpdateValidityElementStates(true);
    }
  }
  if (IsInComposedDoc() && IsCombobox()) {
    OptionValueMightHaveChanged(aChild);
    if (anySelected || InsideSelectedOption(aChild, this)) {
      // If there's any selected option getting removed, we need to call
      // SelectedContentTextMightHaveChanged ignoring the options here
      // to get the correct text.
      // TODO(emilio): Maybe plumb options down further or something.
      SelectedContentTextMightHaveChanged(true, options);
    }
  }
  if (!options.IsEmpty()) {
    // NOTE(emilio): This is a bit of a hack. Our mOptions list gets notified of
    // mutations before us, which is generally what we want. However, for
    // removal it is _not_ what we want, since we look at the pre-removal
    // options list here. If any code above brings it up to date, then there's
    // no other notification for it to invalidate again, which would leave stale
    // options in the list. So gotta invalidate it manually here.
    mOptions->SetDirty();
  }
}

void HTMLSelectElement::ContentAppendedOrInserted(nsIContent* aFirstNewContent,
                                                  bool aIsAppend) {
  if (!nsContentUtils::IsInSameAnonymousTree(this, aFirstNewContent)) {
    return;
  }
  MutatedOptions options;
  // Inserting selected options de-selects all others per spec.
  bool anySelected = false;
  for (auto* cur = aFirstNewContent; cur; cur = cur->GetNextSibling()) {
    anySelected |= CollectOptions(*this, cur, options);
    if (!aIsAppend) {
      break;
    }
  }
  if (!options.IsEmpty()) {
    if (nsListControlFrame* listBox = GetListBoxFrame()) {
      listBox->OptionsAdded();
    }
  }
  if (anySelected && !Multiple()) {
    // Select the last selected option.
    HTMLOptionElement* lastSelected = nullptr;
    for (HTMLOptionElement* opt : Reversed(options)) {
      if (opt->Selected()) {
        lastSelected = opt;
        break;
      }
    }
    MOZ_ASSERT(lastSelected, "How?");
    int32_t indexToSelect = lastSelected->Index();
    const OptionFlags mask{OptionFlag::IsSelected, OptionFlag::ClearAll,
                           OptionFlag::SetDisabled, OptionFlag::Notify,
                           OptionFlag::InsertingOptions};
    SetOptionsSelectedByIndex(indexToSelect, indexToSelect, mask);
  }

  if (IsCombobox()) {
    if (!anySelected) {
      TrySelectSomething(true);
    }
    if (IsInComposedDoc()) {
      OptionValueMightHaveChanged(aFirstNewContent);
      if (InsideSelectedOption(aFirstNewContent, this)) {
        SelectedContentTextMightHaveChanged();
      }
    }
  } else if (GetValidityState(VALIDITY_STATE_VALUE_MISSING)) {
    // If we add an already-selected option we might not be missing a value
    // anymore.
    UpdateValueMissingValidityState();
    UpdateValidityElementStates(true);
  }
}

void HTMLSelectElement::ContentAppended(nsIContent* aFirstNewContent,
                                        const ContentAppendInfo&) {
  ContentAppendedOrInserted(aFirstNewContent, true);
}

void HTMLSelectElement::ContentInserted(nsIContent* aChild,
                                        const ContentInsertInfo&) {
  ContentAppendedOrInserted(aChild, false);
}

JSObject* HTMLSelectElement::WrapNode(JSContext* aCx,
                                      JS::Handle<JSObject*> aGivenProto) {
  return HTMLSelectElement_Binding::Wrap(aCx, this, aGivenProto);
}

HTMLSelectElement::~HTMLSelectElement() {
  if (sLastSelectKeyHandler == uintptr_t(this)) {
    sLastSelectKeyHandler = 0;
  }
}

static constexpr int32_t kNothingSelected = -1;
static const uint32_t kMaxDropdownRows = 20;

class MOZ_RAII AutoIncrementalSearchResetter {
 public:
  explicit AutoIncrementalSearchResetter(HTMLSelectElement& aElement) {
    if (sLastSelectKeyHandler != uintptr_t(&aElement)) {
      sLastSelectKeyHandler = uintptr_t(&aElement);
      GetIncrementalString().Truncate();
      gLastKeyTime = TimeStamp::Now() -
                     TimeDuration::FromMilliseconds(
                         StaticPrefs::ui_menu_incremental_search_timeout() * 2);
    }
  }
  ~AutoIncrementalSearchResetter() {
    if (!mResettingCancelled) {
      GetIncrementalString().Truncate();
    }
  }
  void CancelResetting() { mResettingCancelled = true; }

 private:
  bool mResettingCancelled = false;
};

int32_t HTMLSelectElement::GetEndSelectionIndex() const {
  if (nsListControlFrame* lf = do_QueryFrame(GetPrimaryFrame())) {
    return lf->GetEndSelectionIndex();
  }
  return SelectedIndex();
}

bool HTMLSelectElement::IsOptionInteractivelySelectable(uint32_t aIndex) const {
  HTMLOptionElement* option = Item(aIndex);
  return option && ::IsOptionInteractivelySelectable(*this, *option);
}

int32_t HTMLSelectElement::ItemsPerPage() const {
  uint32_t size = [&] {
    if (IsCombobox()) {
      return kMaxDropdownRows;
    }
    if (nsListControlFrame* lf = do_QueryFrame(GetPrimaryFrame())) {
      return lf->GetNumDisplayRows();
    }
    return Size();
  }();
  if (size <= 1) {
    return 1;
  }
  if (MOZ_UNLIKELY(size > INT32_MAX)) {
    return INT32_MAX - 1;
  }
  return AssertedCast<int32_t>(size - 1u);
}

void HTMLSelectElement::AdjustIndexForDisabledOpt(int32_t aStartIndex,
                                                  int32_t& aNewIndex,
                                                  int32_t aNumOptions,
                                                  int32_t aDoAdjustInc,
                                                  int32_t aDoAdjustIncNext) {
  if (aNumOptions == 0) {
    aNewIndex = kNothingSelected;
    return;
  }

  bool doingReverse = false;
  int32_t bottom = 0;
  int32_t top = aNumOptions;

  int32_t startIndex = aStartIndex;
  if (startIndex < bottom) {
    startIndex = SelectedIndex();
  }
  int32_t newIndex = startIndex + aDoAdjustInc;

  if (newIndex < bottom) {
    newIndex = 0;
  } else if (newIndex >= top) {
    newIndex = aNumOptions - 1;
  }

  while (true) {
    if (IsOptionInteractivelySelectable(newIndex)) {
      break;
    }

    newIndex += aDoAdjustIncNext;

    if (newIndex < bottom) {
      if (doingReverse) {
        return;
      }
      newIndex = bottom;
      aDoAdjustIncNext = 1;
      doingReverse = true;
      top = startIndex;
    } else if (newIndex >= top) {
      if (doingReverse) {
        return;
      }
      newIndex = top - 1;
      aDoAdjustIncNext = -1;
      doingReverse = true;
      bottom = startIndex;
    }
  }

  aNewIndex = newIndex;
}

HTMLOptionElement* HTMLSelectElement::GetCurrentOption() const {
  int32_t endIndex = GetEndSelectionIndex();
  int32_t focusedIndex =
      endIndex == kNothingSelected ? SelectedIndex() : endIndex;
  if (focusedIndex >= 0) {
    return Item(AssertedCast<uint32_t>(focusedIndex));
  }
  return GetNonDisabledOptionFrom(0);
}

HTMLOptionElement* HTMLSelectElement::GetNonDisabledOptionFrom(
    int32_t aFromIndex, int32_t* aFoundIndex) const {
  const uint32_t length = Length();
  for (uint32_t i = std::max(aFromIndex, 0); i < length; ++i) {
    if (IsOptionInteractivelySelectable(i)) {
      if (aFoundIndex) {
        *aFoundIndex = i;
      }
      return Item(i);
    }
  }
  return nullptr;
}

void HTMLSelectElement::FireDropDownEvent(bool aShow,
                                          bool aIsSourceTouchEvent) {
  const auto eventName = [&] {
    if (aShow) {
      return aIsSourceTouchEvent ? u"mozshowdropdown-sourcetouch"_ns
                                 : u"mozshowdropdown"_ns;
    }
    return u"mozhidedropdown"_ns;
  }();
  nsContentUtils::DispatchChromeEvent(OwnerDoc(), this, eventName,
                                      CanBubble::eYes, Cancelable::eNo);
}

void HTMLSelectElement::PostHandleKeyEvent(int32_t aNewIndex,
                                           uint32_t aCharCode, bool aIsShift,
                                           bool aIsControlOrMeta) {
  if (aNewIndex == kNothingSelected) {
    int32_t endIndex = GetEndSelectionIndex();
    int32_t focusedIndex =
        endIndex == kNothingSelected ? SelectedIndex() : endIndex;
    if (focusedIndex != kNothingSelected) {
      return;
    }
    if (!GetNonDisabledOptionFrom(0, &aNewIndex)) {
      return;
    }
  }

  if (IsCombobox()) {
    RefPtr<HTMLOptionElement> newOption = Item(aNewIndex);
    MOZ_ASSERT(newOption);
    if (newOption->Selected()) {
      return;
    }
    newOption->SetSelected(true);
    UserFinishedInteracting(/* aChanged = */ true);
    return;
  }
  if (nsListControlFrame* lf = GetListBoxFrame()) {
    lf->UpdateSelectionAfterKeyEvent(aNewIndex, aCharCode, aIsShift,
                                     aIsControlOrMeta, mControlSelectMode);
  }
}

nsresult HTMLSelectElement::PostHandleEvent(EventChainPostVisitor& aVisitor) {
  if (aVisitor.mEventStatus == nsEventStatus_eConsumeNoDefault) {
    return NS_OK;
  }

  WidgetEvent* event = aVisitor.mEvent;
  if (!event->IsTrusted()) {
    return NS_OK;
  }

  switch (event->mMessage) {
    case eKeyDown:
      return HandleKeyDown(aVisitor);
    case eKeyPress:
      return HandleKeyPress(aVisitor);
    case eMouseDown:
      if (event->DefaultPrevented()) {
        return NS_OK;
      }
      return HandleMouseDown(aVisitor);
    case eMouseUp:
      // Don't try to honor defaultPrevented here - it's not web compatible.
      // (bug 1194733)
      return HandleMouseUp(aVisitor);
    case eMouseMove:
      return HandleMouseMove(aVisitor);
    default:
      break;
  }
  return NS_OK;
}

nsresult HTMLSelectElement::HandleMouseDown(EventChainPostVisitor& aVisitor) {
  if (IsDisabled()) {
    return NS_OK;
  }

  WidgetMouseEvent* mouseEvent = aVisitor.mEvent->AsMouseEvent();
  if (!mouseEvent) {
    return NS_OK;
  }

  const bool isLeftButton = mouseEvent->mButton == MouseButton::ePrimary;
  if (!isLeftButton) {
    return NS_OK;
  }

  if (IsCombobox()) {
    uint16_t inputSource = mouseEvent->mInputSource;
    if (OpenInParentProcess()) {
      nsCOMPtr<nsIContent> target =
          nsIContent::FromEventTargetOrNull(aVisitor.mEvent->mOriginalTarget);
      if (target && target->IsHTMLElement(nsGkAtoms::option)) {
        return NS_OK;
      }
    }
    const bool isSourceTouchEvent =
        inputSource == MouseEvent_Binding::MOZ_SOURCE_TOUCH;
    FireDropDownEvent(!OpenInParentProcess(), isSourceTouchEvent);
    return NS_OK;
  }

  if (nsListControlFrame* list = GetListBoxFrame()) {
    mButtonDown = true;
    return list->HandleLeftButtonMouseDown(*mouseEvent);
  }
  return NS_OK;
}

nsresult HTMLSelectElement::HandleMouseUp(EventChainPostVisitor& aVisitor) {
  mButtonDown = false;

  if (IsDisabled()) {
    return NS_OK;
  }

  if (nsListControlFrame* lf = GetListBoxFrame()) {
    lf->CaptureMouseEvents(false);
  }

  WidgetMouseEvent* mouseEvent = aVisitor.mEvent->AsMouseEvent();
  if (!mouseEvent) {
    return NS_OK;
  }

  const bool isLeftButton = mouseEvent->mButton == MouseButton::ePrimary;
  if (!isLeftButton) {
    return NS_OK;
  }

  if (nsListControlFrame* lf = GetListBoxFrame()) {
    return lf->HandleLeftButtonMouseUp();
  }

  return NS_OK;
}

nsresult HTMLSelectElement::HandleMouseMove(EventChainPostVisitor& aVisitor) {
  if (!mButtonDown) {
    return NS_OK;
  }

  WidgetMouseEvent* mouseEvent = aVisitor.mEvent->AsMouseEvent();
  if (!mouseEvent) {
    return NS_OK;
  }

  if (nsListControlFrame* lf = GetListBoxFrame()) {
    return lf->DragMove(*mouseEvent);
  }

  return NS_OK;
}

nsresult HTMLSelectElement::HandleKeyPress(EventChainPostVisitor& aVisitor) {
  if (IsDisabled()) {
    return NS_OK;
  }

  AutoIncrementalSearchResetter incrementalHandler(*this);

  const WidgetKeyboardEvent* keyEvent = aVisitor.mEvent->AsKeyboardEvent();
  MOZ_ASSERT(keyEvent,
             "DOM event must have WidgetKeyboardEvent for its internal event");

  if (keyEvent->DefaultPrevented()) {
    return NS_OK;
  }

  if (keyEvent->IsAlt()) {
    return NS_OK;
  }

  // With some keyboard layout, space key causes non-ASCII space.
  // So, the check in keydown event handler isn't enough, we need to check it
  // again with keypress event.
  if (keyEvent->mCharCode != ' ') {
    mControlSelectMode = false;
  }

  const bool isCombobox = IsCombobox();
  const bool isControlOrMeta = keyEvent->IsControl()
#if !defined(XP_WIN) && !defined(MOZ_WIDGET_GTK)
                               || keyEvent->IsMeta()
#endif
      ;
  if (isControlOrMeta && keyEvent->mCharCode != ' ') {
    AutoShortcutKeyCandidateArray candidates;
    keyEvent->GetShortcutKeyCandidates(candidates);
    const bool isSelectAll =
        Multiple() && !isCombobox &&
        std::any_of(candidates.begin(), candidates.end(),
                    [](const ShortcutKeyCandidate& c) {
                      return c.mCharCode == 'a' || c.mCharCode == 'A';
                    });
    if (isSelectAll) {
      using OptionFlag = HTMLSelectElement::OptionFlag;
      uint32_t numOptions = Length();
      if (numOptions) {
        HTMLSelectElement::OptionFlags mask = {
            OptionFlag::IsSelected, OptionFlag::ClearAll, OptionFlag::Notify};
        const bool wasChanged = SetOptionsSelectedByIndex(
            0, AssertedCast<int32_t>(numOptions - 1), mask);
        if (wasChanged) {
          UserFinishedInteracting(/* aChanged = */ true);
        }
      }
      aVisitor.mEvent->PreventDefault();
    }
    return NS_OK;
  }

  if (!keyEvent->mCharCode) {
    if (keyEvent->mKeyCode == NS_VK_BACK) {
      incrementalHandler.CancelResetting();
      if (!GetIncrementalString().IsEmpty()) {
        GetIncrementalString().Truncate(GetIncrementalString().Length() - 1);
      }
      aVisitor.mEvent->PreventDefault();
    }
    return NS_OK;
  }

  incrementalHandler.CancelResetting();

  aVisitor.mEvent->PreventDefault();

  if ((keyEvent->mTimeStamp - gLastKeyTime).ToMilliseconds() >
      StaticPrefs::ui_menu_incremental_search_timeout()) {
    if (keyEvent->mCharCode == ' ') {
      PostHandleKeyEvent(GetEndSelectionIndex(), keyEvent->mCharCode,
                         keyEvent->IsShift(), isControlOrMeta);
      return NS_OK;
    }
    GetIncrementalString().Truncate();
  }

  gLastKeyTime = keyEvent->mTimeStamp;

  char16_t uniChar = ToLowerCase(static_cast<char16_t>(keyEvent->mCharCode));
  GetIncrementalString().Append(uniChar);

  nsAutoString incrementalString(GetIncrementalString());
  uint32_t charIndex = 1, stringLength = incrementalString.Length();
  while (charIndex < stringLength &&
         incrementalString[charIndex] == incrementalString[charIndex - 1]) {
    charIndex++;
  }
  if (charIndex == stringLength) {
    incrementalString.Truncate(1);
    stringLength = 1;
  }

  int32_t startIndex = SelectedIndex();
  if (startIndex == kNothingSelected) {
    startIndex = 0;
  } else if (stringLength == 1) {
    startIndex++;
  }

  RefPtr<HTMLOptionsCollection> options = Options();
  uint32_t numOptions = options->Length();

  for (uint32_t i = 0; i < numOptions; ++i) {
    uint32_t index = (i + startIndex) % numOptions;
    RefPtr<HTMLOptionElement> optionElement = options->ItemAsOption(index);
    if (!optionElement ||
        !::IsOptionInteractivelySelectable(*this, *optionElement)) {
      continue;
    }

    nsAutoString text;
    optionElement->GetRenderedLabel(text);
    if (!StringBeginsWith(
            nsContentUtils::TrimWhitespace<
                nsContentUtils::IsHTMLWhitespaceOrNBSP>(text, false),
            incrementalString, nsCaseInsensitiveStringComparator)) {
      continue;
    }

    if (isCombobox) {
      if (optionElement->Selected()) {
        return NS_OK;
      }
      optionElement->SetSelected(true);
      UserFinishedInteracting(/* aChanged = */ true);
      return NS_OK;
    }

    if (nsListControlFrame* lf = GetListBoxFrame()) {
      bool wasChanged =
          lf->PerformSelection(index, keyEvent->IsShift(), isControlOrMeta);
      if (!wasChanged) {
        return NS_OK;
      }
      UserFinishedInteracting(/* aChanged = */ true);
    }
    break;
  }

  return NS_OK;
}

nsresult HTMLSelectElement::HandleKeyDown(EventChainPostVisitor& aVisitor) {
  if (IsDisabled()) {
    return NS_OK;
  }

  AutoIncrementalSearchResetter incrementalHandler(*this);

  if (aVisitor.mEvent->DefaultPrevented()) {
    return NS_OK;
  }

  const WidgetKeyboardEvent* keyEvent = aVisitor.mEvent->AsKeyboardEvent();
  MOZ_ASSERT(keyEvent,
             "DOM event must have WidgetKeyboardEvent for its internal event");

  const bool isCombobox = IsCombobox();
  bool dropDownMenuOnUpDown;
  bool dropDownMenuOnSpace;
#ifdef XP_MACOSX
  dropDownMenuOnUpDown = isCombobox && !OpenInParentProcess();
  dropDownMenuOnSpace = isCombobox && !keyEvent->IsAlt() &&
                        !keyEvent->IsControl() && !keyEvent->IsMeta();
#else
  dropDownMenuOnUpDown = isCombobox && keyEvent->IsAlt();
  dropDownMenuOnSpace = isCombobox && !OpenInParentProcess();
#endif
  bool withinIncrementalSearchTime =
      (keyEvent->mTimeStamp - gLastKeyTime).ToMilliseconds() <=
      StaticPrefs::ui_menu_incremental_search_timeout();
  if ((dropDownMenuOnUpDown &&
       (keyEvent->mKeyCode == NS_VK_UP || keyEvent->mKeyCode == NS_VK_DOWN)) ||
      (dropDownMenuOnSpace && keyEvent->mKeyCode == NS_VK_SPACE &&
       !withinIncrementalSearchTime)) {
    FireDropDownEvent(!OpenInParentProcess(), false);
    aVisitor.mEvent->PreventDefault();
    return NS_OK;
  }
  if (keyEvent->IsAlt()) {
    return NS_OK;
  }

  // We should not change the selection if the popup is "opened in the parent
  // process" (even when we're in single-process mode).
  const bool shouldSelect = !isCombobox || !OpenInParentProcess();

  RefPtr<HTMLOptionsCollection> options = Options();
  uint32_t numOptions = options->Length();

  int32_t newIndex = kNothingSelected;

  bool isControlOrMeta = keyEvent->IsControl()
#if !defined(XP_WIN) && !defined(MOZ_WIDGET_GTK)
                         || keyEvent->IsMeta()
#endif
      ;
  if (isControlOrMeta && !Multiple() &&
      (keyEvent->mKeyCode == NS_VK_PAGE_UP ||
       keyEvent->mKeyCode == NS_VK_PAGE_DOWN)) {
    return NS_OK;
  }
  if (isControlOrMeta &&
      (keyEvent->mKeyCode == NS_VK_UP || keyEvent->mKeyCode == NS_VK_LEFT ||
       keyEvent->mKeyCode == NS_VK_DOWN || keyEvent->mKeyCode == NS_VK_RIGHT ||
       keyEvent->mKeyCode == NS_VK_HOME || keyEvent->mKeyCode == NS_VK_END)) {
    isControlOrMeta = mControlSelectMode = Multiple();
  } else if (keyEvent->mKeyCode != NS_VK_SPACE) {
    mControlSelectMode = false;
  }

  auto isVerticalRL = [this]() -> bool {
    if (nsIFrame* f = GetPrimaryFrame()) {
      return f->GetWritingMode().IsVerticalRL();
    }
    return false;
  };

  switch (keyEvent->mKeyCode) {
    case NS_VK_UP:
      if (shouldSelect) {
        AdjustIndexForDisabledOpt(GetEndSelectionIndex(), newIndex,
                                  int32_t(numOptions), -1, -1);
      }
      break;
    case NS_VK_LEFT:
      if (shouldSelect) {
        int dir = isVerticalRL() ? 1 : -1;
        AdjustIndexForDisabledOpt(GetEndSelectionIndex(), newIndex,
                                  int32_t(numOptions), dir, dir);
      }
      break;
    case NS_VK_DOWN:
      if (shouldSelect) {
        AdjustIndexForDisabledOpt(GetEndSelectionIndex(), newIndex,
                                  int32_t(numOptions), 1, 1);
      }
      break;
    case NS_VK_RIGHT:
      if (shouldSelect) {
        int dir = isVerticalRL() ? -1 : 1;
        AdjustIndexForDisabledOpt(GetEndSelectionIndex(), newIndex,
                                  int32_t(numOptions), dir, dir);
      }
      break;
    case NS_VK_RETURN:
      if (!Multiple()) {
        return NS_OK;
      }
      newIndex = GetEndSelectionIndex();
      break;
    case NS_VK_PAGE_UP: {
      if (shouldSelect) {
        AdjustIndexForDisabledOpt(GetEndSelectionIndex(), newIndex,
                                  int32_t(numOptions), -ItemsPerPage(), -1);
      }
      break;
    }
    case NS_VK_PAGE_DOWN: {
      if (shouldSelect) {
        AdjustIndexForDisabledOpt(GetEndSelectionIndex(), newIndex,
                                  int32_t(numOptions), ItemsPerPage(), 1);
      }
      break;
    }
    case NS_VK_HOME:
      if (shouldSelect) {
        AdjustIndexForDisabledOpt(0, newIndex, int32_t(numOptions), 0, 1);
      }
      break;
    case NS_VK_END:
      if (shouldSelect) {
        AdjustIndexForDisabledOpt(int32_t(numOptions) - 1, newIndex,
                                  int32_t(numOptions), 0, -1);
      }
      break;
    default:
      incrementalHandler.CancelResetting();
      return NS_OK;
  }

  aVisitor.mEvent->PreventDefault();

  PostHandleKeyEvent(newIndex, 0, keyEvent->IsShift(), isControlOrMeta);
  return NS_OK;
}

}  // namespace mozilla::dom
