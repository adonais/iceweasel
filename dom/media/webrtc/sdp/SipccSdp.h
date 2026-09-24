/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef DOM_MEDIA_WEBRTC_SDP_SIPCCSDP_H_
#define DOM_MEDIA_WEBRTC_SDP_SIPCCSDP_H_

#include "sdp/SdpImpl.h"
#include "sdp/SdpParser.h"
#include "sdp/SipccSdpAttributeList.h"
#include "sdp/SipccSdpMediaSection.h"
extern "C" {
#include "sipcc_sdp.h"
}

namespace mozilla {

class SipccSdpParser;

class SipccSdp final : public SdpImpl {
  friend class SipccSdpParser;

 public:
  explicit SipccSdp(const SdpOrigin& origin)
      : SdpImpl(origin, UniquePtr<SdpAttributeListImpl>(
                            new SipccSdpAttributeList(nullptr))) {}
  SipccSdp(const SipccSdp& aOrig);

  virtual UniquePtr<Sdp> Clone() const override;

 private:
  using InternalResults = SdpParser::InternalResults;

  SipccSdp() : SipccSdp(SdpOrigin("", 0, 0, sdp::kIPv4, "")) {}

  UniquePtr<SdpMediaSectionImpl> CreateMediaSection(
      const size_t level) override;

  // mAttributeList is always a SipccSdpAttributeList for this sdp
  SipccSdpAttributeList& SipccAttributeList() {
    return *static_cast<SipccSdpAttributeList*>(mAttributeList.get());
  }
  const SipccSdpAttributeList& SipccAttributeList() const {
    return *static_cast<const SipccSdpAttributeList*>(mAttributeList.get());
  }

  bool Load(sdp_t* sdp, InternalResults& results);
  bool LoadOrigin(sdp_t* sdp, InternalResults& results);
};

}  // namespace mozilla

#endif  // DOM_MEDIA_WEBRTC_SDP_SIPCCSDP_H_
