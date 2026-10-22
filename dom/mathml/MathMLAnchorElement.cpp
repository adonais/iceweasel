/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "mozilla/dom/MathMLAnchorElement.h"

#include "mozilla/dom/Document.h"
#include "mozilla/dom/MathMLAnchorElementBinding.h"
#include "nsContentUtils.h"
#include "nsGkAtoms.h"

namespace mozilla::dom {

NS_IMPL_CYCLE_COLLECTION_INHERITED(MathMLAnchorElement, MathMLElement, mRelList)

NS_INTERFACE_MAP_BEGIN_CYCLE_COLLECTION(MathMLAnchorElement)
  NS_INTERFACE_MAP_ENTRY(Link)
NS_INTERFACE_MAP_END_INHERITING(MathMLElement)

NS_IMPL_ADDREF_INHERITED(MathMLAnchorElement, MathMLElement)
NS_IMPL_RELEASE_INHERITED(MathMLAnchorElement, MathMLElement)

MathMLAnchorElement::MathMLAnchorElement(
    already_AddRefed<mozilla::dom::NodeInfo>&& aNodeInfo)
    : MathMLElement(std::move(aNodeInfo)) {}

JSObject* MathMLAnchorElement::WrapNode(JSContext* aCx,
                                        JS::Handle<JSObject*> aGivenProto) {
  return MathMLAnchorElement_Binding::Wrap(aCx, this, aGivenProto);
}

void MathMLAnchorElement::GetBaseTarget(nsAString& aValue) const {
  OwnerDoc()->GetBaseTarget(aValue);
}

void MathMLAnchorElement::GetLinkTargetImpl(nsAString& aTarget) {
  GetAttr(nsGkAtoms::target, aTarget);
  if (aTarget.IsEmpty()) {
    GetBaseTarget(aTarget);
  }
}

nsDOMTokenList* MathMLAnchorElement::RelList() {
  if (!mRelList) {
    mRelList =
        new nsDOMTokenList(this, nsGkAtoms::rel, sAnchorAndFormRelValues);
  }
  return mRelList;
}

bool MathMLAnchorElement::ParseAttribute(int32_t aNamespaceID,
                                         nsAtom* aAttribute,
                                         const nsAString& aValue,
                                         nsIPrincipal* aMaybeScriptedPrincipal,
                                         nsAttrValue& aResult) {
  if (aNamespaceID == kNameSpaceID_None) {
    if (aAttribute == nsGkAtoms::rel) {
      aResult.ParseAtomArray(aValue);
      return true;
    }

    if (aAttribute == nsGkAtoms::referrerpolicy) {
      return ParseReferrerAttribute(aValue, aResult);
    }
  }

  return MathMLElement::ParseAttribute(aNamespaceID, aAttribute, aValue,
                                       aMaybeScriptedPrincipal, aResult);
}

NS_IMPL_ELEMENT_CLONE(MathMLAnchorElement)

}  // namespace mozilla::dom
