/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim:set ts=2 sw=2 sts=2 et cindent: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "mozilla/dom/CSSUnitValue.h"

#include "mozilla/AlreadyAddRefed.h"
#include "mozilla/ErrorResult.h"
#include "mozilla/RefPtr.h"
#include "mozilla/dom/BindingDeclarations.h"
#include "mozilla/dom/CSSUnitValueBinding.h"

namespace mozilla::dom {

CSSUnitValue::CSSUnitValue(nsCOMPtr<nsISupports> aParent)
    : CSSNumericValue(std::move(aParent)) {}

JSObject* CSSUnitValue::WrapObject(JSContext* aCx,
                                   JS::Handle<JSObject*> aGivenProto) {
  return CSSUnitValue_Binding::Wrap(aCx, this, aGivenProto);
}

// start of CSSUnitValue Web IDL implementation

// static
already_AddRefed<CSSUnitValue> CSSUnitValue::Constructor(
    const GlobalObject& aGlobal, double aValue, const nsACString& aUnit,
    ErrorResult& aRv) {
  return MakeAndAddRef<CSSUnitValue>(aGlobal.GetAsSupports());
}

double CSSUnitValue::Value() const { return 0; }

void CSSUnitValue::SetValue(double aArg) {}

void CSSUnitValue::GetUnit(nsCString& aRetVal) const {}

// end of CSSUnitValue Web IDL implementation

}  // namespace mozilla::dom
