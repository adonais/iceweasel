/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef LAYOUT_STYLE_TYPEDOM_CSSSTYLEVALUE_H_
#define LAYOUT_STYLE_TYPEDOM_CSSSTYLEVALUE_H_

#include "js/TypeDecls.h"
#include "nsCOMPtr.h"
#include "nsISupports.h"
#include "nsISupportsImpl.h"
#include "nsStringFwd.h"
#include "nsTArrayForwardDeclare.h"
#include "nsWrapperCache.h"

template <class T>
class RefPtr;

namespace mozilla {

class ErrorResult;

namespace dom {

class GlobalObject;

class CSSStyleValue : public nsISupports, public nsWrapperCache {
 public:
  explicit CSSStyleValue(nsCOMPtr<nsISupports> aParent);

  NS_DECL_CYCLE_COLLECTING_ISUPPORTS
  NS_DECL_CYCLE_COLLECTION_WRAPPERCACHE_CLASS(CSSStyleValue)

  nsISupports* GetParentObject() const;

  JSObject* WrapObject(JSContext*, JS::Handle<JSObject*> aGivenProto) override;

  // start of CSSStyleValue Web IDL declarations

  [[nodiscard]] static RefPtr<CSSStyleValue> Parse(const GlobalObject& aGlobal,
                                                   const nsACString& aProperty,
                                                   const nsACString& aCssText,
                                                   ErrorResult& aRv);

  static void ParseAll(const GlobalObject& aGlobal, const nsACString& aProperty,
                       const nsACString& aCssText,
                       nsTArray<RefPtr<CSSStyleValue>>& aRetVal,
                       ErrorResult& aRv);

  void Stringify(nsAString& aRetVal) const;

  // end of CSSStyleValue Web IDL declarations

 protected:
  virtual ~CSSStyleValue() = default;

  nsCOMPtr<nsISupports> mParent;
};

}  // namespace dom
}  // namespace mozilla

#endif  // LAYOUT_STYLE_TYPEDOM_CSSSTYLEVALUE_H_
