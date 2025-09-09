/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim:set ts=2 sw=2 sts=2 et cindent: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "mozilla/dom/CSSTransformValue.h"

#include "mozilla/AlreadyAddRefed.h"
#include "mozilla/ErrorResult.h"
#include "mozilla/RefPtr.h"
#include "mozilla/dom/BindingDeclarations.h"
#include "mozilla/dom/CSSTransformValueBinding.h"

namespace mozilla::dom {

CSSTransformValue::CSSTransformValue(nsCOMPtr<nsISupports> aParent)
    : CSSStyleValue(std::move(aParent)) {}

JSObject* CSSTransformValue::WrapObject(JSContext* aCx,
                                        JS::Handle<JSObject*> aGivenProto) {
  return CSSTransformValue_Binding::Wrap(aCx, this, aGivenProto);
}

// start of CSSTransformValue Web IDL implementation

// static
already_AddRefed<CSSTransformValue> CSSTransformValue::Constructor(
    const GlobalObject& aGlobal,
    const Sequence<OwningNonNull<CSSTransformComponent>>& aTransforms,
    ErrorResult& aRv) {
  return MakeAndAddRef<CSSTransformValue>(aGlobal.GetAsSupports());
}

uint32_t CSSTransformValue::Length() const { return 0; }

bool CSSTransformValue::Is2D() const { return true; }

already_AddRefed<DOMMatrix> CSSTransformValue::ToMatrix(ErrorResult& aRv) {
  aRv.Throw(NS_ERROR_NOT_IMPLEMENTED);
  return nullptr;
}

CSSTransformComponent* CSSTransformValue::IndexedGetter(uint32_t aIndex,
                                                        bool& aFound,
                                                        ErrorResult& aRv) {
  aRv.Throw(NS_ERROR_NOT_IMPLEMENTED);
  return nullptr;
}

void CSSTransformValue::IndexedSetter(uint32_t aIndex,
                                      CSSTransformComponent& aVal,
                                      ErrorResult& aRv) {
  aRv.Throw(NS_ERROR_NOT_IMPLEMENTED);
}

// end of CSSTransformValue Web IDL implementation

}  // namespace mozilla::dom
