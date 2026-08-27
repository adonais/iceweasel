/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef MOZILLA_DOM_MEDIA_WEBRTC_JSAPI_RTCICECANDIDATEPAIR_H_
#define MOZILLA_DOM_MEDIA_WEBRTC_JSAPI_RTCICECANDIDATEPAIR_H_

#include "js/RootingAPI.h"
#include "mozilla/RefPtr.h"
#include "mozilla/dom/RTCIceCandidate.h"
#include "nsCycleCollectionParticipant.h"
#include "nsIGlobalObject.h"
#include "nsWrapperCache.h"

namespace mozilla::dom {
class RTCIceCandidatePair final : public nsISupports, public nsWrapperCache {
 public:
  RTCIceCandidatePair(nsIGlobalObject* aGlobal, RTCIceCandidate* aLocal,
                      RTCIceCandidate* aRemote);

  NS_DECL_CYCLE_COLLECTING_ISUPPORTS_FINAL
  NS_DECL_CYCLE_COLLECTION_WRAPPERCACHE_CLASS(RTCIceCandidatePair)

  nsIGlobalObject* GetParentObject() const { return mGlobal; }
  JSObject* WrapObject(JSContext* aCx,
                       JS::Handle<JSObject*> aGivenProto) override;

  // webidl
  RefPtr<RTCIceCandidate> Local() const { return mLocal; }
  RefPtr<RTCIceCandidate> Remote() const { return mRemote; }

 private:
  virtual ~RTCIceCandidatePair() = default;

  RefPtr<nsIGlobalObject> mGlobal;
  RefPtr<RTCIceCandidate> mLocal;
  RefPtr<RTCIceCandidate> mRemote;
};

}  // namespace mozilla::dom

#endif  // MOZILLA_DOM_MEDIA_WEBRTC_JSAPI_RTCICECANDIDATEPAIR_H_
