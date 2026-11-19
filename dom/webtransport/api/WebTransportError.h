/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef DOM_WEBTRANSPORT_API_WEBTRANSPORTERROR_H_
#define DOM_WEBTRANSPORT_API_WEBTRANSPORTERROR_H_

#include "mozilla/dom/DOMException.h"
#include "mozilla/dom/WebTransportErrorBinding.h"

namespace mozilla::dom {
class WebTransportError final : public DOMException {
 public:
  explicit WebTransportError(
      const nsACString& aMessage,
      WebTransportErrorSource aSource = WebTransportErrorSource::Stream,
      Nullable<uint32_t> aCode = Nullable<uint32_t>())
      : DOMException(NS_OK, aMessage, "WebTransportError"_ns, 0),
        mStreamErrorCode(aCode),
        mSource(aSource) {}

  JSObject* WrapObject(JSContext* aCx,
                       JS::Handle<JSObject*> aGivenProto) override;

  static already_AddRefed<WebTransportError> Constructor(
      const GlobalObject& aGlobal,
      const StringOrWebTransportErrorInit& aMessage,
      const WebTransportErrorOptions& aOptions);

  static already_AddRefed<WebTransportError> ReadStructuredClone(
      JSContext* aCx, nsIGlobalObject* aGlobal,
      JSStructuredCloneReader* aReader);
  bool WriteStructuredClone(JSContext* aCx,
                            JSStructuredCloneWriter* aWriter) const;

  WebTransportErrorSource Source() { return mSource; }
  Nullable<uint32_t> GetStreamErrorCode() const { return mStreamErrorCode; }

 private:
  Nullable<uint32_t> mStreamErrorCode;
  const WebTransportErrorSource mSource;
};

}  // namespace mozilla::dom

#endif
