/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef LAYOUT_STYLE_TYPEDOM_CSSTRANSFORMCOMPONENT_H_
#define LAYOUT_STYLE_TYPEDOM_CSSTRANSFORMCOMPONENT_H_

#include "js/TypeDecls.h"
#include "mozilla/dom/DOMMatrixBindingFwd.h"
#include "nsCOMPtr.h"
#include "nsISupports.h"
#include "nsISupportsImpl.h"
#include "nsStringFwd.h"
#include "nsWrapperCache.h"

template <class T>
struct already_AddRefed;

namespace mozilla {

class ErrorResult;

namespace dom {

class CSSTransformComponent : public nsISupports, public nsWrapperCache {
 public:
  explicit CSSTransformComponent(nsCOMPtr<nsISupports> aParent);

  NS_DECL_CYCLE_COLLECTING_ISUPPORTS
  NS_DECL_CYCLE_COLLECTION_WRAPPERCACHE_CLASS(CSSTransformComponent)

  nsISupports* GetParentObject() const;

  JSObject* WrapObject(JSContext*, JS::Handle<JSObject*> aGivenProto) override;

  // start of CSSTransformComponent Web IDL declarations

  bool Is2D() const;

  void SetIs2D(bool aArg);

  already_AddRefed<DOMMatrix> ToMatrix(ErrorResult& aRv);

  void Stringify(nsString& aRetVal);

  // end of CSSTransformComponent Web IDL declarations

 protected:
  virtual ~CSSTransformComponent() = default;

  nsCOMPtr<nsISupports> mParent;
};

}  // namespace dom
}  // namespace mozilla

#endif  // LAYOUT_STYLE_TYPEDOM_CSSTRANSFORMCOMPONENT_H_
