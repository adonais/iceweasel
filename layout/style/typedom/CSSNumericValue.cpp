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
#include "mozilla/dom/CSSMathClamp.h"
#include "mozilla/dom/CSSMathInvert.h"
#include "mozilla/dom/CSSMathMax.h"
#include "mozilla/dom/CSSMathMin.h"
#include "mozilla/dom/CSSMathNegate.h"
#include "mozilla/dom/CSSMathProduct.h"
#include "mozilla/dom/CSSMathSum.h"
#include "mozilla/dom/CSSMathValue.h"
#include "mozilla/dom/CSSNumericArray.h"
#include "mozilla/dom/CSSNumericValueBinding.h"
#include "mozilla/dom/CSSUnitValue.h"
#include "nsTArray.h"

namespace mozilla::dom {

namespace {

template <typename Operation>
class SameUnitValueComputation final {
 public:
  SameUnitValueComputation(Span<const RefPtr<CSSNumericValue>> aValues,
                           Operation aOperation) {
    MOZ_DIAGNOSTIC_ASSERT(!aValues.IsEmpty());

    if (!aValues[0]->IsCSSUnitValue()) {
      return;
    }

    auto& firstUnitValue = aValues[0]->GetAsCSSUnitValue();
    double computedValue = firstUnitValue.Value();

    for (size_t i = 1; i < aValues.Length(); ++i) {
      if (!aValues[i]->IsCSSUnitValue()) {
        return;
      }

      const auto& unitValue = aValues[i]->GetAsCSSUnitValue();

      if (unitValue.Unit() != firstUnitValue.Unit()) {
        return;
      }

      computedValue = aOperation(computedValue, unitValue.Value());
    }

    mCommonUnitValue = &firstUnitValue;
    mComputedValue = computedValue;
  }

  bool AllHaveSameUnit() const { return mCommonUnitValue; }

  const StyleNumericType& CommonNumericType() const {
    MOZ_DIAGNOSTIC_ASSERT(AllHaveSameUnit());
    return mCommonUnitValue->GetNumericType();
  }

  const nsACString& CommonUnit() const {
    MOZ_DIAGNOSTIC_ASSERT(AllHaveSameUnit());
    return mCommonUnitValue->Unit();
  }

  double ComputedValue() const {
    MOZ_DIAGNOSTIC_ASSERT(AllHaveSameUnit());
    return mComputedValue;
  }

 private:
  RefPtr<CSSUnitValue> mCommonUnitValue;
  double mComputedValue = 0.0;
};

class ProductUnitValueComputation final {
 public:
  explicit ProductUnitValueComputation(
      Span<const RefPtr<CSSNumericValue>> aValues) {
    MOZ_DIAGNOSTIC_ASSERT(!aValues.IsEmpty());

    RefPtr<CSSUnitValue> firstNonNumberUnitValue;
    double computedValue = 1.0;

    for (const auto& value : aValues) {
      if (!value->IsCSSUnitValue()) {
        return;
      }

      auto& unitValue = value->GetAsCSSUnitValue();

      if (!unitValue.Unit().EqualsLiteral("number")) {
        if (firstNonNumberUnitValue) {
          return;
        }

        firstNonNumberUnitValue = &unitValue;
      }

      computedValue *= unitValue.Value();
    }

    mOneNonNumberUnitValue = std::move(firstNonNumberUnitValue);
    mComputedValue = computedValue;
    mValid = true;
  }

  bool AllHaveNumberUnit() const { return mValid && !mOneNonNumberUnitValue; }

  bool OneHasNonNumberUnit() const { return mValid && mOneNonNumberUnitValue; }

  const StyleNumericType& OneNonNumberNumericType() const {
    MOZ_DIAGNOSTIC_ASSERT(OneHasNonNumberUnit());
    return mOneNonNumberUnitValue->GetNumericType();
  }

  const nsACString& OneNonNumberUnit() const {
    MOZ_DIAGNOSTIC_ASSERT(OneHasNonNumberUnit());
    return mOneNonNumberUnitValue->Unit();
  }

