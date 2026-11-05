/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "WebTransportError.h"

#include "js/StructuredClone.h"

namespace mozilla::dom {

JSObject* WebTransportError::WrapObject(JSContext* aCx,
                                        JS::Handle<JSObject*> aGivenProto) {
  return WebTransportError_Binding::Wrap(aCx, this, aGivenProto);
}

/* static */
already_AddRefed<WebTransportError> WebTransportError::Constructor(
    const GlobalObject& aGlobal, const nsAString& aMessage,
    const WebTransportErrorOptions& aOptions) {
  // https://w3c.github.io/webtransport/#dom-webtransporterror-webtransporterror

  // Steps 1-2: set this's name to "WebTransportError" and message to
  // message (both handled by the DOMException base constructor below).
  nsCString message;
  CopyUTF16toUTF8(aMessage, message);

  // Step 3: set [[Source]] to options.source and [[StreamErrorCode]] to
  // options.streamErrorCode.
  RefPtr<WebTransportError> error(new WebTransportError(
      message, aOptions.mSource, aOptions.mStreamErrorCode));
  return error.forget();
}

// https://w3c.github.io/webtransport/#web-transport-error-serialization
/* static */
already_AddRefed<WebTransportError> WebTransportError::ReadStructuredClone(
    JSContext* aCx, nsIGlobalObject* aGlobal,
    JSStructuredCloneReader* aReader) {
  nsresult rv;
  nsCString message;
  nsCString name;
  uint16_t code;
  uint32_t source;
  uint32_t hasStreamErrorCode;
  uint32_t streamErrorCode;
  uint32_t unused;
  if (!ReadStructuredCloneFields(aCx, aReader, rv, message, name, code) ||
      !JS_ReadUint32Pair(aReader, &source, &hasStreamErrorCode) ||
      !JS_ReadUint32Pair(aReader, &streamErrorCode, &unused) ||
      source > static_cast<uint32_t>(
                   MaxContiguousEnumValue<WebTransportErrorSource>::value)) {
    return nullptr;
  }

  return do_AddRef(new WebTransportError(
      message, static_cast<WebTransportErrorSource>(source),
      hasStreamErrorCode ? Nullable<uint32_t>(streamErrorCode)
                         : Nullable<uint32_t>()));
}

bool WebTransportError::WriteStructuredClone(
    JSContext* aCx, JSStructuredCloneWriter* aWriter) const {
  return DOMException::WriteStructuredClone(aCx, aWriter) &&
         JS_WriteUint32Pair(aWriter, static_cast<uint32_t>(mSource),
                            !mStreamErrorCode.IsNull()) &&
         JS_WriteUint32Pair(
             aWriter, mStreamErrorCode.IsNull() ? 0 : mStreamErrorCode.Value(),
             0);
}

}  // namespace mozilla::dom
