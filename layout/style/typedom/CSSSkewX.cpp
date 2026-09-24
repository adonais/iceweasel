/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "mozilla/dom/CSSSkewX.h"

#include "mozilla/AlreadyAddRefed.h"
#include "mozilla/ErrorResult.h"
#include "mozilla/ServoStyleConsts.h"
#include "mozilla/dom/BindingDeclarations.h"
#include "mozilla/dom/CSSNumericValue.h"
#include "mozilla/dom/CSSSkewXBinding.h"
#include "mozilla/dom/CSSUnitValue.h"
#include "mozilla/dom/DOMMatrix.h"
#include "nsString.h"

namespace mozilla::dom {

CSSSkewX::CSSSkewX(nsCOMPtr<nsISupports> aParent, bool aIs2D,
                   RefPtr<CSSNumericValue> aAx)
    : CSSTransformComponent(std::move(aParent), aIs2D,
                            TransformComponentType::SkewX),
      mAx(std::move(aAx)) {}

// static
RefPtr<CSSSkewX> CSSSkewX::Create(nsCOMPtr<nsISupports> aParent,
                                  const StyleSkewXComponent& aSkewXComponent) {
  RefPtr<CSSNumericValue> ax =
      CSSNumericValue::Create(aParent, aSkewXComponent);

  return MakeAndAddRef<CSSSkewX>(std::move(aParent), /* aIs2Da */ true,
                                 std::move(ax));
}

NS_IMPL_ISUPPORTS_CYCLE_COLLECTION_INHERITED_0(CSSSkewX, CSSTransformComponent)
NS_IMPL_CYCLE_COLLECTION_INHERITED(CSSSkewX, CSSTransformComponent, mAx)

JSObject* CSSSkewX::WrapObject(JSContext* aCx,
                               JS::Handle<JSObject*> aGivenProto) {
  return CSSSkewX_Binding::Wrap(aCx, this, aGivenProto);
}

// start of CSSSkewX Web IDL implementation

// https://drafts.css-houdini.org/css-typed-om-1/#dom-cssskewx-cssskewx
//
// static
already_AddRefed<CSSSkewX> CSSSkewX::Constructor(const GlobalObject& aGlobal,
                                                 CSSNumericValue& aAx,
                                                 ErrorResult& aRv) {
  // Step 1.
  if (!aAx.GetNumericType().MatchesAngle()) {
    aRv.ThrowTypeError("Ax must match <angle>");
    return nullptr;
  }

  // Step 2.
  return MakeAndAddRef<CSSSkewX>(aGlobal.GetAsSupports(), /* aIs2D */ true,
                                 &aAx);
}

CSSNumericValue* CSSSkewX::Ax() const { return mAx; }

void CSSSkewX::SetAx(CSSNumericValue& aArg, ErrorResult& aRv) {
  if (!aArg.GetNumericType().MatchesAngle()) {
    aRv.ThrowTypeError("Ax must match <angle>");
    return;
  }

  mAx = &aArg;
}

// end of CSSSkewX Web IDL implementation

already_AddRefed<DOMMatrix> CSSSkewX::ToMatrix(ErrorResult& aRv) {
  auto matrix = MakeRefPtr<DOMMatrix>(mParent);

  auto ax = mAx->ToStyleUnitValue("deg"_ns);

  matrix->SkewXSelf(ax.value);

  return matrix.forget();
}

void CSSSkewX::ToCssTextWithProperty(const CSSPropertyId& aPropertyId,
                                     nsACString& aDest) const {
  aDest.Append("skewX("_ns);

  mAx->ToCssTextWithProperty(aPropertyId, aDest);

  aDest.Append(")"_ns);
}

const CSSSkewX& CSSTransformComponent::GetAsCSSSkewX() const {
  MOZ_DIAGNOSTIC_ASSERT(mTransformComponentType ==
                        TransformComponentType::SkewX);

  return *static_cast<const CSSSkewX*>(this);
}

CSSSkewX& CSSTransformComponent::GetAsCSSSkewX() {
  MOZ_DIAGNOSTIC_ASSERT(mTransformComponentType ==
                        TransformComponentType::SkewX);

  return *static_cast<CSSSkewX*>(this);
}

}  // namespace mozilla::dom
