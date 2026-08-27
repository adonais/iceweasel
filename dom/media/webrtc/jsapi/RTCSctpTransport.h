/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef RTCSctpTransport_h_
#define RTCSctpTransport_h_

#include "RTCDtlsTransport.h"
#include "js/RootingAPI.h"
#include "mozilla/DOMEventTargetHelper.h"
#include "mozilla/RefPtr.h"

class nsPIDOMWindowInner;

namespace mozilla::dom {

enum class RTCSctpTransportState : uint8_t;

class RTCSctpTransport : public DOMEventTargetHelper {
 public:
  explicit RTCSctpTransport(nsPIDOMWindowInner* aWindow,
                            const Nullable<double> aMaxMessageSize,
                            const Nullable<uint16_t>& aMaxChannels);

  // nsISupports
  NS_DECL_ISUPPORTS_INHERITED
  NS_DECL_CYCLE_COLLECTION_CLASS_INHERITED(RTCSctpTransport,
                                           DOMEventTargetHelper)

  // webidl
  JSObject* WrapObject(JSContext* aCx,
                       JS::Handle<JSObject*> aGivenProto) override;
  IMPL_EVENT_HANDLER(statechange)

  RTCDtlsTransport* GetTransport() const { return mDtlsTransport; }
  RTCSctpTransportState State() const { return mState; }
  Nullable<double> GetMaxMessageSize() const { return mMaxMessageSize; }
  Nullable<uint16_t> GetMaxChannels() const { return mMaxChannels; }

  // May be null to clear the transport (e.g. rolling back to a
  // have-remote-offer state in which the RTCDtlsTransport did not yet exist).
  void SetTransport(RTCDtlsTransport* aTransport) {
    mDtlsTransport = aTransport;
  }

  void SetMaxMessageSize(const Nullable<double>& aMaxMessageSize) {
    mMaxMessageSize = aMaxMessageSize;
  }

  void SetMaxChannels(const Nullable<uint16_t>& aMaxChannels) {
    mMaxChannels = aMaxChannels;
  }

  void UpdateState(RTCSctpTransportState aState);

 private:
  virtual ~RTCSctpTransport() = default;

  RTCSctpTransportState mState;
  RefPtr<RTCDtlsTransport> mDtlsTransport;
  Nullable<double> mMaxMessageSize;
  Nullable<uint16_t> mMaxChannels;
};

}  // namespace mozilla::dom
#endif  // RTCSctpTransport_h_
