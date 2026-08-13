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
#include "mozilla/StyleSheet.h"
#include "mozilla/dom/CSSStyleRule.h"
#include "mozilla/dom/CSSStyleValue.h"
#include "mozilla/dom/Document.h"
#include "mozilla/dom/Element.h"
#include "mozilla/dom/StylePropertyMapReadOnlyBinding.h"
#include "nsCSSProps.h"
#include "nsComputedDOMStyle.h"
#include "nsCycleCollectionParticipant.h"
#include "nsReadableUtils.h"
#include "nsStyledElement.h"

namespace mozilla::dom {

namespace {

template <typename Source>
struct DeclarationTraits;

// Specialization for inline style (specified values)
struct InlineStyleDeclarations {};

static StylePropertyTypedValueList DeclarationBlockGetAll(
    const StyleLockedDeclarationBlock* aBlock, const CSSPropertyId& aPropertyId,
    ErrorResult& aRv) {
  auto valueList = StylePropertyTypedValueList::None();
  if (!aBlock) {
    return valueList;
  }
  if (!Servo_DeclarationBlock_GetPropertyTypedValueList(aBlock, &aPropertyId,
                                                        &valueList)) {
    aRv.ThrowTypeError("Invalid property");
    return valueList;
  }
  return valueList;
}

static uint32_t DeclarationBlockHas(const StyleLockedDeclarationBlock* aBlock,
                                    const CSSPropertyId& aProp) {
  return aBlock && Servo_DeclarationBlock_HasProperty(aBlock, &aProp);
}

static uint32_t DeclarationBlockSize(
    const StyleLockedDeclarationBlock* aBlock) {
  return aBlock ? Servo_DeclarationBlock_Count(aBlock) : 0;
}

static bool DeclarationBlockKeyAt(const StyleLockedDeclarationBlock* aBlock,
                                  uint32_t aIndex, CSSPropertyId& aId) {
  return aBlock && Servo_DeclarationBlock_GetAt(aBlock, aIndex, &aId);
}

template <>
struct DeclarationTraits<InlineStyleDeclarations> {
  static URLExtraData* GetURLExtraData(nsStyledElement* aStyledElement) {
    MOZ_ASSERT(aStyledElement);

    return aStyledElement->OwnerDoc()->DefaultStyleAttrURLData();
  }
};

// Specialization for computed style (computed values)
struct ComputedStyleDeclarations {};

template <>
struct DeclarationTraits<ComputedStyleDeclarations> {
  static StylePropertyTypedValueList GetAll(Element* aElement,
                                            const CSSPropertyId& aPropertyId,
                                            ErrorResult& aRv) {
    MOZ_ASSERT(aElement);

    auto valueList = StylePropertyTypedValueList::None();

    RefPtr<const ComputedStyle> style =
        nsComputedDOMStyle::GetComputedStyle(aElement);
    if (!style) {
      return valueList;
    }

    if (!style->GetPropertyTypedValueList(aPropertyId, valueList)) {
      aRv.ThrowTypeError("Invalid property");
      return valueList;
    }

    return valueList;
  }

  static bool Has(Element* aElement, const CSSPropertyId& aId) {
    RefPtr style = nsComputedDOMStyle::GetComputedStyle(aElement);
    if (!style) {
      return false;
    }
    if (!aId.IsCustom()) {
      return nsComputedDOMStyle::HasNonCustomProperty(aId.mId);
    }
    return Servo_ComputedValues_HasCustomProperty(style, aId.mCustomName.get());
  }

  static uint32_t Size(Element* aElement) {
    RefPtr style = nsComputedDOMStyle::GetComputedStyle(aElement);
    if (!style) {
      return 0;
    }
    return nsComputedDOMStyle::NonCustomPropertyCount() +
           Servo_GetCustomPropertiesCount(style);
  }

  static bool GetKeyAt(Element* aElement, uint32_t aIndex, CSSPropertyId& aId) {
    RefPtr style = nsComputedDOMStyle::GetComputedStyle(aElement);
    if (!style) {
      return false;
    }
    uint32_t nonCustomCount = nsComputedDOMStyle::NonCustomPropertyCount();
    if (aIndex < nonCustomCount) {
      aId = CSSPropertyId(nsComputedDOMStyle::NonCustomPropertyAt(aIndex));
      return true;
    }
    uint32_t customPropIndex = aIndex - nonCustomCount;
    nsAtom* prop = Servo_GetCustomPropertyNameAt(style, customPropIndex);
    if (!prop) {
      return false;
    }
    aId = CSSPropertyId::FromCustomName(prop);
    return true;
  }

