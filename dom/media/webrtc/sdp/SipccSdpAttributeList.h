/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef DOM_MEDIA_WEBRTC_SDP_SIPCCSDPATTRIBUTELIST_H_
#define DOM_MEDIA_WEBRTC_SDP_SIPCCSDPATTRIBUTELIST_H_

#include "sdp/SdpAttributeListImpl.h"
#include "sdp/SdpParser.h"

extern "C" {
#include "sipcc_sdp.h"
}

namespace mozilla {

class SipccSdp;
class SipccSdpMediaSection;

class SipccSdpAttributeList : public SdpAttributeListImpl {
  friend class SipccSdpMediaSection;
  friend class SipccSdp;

 public:
  // Make sure we don't hide the default arg thunks
  using SdpAttributeList::GetAttribute;
  using SdpAttributeList::HasAttribute;

  virtual ~SipccSdpAttributeList() = default;

  SipccSdpAttributeList(const SipccSdpAttributeList& orig) = delete;
  SipccSdpAttributeList& operator=(const SipccSdpAttributeList& rhs) = delete;

 private:
  // Pass a session-level attribute list if constructing a media-level one,
  // otherwise pass nullptr
  explicit SipccSdpAttributeList(const SipccSdpAttributeList* sessionLevel);

  // Copy c'tor, sort of
  SipccSdpAttributeList(const SipccSdpAttributeList& aOrig,
                        const SipccSdpAttributeList* sessionLevel);

  using InternalResults = SdpParser::InternalResults;

  bool Load(sdp_t* sdp, const uint16_t level, InternalResults& results);
  void LoadSimpleStrings(sdp_t* sdp, const uint16_t level,
                         InternalResults& results);
  void LoadSimpleString(sdp_t* sdp, const uint16_t level, const sdp_attr_e attr,
                        const AttributeType targetType,
                        InternalResults& results);
  void LoadSimpleNumbers(sdp_t* sdp, const uint16_t level,
                         InternalResults& results);
  void LoadSimpleNumber(sdp_t* sdp, const uint16_t level, const sdp_attr_e attr,
                        const AttributeType targetType,
                        InternalResults& results);
  void LoadFlags(sdp_t* sdp, const uint16_t level);
  void LoadDirection(sdp_t* sdp, const uint16_t level,
                     InternalResults& results);
  bool LoadRtpmap(sdp_t* sdp, const uint16_t level, InternalResults& results);
  bool LoadSctpmap(sdp_t* sdp, const uint16_t level, InternalResults& results);
  void LoadIceAttributes(sdp_t* sdp, const uint16_t level);
  bool LoadFingerprint(sdp_t* sdp, const uint16_t level,
                       InternalResults& results);
  void LoadCandidate(sdp_t* sdp, const uint16_t level);
  void LoadSetup(sdp_t* sdp, const uint16_t level);
  void LoadSsrc(sdp_t* sdp, const uint16_t level);
  void LoadSsrcGroup(sdp_t* sdp, const uint16_t level);
  bool LoadImageattr(sdp_t* sdp, const uint16_t level,
                     InternalResults& results);
  bool LoadSimulcast(sdp_t* sdp, const uint16_t level,
                     InternalResults& results);
  bool LoadGroups(sdp_t* sdp, const uint16_t level, InternalResults& results);
  bool LoadMsidSemantics(sdp_t* sdp, const uint16_t level,
                         InternalResults& results);
  void LoadIdentity(sdp_t* sdp, const uint16_t level);
  void LoadDtlsMessage(sdp_t* sdp, const uint16_t level);
  void LoadFmtp(sdp_t* sdp, const uint16_t level);
  void LoadMsids(sdp_t* sdp, const uint16_t level, InternalResults& results);
  bool LoadRid(sdp_t* sdp, const uint16_t level, InternalResults& results);
  void LoadExtmap(sdp_t* sdp, const uint16_t level, InternalResults& results);
  void LoadRtcpFb(sdp_t* sdp, const uint16_t level, InternalResults& results);
  void LoadRtcp(sdp_t* sdp, const uint16_t level, InternalResults& results);
  static SdpRtpmapAttributeList::CodecType GetCodecType(const rtp_ptype type);

  void WarnAboutMisplacedAttribute(const SdpAttribute::AttributeType type,
                                   const uint32_t lineNumber,
                                   InternalResults& results);
};

}  // namespace mozilla

#endif
