/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "mozilla/dom/StylePropertyMapReadOnly.h"

#include "CSSUnsupportedValue.h"
#include "mozilla/Assertions.h"
#include "mozilla/ComputedStyle.h"
#include "mozilla/DeclarationBlock.h"
#include "mozilla/ErrorResult.h"
#include "mozilla/RefPtr.h"
#include "mozilla/ServoStyleConsts.h"
#include "mozilla/dom/CSSKeywordValue.h"
#include "mozilla/dom/CSSStyleValue.h"
#include "mozilla/dom/Element.h"
#include "mozilla/dom/StylePropertyMapReadOnlyBinding.h"
#include "nsComputedDOMStyle.h"
#include "nsCycleCollectionParticipant.h"
#include "nsQueryObject.h"
#include "nsReadableUtils.h"

namespace mozilla::dom {

namespace {

template <typename Source>
struct DeclarationTraits;

// Specialization for inline style (specified values)
struct InlineStyleDeclarations {};

template <>
struct DeclarationTraits<InlineStyleDeclarations> {
  static StylePropertyTypedValueResult Get(Element* aElement,
                                           const nsACString& aProperty,
                                           ErrorResult& aRv) {
    MOZ_ASSERT(aElement);

    auto result = StylePropertyTypedValueResult::None();

    RefPtr<DeclarationBlock> block = aElement->GetInlineStyleDeclaration();
    if (!block) {
      return result;
    }

    if (!block->GetPropertyTypedValue(aProperty, result)) {
      aRv.ThrowTypeError("Invalid CSS property");
      return result;
    }

    return result;
  }
};

// Specialization for computed style (computed values)
struct ComputedStyleDeclarations {};

template <>
struct DeclarationTraits<ComputedStyleDeclarations> {
  static StylePropertyTypedValueResult Get(Element* aElement,
                                           const nsACString& aProperty,
                                           ErrorResult& aRv) {
    MOZ_ASSERT(aElement);

    auto result = StylePropertyTypedValueResult::None();

    RefPtr<const ComputedStyle> style =
        nsComputedDOMStyle::GetComputedStyle(aElement);
    if (!style) {
      return result;
    }

    if (!style->GetPropertyTypedValue(aProperty, result)) {
      aRv.ThrowTypeError("Invalid CSS property");
      return result;
    }

    return result;
  }
};

// XXX StyleRuleDeclarations go here

}  // namespace

StylePropertyMapReadOnly::StylePropertyMapReadOnly(
    nsCOMPtr<nsISupports> aParent, bool aComputed)
    : mParent(std::move(aParent)), mDeclarations(aComputed) {
  MOZ_ASSERT(mParent);
}

NS_IMPL_CYCLE_COLLECTING_ADDREF(StylePropertyMapReadOnly)
NS_IMPL_CYCLE_COLLECTING_RELEASE(StylePropertyMapReadOnly)
NS_INTERFACE_MAP_BEGIN_CYCLE_COLLECTION(StylePropertyMapReadOnly)
  NS_WRAPPERCACHE_INTERFACE_MAP_ENTRY
  NS_INTERFACE_MAP_ENTRY(nsISupports)
NS_INTERFACE_MAP_END

NS_IMPL_CYCLE_COLLECTION_WRAPPERCACHE(StylePropertyMapReadOnly, mParent)

nsISupports* StylePropertyMapReadOnly::GetParentObject() const {
  return mParent;
}

JSObject* StylePropertyMapReadOnly::WrapObject(
    JSContext* aCx, JS::Handle<JSObject*> aGivenProto) {
  return StylePropertyMapReadOnly_Binding::Wrap(aCx, this, aGivenProto);
}

// start of StylePropertyMapReadOnly Web IDL implementation

// XXX This is not yet fully implemented and optimized!
void StylePropertyMapReadOnly::Get(const nsACString& aProperty,
                                   OwningUndefinedOrCSSStyleValue& aRetVal,
                                   ErrorResult& aRv) const {
  // XXX This QO wouldn't be needed if we had RefPtr<Element> mElement
  RefPtr<Element> element = do_QueryObject(mParent);
  if (!element) {
    aRv.Throw(NS_ERROR_NOT_IMPLEMENTED);
    return;
  }

  // Step 3.

  const Declarations& declarations = mDeclarations;

  // Step 4.

  auto result = declarations.Get(element, aProperty, aRv);
  if (aRv.Failed()) {
    return;
  }

  // XXX Consider switch on result.tag
  if (result.IsTyped()) {
    auto typedValue = result.AsTyped();

    MOZ_ASSERT(typedValue.IsKeyword());
    auto value = typedValue.AsKeyword();

    auto keywordValue = MakeRefPtr<CSSKeywordValue>(mParent, value);

    aRetVal.SetAsCSSStyleValue() = std::move(keywordValue);
    return;
  }

  if (result.IsUnsupported()) {
    auto rawBlock = result.AsUnsupported();

    auto block = MakeRefPtr<DeclarationBlock>(rawBlock.Consume());

    auto unsupportedValue =
        MakeRefPtr<CSSUnsupportedValue>(mParent, aProperty, std::move(block));

    aRetVal.SetAsCSSStyleValue() = std::move(unsupportedValue);
    return;
  }

  MOZ_ASSERT(result.IsNone());

  aRetVal.SetUndefined();
}

// XXX This is not yet fully implemented and optimized!
void StylePropertyMapReadOnly::GetAll(const nsACString& aProperty,
                                      nsTArray<RefPtr<CSSStyleValue>>& aRetVal,
                                      ErrorResult& aRv) const {
  OwningUndefinedOrCSSStyleValue retVal;

  Get(aProperty, retVal, aRv);
  if (aRv.Failed()) {
    return;
  }

  if (retVal.IsCSSStyleValue()) {
    auto styleValue = retVal.GetAsCSSStyleValue();
    aRetVal.AppendElement(styleValue);
  }
}

bool StylePropertyMapReadOnly::Has(const nsACString& aProperty,
                                   ErrorResult& aRv) const {
  aRv.Throw(NS_ERROR_NOT_IMPLEMENTED);
  return false;
}

uint32_t StylePropertyMapReadOnly::Size() const { return 0; }

uint32_t StylePropertyMapReadOnly::GetIterableLength() const { return 0; }

const nsACString& StylePropertyMapReadOnly::GetKeyAtIndex(
    uint32_t aIndex) const {
  return EmptyCString();
}

nsTArray<RefPtr<CSSStyleValue>> StylePropertyMapReadOnly::GetValueAtIndex(
    uint32_t aIndex) const {
  return nsTArray<RefPtr<CSSStyleValue>>();
}

// end of StylePropertyMapReadOnly Web IDL implementation

size_t StylePropertyMapReadOnly::SizeOfExcludingThis(
    MallocSizeOf aMallocSizeOf) const {
  return 0;
}

size_t StylePropertyMapReadOnly::SizeOfIncludingThis(
    MallocSizeOf aMallocSizeOf) const {
  return SizeOfExcludingThis(aMallocSizeOf) + aMallocSizeOf(this);
}

StylePropertyTypedValueResult StylePropertyMapReadOnly::Declarations::Get(
    Element* aElement, const nsACString& aProperty, ErrorResult& aRv) const {
  if (mComputed) {
    return DeclarationTraits<ComputedStyleDeclarations>::Get(aElement,
                                                             aProperty, aRv);
  }

  return DeclarationTraits<InlineStyleDeclarations>::Get(aElement, aProperty,
                                                         aRv);
}

}  // namespace mozilla::dom
