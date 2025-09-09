/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim:set ts=2 sw=2 sts=2 et cindent: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef LAYOUT_STYLE_TYPEDOM_CSSTRANSFORMVALUE_H_
#define LAYOUT_STYLE_TYPEDOM_CSSTRANSFORMVALUE_H_

#include <stdint.h>

#include "js/TypeDecls.h"
#include "mozilla/dom/CSSStyleValue.h"
#include "mozilla/dom/CSSTransformComponentBindingFwd.h"
#include "mozilla/dom/DOMMatrixBindingFwd.h"

template <class T>
struct already_AddRefed;
template <class T>
class nsCOMPtr;
class nsISupports;

namespace mozilla {

class ErrorResult;
template <class T>
class OwningNonNull;

namespace dom {

class GlobalObject;
template <typename T>
class Sequence;

class CSSTransformValue final : public CSSStyleValue {
 public:
  explicit CSSTransformValue(nsCOMPtr<nsISupports> aParent);

  JSObject* WrapObject(JSContext* aCx,
                       JS::Handle<JSObject*> aGivenProto) override;

  // start of CSSTransformValue Web IDL declarations

  static already_AddRefed<CSSTransformValue> Constructor(
      const GlobalObject& aGlobal,
      const Sequence<OwningNonNull<CSSTransformComponent>>& aTransforms,
      ErrorResult& aRv);

  uint32_t Length() const;

  bool Is2D() const;

  already_AddRefed<DOMMatrix> ToMatrix(ErrorResult& aRv);

  CSSTransformComponent* IndexedGetter(uint32_t aIndex, bool& aFound,
                                       ErrorResult& aRv);

  void IndexedSetter(uint32_t aIndex, CSSTransformComponent& aVal,
                     ErrorResult& aRv);

  // end of CSSTransformValue Web IDL declarations

 private:
  virtual ~CSSTransformValue() = default;
};

}  // namespace dom
}  // namespace mozilla

#endif  // LAYOUT_STYLE_TYPEDOM_CSSTRANSFORMVALUE_H_
