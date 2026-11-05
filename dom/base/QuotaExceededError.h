/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef DOM_BASE_QUOTAEXCEEDEDERROR_H_
#define DOM_BASE_QUOTAEXCEEDEDERROR_H_

#include "mozilla/dom/DOMException.h"
#include "mozilla/dom/Nullable.h"

namespace mozilla::dom {

struct QuotaExceededErrorOptions;

class QuotaExceededError final : public DOMException {
 public:
  QuotaExceededError(nsresult aRv, const nsACString& aMessage,
                     const Nullable<double>& aQuota = Nullable<double>(),
                     const Nullable<double>& aRequested = Nullable<double>(),
                     nsIStackFrame* aLocation = nullptr);

  JSObject* WrapObject(JSContext* aCx,
                       JS::Handle<JSObject*> aGivenProto) override;

  static already_AddRefed<QuotaExceededError> Constructor(
      const GlobalObject& aGlobal, const nsAString& aMessage,
      const QuotaExceededErrorOptions& aOptions, ErrorResult& aRv);

  Nullable<double> GetQuota() const { return mQuota; }
  Nullable<double> GetRequested() const { return mRequested; }

  static already_AddRefed<QuotaExceededError> ReadStructuredClone(
      JSContext* aCx, nsIGlobalObject* aGlobal,
      JSStructuredCloneReader* aReader);
  bool WriteStructuredClone(JSContext* aCx,
                            JSStructuredCloneWriter* aWriter) const;

 private:
  ~QuotaExceededError() = default;

  Nullable<double> mQuota;
  Nullable<double> mRequested;
};

}  // namespace mozilla::dom

#endif  // DOM_BASE_QUOTAEXCEEDEDERROR_H_