  static URLExtraData* GetURLExtraData(Element* aElement) {
    MOZ_ASSERT(aElement);

    return aElement->OwnerDoc()->DefaultStyleAttrURLData();
  }
};

// Specialization for style rule
struct StyleRuleDeclarations {};
template <>
struct DeclarationTraits<StyleRuleDeclarations> {
  static URLExtraData* GetURLExtraData(const CSSStyleRule* aRule) {
    MOZ_ASSERT(aRule);

    StyleSheet* sheet = aRule->GetStyleSheet();
    if (!sheet) {
      return nullptr;
    }

    return sheet->URLData();
  }
};

}  // namespace

StylePropertyMapReadOnly::StylePropertyMapReadOnly(
    nsStyledElement* aStyledElement)
    : mParent(aStyledElement), mDeclarations(aStyledElement) {
  MOZ_ASSERT(mParent);
}

StylePropertyMapReadOnly::StylePropertyMapReadOnly(Element* aElement)
    : mParent(aElement), mDeclarations(aElement) {
  MOZ_ASSERT(mParent);
}

StylePropertyMapReadOnly::StylePropertyMapReadOnly(CSSStyleRule* aRule)
    : mParent(aRule), mDeclarations(aRule) {
  MOZ_ASSERT(mParent);
}

NS_IMPL_CYCLE_COLLECTING_ADDREF(StylePropertyMapReadOnly)
NS_IMPL_CYCLE_COLLECTING_RELEASE(StylePropertyMapReadOnly)
NS_INTERFACE_MAP_BEGIN_CYCLE_COLLECTION(StylePropertyMapReadOnly)
  NS_WRAPPERCACHE_INTERFACE_MAP_ENTRY
  NS_INTERFACE_MAP_ENTRY(nsISupports)
NS_INTERFACE_MAP_END

NS_IMPL_CYCLE_COLLECTION_WRAPPERCACHE_CLASS(StylePropertyMapReadOnly)
NS_IMPL_CYCLE_COLLECTION_UNLINK_BEGIN(StylePropertyMapReadOnly)
  // Clear out our weak pointers.
  tmp->mDeclarations.Unlink();

