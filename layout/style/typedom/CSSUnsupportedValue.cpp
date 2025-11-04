/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim:set ts=2 sw=2 sts=2 et cindent: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "CSSUnsupportedValue.h"

#include "mozilla/Assertions.h"
#include "mozilla/DeclarationBlock.h"

namespace mozilla::dom {

CSSUnsupportedValue::CSSUnsupportedValue(nsCOMPtr<nsISupports> aParent,
                                         const nsACString& aProperty,
                                         RefPtr<DeclarationBlock> aDeclarations)
    : CSSStyleValue(std::move(aParent), ValueType::Unsupported),
      mProperty(aProperty),
      mDeclarations(std::move(aDeclarations)) {}

void CSSUnsupportedValue::GetValue(nsACString& aRetVal) const {
  mDeclarations->GetPropertyValue(mProperty, aRetVal);
}

CSSUnsupportedValue& CSSStyleValue::GetAsCSSUnsupportedValue() {
  MOZ_DIAGNOSTIC_ASSERT(mValueType == ValueType::Unsupported);

  return *static_cast<CSSUnsupportedValue*>(this);
}

}  // namespace mozilla::dom
