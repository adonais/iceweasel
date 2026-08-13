/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef MOZILLA_DOM_MEDIA_WEBRTC_JSAPI_RTCICETRANSPORT_H_
#define MOZILLA_DOM_MEDIA_WEBRTC_JSAPI_RTCICETRANSPORT_H_

#include "js/RootingAPI.h"
#include "mozilla/DOMEventTargetHelper.h"
#include "mozilla/RefPtr.h"
#include "transport/transportlayer.h"

class nsPIDOMWindowInner;

namespace mozilla::dom {

enum class RTCIceTransportState : uint8_t;
enum class RTCIceGathererState : uint8_t;
enum class RTCIceRole : uint8_t;
class RTCIceCandidatePair;

class RTCIceTransport : public DOMEventTargetHelper {
 public:
  explicit RTCIceTransport(nsPIDOMWindowInner* aWindow);

  // nsISupports
  NS_DECL_ISUPPORTS_INHERITED
  NS_DECL_CYCLE_COLLECTION_CLASS_INHERITED(RTCIceTransport,
                                           DOMEventTargetHelper)

  // webidl
  JSObject* WrapObject(JSContext* aCx,
                       JS::Handle<JSObject*> aGivenProto) override;
  IMPL_EVENT_HANDLER(statechange)
  IMPL_EVENT_HANDLER(gatheringstatechange)
  IMPL_EVENT_HANDLER(selectedcandidatepairchange)
  RTCIceRole Role() const { return mRole; }
  RTCIceTransportState State() const { return mState; }
  RTCIceGathererState GatheringState() const { return mGatheringState; }
  already_AddRefed<RTCIceCandidatePair> GetSelectedCandidatePair() const;

  void SetRole(RTCIceRole aRole);
  void SetState(RTCIceTransportState aState);
  void SetGatheringState(RTCIceGathererState aState);
  // Sets the [[SelectedCandidatePair]] slot. Pass nullptr to clear it.
  void SetSelectedCandidatePair(RTCIceCandidatePair* aPair);

  void FireStateChangeEvent();
  void FireGatheringStateChangeEvent();
  void FireSelectedCandidatePairChangeEvent();

 private:
  virtual ~RTCIceTransport() = default;

  RTCIceRole mRole;
  RTCIceTransportState mState;
  RTCIceGathererState mGatheringState;
  RefPtr<RTCIceCandidatePair> mSelectedCandidatePair;
};

}  // namespace mozilla::dom
#endif  // MOZILLA_DOM_MEDIA_WEBRTC_JSAPI_RTCICETRANSPORT_H_