  NS_IMPL_CYCLE_COLLECTION_UNLINK(mParent)
  NS_IMPL_CYCLE_COLLECTION_UNLINK_PRESERVED_WRAPPER
NS_IMPL_CYCLE_COLLECTION_UNLINK_END
NS_IMPL_CYCLE_COLLECTION_TRAVERSE_BEGIN(StylePropertyMapReadOnly)
  NS_IMPL_CYCLE_COLLECTION_TRAVERSE(mParent)
NS_IMPL_CYCLE_COLLECTION_TRAVERSE_END

nsISupports* StylePropertyMapReadOnly::GetParentObject() const {
  return mParent;
}

JSObject* StylePropertyMapReadOnly::WrapObject(
    JSContext* aCx, JS::Handle<JSObject*> aGivenProto) {
  return StylePropertyMapReadOnly_Binding::Wrap(aCx, this, aGivenProto);
}

// start of StylePropertyMapReadOnly Web IDL implementation

// https://drafts.css-houdini.org/css-typed-om-1/#dom-stylepropertymapreadonly-get
//
// XXX This is not yet fully implemented and optimized!
void StylePropertyMapReadOnly::Get(const nsACString& aProperty,
                                   OwningUndefinedOrCSSStyleValue& aRetVal,
                                   ErrorResult& aRv) const {
  if (!mParent) {
    aRv.Throw(NS_ERROR_UNEXPECTED);
    return;
  }

  // Step 2.
  auto propertyId = CSSPropertyId::Parse(aProperty);
  if (!propertyId.IsValid()) {
    aRv.ThrowTypeError("Invalid property: "_ns + aProperty);
    return;
  }

  // Steps 3 and 4.
  nsTArray<RefPtr<CSSStyleValue>> styleValues;
  GetAll(propertyId, styleValues, aRv);
  if (aRv.Failed()) {
    return;
  }
  if (!styleValues.IsEmpty()) {
    aRetVal.SetAsCSSStyleValue() = styleValues[0];
  } else {
    aRetVal.SetUndefined();
  }
}

// https://drafts.css-houdini.org/css-typed-om-1/#dom-stylepropertymapreadonly-getall
//
// XXX This is not yet fully implemented and optimized!
void StylePropertyMapReadOnly::GetAll(const nsACString& aProperty,
                                      nsTArray<RefPtr<CSSStyleValue>>& aRetVal,
                                      ErrorResult& aRv) const {
  if (!mParent) {
    aRv.Throw(NS_ERROR_UNEXPECTED);
    return;
  }

  // Step 2.
  auto propertyId = CSSPropertyId::Parse(aProperty);
  if (!propertyId.IsValid()) {
    aRv.ThrowTypeError("Invalid property: "_ns + aProperty);
    return;
  }

  // Steps 3 and 4.
  GetAll(propertyId, aRetVal, aRv);
}

void StylePropertyMapReadOnly::GetAll(const CSSPropertyId& aProperty,
                                      nsTArray<RefPtr<CSSStyleValue>>& aRetVal,
                                      ErrorResult& aRv) const {
  // Step 3.
  const Declarations& declarations = mDeclarations;
  // Step 4.
  auto valueList = declarations.GetAll(aProperty, aRv);
  if (aRv.Failed()) {
    return;
  }
  CSSStyleValue::Create(mParent, aProperty, std::move(valueList), aRetVal);
}

bool StylePropertyMapReadOnly::Has(const nsACString& aProperty,
                                   ErrorResult& aRv) const {
  // Step 2.
  auto propertyId = CSSPropertyId::Parse(aProperty);
  if (!propertyId.IsValid()) {
    aRv.ThrowTypeError("Invalid property: "_ns + aProperty);
    return false;
  }
  // Steps 3 and 4.
  return mDeclarations.Has(propertyId);
}

uint32_t StylePropertyMapReadOnly::Size() const { return mDeclarations.Size(); }

uint32_t StylePropertyMapReadOnly::GetIterableLength() const {
  return mDeclarations.Size();
}

nsCString StylePropertyMapReadOnly::GetKeyAtIndex(uint32_t aIndex) const {
  nsCString result;
  CSSPropertyId id{eCSSProperty_UNKNOWN};
  if (!mDeclarations.GetKeyAt(aIndex, id)) {
    return result;
  }
  id.ToString(result);
  return result;
}

nsTArray<RefPtr<CSSStyleValue>> StylePropertyMapReadOnly::GetValueAtIndex(
    uint32_t aIndex) const {
  nsTArray<RefPtr<CSSStyleValue>> result;
  CSSPropertyId id{eCSSProperty_UNKNOWN};
  if (!mDeclarations.GetKeyAt(aIndex, id)) {
    return result;
  }
  GetAll(id, result, IgnoreErrors());
  return result;
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

StylePropertyTypedValueList StylePropertyMapReadOnly::Declarations::GetAll(
    const CSSPropertyId& aPropertyId, ErrorResult& aRv) const {
  switch (mKind) {
    case Kind::Inline:
      return DeclarationBlockGetAll(mStyledElement->GetInlineStyleDeclaration(),
                                    aPropertyId, aRv);

    case Kind::Computed:
      return DeclarationTraits<ComputedStyleDeclarations>::GetAll(
          mElement, aPropertyId, aRv);

    case Kind::Rule:
      return DeclarationBlockGetAll(&mRule->GetDeclarationBlock(), aPropertyId,
                                    aRv);
  }
  MOZ_MAKE_COMPILER_ASSUME_IS_UNREACHABLE("Bad kind value!");
}

bool StylePropertyMapReadOnly::Declarations::Has(
    const CSSPropertyId& aPropertyId) const {
  switch (mKind) {
    case Kind::Inline:
      return DeclarationBlockHas(mStyledElement->GetInlineStyleDeclaration(),
                                 aPropertyId);
    case Kind::Computed:
      return DeclarationTraits<ComputedStyleDeclarations>::Has(mElement,
                                                               aPropertyId);
    case Kind::Rule:
      return DeclarationBlockHas(&mRule->GetDeclarationBlock(), aPropertyId);
  }
  MOZ_MAKE_COMPILER_ASSUME_IS_UNREACHABLE("Bad kind value!");
}

uint32_t StylePropertyMapReadOnly::Declarations::Size() const {
  switch (mKind) {
    case Kind::Inline:
      return DeclarationBlockSize(mStyledElement->GetInlineStyleDeclaration());
    case Kind::Computed:
      return DeclarationTraits<ComputedStyleDeclarations>::Size(mElement);
    case Kind::Rule:
      return DeclarationBlockSize(&mRule->GetDeclarationBlock());
  }
  MOZ_MAKE_COMPILER_ASSUME_IS_UNREACHABLE("Bad kind value!");
}

bool StylePropertyMapReadOnly::Declarations::GetKeyAt(
    uint32_t aIndex, CSSPropertyId& aId) const {
  switch (mKind) {
    case Kind::Inline:
      return DeclarationBlockKeyAt(mStyledElement->GetInlineStyleDeclaration(),
                                   aIndex, aId);
    case Kind::Computed:
      return DeclarationTraits<ComputedStyleDeclarations>::GetKeyAt(
          mElement, aIndex, aId);
    case Kind::Rule:
      return DeclarationBlockKeyAt(&mRule->GetDeclarationBlock(), aIndex, aId);
  }
  MOZ_MAKE_COMPILER_ASSUME_IS_UNREACHABLE("Bad kind value!");
}

URLExtraData* StylePropertyMapReadOnly::Declarations::GetURLExtraData() const {
  switch (mKind) {
    case Kind::Inline:
      return DeclarationTraits<InlineStyleDeclarations>::GetURLExtraData(
          mStyledElement);

    case Kind::Computed:
      return DeclarationTraits<ComputedStyleDeclarations>::GetURLExtraData(
          mElement);

    case Kind::Rule:
      return DeclarationTraits<StyleRuleDeclarations>::GetURLExtraData(mRule);
  }
  MOZ_MAKE_COMPILER_ASSUME_IS_UNREACHABLE("Bad kind value!");
}

void StylePropertyMapReadOnly::Declarations::Unlink() {
  switch (mKind) {
    case Kind::Inline:
      mStyledElement = nullptr;
      break;

    case Kind::Computed:
      mElement = nullptr;
      break;

    case Kind::Rule:
      mRule = nullptr;
      break;
  }
}

}  // namespace mozilla::dom
