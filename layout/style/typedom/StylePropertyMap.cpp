/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "mozilla/dom/StylePropertyMap.h"

#include "mozilla/CSSPropertyId.h"
#include "mozilla/ErrorResult.h"
#include "mozilla/RefPtr.h"
#include "mozilla/ServoBindings.h"
#include "mozilla/URLExtraData.h"
#include "mozilla/dom/BindingDeclarations.h"
#include "mozilla/dom/CSSStyleRule.h"
#include "mozilla/dom/CSSStyleValue.h"
#include "mozilla/dom/StylePropertyMapBinding.h"
#include "nsCOMPtr.h"
#include "nsCSSProps.h"
#include "nsDOMCSSDeclaration.h"
#include "nsQueryObject.h"
#include "nsString.h"
#include "nsStyledElement.h"

namespace mozilla::dom {

namespace {

// Returns whether aText is a valid value to append to the list-valued property
// aPropertyId. CSS-wide keywords and var() references are not.
bool IsValidListItem(const CSSPropertyId& aPropertyId, const nsACString& aText,
                     URLExtraData* aURLExtraData) {
  RefPtr<StyleLockedDeclarationBlock> block =
      Servo_DeclarationBlock_Parse(&aPropertyId, &aText, aURLExtraData)
          .Consume();
  return block &&
         !Servo_DeclarationBlock_HasCSSWideKeyword(block, aPropertyId.mId) &&
         !Servo_DeclarationBlock_HasUnparsedValue(block, aPropertyId.mId);
}

template <typename Source>
struct DeclarationTraits;

// Specialization for inline style (specified values)
struct MutableInlineStyleDeclarations {};

template <>
struct DeclarationTraits<MutableInlineStyleDeclarations> {
  static void Set(nsStyledElement* aStyledElement,
                  const CSSPropertyId& aPropertyId, const nsACString& aValue,
                  ErrorResult& aRv) {
    MOZ_ASSERT(aStyledElement);

    nsCOMPtr<nsDOMCSSDeclaration> declaration = aStyledElement->Style();

    declaration->SetPropertyTypedValue(aPropertyId, aValue, aRv);
  }

  static void Delete(nsStyledElement* aStyledElement,
                     const CSSPropertyId& aPropertyId, ErrorResult& aRv) {
    MOZ_ASSERT(aStyledElement);
    nsCOMPtr<nsDOMCSSDeclaration> declaration = aStyledElement->Style();

    declaration->RemoveProperty(aPropertyId, aRv);
  }
};

// Specialization for style rule
struct MutableStyleRuleDeclarations {};

template <>
struct DeclarationTraits<MutableStyleRuleDeclarations> {
  static void Set(CSSStyleRule* aRule, const CSSPropertyId& aPropertyId,
                  const nsACString& aValue, ErrorResult& aRv) {
    MOZ_ASSERT(aRule);

    nsCOMPtr<nsDOMCSSDeclaration> declaration = aRule->Style();

    declaration->SetPropertyTypedValue(aPropertyId, aValue, aRv);
  }

