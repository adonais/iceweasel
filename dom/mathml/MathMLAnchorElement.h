/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_dom_MathMLAnchorElement_h
#define mozilla_dom_MathMLAnchorElement_h

#include "MathMLElement.h"
#include "nsDOMTokenList.h"

namespace mozilla::dom {

// FIXME: We should also inherit from Link once we migrate link behavior from
// MathMLElement. Since MathMLElement already inherits from Link, we need to
// prevent diamond inheritance for now.
class MathMLAnchorElement final : public MathMLElement {
 public:
  explicit MathMLAnchorElement(
      already_AddRefed<mozilla::dom::NodeInfo>&& aNodeInfo);

  NS_DECL_CYCLE_COLLECTION_CLASS_INHERITED(MathMLAnchorElement, MathMLElement)

  // nsISupports
  NS_DECL_ISUPPORTS_INHERITED

  void GetHref(nsAString& aHref) const {
    GetURIAttr(nsGkAtoms::href, nullptr, aHref);
  }

  void SetHref(const nsAString& aHref, ErrorResult& aRv) {
    SetAttr(nsGkAtoms::href, aHref, aRv);
  }

  void GetTarget(nsAString& aValue) const {
    if (!GetAttr(nsGkAtoms::target, aValue)) {
      GetBaseTarget(aValue);
    }
  }
  void SetTarget(const nsAString& aValue, ErrorResult& aRv) {
    SetAttr(nsGkAtoms::target, aValue, aRv);
  }

  void GetHreflang(DOMString& aValue) const {
    GetAttr(nsGkAtoms::hreflang, aValue);
  }
  void SetHreflang(const nsAString& aValue, mozilla::ErrorResult& rv) {
    SetAttr(nsGkAtoms::hreflang, aValue, rv);
  }
  void GetType(DOMString& aValue) const { GetAttr(nsGkAtoms::type, aValue); }
  void SetType(const nsAString& aValue, mozilla::ErrorResult& rv) {
    SetAttr(nsGkAtoms::type, aValue, rv);
  }

  void GetBaseTarget(nsAString& aValue) const;
  void GetLinkTargetImpl(nsAString& aTarget) override;

  nsresult Clone(dom::NodeInfo*, nsINode** aResult) const override;

 protected:
  virtual ~MathMLAnchorElement() = default;
  JSObject* WrapNode(JSContext* aCx,
                     JS::Handle<JSObject*> aGivenProto) override;
};

}  // namespace mozilla::dom

#endif
