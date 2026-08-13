/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "mozilla/dom/CSSNumericValue.h"

#include "TypedOMUtils.h"
#include "mozilla/AlreadyAddRefed.h"
#include "mozilla/Assertions.h"
#include "mozilla/ErrorResult.h"
#include "mozilla/RefPtr.h"
#include "mozilla/ServoStyleConsts.h"
#include "mozilla/UniquePtr.h"
#include "mozilla/dom/BindingDeclarations.h"
#include "mozilla/dom/CSSMathSum.h"
#include "mozilla/dom/CSSMathValue.h"
#include "mozilla/dom/CSSNumericValueBinding.h"
#include "mozilla/dom/CSSUnitValue.h"

namespace mozilla::dom {

CSSNumericValue::CSSNumericValue(nsCOMPtr<nsISupports> aParent,
                                 NumericValueType aNumericValueType)
    : CSSStyleValue(std::move(aParent), StyleValueType::NumericValue),
      mNumericType(WrapMovingNotNull(MakeUnique<StyleNumericType>())),
      mNumericValueType(aNumericValueType) {}

CSSNumericValue::CSSNumericValue(
    nsCOMPtr<nsISupports> aParent,
    MovingNotNull<UniquePtr<StyleNumericType>> aNumericType,
    NumericValueType aNumericValueType)
    : CSSStyleValue(std::move(aParent), StyleValueType::NumericValue),
      mNumericType(std::move(aNumericType)),
      mNumericValueType(aNumericValueType) {}

// https://drafts.css-houdini.org/css-typed-om-1/#rectify-a-numberish-value
//
// static
RefPtr<CSSNumericValue> CSSNumericValue::Create(
    nsCOMPtr<nsISupports> aParent, const CSSNumberish& aNumberish) {
  if (aNumberish.IsCSSNumericValue()) {
    return &aNumberish.GetAsCSSNumericValue();
  }

  MOZ_DIAGNOSTIC_ASSERT(aNumberish.IsDouble());
  return CSSUnitValue::Create(std::move(aParent), aNumberish.GetAsDouble());
}

// https://drafts.css-houdini.org/css-typed-om-1/#rectify-a-numberish-value
//
// static
RefPtr<CSSNumericValue> CSSNumericValue::Create(
    nsCOMPtr<nsISupports> aParent, const OwningCSSNumberish& aOwningNumberish) {
  if (aOwningNumberish.IsCSSNumericValue()) {
    return aOwningNumberish.GetAsCSSNumericValue();
  }

  MOZ_DIAGNOSTIC_ASSERT(aOwningNumberish.IsDouble());
  return CSSUnitValue::Create(std::move(aParent),
                              aOwningNumberish.GetAsDouble());
}

// static
RefPtr<CSSNumericValue> CSSNumericValue::Create(
    nsCOMPtr<nsISupports> aParent, const StyleNumericValue& aNumericValue) {
  RefPtr<CSSNumericValue> numericValue;

  switch (aNumericValue.tag) {
    case StyleNumericValue::Tag::Unit: {
      const auto& unitValue = aNumericValue.AsUnit();

      numericValue = CSSUnitValue::Create(std::move(aParent), unitValue);
      break;
    }

    case StyleNumericValue::Tag::Math: {
      const auto& mathValue = aNumericValue.AsMath();

      numericValue = CSSMathValue::Create(std::move(aParent), mathValue);
      break;
    }
  }

  return numericValue;
}

JSObject* CSSNumericValue::WrapObject(JSContext* aCx,
                                      JS::Handle<JSObject*> aGivenProto) {
  return CSSNumericValue_Binding::Wrap(aCx, this, aGivenProto);
}

// start of CSSNumericValue Web IDL implementation

already_AddRefed<CSSNumericValue> CSSNumericValue::Add(
    const Sequence<OwningCSSNumberish>& aValues, ErrorResult& aRv) {
  aRv.Throw(NS_ERROR_NOT_IMPLEMENTED);
  return nullptr;
}

already_AddRefed<CSSNumericValue> CSSNumericValue::Sub(
    const Sequence<OwningCSSNumberish>& aValues, ErrorResult& aRv) {
  aRv.Throw(NS_ERROR_NOT_IMPLEMENTED);
  return nullptr;
}

already_AddRefed<CSSNumericValue> CSSNumericValue::Mul(
    const Sequence<OwningCSSNumberish>& aValues, ErrorResult& aRv) {
  aRv.Throw(NS_ERROR_NOT_IMPLEMENTED);
  return nullptr;
}

already_AddRefed<CSSNumericValue> CSSNumericValue::Div(
    const Sequence<OwningCSSNumberish>& aValues, ErrorResult& aRv) {
  aRv.Throw(NS_ERROR_NOT_IMPLEMENTED);
  return nullptr;
}

already_AddRefed<CSSNumericValue> CSSNumericValue::Min(
    const Sequence<OwningCSSNumberish>& aValues, ErrorResult& aRv) {
  aRv.Throw(NS_ERROR_NOT_IMPLEMENTED);
  return nullptr;
}

already_AddRefed<CSSNumericValue> CSSNumericValue::Max(
    const Sequence<OwningCSSNumberish>& aValues, ErrorResult& aRv) {
  aRv.Throw(NS_ERROR_NOT_IMPLEMENTED);
  return nullptr;
}

bool CSSNumericValue::Equals(const Sequence<OwningCSSNumberish>& aValue) {
  return false;
}

// https://drafts.css-houdini.org/css-typed-om-1/#dom-cssnumericvalue-to
already_AddRefed<CSSUnitValue> CSSNumericValue::To(const nsACString& aUnit,
                                                   ErrorResult& aRv) const {
  // Step 1.
  StyleNumericType numericType;
  if (!Servo_NumericType_Create(&aUnit, &numericType)) {
    aRv.ThrowSyntaxError("Invalid unit: "_ns + aUnit);
    return nullptr;
  }

  // Step 2.
  auto styleNumericValue = ToStyleNumericValue();

  auto sumValue = WrapUnique(Servo_SumValue_Create(&styleNumericValue));
  if (!sumValue) {
    aRv.ThrowTypeError("Failed to create a sum value");
    return nullptr;
  }

  // Step 3.
  auto styleUnitValue = StyleOptional<StyleUnitValue>::None();
  Servo_SumValue_ToUnit(sumValue.get(), &aUnit, &styleUnitValue);
  if (styleUnitValue.IsNone()) {
    aRv.ThrowTypeError("Failed to convert to "_ns + aUnit);
    return nullptr;
  }

  // Step 4.
  RefPtr<CSSUnitValue> unitValue =
      CSSUnitValue::Create(mParent, styleUnitValue.AsSome());
  return unitValue.forget();
}

// https://drafts.css-houdini.org/css-typed-om-1/#dom-cssnumericvalue-tosum
already_AddRefed<CSSMathSum> CSSNumericValue::ToSum(
    const Sequence<nsCString>& aUnits, ErrorResult& aRv) const {
  // Step 1.
  AutoTArray<StyleNumericType, 4> numericTypes;
  numericTypes.SetCapacity(aUnits.Length());

  for (const auto& unit : aUnits) {
    StyleNumericType* numericType = numericTypes.AppendElement();
    if (!Servo_NumericType_Create(&unit, numericType)) {
      aRv.ThrowSyntaxError("Invalid unit: "_ns + unit);
      return nullptr;
    }
  }

  // The spec currently relies on CSSMathSum construction to reject requested
  // units that are not addable. Since the numeric types for all requested
  // units must already be created, validate addability here instead so
  // incompatible units fail early and the remaining algorithm can be skipped.
  //
  // TODO: Propose making this an explicit step in the specification.
  if (!numericTypes.IsEmpty()) {
    StyleNumericType numericType;
    if (!Servo_NumericType_AddTypesFromValues(&numericTypes, &numericType)) {
      aRv.ThrowTypeError("Units are not addable");
      return nullptr;
    }
  }

  // Step 2.
  auto styleNumericValue = ToStyleNumericValue();

  auto sumValue = WrapUnique(Servo_SumValue_Create(&styleNumericValue));
  if (!sumValue) {
    aRv.ThrowTypeError("Failed to create a sum value");
    return nullptr;
  }

  // Step 3-6.
  auto styleMathSum = StyleOptional<StyleMathSum>::None();
  Servo_SumValue_ToUnits(sumValue.get(),
                         &static_cast<const nsTArray<nsCString>&>(aUnits),
                         &styleMathSum);
  if (styleMathSum.IsNone()) {
    aRv.ThrowTypeError("Failed to convert to requested units");
    return nullptr;
  }

  // Step 7.
  RefPtr<CSSMathSum> mathSum =
      CSSMathSum::Create(mParent, styleMathSum.AsSome());
  return mathSum.forget();
}

// Step 2-3 of:
// https://drafts.css-houdini.org/css-typed-om-1/#dom-cssnumericvalue-type
void CSSNumericValue::Type(CSSNumericType& aRetVal) {
  // Step 2.

  // StyleALL_NUMERIC_BASE_TYPES[index] and CSSNUMERIC_TYPED_FIELDS[index]
  // refer to the same numeric base type by parallel-array convention. The
  // static_asserts in TypedOMUtils.cpp guarantee StyleNumericBaseType and
  // CSSNumericBaseType discriminants match, so the index can be used to look
  // up both the exponent and the field.
  for (size_t index = 0; index < StyleNUMERIC_BASE_TYPE_COUNT; index++) {
    auto baseType = StyleALL_NUMERIC_BASE_TYPES[index];

    if (auto power = mNumericType->Exponent(baseType)) {
      (aRetVal.*CSSNUMERIC_TYPE_FIELDS[index]).Construct(power);
    }
  }

  // Step 3.
  if (const auto& percentHint = mNumericType->percent_hint) {
    // The cast is safe, StyleNumericBaseType and CSSNumericBaseType have
    // matching discriminants, verified by static_asserts in TypedOMUtils.cpp.
    aRetVal.mPercentHint.Construct(
        static_cast<CSSNumericBaseType>(*percentHint));
  }
}

// https://drafts.css-houdini.org/css-typed-om-1/#dom-cssnumericvalue-parse
//
// static
already_AddRefed<CSSNumericValue> CSSNumericValue::Parse(
    const GlobalObject& aGlobal, const nsACString& aCssText, ErrorResult& aRv) {
  // Step 1 & 2 & 3.
  auto declaration = WrapUnique(Servo_NumericDeclaration_Parse(&aCssText));
  if (!declaration) {
    aRv.ThrowSyntaxError("Failed to parse CSS text");
    return nullptr;
  }

  // Step 4.
  StyleNumericValueResult result = StyleNumericValueResult::Unsupported();
  Servo_NumericDeclaration_GetValue(declaration.get(), &result);
  if (result.IsUnsupported()) {
    aRv.Throw(NS_ERROR_UNEXPECTED);
    return nullptr;
  }

  RefPtr<CSSNumericValue> numericValue =
      Create(aGlobal.GetAsSupports(), result.AsNumeric());
  return numericValue.forget();
}

// end of CSSNumericValue Web IDL implementation

bool CSSNumericValue::IsCSSUnitValue() const {
  return mNumericValueType == NumericValueType::UnitValue;
}

bool CSSNumericValue::IsCSSMathValue() const {
  return mNumericValueType == NumericValueType::MathValue;
}

void CSSNumericValue::ToCssTextWithProperty(const CSSPropertyId& aPropertyId,
                                            nsACString& aDest) const {
  ToCssTextWithProperty(aPropertyId, SerializationContext(), aDest);
}

void CSSNumericValue::ToCssTextWithProperty(
    const CSSPropertyId& aPropertyId, const SerializationContext& aContext,
    nsACString& aDest) const {
  switch (GetNumericValueType()) {
    case NumericValueType::MathValue: {
      const CSSMathValue& mathValue = GetAsCSSMathValue();

      mathValue.ToCssTextWithProperty(aPropertyId, aContext, aDest);
      break;
    }

    case NumericValueType::UnitValue: {
      const CSSUnitValue& unitValue = GetAsCSSUnitValue();

      unitValue.ToCssTextWithProperty(aPropertyId, aDest);
      break;
    }
  }
}

StyleNumericValue CSSNumericValue::ToStyleNumericValue() const {
  switch (GetNumericValueType()) {
    case NumericValueType::MathValue: {
      const CSSMathValue& mathValue = GetAsCSSMathValue();

      return StyleNumericValue::Math(mathValue.ToStyleMathValue());
    }

    case NumericValueType::UnitValue: {
      const CSSUnitValue& unitValue = GetAsCSSUnitValue();

      return StyleNumericValue::Unit(unitValue.ToStyleUnitValue());
    }
  }
  MOZ_MAKE_COMPILER_ASSUME_IS_UNREACHABLE("Bad numeric value type!");
}

const CSSNumericValue& CSSStyleValue::GetAsCSSNumericValue() const {
  MOZ_DIAGNOSTIC_ASSERT(mStyleValueType == StyleValueType::NumericValue);

  return *static_cast<const CSSNumericValue*>(this);
}

CSSNumericValue& CSSStyleValue::GetAsCSSNumericValue() {
  MOZ_DIAGNOSTIC_ASSERT(mStyleValueType == StyleValueType::NumericValue);

  return *static_cast<CSSNumericValue*>(this);
}

}  // namespace mozilla::dom
