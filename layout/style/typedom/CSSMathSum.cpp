/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim:set ts=2 sw=2 sts=2 et cindent: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "mozilla/dom/CSSMathSum.h"

#include "mozilla/AlreadyAddRefed.h"
#include "mozilla/ErrorResult.h"
#include "mozilla/RefPtr.h"
#include "mozilla/dom/BindingDeclarations.h"
#include "mozilla/dom/CSSMathSumBinding.h"

namespace mozilla::dom {

CSSMathSum::CSSMathSum(nsCOMPtr<nsISupports> aParent)
    : CSSMathValue(std::move(aParent)) {}

JSObject* CSSMathSum::WrapObject(JSContext* aCx,
                                 JS::Handle<JSObject*> aGivenProto) {
  return CSSMathSum_Binding::Wrap(aCx, this, aGivenProto);
}

// start of CSSMathSum Web IDL implementation

// static
already_AddRefed<CSSMathSum> CSSMathSum::Constructor(
    const GlobalObject& aGlobal, const Sequence<OwningCSSNumberish>& aArgs,
    ErrorResult& aRv) {
  return MakeAndAddRef<CSSMathSum>(aGlobal.GetAsSupports());
}

CSSNumericArray* CSSMathSum::GetValues(ErrorResult& aRv) const {
  aRv.Throw(NS_ERROR_NOT_IMPLEMENTED);
  return nullptr;
}

// end of CSSMathSum Web IDL implementation

}  // namespace mozilla::dom