  static void Delete(CSSStyleRule* aRule, const CSSPropertyId& aPropertyId,
                     ErrorResult& aRv) {
    MOZ_ASSERT(aRule);
    nsCOMPtr<nsDOMCSSDeclaration> declaration = aRule->Style();

    declaration->RemoveProperty(aPropertyId, aRv);
  }
};

}  // namespace

StylePropertyMap::StylePropertyMap(nsStyledElement* aStyledElement)
    : StylePropertyMapReadOnly(aStyledElement) {}

StylePropertyMap::StylePropertyMap(CSSStyleRule* aRule)
    : StylePropertyMapReadOnly(aRule) {}

JSObject* StylePropertyMap::WrapObject(JSContext* aCx,
                                       JS::Handle<JSObject*> aGivenProto) {
  return StylePropertyMap_Binding::Wrap(aCx, this, aGivenProto);
}

// start of StylePropertyMap Web IDL implementation

// https://drafts.css-houdini.org/css-typed-om/#dom-stylepropertymap-set
void StylePropertyMap::Set(
    const nsACString& aProperty,
    const Sequence<OwningCSSStyleValueOrUTF8String>& aValues,
    ErrorResult& aRv) {
  return SetOrAppend(aProperty, aValues, Mode::Set, aRv);
}

// https://drafts.css-houdini.org/css-typed-om/#dom-stylepropertymap-append
void StylePropertyMap::Append(
    const nsACString& aProperty,
    const Sequence<OwningCSSStyleValueOrUTF8String>& aValues,
    ErrorResult& aRv) {
  return SetOrAppend(aProperty, aValues, Mode::Append, aRv);
}

void StylePropertyMap::SetOrAppend(
    const nsACString& aProperty,
    const Sequence<OwningCSSStyleValueOrUTF8String>& aValues, Mode aMode,
    ErrorResult& aRv) {
  // Steps 1 and 2.
  auto propertyId = CSSPropertyId::Parse(aProperty);
  if (!propertyId.IsValid()) {
    return aRv.ThrowTypeError("Invalid property: "_ns + aProperty);
  }

  nsCString separator;
  nsAutoCString cssText;
  auto appendValue = [&](const nsACString& aValue) {
    if (!cssText.IsEmpty()) {
      cssText.Append(separator);
    }
    cssText.Append(aValue);
  };

  const bool requiresListValued = aMode == Mode::Append || aValues.Length() > 1;
  if (requiresListValued) {
    if (propertyId.IsCustom()) {
      return aRv.ThrowTypeError("Custom properties are not list-valued: "_ns +
                                aProperty);
    }
    const CSSPropFlags flags = nsCSSProps::PropFlags(propertyId.mId);
    if (!(flags & CSSPropFlags::IsListValued)) {
      return aRv.ThrowTypeError("Property is not list-valued: "_ns + aProperty);
    }
    separator = flags & CSSPropFlags::IsCommaSeparated ? ", "_ns : " "_ns;
  }

  if (aValues.IsEmpty()) {
    if (aMode == Mode::Append) {
      // TODO: This is not in the spec, but makes some sense, it prevents e.g.
      // style attribute mutations from happening here.
      return;
    }
    return mDeclarations.Delete(propertyId, aRv);
  }

  if (aMode == Mode::Append) {
    // NOTE(emilio): We rejigger a bit the steps because it's not observable
    // (other than in the error message I guess), as everything throws a
    // TypeError. It's more convenient to build the value from the beginning.
    nsTArray<RefPtr<CSSStyleValue>> existingValues;
    GetAll(propertyId, existingValues, aRv);
    if (aRv.Failed()) {
      return;
    }

    // Step 5
    for (const auto& existingValue : existingValues) {
      if (existingValue->IsCSSUnparsedValue()) {
        return aRv.ThrowTypeError(
            "Cannot append to value with var() references");
      }
      nsAutoCString text;
      existingValue->ToCssTextWithProperty(propertyId, text);
      if (text.IsEmpty()) {
        // This is the case for a value from a pending substitution from a
        // shorthand, for example.
        return aRv.ThrowTypeError(
            "Cannot append to value with var() references");
      }
      appendValue(text);
    }
  }

  auto* urlExtraData = mDeclarations.GetURLExtraData();
  if (!urlExtraData) {
    return aRv.ThrowTypeError("Can't find the right base uri for parsing");
  }

  // Step 4
  for (const auto& styleValueOrString : aValues) {
    nsAutoCString text;
    if (styleValueOrString.IsCSSStyleValue()) {
      const auto& styleValue = styleValueOrString.GetAsCSSStyleValue();
      const auto* valuePropertyId = styleValue->GetPropertyId();
      if (valuePropertyId && *valuePropertyId != propertyId) {
        return aRv.ThrowTypeError("Invalid type for property");
      }
      if (requiresListValued && styleValue->IsCSSUnparsedValue()) {
        return aRv.ThrowTypeError("Cannot append a CSSUnparsedValue");
      }
      styleValue->ToCssTextWithProperty(propertyId, text);
    } else {
      text = styleValueOrString.GetAsUTF8String();
    }
    // Each value is validated on its own so that values can't combine into
    // something different once joined.
    const bool valid = requiresListValued
                           ? IsValidListItem(propertyId, text, urlExtraData)
                           : !text.IsEmpty();
    if (!valid) {
      return aRv.ThrowTypeError("Invalid value for property: "_ns + text);
    }
    appendValue(text);
  }

  mDeclarations.Set(propertyId, cssText, aRv);
}

// https://drafts.css-houdini.org/css-typed-om/#dom-stylepropertymap-delete
void StylePropertyMap::Delete(const nsACString& aProperty, ErrorResult& aRv) {
  if (!mParent) {
    aRv.Throw(NS_ERROR_UNEXPECTED);
    return;
  }

  // Step 1. If property is not a custom property name string, set property to
  // property ASCII lowercased.
  // TODO: Implement Step 1 if it's actually needed.

  // Step 2. If property is not a valid CSS property, throw a TypeError.
  auto propertyId = CSSPropertyId::Parse(aProperty);
  if (!propertyId.IsValid()) {
    aRv.ThrowTypeError("Invalid property: "_ns + aProperty);
    return;
  }

  // Step 3. If this’s [[declarations]] internal slot contains property, remove
  // it.
  mDeclarations.Delete(propertyId, aRv);
}

// https://drafts.css-houdini.org/css-typed-om/#dom-stylepropertymap-clear
void StylePropertyMap::Clear() {
  if (!mParent) {
    return;
  }

  mDeclarations.Clear(IgnoreErrors());
}

// end of StylePropertyMap Web IDL implementation

size_t StylePropertyMap::SizeOfIncludingThis(MallocSizeOf aMallocSizeOf) const {
  return StylePropertyMapReadOnly::SizeOfExcludingThis(aMallocSizeOf) +
         aMallocSizeOf(this);
}

void StylePropertyMapReadOnly::Declarations::Set(
    const CSSPropertyId& aPropertyId, const nsACString& aValue,
    ErrorResult& aRv) {
  switch (mKind) {
    case Kind::Inline:
      DeclarationTraits<MutableInlineStyleDeclarations>::Set(
          mStyledElement, aPropertyId, aValue, aRv);
      return;

    case Kind::Computed:
      aRv.Throw(NS_ERROR_UNEXPECTED);
      return;

    case Kind::Rule:
      DeclarationTraits<MutableStyleRuleDeclarations>::Set(mRule, aPropertyId,
                                                           aValue, aRv);
      return;
  }
}
void StylePropertyMapReadOnly::Declarations::Clear(ErrorResult& aRv) {
  switch (mKind) {
    case Kind::Inline:
      mStyledElement->SetAttr(kNameSpaceID_None, nsGkAtoms::style, u""_ns, true,
                              IsKnownNewAttr::No);
      return;

    case Kind::Computed:
      MOZ_ASSERT_UNREACHABLE("ComputedStyleMap is not writable");
      return;

    case Kind::Rule: {
      nsCOMPtr<nsDOMCSSDeclaration> declaration = mRule->Style();
      declaration->SetCssText(""_ns, nullptr, aRv);
      return;
    }
  }
}

void StylePropertyMapReadOnly::Declarations::Delete(
    const CSSPropertyId& aPropertyId, ErrorResult& aRv) {
  switch (mKind) {
    case Kind::Inline:
      DeclarationTraits<MutableInlineStyleDeclarations>::Delete(
          mStyledElement, aPropertyId, aRv);
      return;

    case Kind::Computed:
      MOZ_ASSERT_UNREACHABLE("ComputedStyleMap is not writable");
      return;

    case Kind::Rule:
      DeclarationTraits<MutableStyleRuleDeclarations>::Delete(mRule,
                                                              aPropertyId, aRv);
      return;
  }
}

}  // namespace mozilla::dom
