/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "HTMLSelectedContentElement.h"

#include "mozilla/dom/HTMLSelectedContentElementBinding.h"
#include "nsGenericHTMLElement.h"

nsGenericHTMLElement* NS_NewHTMLSelectedContentElement(
    already_AddRefed<mozilla::dom::NodeInfo>&& aNodeInfo,
    mozilla::dom::FromParser aFromParser) {
  if (!mozilla::StaticPrefs::dom_select_customizable_select_enabled()) {
    return NS_NewHTMLElement(std::move(aNodeInfo), aFromParser);
  }
  RefPtr<mozilla::dom::NodeInfo> nodeInfo(aNodeInfo);
  auto* nim = nodeInfo->NodeInfoManager();
  MOZ_ASSERT(nim);
  return new (nim) mozilla::dom::HTMLSelectedContentElement(nodeInfo.forget());
}

namespace mozilla::dom {

HTMLSelectedContentElement::HTMLSelectedContentElement(
    already_AddRefed<class NodeInfo>&& aNodeInfo)
    : nsGenericHTMLElement(std::move(aNodeInfo)) {}

HTMLSelectedContentElement::~HTMLSelectedContentElement() = default;

NS_IMPL_ELEMENT_CLONE(HTMLSelectedContentElement)

JSObject* HTMLSelectedContentElement::WrapNode(
    JSContext* aCx, JS::Handle<JSObject*> aGivenProto) {
  return HTMLSelectedContentElement_Binding::Wrap(aCx, this, aGivenProto);
}

}  // namespace mozilla::dom
