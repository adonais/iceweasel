/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "mozilla/dom/CSSStyleValue.h"

#include "mozilla/Assertions.h"
#include "mozilla/ErrorResult.h"
#include "mozilla/dom/CSSStyleValueBinding.h"
#include "nsCycleCollectionParticipant.h"

namespace mozilla::dom {

CSSStyleValue::CSSStyleValue(nsCOMPtr<nsISupports> aParent)
    : mParent(std::move(aParent)), mValueType(ValueType::Uninitialized) {
  MOZ_ASSERT(mParent);
}

CSSStyleValue::CSSStyleValue(nsCOMPtr<nsISupports> aParent,
                             ValueType aValueType)
    : mParent(std::move(aParent)), mValueType(aValueType) {
  MOZ_ASSERT(mParent);
}

NS_IMPL_CYCLE_COLLECTING_ADDREF(CSSStyleValue)
NS_IMPL_CYCLE_COLLECTING_RELEASE(CSSStyleValue)
NS_INTERFACE_MAP_BEGIN_CYCLE_COLLECTION(CSSStyleValue)
  NS_WRAPPERCACHE_INTERFACE_MAP_ENTRY
  NS_INTERFACE_MAP_ENTRY(nsISupports)
NS_INTERFACE_MAP_END
NS_IMPL_CYCLE_COLLECTION_WRAPPERCACHE(CSSStyleValue, mParent)

nsISupports* CSSStyleValue::GetParentObject() const { return mParent; }

JSObject* CSSStyleValue::WrapObject(JSContext* aCx,
                                    JS::Handle<JSObject*> aGivenProto) {
  return CSSStyleValue_Binding::Wrap(aCx, this, aGivenProto);
}

// start of CSSStyleValue Web IDL implementation

// static
RefPtr<CSSStyleValue> CSSStyleValue::Parse(const GlobalObject& aGlobal,
                                           const nsACString& aProperty,
                                           const nsACString& aCssText,
                                           ErrorResult& aRv) {
  aRv.Throw(NS_ERROR_NOT_IMPLEMENTED);
  return nullptr;
}

// static
void CSSStyleValue::ParseAll(const GlobalObject& aGlobal,
                             const nsACString& aProperty,
                             const nsACString& aCssText,
                             nsTArray<RefPtr<CSSStyleValue>>& aRetVal,
                             ErrorResult& aRv) {
  aRv.Throw(NS_ERROR_NOT_IMPLEMENTED);
}

void CSSStyleValue::Stringify(nsAString& aRetVal) const {}

// end of CSSStyleValue Web IDL implementation

bool CSSStyleValue::IsCSSUnsupportedValue() const {
  return mValueType == ValueType::UnsupportedValue;
}

bool CSSStyleValue::IsCSSKeywordValue() const {
  return mValueType == ValueType::KeywordValue;
}

bool CSSStyleValue::IsCSSUnitValue() const {
  return mValueType == ValueType::UnitValue;
}

bool CSSStyleValue::IsCSSMathSum() const {
  return mValueType == ValueType::MathSum;
}

}  // namespace mozilla::dom
