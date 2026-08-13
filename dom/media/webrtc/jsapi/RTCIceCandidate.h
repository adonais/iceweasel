/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef MOZILLA_DOM_MEDIA_WEBRTC_JSAPI_RTCICECANDIDATE_H_
#define MOZILLA_DOM_MEDIA_WEBRTC_JSAPI_RTCICECANDIDATE_H_

#include "js/RootingAPI.h"
#include "mozilla/Maybe.h"
#include "mozilla/dom/Nullable.h"
#include "nsCycleCollectionParticipant.h"
#include "nsString.h"
#include "nsWrapperCache.h"
#include "transport/nricecandidate.h"

class nsIGlobalObject;

namespace mozilla {

class ErrorResult;

namespace dom {

class GlobalObject;
struct RTCIceCandidateInit;
enum class RTCIceComponent : uint8_t;
enum class RTCIceProtocol : uint8_t;
enum class RTCIceCandidateType : uint8_t;
enum class RTCIceTcpCandidateType : uint8_t;

class RTCIceCandidate final : public nsISupports, public nsWrapperCache {
 public:
  RTCIceCandidate(nsIGlobalObject* aGlobal, const nsAString& aCandidate,
                  const nsAString& aSdpMid,
                  const Nullable<uint16_t>& aSdpMLineIndex,
                  const nsAString& aUsernameFragment);

  NS_DECL_CYCLE_COLLECTING_ISUPPORTS
  NS_DECL_CYCLE_COLLECTION_WRAPPERCACHE_CLASS(RTCIceCandidate)

  static already_AddRefed<RTCIceCandidate> Constructor(
      const GlobalObject& aGlobal, const RTCIceCandidateInit& aInit,
      ErrorResult& aRv);

  // Internal-use factory for constructing an RTCIceCandidate from a
  // |candidate:...|-form attribute string with no sdpMid/sdpMLineIndex
  // context, typically for candidates reported by the ICE stack. When
  // |aRemote| is true, webrtc-pc's exposure rules for remote candidates are
  // applied (peer-reflexive candidates have their candidate-attribute string
  // and address hidden).
  static already_AddRefed<RTCIceCandidate> FromAttribute(
      nsIGlobalObject* aGlobal, const nsACString& aAttr, bool aRemote = false);

  nsIGlobalObject* GetParentObject() const { return mGlobal; }
  JSObject* WrapObject(JSContext* aCx,
                       JS::Handle<JSObject*> aGivenProto) override;

  // Gets the unredacted candidate-attribute string, see mCandidateHidden.
  const nsString& CandidateInternal() const { return mCandidate; }

  // webidl
  void GetCandidate(nsAString& aResult) const;
  void GetSdpMid(nsAString& aResult) const;
  Nullable<uint16_t> GetSdpMLineIndex() const;
  void GetFoundation(nsAString& aResult) const;
  Nullable<RTCIceComponent> GetComponent() const;
  Nullable<uint32_t> GetPriority() const;
  void GetAddress(nsAString& aResult) const;
  Nullable<RTCIceProtocol> GetProtocol() const;
  Nullable<uint16_t> GetPort() const;
  Nullable<RTCIceCandidateType> GetType() const;
  Nullable<RTCIceTcpCandidateType> GetTcpType() const;
  void GetRelatedAddress(nsAString& aResult) const;
  Nullable<uint16_t> GetRelatedPort() const;
  void GetUsernameFragment(nsAString& aResult) const;
  void ToJSON(RTCIceCandidateInit& aResult) const;

 private:
  virtual ~RTCIceCandidate() = default;

  RefPtr<nsIGlobalObject> mGlobal;
  // Init-dictionary fields, stored verbatim.
  nsString mCandidate;
  nsString mSdpMid;
  Nullable<uint16_t> mSdpMLineIndex;
  nsString mUsernameFragment;
  // Present iff the candidate string parsed.
  Maybe<NrIceCandidateAttribute> mParsed;
  // True when |candidate| should be reported as the empty string. Generally
  // set for peer-reflexive remote candidates.
  bool mCandidateHidden = false;
  // True when |address| and |raddr| should be reported as null. Also generally
  // used for remote prflx candidates.
  bool mAddressHidden = false;
};

}  // namespace dom
}  // namespace mozilla

#endif  // MOZILLA_DOM_MEDIA_WEBRTC_JSAPI_RTCICECANDIDATE_H_
