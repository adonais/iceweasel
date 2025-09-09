/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "mozilla/dom/StylePropertyMap.h"

#include "mozilla/ErrorResult.h"
#include "mozilla/dom/BindingDeclarations.h"
#include "mozilla/dom/StylePropertyMapBinding.h"

namespace mozilla::dom {

StylePropertyMap::StylePropertyMap(nsCOMPtr<nsISupports> aParent)
    : StylePropertyMapReadOnly(std::move(aParent)) {}

JSObject* StylePropertyMap::WrapObject(JSContext* aCx,
                                       JS::Handle<JSObject*> aGivenProto) {
  return StylePropertyMap_Binding::Wrap(aCx, this, aGivenProto);
}

// start of StylePropertyMap Web IDL implementation

void StylePropertyMap::Set(
    const nsACString& aProperty,
    const Sequence<OwningCSSStyleValueOrUTF8String>& aValues,
    ErrorResult& aRv) {
  aRv.Throw(NS_ERROR_NOT_IMPLEMENTED);
}

void StylePropertyMap::Append(
    const nsACString& aProperty,
    const Sequence<OwningCSSStyleValueOrUTF8String>& aValues,
    ErrorResult& aRv) {
  aRv.Throw(NS_ERROR_NOT_IMPLEMENTED);
}

void StylePropertyMap::Delete(const nsACString& aProperty, ErrorResult& aRv) {
  aRv.Throw(NS_ERROR_NOT_IMPLEMENTED);
}

void StylePropertyMap::Clear() {}

// end of StylePropertyMap Web IDL implementation

size_t StylePropertyMap::SizeOfIncludingThis(MallocSizeOf aMallocSizeOf) const {
  return StylePropertyMapReadOnly::SizeOfExcludingThis(aMallocSizeOf) +
         aMallocSizeOf(this);
}

}  // namespace mozilla::dom