  double ComputedValue() const {
    MOZ_DIAGNOSTIC_ASSERT(mValid);
    return mComputedValue;
  }

 private:
  RefPtr<CSSUnitValue> mOneNonNumberUnitValue;
  double mComputedValue = 0.0;
  bool mValid = false;
};

template <typename Operation>
UniquePtr<StyleNumericType> ComputeNumericType(
    Span<const RefPtr<CSSNumericValue>> aValues, Operation aOperation,
    ErrorResult& aRv) {
  AutoTArray<const StyleNumericType*, 8> numericTypes;
  numericTypes.SetCapacity(aValues.Length());

  for (const auto& value : aValues) {
    numericTypes.AppendElement(&value->GetNumericType());
  }

  auto numericType = MakeUnique<StyleNumericType>();
  if (!aOperation(&numericTypes, numericType.get())) {
    aRv.ThrowTypeError("Incompatible types");
    return nullptr;
  }

  return numericType;
}

}  // namespace

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

// Note: Implementing arithmetic operations in Stylo/Rust was considered, but
// would require recursively converting operands via ToStyleNumericValue().
// While this can be justified for To() and ToSum(), it would introduce
// unnecessary conversions for arithmetic operations, which can work directly
// with the existing DOM numeric values.

// https://drafts.css-houdini.org/css-typed-om-1/#dom-cssnumericvalue-add
already_AddRefed<CSSNumericValue> CSSNumericValue::Add(
    const Sequence<OwningCSSNumberish>& aValues, ErrorResult& aRv) {
  nsTArray<RefPtr<CSSNumericValue>> values;

  // Step 1.
  for (const OwningCSSNumberish& numberish : aValues) {
    values.AppendElement(CSSNumericValue::Create(mParent, numberish));
  }

  // Step 2-5.
  return Add(std::move(values), aRv);
}

// https://drafts.css-houdini.org/css-typed-om-1/#dom-cssnumericvalue-sub
already_AddRefed<CSSNumericValue> CSSNumericValue::Sub(
    const Sequence<OwningCSSNumberish>& aValues, ErrorResult& aRv) {
  nsTArray<RefPtr<CSSNumericValue>> values;

  // Step 1.
  for (const OwningCSSNumberish& numberish : aValues) {
    RefPtr<CSSNumericValue> value = CSSNumericValue::Create(mParent, numberish);

    values.AppendElement(value->Negate());
  }

  // Step 2.
  return Add(std::move(values), aRv);
}

// https://drafts.css-houdini.org/css-typed-om-1/#dom-cssnumericvalue-mul
already_AddRefed<CSSNumericValue> CSSNumericValue::Mul(
    const Sequence<OwningCSSNumberish>& aValues, ErrorResult& aRv) {
  nsTArray<RefPtr<CSSNumericValue>> values;

  // Step 1.
  for (const OwningCSSNumberish& numberish : aValues) {
    values.AppendElement(CSSNumericValue::Create(mParent, numberish));
  }

  // Step 2-6.
  return Mul(std::move(values), aRv);
}

// https://drafts.css-houdini.org/css-typed-om-1/#dom-cssnumericvalue-div
already_AddRefed<CSSNumericValue> CSSNumericValue::Div(
    const Sequence<OwningCSSNumberish>& aValues, ErrorResult& aRv) {
  nsTArray<RefPtr<CSSNumericValue>> values;

  // Step 1.
  for (const OwningCSSNumberish& numberish : aValues) {
    RefPtr<CSSNumericValue> value = CSSNumericValue::Create(mParent, numberish);

    RefPtr<CSSNumericValue> inverted = value->Invert(aRv);
    if (aRv.Failed()) {
      return nullptr;
    }

    values.AppendElement(std::move(inverted));
  }

  // Step 2.
  return Mul(std::move(values), aRv);
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

// https://drafts.css-houdini.org/css-typed-om-1/#dom-cssnumericvalue-equals
bool CSSNumericValue::Equals(const Sequence<OwningCSSNumberish>& aValue) {
  // Steps 1 and 2.
  // Rectify and compare each value in a single loop, avoiding the need to
  // create a separate array for the rectified values.
  for (const OwningCSSNumberish& numberish : aValue) {
    RefPtr<CSSNumericValue> value = CSSNumericValue::Create(mParent, numberish);

    if (!EqualNumericValues(*value, *this)) {
      return false;
    }
  }

  // Step 3.
  return true;
}

// https://drafts.css-houdini.org/css-typed-om-1/#dom-cssnumericvalue-to
already_AddRefed<CSSUnitValue> CSSNumericValue::To(const nsACString& aUnit,
                                                   ErrorResult& aRv) const {
  // Step 1-3.
  auto styleUnitValue = ToStyleUnitValue(aUnit, aRv);
  if (aRv.Failed()) {
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
  return Parse(aGlobal.GetAsSupports(), aCssText, aRv);
}

// static
already_AddRefed<CSSNumericValue> CSSNumericValue::Parse(
    nsISupports* aParent, const nsACString& aCssText, ErrorResult& aRv) {
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

  RefPtr<CSSNumericValue> numericValue = Create(aParent, result.AsNumeric());
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

// Step 2-5 of:
// https://drafts.css-houdini.org/css-typed-om-1/#dom-cssnumericvalue-add
already_AddRefed<CSSNumericValue> CSSNumericValue::Add(
    nsTArray<RefPtr<CSSNumericValue>> aValues, ErrorResult& aRv) {
  // Step 2.
  if (IsCSSMathValue() && GetAsCSSMathValue().IsCSSMathSum()) {
    aValues.InsertElementsAt(
        0, GetAsCSSMathValue().GetAsCSSMathSum().Values()->GetValues());
  } else {
    aValues.InsertElementAt(0, this);
  }

  SameUnitValueComputation computation(aValues, std::plus<double>{});

  // Step 3.
  if (computation.AllHaveSameUnit()) {
    return MakeCSSUnitValue(mParent, computation.CommonNumericType(),
                            computation.ComputedValue(),
                            computation.CommonUnit());
  }

  // Step 4.
  auto numericType = AddTypes(aValues, aRv);
  if (aRv.Failed()) {
    return nullptr;
  }

  // Step 5.
  RefPtr<CSSMathSum> mathSum =
      CSSMathSum::Create(mParent, std::move(numericType), std::move(aValues));
  return mathSum.forget();
}

// https://drafts.css-houdini.org/css-typed-om-1/#cssmath-negate-a-cssnumericvalue
already_AddRefed<CSSNumericValue> CSSNumericValue::Negate() {
  // Step 1.
  if (IsCSSMathValue() && GetAsCSSMathValue().IsCSSMathNegate()) {
    RefPtr<CSSNumericValue> value =
        GetAsCSSMathValue().GetAsCSSMathNegate().Value();
    return value.forget();
  }

  // Step 2.
  if (IsCSSUnitValue()) {
    const auto& unitValue = GetAsCSSUnitValue();

    return MakeCSSUnitValue(mParent, unitValue.GetNumericType(),
                            -unitValue.Value(), unitValue.Unit());
  }

  // Step 3.
  auto numericType = MakeUnique<StyleNumericType>(GetNumericType());

  RefPtr<CSSMathNegate> mathNegate =
      CSSMathNegate::Create(mParent, std::move(numericType), this);
  return mathNegate.forget();
}

// Step 2-6 of:
// https://drafts.css-houdini.org/css-typed-om-1/#dom-cssnumericvalue-mul
already_AddRefed<CSSNumericValue> CSSNumericValue::Mul(
    nsTArray<RefPtr<CSSNumericValue>> aValues, ErrorResult& aRv) {
  // Step 2.
  if (IsCSSMathValue() && GetAsCSSMathValue().IsCSSMathProduct()) {
    aValues.InsertElementsAt(
        0, GetAsCSSMathValue().GetAsCSSMathProduct().Values()->GetValues());
  } else {
    aValues.InsertElementAt(0, this);
  }

  ProductUnitValueComputation computation(aValues);

  // Step 3.
  if (computation.AllHaveNumberUnit()) {
    return MakeCSSUnitValue(mParent, computation.ComputedValue());
  }

  // Step 4.
  if (computation.OneHasNonNumberUnit()) {
    return MakeCSSUnitValue(mParent, computation.OneNonNumberNumericType(),
                            computation.ComputedValue(),
                            computation.OneNonNumberUnit());
  }

  // Step 5.
  auto numericType = MultiplyTypes(aValues, aRv);
  if (aRv.Failed()) {
    return nullptr;
  }

  // Step 6.
  RefPtr<CSSMathProduct> mathProduct = CSSMathProduct::Create(
      mParent, std::move(numericType), std::move(aValues));
  return mathProduct.forget();
}

// https://drafts.css-houdini.org/css-typed-om-1/#cssmath-invert-a-cssnumericvalue
already_AddRefed<CSSNumericValue> CSSNumericValue::Invert(ErrorResult& aRv) {
  // Step 1.
  if (IsCSSMathValue() && GetAsCSSMathValue().IsCSSMathInvert()) {
    RefPtr<CSSNumericValue> value =
        GetAsCSSMathValue().GetAsCSSMathInvert().Value();
    return value.forget();
  }

  // Step 2.
  if (IsCSSUnitValue() && GetAsCSSUnitValue().Unit().EqualsLiteral("number")) {
    const auto& unitValue = GetAsCSSUnitValue();

    // Step 2.1.
    if (unitValue.Value() == 0.0) {
      aRv.ThrowRangeError("Cannot divide by zero");
      return nullptr;
    }

    // Step 2.2.
    return MakeCSSUnitValue(mParent, 1.0 / unitValue.Value());
  }

  // Step 3.
  auto numericType = MakeUnique<StyleNumericType>(GetNumericType());
  Servo_NumericType_Invert(numericType.get());

  RefPtr<CSSMathInvert> mathInvert =
      CSSMathInvert::Create(mParent, std::move(numericType), this);
  return mathInvert.forget();
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

// Step 1-3 of:
// https://drafts.css-houdini.org/css-typed-om-1/#dom-cssnumericvalue-to
StyleOptional<StyleUnitValue> CSSNumericValue::ToStyleUnitValue(
    const nsACString& aUnit, ErrorResult& aRv) const {
  auto result = StyleOptional<StyleUnitValue>::None();

  // Step 1.
  StyleNumericType numericType;
  if (!Servo_NumericType_Create(&aUnit, &numericType)) {
    aRv.ThrowSyntaxError("Invalid unit: "_ns + aUnit);
    return result;
  }

  // Step 2.
  auto styleNumericValue = ToStyleNumericValue();

  auto sumValue = WrapUnique(Servo_SumValue_Create(&styleNumericValue));
  if (!sumValue) {
    aRv.ThrowTypeError("Failed to create a sum value");
    return result;
  }

  // Step 3.
  Servo_SumValue_ToUnit(sumValue.get(), &aUnit, &result);
  if (result.IsNone()) {
    aRv.ThrowTypeError("Failed to convert to "_ns + aUnit);
    return result;
  }

  return result;
}

StyleUnitValue CSSNumericValue::ToStyleUnitValue(
    const nsACString& aUnit) const {
  IgnoredErrorResult rv;
  auto styleUnitValue = ToStyleUnitValue(aUnit, rv);
  if (rv.Failed()) {
    MOZ_ASSERT_UNREACHABLE("Failed to convert CSSNumericValue to unit");
    return {StyleNumericType::Number(), 0.0, "number"_ns};
  }

  return *styleUnitValue;
}

// https://drafts.css-houdini.org/css-typed-om-1/#equal-numeric-value
//
// static
bool CSSNumericValue::EqualNumericValues(const CSSNumericValue& aValue1,
                                         const CSSNumericValue& aValue2) {
  // Step 1.
  if (aValue1.GetNumericValueType() != aValue2.GetNumericValueType() ||
      (aValue1.IsCSSMathValue() &&
       aValue1.GetAsCSSMathValue().GetMathValueType() !=
           aValue2.GetAsCSSMathValue().GetMathValueType())) {
    return false;
  }

  // Step 2.
  // We don't need to check aValue2 since Step 1 guarantees that both values
  // are members of the same interface.
  if (aValue1.IsCSSUnitValue()) {
    const auto& value1 = aValue1.GetAsCSSUnitValue();
    const auto& value2 = aValue2.GetAsCSSUnitValue();

    return value1.Unit() == value2.Unit() && value1.Value() == value2.Value();
  }

  const auto& value1 = aValue1.GetAsCSSMathValue();
  const auto& value2 = aValue2.GetAsCSSMathValue();

  // Step 3.
  // As above, we don't need to check aValue2.
  const CSSNumericArray* numericArray1 = nullptr;
  const CSSNumericArray* numericArray2 = nullptr;

  switch (value1.GetMathValueType()) {
    case CSSMathValue::MathValueType::MathSum:
      numericArray1 = value1.GetAsCSSMathSum().Values();
      numericArray2 = value2.GetAsCSSMathSum().Values();
      break;

    case CSSMathValue::MathValueType::MathProduct:
      numericArray1 = value1.GetAsCSSMathProduct().Values();
      numericArray2 = value2.GetAsCSSMathProduct().Values();
      break;

    case CSSMathValue::MathValueType::MathMin:
      numericArray1 = value1.GetAsCSSMathMin().Values();
      numericArray2 = value2.GetAsCSSMathMin().Values();
      break;

    case CSSMathValue::MathValueType::MathMax:
      numericArray1 = value1.GetAsCSSMathMax().Values();
      numericArray2 = value2.GetAsCSSMathMax().Values();
      break;

    default:
      break;
  }

  if (numericArray1) {
    const auto& values1 = numericArray1->GetValues();
    const auto& values2 = numericArray2->GetValues();

    // Step 3.1.
    if (values1.Length() != values2.Length()) {
      return false;
    }

    // Step 3.2.
    for (size_t i = 0; i < values1.Length(); ++i) {
      if (!EqualNumericValues(*values1[i], *values2[i])) {
        return false;
      }
    }

    // Step 3.3.
    return true;
  }

  // Proposed step for CSSMathClamp.
  //
  // CSSMathClamp is not currently covered by the specification's equality
  // algorithm. Handle it structurally for compatibility with other browsers.
  //
  // As above, we don't need to check aValue2.
  if (value1.GetMathValueType() == CSSMathValue::MathValueType::MathClamp) {
    const auto& clamp1 = value1.GetAsCSSMathClamp();
    const auto& clamp2 = value2.GetAsCSSMathClamp();

    return EqualNumericValues(*clamp1.Lower(), *clamp2.Lower()) &&
           EqualNumericValues(*clamp1.Value(), *clamp2.Value()) &&
           EqualNumericValues(*clamp1.Upper(), *clamp2.Upper());
  }

  // Step 4.
  // As above, we don't need to check aValue2.
  MOZ_ASSERT(
      value1.GetMathValueType() == CSSMathValue::MathValueType::MathNegate ||
      value1.GetMathValueType() == CSSMathValue::MathValueType::MathInvert);

  // Step 5.
  if (value1.GetMathValueType() == CSSMathValue::MathValueType::MathNegate) {
    return EqualNumericValues(*value1.GetAsCSSMathNegate().Value(),
                              *value2.GetAsCSSMathNegate().Value());
  }

  return EqualNumericValues(*value1.GetAsCSSMathInvert().Value(),
                            *value2.GetAsCSSMathInvert().Value());
}

UniquePtr<StyleNumericType> CSSNumericValue::AddTypes(
    Span<const RefPtr<CSSNumericValue>> aValues, ErrorResult& aRv) {
  return ComputeNumericType(aValues, Servo_NumericType_AddTypes, aRv);
}

UniquePtr<StyleNumericType> CSSNumericValue::MultiplyTypes(
    Span<const RefPtr<CSSNumericValue>> aValues, ErrorResult& aRv) {
  return ComputeNumericType(aValues, Servo_NumericType_MultiplyTypes, aRv);
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
