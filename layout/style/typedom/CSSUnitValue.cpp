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

CSSUnitValue::CSSUnitValue(nsCOMPtr<nsISupports> aParent, double aValue,
                           const nsACString& aUnit)
    : CSSNumericValue(std::move(aParent), ValueType::UnitValue),
      mValue(aValue),
      mUnit(aUnit) {}

JSObject* CSSUnitValue::WrapObject(JSContext* aCx,
                                   JS::Handle<JSObject*> aGivenProto) {
  return CSSUnitValue_Binding::Wrap(aCx, this, aGivenProto);
}

// start of CSSUnitValue Web IDL implementation

// https://drafts.css-houdini.org/css-typed-om-1/#dom-cssunitvalue-cssunitvalue
//
// static
already_AddRefed<CSSUnitValue> CSSUnitValue::Constructor(
    const GlobalObject& aGlobal, double aValue, const nsACString& aUnit,
    ErrorResult& aRv) {
  // XXX Units should be normalized to lowercase. The Typed OM spec doesn’t
  // state this explicitly, but WPT requires lowercase normalization and it
  // can also be deduced from the CSS Values spec. Besides fixing it here,
  // a spec issue may be needed to clarify this.

  // Step 1.

  // XXX A type should be created from unit and if that fails, the failure
  // should be propagated here

  // Step 2.

  return MakeAndAddRef<CSSUnitValue>(aGlobal.GetAsSupports(), aValue, aUnit);
}

double CSSUnitValue::Value() const { return mValue; }

void CSSUnitValue::SetValue(double aArg) { mValue = aArg; }

void CSSUnitValue::GetUnit(nsCString& aRetVal) const { aRetVal = mUnit; }

// end of CSSUnitValue Web IDL implementation

void CSSUnitValue::ToCssTextWithProperty(const CSSPropertyId& aPropertyId,
                                         nsACString& aDest) const {
  aDest.AppendFloat(mValue);
  aDest.Append(mUnit);
}

CSSUnitValue& CSSStyleValue::GetAsCSSUnitValue() {
  MOZ_DIAGNOSTIC_ASSERT(mValueType == ValueType::UnitValue);

  return *static_cast<CSSUnitValue*>(this);
}

}  // namespace mozilla::dom
