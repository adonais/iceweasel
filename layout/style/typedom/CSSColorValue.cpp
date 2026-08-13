/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "mozilla/dom/CSSColorValue.h"

#include "mozilla/ErrorResult.h"
#include "mozilla/StaticPrefs_layout.h"
#include "mozilla/dom/CSSColorValueBinding.h"

namespace mozilla::dom {

CSSColorValue::CSSColorValue(nsCOMPtr<nsISupports> aParent)
    : CSSStyleValue(std::move(aParent)) {}

// static
bool CSSColorValue::IsEnabled(JSContext*, JSObject*) {
  return StaticPrefs::layout_css_typed_om_enabled() &&
         StaticPrefs::layout_css_typed_om_color_enabled();
}

JSObject* CSSColorValue::WrapObject(JSContext* aCx,
                                    JS::Handle<JSObject*> aGivenProto) {
  return CSSColorValue_Binding::Wrap(aCx, this, aGivenProto);
}

// start of CSSColorValue Web IDL implementation

// static
void CSSColorValue::Parse(const GlobalObject& aGlobal,
                          const nsACString& aCssText,
                          OwningCSSColorValueOrCSSStyleValue& aRetVal,
                          ErrorResult& aRv) {
  aRv.Throw(NS_ERROR_NOT_IMPLEMENTED);
}

// end of CSSColorValue Web IDL implementation

}  // namespace mozilla::dom
