/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "sdp/SipccSdpMediaSection.h"

#include "sdp/SdpParser.h"

extern "C" {
#include "sipcc_sdp.h"
}

namespace mozilla {

bool LoadBandwidths(sdp_t* sdp, const uint16_t level, InternalResults& results,
                    SdpBandwidths& bandwidths) {
  size_t count = sdp_get_num_bw_lines(sdp, level);
  for (size_t i = 1; i <= count; ++i) {
    sdp_bw_modifier_e bwtype = sdp_get_bw_modifier(sdp, level, i);
    uint32_t bandwidth = sdp_get_bw_value(sdp, level, i);
    if (bwtype != SDP_BW_MODIFIER_UNSUPPORTED) {
      const char* typeName = sdp_get_bw_modifier_name(bwtype);
      bandwidths[typeName] = bandwidth;
    }
  }

  return true;
}

SipccSdpMediaSection::SipccSdpMediaSection(
    const SipccSdpMediaSection& aOrig,
    const SipccSdpAttributeList* sessionLevel)
    : SdpMediaSectionImpl(
          aOrig, UniquePtr<SdpAttributeListImpl>(new SipccSdpAttributeList(
                     aOrig.SipccAttributeList(), sessionLevel))) {}

bool SipccSdpMediaSection::Load(sdp_t* sdp, const uint16_t level,
                                InternalResults& results) {
  switch (sdp_get_media_type(sdp, level)) {
    case SDP_MEDIA_AUDIO:
      mMediaType = kAudio;
      break;
    case SDP_MEDIA_VIDEO:
      mMediaType = kVideo;
      break;
    case SDP_MEDIA_APPLICATION:
      mMediaType = kApplication;
      break;
    case SDP_MEDIA_TEXT:
      mMediaType = kText;
      break;

    default:
      results.AddParseError(sdp_get_media_line_number(sdp, level),
                            "Unsupported media section type");
      return false;
  }

  mPort = sdp_get_media_portnum(sdp, level);
  int32_t pc = sdp_get_media_portcount(sdp, level);
  if (pc == SDP_INVALID_VALUE) {
    // SDP_INVALID_VALUE (ie; -2) is used when there is no port count. :(
    mPortCount = 0;
  } else if (pc > static_cast<int32_t>(UINT16_MAX) || pc < 0) {
    results.AddParseError(sdp_get_media_line_number(sdp, level),
                          "Invalid port count");
    return false;
  } else {
    mPortCount = pc;
  }

  if (!LoadProtocol(sdp, level, results)) {
    return false;
  }

  if (!LoadFormats(sdp, level, results)) {
    return false;
  }

  if (!SipccAttributeList().Load(sdp, level, results)) {
    return false;
  }

  if (!ValidateSimulcast(sdp, level, results)) {
    return false;
  }

  if (!LoadBandwidths(sdp, level, results, mBandwidths)) {
    return false;
  }

  return LoadConnection(sdp, level, results);
}

bool SipccSdpMediaSection::LoadProtocol(sdp_t* sdp, const uint16_t level,
                                        InternalResults& results) {
  switch (sdp_get_media_transport(sdp, level)) {
    case SDP_TRANSPORT_RTPAVP:
      mProtocol = kRtpAvp;
      break;
    case SDP_TRANSPORT_RTPSAVP:
      mProtocol = kRtpSavp;
      break;
    case SDP_TRANSPORT_RTPAVPF:
      mProtocol = kRtpAvpf;
      break;
    case SDP_TRANSPORT_RTPSAVPF:
      mProtocol = kRtpSavpf;
      break;
    case SDP_TRANSPORT_UDPTLSRTPSAVP:
      mProtocol = kUdpTlsRtpSavp;
      break;
    case SDP_TRANSPORT_UDPTLSRTPSAVPF:
      mProtocol = kUdpTlsRtpSavpf;
      break;
    case SDP_TRANSPORT_TCPDTLSRTPSAVP:
      mProtocol = kTcpDtlsRtpSavp;
      break;
    case SDP_TRANSPORT_TCPDTLSRTPSAVPF:
      mProtocol = kTcpDtlsRtpSavpf;
      break;
    case SDP_TRANSPORT_DTLSSCTP:
      mProtocol = kDtlsSctp;
      break;
    case SDP_TRANSPORT_UDPDTLSSCTP:
      mProtocol = kUdpDtlsSctp;
      break;
    case SDP_TRANSPORT_TCPDTLSSCTP:
      mProtocol = kTcpDtlsSctp;
      break;

    default:
      results.AddParseError(sdp_get_media_line_number(sdp, level),
                            "Unsupported media transport type");
      return false;
  }
  return true;
}

bool SipccSdpMediaSection::LoadFormats(sdp_t* sdp, const uint16_t level,
                                       InternalResults& results) {
  sdp_media_e mtype = sdp_get_media_type(sdp, level);

  if (mtype == SDP_MEDIA_APPLICATION) {
    sdp_transport_e ttype = sdp_get_media_transport(sdp, level);
    if ((ttype == SDP_TRANSPORT_UDPDTLSSCTP) ||
        (ttype == SDP_TRANSPORT_TCPDTLSSCTP)) {
      if (sdp_get_media_sctp_fmt(sdp, level) ==
          SDP_SCTP_MEDIA_FMT_WEBRTC_DATACHANNEL) {
        mFormats.push_back("webrtc-datachannel");
      }
    } else {
      uint32_t ptype = sdp_get_media_sctp_port(sdp, level);
      std::ostringstream osPayloadType;
      osPayloadType << ptype;
      mFormats.push_back(osPayloadType.str());
    }
  } else if (mtype == SDP_MEDIA_AUDIO || mtype == SDP_MEDIA_VIDEO) {
    uint16_t count = sdp_get_media_num_payload_types(sdp, level);
    for (uint16_t i = 0; i < count; ++i) {
      sdp_payload_ind_e indicator;  // we ignore this, which is fine
      uint32_t ptype =
          sdp_get_media_payload_type(sdp, level, i + 1, &indicator);

      if (GET_DYN_PAYLOAD_TYPE_VALUE(ptype) > UINT8_MAX) {
        results.AddParseError(sdp_get_media_line_number(sdp, level),
                              "Format is too large");
        return false;
      }

      std::ostringstream osPayloadType;
      // sipcc stores payload types in a funny way. When sipcc and the SDP it
      // parsed differ on what payload type number should be used for a given
      // codec, sipcc's value goes in the lower byte, and the SDP's value in
      // the upper byte. When they do not differ, only the lower byte is used.
      // We want what was in the SDP, verbatim.
      osPayloadType << GET_DYN_PAYLOAD_TYPE_VALUE(ptype);
      mFormats.push_back(osPayloadType.str());
    }
  }

  return true;
}

bool SipccSdpMediaSection::ValidateSimulcast(sdp_t* sdp, const uint16_t level,
                                             InternalResults& results) const {
  if (!GetAttributeList().HasAttribute(SdpAttribute::kSimulcastAttribute)) {
    return true;
  }

  const SdpSimulcastAttribute& simulcast(GetAttributeList().GetSimulcast());
  if (!ValidateSimulcastVersions(sdp, level, simulcast.sendVersions, sdp::kSend,
                                 results)) {
    return false;
  }
  if (!ValidateSimulcastVersions(sdp, level, simulcast.recvVersions, sdp::kRecv,
                                 results)) {
    return false;
  }
  return true;
}

bool SipccSdpMediaSection::ValidateSimulcastVersions(
    sdp_t* sdp, const uint16_t level,
    const SdpSimulcastAttribute::Versions& versions,
    const sdp::Direction direction, InternalResults& results) const {
  for (const SdpSimulcastAttribute::Version& version : versions) {
    for (const SdpSimulcastAttribute::Encoding& encoding : version.choices) {
      const SdpRidAttributeList::Rid* ridAttr = FindRid(encoding.rid);
      if (!ridAttr || (ridAttr->direction != direction)) {
        std::ostringstream os;
        os << "No rid attribute for \'" << encoding.rid << "\'";
        results.AddParseError(sdp_get_media_line_number(sdp, level), os.str());
        results.AddParseError(sdp_get_media_line_number(sdp, level), os.str());
        return false;
      }
    }
  }
  return true;
}

bool SipccSdpMediaSection::LoadConnection(sdp_t* sdp, uint16_t level,
                                          InternalResults& results) {
  if (!sdp_connection_valid(sdp, level)) {
    level = SDP_SESSION_LEVEL;
    if (!sdp_connection_valid(sdp, level)) {
      results.AddParseError(sdp_get_media_line_number(sdp, level),
                            "Missing c= line");
      return false;
    }
  }

  sdp_nettype_e type = sdp_get_conn_nettype(sdp, level);
  if (type != SDP_NT_INTERNET) {
    results.AddParseError(sdp_get_media_line_number(sdp, level),
                          "Unsupported network type");
    return false;
  }

  sdp::AddrType addrType;
  switch (sdp_get_conn_addrtype(sdp, level)) {
    case SDP_AT_IP4:
      addrType = sdp::kIPv4;
      break;
    case SDP_AT_IP6:
      addrType = sdp::kIPv6;
      break;
    default:
      results.AddParseError(sdp_get_media_line_number(sdp, level),
                            "Unsupported address type");
      return false;
  }

  std::string address = sdp_get_conn_address(sdp, level);
  int16_t ttl = static_cast<uint16_t>(sdp_get_mcast_ttl(sdp, level));
  if (ttl < 0) {
    ttl = 0;
  }
  int32_t numAddr =
      static_cast<uint32_t>(sdp_get_mcast_num_of_addresses(sdp, level));
  if (numAddr < 0) {
    numAddr = 0;
  }
  mConnection = MakeUnique<SdpConnection>(addrType, address, ttl, numAddr);
  return true;
}

}  // namespace mozilla
