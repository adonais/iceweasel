/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "mozilla/dom/CSSMathClamp.h"

#include "mozilla/AlreadyAddRefed.h"
#include "mozilla/Assertions.h"
#include "mozilla/ErrorResult.h"
#include "mozilla/NotNull.h"
#include "mozilla/ServoStyleConsts.h"
#include "mozilla/dom/BindingDeclarations.h"
#include "mozilla/dom/CSSMathClampBinding.h"
#include "mozilla/dom/CSSNumericValue.h"
#include "mozilla/dom/CSSNumericValueBinding.h"
#include "nsString.h"

namespace mozilla::dom {

CSSMathClamp::CSSMathClamp(
    nsCOMPtr<nsISupports> aParent,
    MovingNotNull<UniquePtr<StyleNumericType>> aNumericType,
    RefPtr<CSSNumericValue> aLower, RefPtr<CSSNumericValue> aValue,
    RefPtr<CSSNumericValue> aUpper)
    : CSSMathValue(std::move(aParent), std::move(aNumericType),
                   MathValueType::MathClamp),
      mLower(std::move(aLower)),
      mValue(std::move(aValue)),
      mUpper(std::move(aUpper)) {}

// static
RefPtr<CSSMathClamp> CSSMathClamp::Create(nsCOMPtr<nsISupports> aParent,
                                          const StyleMathClamp& aMathClamp) {
  const auto values = aMathClamp.values.AsSpan();
  static_assert(decltype(StyleMathClamp::values)::Length() == 3);

  RefPtr<CSSNumericValue> lower = CSSNumericValue::Create(aParent, values[0]);
  RefPtr<CSSNumericValue> value = CSSNumericValue::Create(aParent, values[1]);
  RefPtr<CSSNumericValue> upper = CSSNumericValue::Create(aParent, values[2]);

  return MakeAndAddRef<CSSMathClamp>(
      std::move(aParent),
      WrapMovingNotNull(MakeUnique<StyleNumericType>(aMathClamp.numeric_type)),
      std::move(lower), std::move(value), std::move(upper));
}

NS_IMPL_ISUPPORTS_CYCLE_COLLECTION_INHERITED_0(CSSMathClamp, CSSMathValue)
NS_IMPL_CYCLE_COLLECTION_INHERITED(CSSMathClamp, CSSMathValue, mLower, mValue,
                                   mUpper)

JSObject* CSSMathClamp::WrapObject(JSContext* aCx,
                                   JS::Handle<JSObject*> aGivenProto) {
  return CSSMathClamp_Binding::Wrap(aCx, this, aGivenProto);
}

// start of CSSMathClamp Web IDL implementation

// https://drafts.css-houdini.org/css-typed-om-1/#dom-cssmathclamp-cssmathclamp
//
// static
already_AddRefed<CSSMathClamp> CSSMathClamp::Constructor(
    const GlobalObject& aGlobal, const CSSNumberish& aLower,
    const CSSNumberish& aValue, const CSSNumberish& aUpper, ErrorResult& aRv) {
  nsCOMPtr<nsISupports> global = aGlobal.GetAsSupports();

  // Step 1.
  RefPtr<CSSNumericValue> lower = CSSNumericValue::Create(global, aLower);
  RefPtr<CSSNumericValue> value = CSSNumericValue::Create(global, aValue);
  RefPtr<CSSNumericValue> upper = CSSNumericValue::Create(global, aUpper);

  // Step 2.

  AutoTArray<const StyleNumericType*, 3> numericTypes;

  numericTypes.AppendElement(&lower->GetNumericType());
  numericTypes.AppendElement(&value->GetNumericType());
  numericTypes.AppendElement(&upper->GetNumericType());

  auto numericType = MakeUnique<StyleNumericType>();
  if (!Servo_NumericType_AddTypes(&numericTypes, numericType.get())) {
    aRv.ThrowTypeError("Incompatible types");
    return nullptr;
  }

  // Step 3.

  return MakeAndAddRef<CSSMathClamp>(
      std::move(global), WrapMovingNotNull(std::move(numericType)),
      std::move(lower), std::move(value), std::move(upper));
}

CSSNumericValue* CSSMathClamp::Lower() const { return mLower; }

CSSNumericValue* CSSMathClamp::Value() const { return mValue; }

CSSNumericValue* CSSMathClamp::Upper() const { return mUpper; }

// end of CSSMathClamp Web IDL implementation

void CSSMathClamp::ToCssTextWithProperty(const CSSPropertyId& aPropertyId,
                                         const SerializationContext& aContext,
                                         nsACString& aDest) const {
  // TODO: The spec seems to not describe CSSMathClamp serialization.

  aDest.Append("clamp("_ns);

  mLower->ToCssTextWithProperty(
      aPropertyId, SerializationContext(Nested{}, ParenLess{}), aDest);
  aDest.Append(", "_ns);

  mValue->ToCssTextWithProperty(
      aPropertyId, SerializationContext(Nested{}, ParenLess{}), aDest);
  aDest.Append(", "_ns);

  mUpper->ToCssTextWithProperty(
      aPropertyId, SerializationContext(Nested{}, ParenLess{}), aDest);

  aDest.Append(")"_ns);
}

StyleMathClamp CSSMathClamp::ToStyleMathClamp() const {
  return StyleMathClamp{GetNumericType(), StyleOwnedArray<StyleNumericValue, 3>(
                                              mLower->ToStyleNumericValue(),
                                              mValue->ToStyleNumericValue(),
                                              mUpper->ToStyleNumericValue())};
}

const CSSMathClamp& CSSMathValue::GetAsCSSMathClamp() const {
  MOZ_DIAGNOSTIC_ASSERT(mMathValueType == MathValueType::MathClamp);

  return *static_cast<const CSSMathClamp*>(this);
}

CSSMathClamp& CSSMathValue::GetAsCSSMathClamp() {
  MOZ_DIAGNOSTIC_ASSERT(mMathValueType == MathValueType::MathClamp);

  return *static_cast<CSSMathClamp*>(this);
}

}  // namespace mozilla::dom
