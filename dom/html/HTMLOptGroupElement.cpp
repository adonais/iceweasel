/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "mozilla/dom/HTMLOptGroupElement.h"

#include "mozilla/EventDispatcher.h"
#include "mozilla/dom/HTMLOptGroupElementBinding.h"
#include "mozilla/dom/HTMLSelectElement.h"
#include "nsGkAtoms.h"
#include "nsIFrame.h"

NS_IMPL_NS_NEW_HTML_ELEMENT(OptGroup)

namespace mozilla::dom {

/**
 * The implementation of &lt;optgroup&gt;
 */

HTMLOptGroupElement::HTMLOptGroupElement(
    already_AddRefed<mozilla::dom::NodeInfo>&& aNodeInfo)
    : nsGenericHTMLElement(std::move(aNodeInfo)) {
  // We start off enabled
  AddStatesSilently(ElementState::ENABLED);
}

HTMLOptGroupElement::~HTMLOptGroupElement() = default;

NS_IMPL_ELEMENT_CLONE(HTMLOptGroupElement)

void HTMLOptGroupElement::GetEventTargetParent(EventChainPreVisitor& aVisitor) {
  aVisitor.mCanHandle = false;
  nsGenericHTMLElement::GetEventTargetParent(aVisitor);
}

HTMLSelectElement* HTMLOptGroupElement::GetSelect() const {
  return HTMLSelectElement::FromNodeOrNull(GetParentNode());
}

void HTMLOptGroupElement::AfterSetAttr(int32_t aNameSpaceID, nsAtom* aName,
                                       const nsAttrValue* aValue,
                                       const nsAttrValue* aOldValue,
                                       nsIPrincipal* aSubjectPrincipal,
                                       bool aNotify) {
  if (aNameSpaceID == kNameSpaceID_None && aName == nsGkAtoms::disabled) {
    ElementState disabledStates;
    if (aValue) {
      disabledStates |= ElementState::DISABLED;
    } else {
      disabledStates |= ElementState::ENABLED;
    }

    ElementState oldDisabledStates = State() & ElementState::DISABLED_STATES;
    ElementState changedStates = disabledStates ^ oldDisabledStates;

    if (!changedStates.IsEmpty()) {
      ToggleStates(changedStates, aNotify);

      // All our children <option> have their :disabled state depending on our
      // disabled attribute. We should make sure their state is updated.
      for (nsIContent* child = nsINode::GetFirstChild(); child;
           child = child->GetNextSibling()) {
        if (auto optElement = HTMLOptionElement::FromNode(child)) {
          optElement->OptGroupDisabledChanged(true);
        }
      }
    }
  }

  return nsGenericHTMLElement::AfterSetAttr(
      aNameSpaceID, aName, aValue, aOldValue, aSubjectPrincipal, aNotify);
}

JSObject* HTMLOptGroupElement::WrapNode(JSContext* aCx,
                                        JS::Handle<JSObject*> aGivenProto) {
  return HTMLOptGroupElement_Binding::Wrap(aCx, this, aGivenProto);
}

}  // namespace mozilla::dom
