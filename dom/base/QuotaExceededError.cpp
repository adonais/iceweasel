/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "mozilla/dom/QuotaExceededError.h"

#include "js/StructuredClone.h"
#include "mozilla/ErrorResult.h"
#include "mozilla/dom/BindingUtils.h"
#include "mozilla/dom/DOMExceptionBinding.h"
#include "mozilla/dom/QuotaExceededErrorBinding.h"
#include "nsJSUtils.h"

namespace mozilla::dom {

QuotaExceededError::QuotaExceededError(nsresult aRv, const nsACString& aMessage,
                                       const Nullable<double>& aQuota,
                                       const Nullable<double>& aRequested,
                                       nsIStackFrame* aLocation)
    : DOMException(aRv, aMessage, "QuotaExceededError"_ns,
                   DOMException_Binding::QUOTA_EXCEEDED_ERR, aLocation),
      mQuota(aQuota),
      mRequested(aRequested) {}

JSObject* QuotaExceededError::WrapObject(JSContext* aCx,
                                         JS::Handle<JSObject*> aGivenProto) {
  return QuotaExceededError_Binding::Wrap(aCx, this, aGivenProto);
}

// https://webidl.spec.whatwg.org/#dom-quotaexceedederror-quotaexceedederror
/* static */
already_AddRefed<QuotaExceededError> QuotaExceededError::Constructor(
    const GlobalObject& aGlobal, const nsAString& aMessage,
    const QuotaExceededErrorOptions& aOptions, ErrorResult& aRv) {
  Nullable<double> quota;
  Nullable<double> requested;

  // Step 3. If options["quota"] is present: if it is less than 0, throw a
  // RangeError; otherwise set quota.
  if (aOptions.mQuota.WasPassed()) {
    if (aOptions.mQuota.Value() < 0) {
      aRv.ThrowRangeError("quota must not be negative");
      return nullptr;
    }
    quota.SetValue(aOptions.mQuota.Value());
  }

  // Step 4. If options["requested"] is present: if it is less than 0, throw a
  // RangeError; otherwise set requested.
  if (aOptions.mRequested.WasPassed()) {
    if (aOptions.mRequested.Value() < 0) {
      aRv.ThrowRangeError("requested must not be negative");
      return nullptr;
    }
    requested.SetValue(aOptions.mRequested.Value());
  }

  // Step 5. If quota and requested are both non-null and requested is less
  // than quota, throw a RangeError.
  if (!quota.IsNull() && !requested.IsNull() &&
      requested.Value() < quota.Value()) {
    aRv.ThrowRangeError("requested must not be less than quota");
    return nullptr;
  }

  // Steps 1-2. Set name to "QuotaExceededError" and message to message; done
  // by the base DOMException constructor.
  return do_AddRef(new QuotaExceededError(NS_ERROR_DOM_QUOTA_EXCEEDED_ERR,
                                          NS_ConvertUTF16toUTF8(aMessage),
                                          quota, requested));
}

/* static */
already_AddRefed<QuotaExceededError> QuotaExceededError::ReadStructuredClone(
    JSContext* aCx, nsIGlobalObject* aGlobal,
    JSStructuredCloneReader* aReader) {
  uint32_t reserved;
  nsresult rv;
  JS::Rooted<JSString*> jsMessage(aCx);
  nsCString message;
  uint32_t hasQuota;
  uint32_t hasRequested;
  double quotaValue;
  double requestedValue;

  if (!JS_ReadBytes(aReader, &reserved, 4) || !JS_ReadBytes(aReader, &rv, 4) ||
      !JS_ReadString(aReader, &jsMessage) ||
      !AssignJSString(aCx, message, jsMessage) ||
      !JS_ReadUint32Pair(aReader, &hasQuota, &hasRequested) ||
      !JS_ReadDouble(aReader, &quotaValue) ||
      !JS_ReadDouble(aReader, &requestedValue)) {
    return nullptr;
  }

  Nullable<double> quota;
  if (hasQuota) {
    quota.SetValue(quotaValue);
  }
  Nullable<double> requested;
  if (hasRequested) {
    requested.SetValue(requestedValue);
  }

  return do_AddRef(new QuotaExceededError(rv, message, quota, requested));
}

bool QuotaExceededError::WriteStructuredClone(
    JSContext* aCx, JSStructuredCloneWriter* aWriter) const {
  JS::Rooted<JS::Value> messageValue(aCx);
  if (!NonVoidByteStringToJsval(aCx, mMessage, &messageValue)) {
    return false;
  }
  JS::Rooted<JSString*> message(aCx, messageValue.toString());

  uint32_t reserved = 0;
  return JS_WriteBytes(aWriter, &reserved, 4) &&
         JS_WriteBytes(aWriter, &mResult, 4) &&
         JS_WriteString(aWriter, message) &&
         JS_WriteUint32Pair(aWriter, !mQuota.IsNull(), !mRequested.IsNull()) &&
         JS_WriteDouble(aWriter, mQuota.IsNull() ? 0.0 : mQuota.Value()) &&
         JS_WriteDouble(aWriter,
                        mRequested.IsNull() ? 0.0 : mRequested.Value());
}

}  // namespace mozilla::dom
