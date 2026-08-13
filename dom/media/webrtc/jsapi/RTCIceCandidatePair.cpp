/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "RTCIceCandidatePair.h"

#include "mozilla/dom/RTCIceCandidatePairBinding.h"

namespace mozilla::dom {

NS_IMPL_CYCLE_COLLECTION_WRAPPERCACHE(RTCIceCandidatePair, mGlobal, mLocal,
                                      mRemote)
NS_IMPL_CYCLE_COLLECTING_ADDREF(RTCIceCandidatePair)
NS_IMPL_CYCLE_COLLECTING_RELEASE(RTCIceCandidatePair)
NS_INTERFACE_MAP_BEGIN_CYCLE_COLLECTION(RTCIceCandidatePair)
  NS_WRAPPERCACHE_INTERFACE_MAP_ENTRY
  NS_INTERFACE_MAP_ENTRY(nsISupports)
NS_INTERFACE_MAP_END

RTCIceCandidatePair::RTCIceCandidatePair(nsIGlobalObject* aGlobal,
                                         RTCIceCandidate* aLocal,
                                         RTCIceCandidate* aRemote)
    : mGlobal(aGlobal), mLocal(aLocal), mRemote(aRemote) {}

JSObject* RTCIceCandidatePair::WrapObject(JSContext* aCx,
                                          JS::Handle<JSObject*> aGivenProto) {
  return RTCIceCandidatePair_Binding::Wrap(aCx, this, aGivenProto);
}

}  // namespace mozilla::dom
