/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef DOM_MEDIA_WEBRTC_SDP_SIPCCSDPMEDIASECTION_H_
#define DOM_MEDIA_WEBRTC_SDP_SIPCCSDPMEDIASECTION_H_

#include "mozilla/UniquePtr.h"
#include "sdp/SdpMediaSectionImpl.h"
#include "sdp/SipccSdpAttributeList.h"

extern "C" {
#include "sipcc_sdp.h"
}

namespace mozilla {

class SipccSdp;
class SdpParser;

using InternalResults = SdpParser::InternalResults;

bool LoadBandwidths(sdp_t* sdp, const uint16_t level, InternalResults& results,
                    SdpBandwidths& bandwidths);

class SipccSdpMediaSection final : public SdpMediaSectionImpl {
  friend class SipccSdp;

 public:
  ~SipccSdpMediaSection() = default;

 private:
  SipccSdpMediaSection(const size_t level,
                       const SipccSdpAttributeList* sessionLevel)
      : SdpMediaSectionImpl(level,
                            UniquePtr<SdpAttributeListImpl>(
                                new SipccSdpAttributeList(sessionLevel))) {}

  SipccSdpMediaSection(const SipccSdpMediaSection& aOrig,
                       const SipccSdpAttributeList* sessionLevel);

  // mAttributeList is always a SipccSdpAttributeList for this media section
  SipccSdpAttributeList& SipccAttributeList() {
    return *static_cast<SipccSdpAttributeList*>(mAttributeList.get());
  }
  const SipccSdpAttributeList& SipccAttributeList() const {
    return *static_cast<const SipccSdpAttributeList*>(mAttributeList.get());
  }

  bool Load(sdp_t* sdp, const uint16_t level, InternalResults& results);
  bool LoadConnection(sdp_t* sdp, uint16_t level, InternalResults& results);
  bool LoadProtocol(sdp_t* sdp, const uint16_t level, InternalResults& results);
  bool LoadFormats(sdp_t* sdp, const uint16_t level, InternalResults& results);
  bool ValidateSimulcast(sdp_t* sdp, const uint16_t level,
                         InternalResults& results) const;
  bool ValidateSimulcastVersions(
      sdp_t* sdp, const uint16_t level,
      const SdpSimulcastAttribute::Versions& versions,
      const sdp::Direction direction, InternalResults& results) const;
};
}  // namespace mozilla

#endif
