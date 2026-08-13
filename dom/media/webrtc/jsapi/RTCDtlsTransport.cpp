/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "RTCDtlsTransport.h"

#include "mozilla/dom/Event.h"
#include "mozilla/dom/EventBinding.h"
#include "mozilla/dom/PMediaTransportChild.h"
#include "mozilla/dom/RTCDtlsTransportBinding.h"
#include "mozilla/dom/RTCErrorEvent.h"
#include "mozilla/dom/TypedArray.h"

namespace mozilla::dom {

NS_IMPL_CYCLE_COLLECTION_INHERITED(RTCDtlsTransport, DOMEventTargetHelper,
                                   mIceTransport)

NS_IMPL_ADDREF_INHERITED(RTCDtlsTransport, DOMEventTargetHelper)
NS_IMPL_RELEASE_INHERITED(RTCDtlsTransport, DOMEventTargetHelper)

NS_INTERFACE_MAP_BEGIN_CYCLE_COLLECTION(RTCDtlsTransport)
  NS_WRAPPERCACHE_INTERFACE_MAP_ENTRY
NS_INTERFACE_MAP_END_INHERITING(DOMEventTargetHelper)

RTCDtlsTransport::RTCDtlsTransport(nsPIDOMWindowInner* aWindow)
    : DOMEventTargetHelper(aWindow),
      mState(RTCDtlsTransportState::New),
      mIceTransport(new RTCIceTransport(aWindow)) {}

JSObject* RTCDtlsTransport::WrapObject(JSContext* aCx,
                                       JS::Handle<JSObject*> aGivenProto) {
  return RTCDtlsTransport_Binding::Wrap(aCx, this, aGivenProto);
}

void RTCDtlsTransport::UpdateStateNoEvent(TransportLayer::State aState) {
  if (mState == RTCDtlsTransportState::Closed) {
    return;
  }

  switch (aState) {
    case TransportLayer::TS_NONE:
      break;
    case TransportLayer::TS_INIT:
      break;
    case TransportLayer::TS_CONNECTING:
      mState = RTCDtlsTransportState::Connecting;
      break;
    case TransportLayer::TS_OPEN:
      mState = RTCDtlsTransportState::Connected;
      break;
    case TransportLayer::TS_CLOSED:
      mState = RTCDtlsTransportState::Closed;
      break;
    case TransportLayer::TS_ERROR:
      mState = RTCDtlsTransportState::Failed;
      break;
  }
}

void RTCDtlsTransport::UpdateState(TransportLayer::State aState,
                                   nsTArray<nsTArray<uint8_t>>&& aRemoteCerts,
                                   Maybe<RTCErrorParams> aError) {
  // Make absolutely sure we aren't destroyed between the two events we fire
  auto kungFuDeathGrip = RefPtr(this);

  RTCDtlsTransportState oldState = mState;
  UpdateStateNoEvent(aState);
  // Per webrtc-pc 5.5, when the DTLS transport transitions to "connected", set
  // [[RemoteCertificates]] before firing statechange so handlers see both.
  if (mState == RTCDtlsTransportState::Connected && !aRemoteCerts.IsEmpty()) {
    mRemoteCertsDer = std::move(aRemoteCerts);
  }
  if (oldState == mState) {
    return;
  }

  // Spec says first the error event, then the statechange event
  if (aError.isSome()) {
    RTCErrorEventInit errorEventInit;
    errorEventInit.mBubbles = false;
    errorEventInit.mCancelable = false;
    errorEventInit.mError =
        new RTCError(aError->errorInit(), nsCString(aError->message()));
    RefPtr<Event> errorEvent =
        RTCErrorEvent::Constructor(this, u"error"_ns, errorEventInit);
    DispatchTrustedEvent(errorEvent);
  }

  EventInit init;
  init.mBubbles = false;
  init.mCancelable = false;

  RefPtr<Event> stateChangeEvent =
      Event::Constructor(this, u"statechange"_ns, init);

  DispatchTrustedEvent(stateChangeEvent);
}

void RTCDtlsTransport::GetRemoteCertificates(JSContext* aCx,
                                             nsTArray<JSObject*>& aRetval,
                                             ErrorResult& aRv) {
  aRetval.SetCapacity(mRemoteCertsDer.Length());
  for (const auto& cert : mRemoteCertsDer) {
    JS::Rooted<JSObject*> buf(aCx, ArrayBuffer::Create(aCx, cert, aRv));
    if (aRv.Failed()) {
      return;
    }
    aRetval.AppendElement(buf);
  }
}

}  // namespace mozilla::dom
