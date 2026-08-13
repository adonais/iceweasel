/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "RTCIceCandidate.h"

#include "mozilla/ErrorResult.h"
#include "mozilla/dom/BindingDeclarations.h"
#include "mozilla/dom/RTCIceCandidateBinding.h"
#include "nsIGlobalObject.h"

namespace mozilla::dom {

NS_IMPL_CYCLE_COLLECTION_WRAPPERCACHE(RTCIceCandidate, mGlobal)
NS_IMPL_CYCLE_COLLECTING_ADDREF(RTCIceCandidate)
NS_IMPL_CYCLE_COLLECTING_RELEASE(RTCIceCandidate)
NS_INTERFACE_MAP_BEGIN_CYCLE_COLLECTION(RTCIceCandidate)
  NS_WRAPPERCACHE_INTERFACE_MAP_ENTRY
  NS_INTERFACE_MAP_ENTRY(nsISupports)
NS_INTERFACE_MAP_END

RTCIceCandidate::RTCIceCandidate(nsIGlobalObject* aGlobal,
                                 const nsAString& aCandidate,
                                 const nsAString& aSdpMid,
                                 const Nullable<uint16_t>& aSdpMLineIndex,
                                 const nsAString& aUsernameFragment)
    : mGlobal(aGlobal),
      mCandidate(aCandidate),
      mSdpMid(aSdpMid),
      mSdpMLineIndex(aSdpMLineIndex),
      mUsernameFragment(aUsernameFragment) {
  // Some applications pass "a=candidate:..." instead of the
  // candidate-attribute form. Let this slide for now, but normalize before
  // parsing.
  if (mCandidate.Find(u"a=") == 0) {
    mCandidate.Cut(0, 2);
  }
  // Spec says parse failures are silently tolerated; the parse-derived getters
  // return null when the candidate string didn't parse.
  mParsed = NrIceCandidateAttribute::Parse(NS_ConvertUTF16toUTF8(mCandidate));
}

/* static */
already_AddRefed<RTCIceCandidate> RTCIceCandidate::Constructor(
    const GlobalObject& aGlobal, const RTCIceCandidateInit& aInit,
    ErrorResult& aRv) {
  if (aInit.mSdpMid.IsVoid() && aInit.mSdpMLineIndex.IsNull()) {
    aRv.ThrowTypeError("Either sdpMid or sdpMLineIndex must be specified");
    return nullptr;
  }

  nsCOMPtr<nsIGlobalObject> global = do_QueryInterface(aGlobal.GetAsSupports());
  if (NS_WARN_IF(!global)) {
    aRv.Throw(NS_ERROR_UNEXPECTED);
    return nullptr;
  }

  auto result = MakeRefPtr<RTCIceCandidate>(global, aInit.mCandidate,
                                            aInit.mSdpMid, aInit.mSdpMLineIndex,
                                            aInit.mUsernameFragment);
  return result.forget();
}

/* static */
already_AddRefed<RTCIceCandidate> RTCIceCandidate::FromAttribute(
    nsIGlobalObject* aGlobal, const nsACString& aAttr, bool aRemote) {
  nsString candidate;
  CopyUTF8toUTF16(aAttr, candidate);
  // sdpMid and usernameFragment are signaling-layer concepts; they have no
  // meaning when the candidate comes directly from the ICE engine. Use the
  // null-string convention (IsVoid()).
  nsString nullStr;
  nullStr.SetIsVoid(true);
  auto result = MakeRefPtr<RTCIceCandidate>(aGlobal, candidate, nullStr,
                                            Nullable<uint16_t>(), nullStr);
  // Apply webrtc-pc's exposure rules for prflx remote candidates.
  // Note: Spec is a little unclear on whether these obfuscation rules apply to
  // an RTCIceCandidate constructed by JS, as opposed to the PC.
  // See https://github.com/w3c/webrtc-pc/issues/3107
  if (aRemote && result->mParsed &&
      result->mParsed->Type() ==
          NrIceCandidateAttribute::CandidateType::PeerReflexive) {
    result->mCandidateHidden = true;
    result->mAddressHidden = true;
  }
  return result.forget();
}

JSObject* RTCIceCandidate::WrapObject(JSContext* aCx,
                                      JS::Handle<JSObject*> aGivenProto) {
  return RTCIceCandidate_Binding::Wrap(aCx, this, aGivenProto);
}

void RTCIceCandidate::GetCandidate(nsAString& aResult) const {
  if (!mCandidateHidden) {
    aResult = mCandidate;
  }
}

void RTCIceCandidate::GetSdpMid(nsAString& aResult) const { aResult = mSdpMid; }

Nullable<uint16_t> RTCIceCandidate::GetSdpMLineIndex() const {
  return mSdpMLineIndex;
}

void RTCIceCandidate::GetFoundation(nsAString& aResult) const {
  if (mParsed) {
    CopyUTF8toUTF16(mParsed->Foundation(), aResult);
  } else {
    SetDOMStringToNull(aResult);
  }
}

Nullable<RTCIceComponent> RTCIceCandidate::GetComponent() const {
  if (!mParsed) {
    return {};
  }
  switch (mParsed->ComponentId()) {
    case 1:
      return Nullable<RTCIceComponent>(RTCIceComponent::Rtp);
    case 2:
      return Nullable<RTCIceComponent>(RTCIceComponent::Rtcp);
    default:
      return {};
  }
}

Nullable<uint32_t> RTCIceCandidate::GetPriority() const {
  if (!mParsed) {
    return {};
  }
  return Nullable<uint32_t>(mParsed->Priority());
}

void RTCIceCandidate::GetAddress(nsAString& aResult) const {
  if (mParsed && !mAddressHidden) {
    CopyUTF8toUTF16(mParsed->Address(), aResult);
  } else {
    SetDOMStringToNull(aResult);
  }
}

Nullable<RTCIceProtocol> RTCIceCandidate::GetProtocol() const {
  if (!mParsed) {
    return {};
  }
  return Nullable<RTCIceProtocol>(mParsed->GetProtocol() ==
                                          NrIceCandidateAttribute::Protocol::Tcp
                                      ? RTCIceProtocol::Tcp
                                      : RTCIceProtocol::Udp);
}

Nullable<uint16_t> RTCIceCandidate::GetPort() const {
  if (!mParsed) {
    return {};
  }
  return Nullable<uint16_t>(mParsed->Port());
}

Nullable<RTCIceCandidateType> RTCIceCandidate::GetType() const {
  if (!mParsed) {
    return {};
  }
  switch (mParsed->Type()) {
    case NrIceCandidateAttribute::CandidateType::Host:
      return Nullable<RTCIceCandidateType>(RTCIceCandidateType::Host);
    case NrIceCandidateAttribute::CandidateType::ServerReflexive:
      return Nullable<RTCIceCandidateType>(RTCIceCandidateType::Srflx);
    case NrIceCandidateAttribute::CandidateType::PeerReflexive:
      return Nullable<RTCIceCandidateType>(RTCIceCandidateType::Prflx);
    case NrIceCandidateAttribute::CandidateType::Relayed:
      return Nullable<RTCIceCandidateType>(RTCIceCandidateType::Relay);
  }
  MOZ_CRASH("Non-existent candidate type!");
}

Nullable<RTCIceTcpCandidateType> RTCIceCandidate::GetTcpType() const {
  if (!mParsed) {
    return {};
  }
  switch (mParsed->GetTcpType()) {
    case NrIceCandidateAttribute::TcpType::Active:
      return Nullable<RTCIceTcpCandidateType>(RTCIceTcpCandidateType::Active);
    case NrIceCandidateAttribute::TcpType::Passive:
      return Nullable<RTCIceTcpCandidateType>(RTCIceTcpCandidateType::Passive);
    case NrIceCandidateAttribute::TcpType::SimultaneousOpen:
      return Nullable<RTCIceTcpCandidateType>(RTCIceTcpCandidateType::So);
    case NrIceCandidateAttribute::TcpType::None:
      return {};
  }
  MOZ_CRASH("Non-existent tcp candidate subtype!");
}

void RTCIceCandidate::GetRelatedAddress(nsAString& aResult) const {
  // Note: Spec does not say to obfuscate raddr, but that's a spec bug.
  // See https://github.com/w3c/webrtc-pc/issues/3106
  if (mParsed && !mAddressHidden) {
    if (Maybe<nsCString> addr = mParsed->RelatedAddress()) {
      CopyUTF8toUTF16(*addr, aResult);
      return;
    }
  }

  SetDOMStringToNull(aResult);
}

Nullable<uint16_t> RTCIceCandidate::GetRelatedPort() const {
  if (!mParsed) {
    return {};
  }
  if (Maybe<uint16_t> port = mParsed->RelatedPort()) {
    return Nullable<uint16_t>(*port);
  }
  return {};
}

void RTCIceCandidate::GetUsernameFragment(nsAString& aResult) const {
  aResult = mUsernameFragment;
}

void RTCIceCandidate::ToJSON(RTCIceCandidateInit& aResult) const {
  if (!mCandidateHidden && !mAddressHidden) {
    aResult.mCandidate = mCandidate;
  }
  aResult.mSdpMid = mSdpMid;
  aResult.mSdpMLineIndex = mSdpMLineIndex;
  aResult.mUsernameFragment = mUsernameFragment;
}

}  // namespace mozilla::dom
