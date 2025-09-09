/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim:set ts=2 sw=2 sts=2 et cindent: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "mozilla/dom/CSSKeywordValue.h"

#include "mozilla/AlreadyAddRefed.h"
#include "mozilla/ErrorResult.h"
#include "mozilla/RefPtr.h"
#include "mozilla/dom/BindingDeclarations.h"
#include "mozilla/dom/CSSKeywordValueBinding.h"

namespace mozilla::dom {

CSSKeywordValue::CSSKeywordValue(nsCOMPtr<nsISupports> aParent)
    : CSSStyleValue(std::move(aParent)) {}

JSObject* CSSKeywordValue::WrapObject(JSContext* aCx,
                                      JS::Handle<JSObject*> aGivenProto) {
  return CSSKeywordValue_Binding::Wrap(aCx, this, aGivenProto);
}

// start of CSSKeywordValue Web IDL implementation

// static
already_AddRefed<CSSKeywordValue> CSSKeywordValue::Constructor(
    const GlobalObject& aGlobal, const nsACString& aValue, ErrorResult& aRv) {
  return MakeAndAddRef<CSSKeywordValue>(aGlobal.GetAsSupports());
}

void CSSKeywordValue::GetValue(nsCString& aRetVal) const {}

void CSSKeywordValue::SetValue(const nsACString& aArg, ErrorResult& aRv) {
  aRv.Throw(NS_ERROR_NOT_IMPLEMENTED);
}

// end of CSSKeywordValue Web IDL implementation

}  // namespace mozilla::dom
