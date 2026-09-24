/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "sdp/SipccSdp.h"

#include <charconv>

#include "mozilla/UniquePtr.h"
#include "sdp/SdpParser.h"

namespace mozilla {

SipccSdp::SipccSdp(const SipccSdp& aOrig)
    : SdpImpl(aOrig, UniquePtr<SdpAttributeListImpl>(new SipccSdpAttributeList(
                         aOrig.SipccAttributeList(), nullptr))) {
  for (const auto& msection : aOrig.mMediaSections) {
    mMediaSections.emplace_back(new SipccSdpMediaSection(
        static_cast<const SipccSdpMediaSection&>(*msection),
        &SipccAttributeList()));
  }
}

UniquePtr<Sdp> SipccSdp::Clone() const { return MakeUnique<SipccSdp>(*this); }

UniquePtr<SdpMediaSectionImpl> SipccSdp::CreateMediaSection(
    const size_t level) {
  return UniquePtr<SdpMediaSectionImpl>(
      new SipccSdpMediaSection(level, &SipccAttributeList()));
}

bool SipccSdp::LoadOrigin(sdp_t* sdp, InternalResults& results) {
  std::string username = sdp_get_owner_username(sdp);

  // Parse session fields using std::from_chars and strlen
  uint64_t sessId = 0;
  const char* sessionIdStr = sdp_get_owner_sessionid(sdp);
  std::from_chars(sessionIdStr, sessionIdStr + strlen(sessionIdStr), sessId,
                  10);

  uint64_t sessVer = 0;
  const char* sessionVersionStr = sdp_get_owner_version(sdp);
  std::from_chars(sessionVersionStr,
                  sessionVersionStr + strlen(sessionVersionStr), sessVer, 10);

  sdp_nettype_e type = sdp_get_owner_network_type(sdp);
  if (type != SDP_NT_INTERNET) {
    results.AddParseError(2, "Unsupported network type");
    return false;
  }

  sdp::AddrType addrType;
  switch (sdp_get_owner_address_type(sdp)) {
    case SDP_AT_IP4:
      addrType = sdp::kIPv4;
      break;
    case SDP_AT_IP6:
      addrType = sdp::kIPv6;
      break;
    default:
      results.AddParseError(2, "Unsupported address type");
      return false;
  }

  std::string address = sdp_get_owner_address(sdp);
  mOrigin = SdpOrigin(username, sessId, sessVer, addrType, address);
  return true;
}

bool SipccSdp::Load(sdp_t* sdp, InternalResults& results) {
  // Believe it or not, SDP_SESSION_LEVEL is 0xFFFF
  if (!SipccAttributeList().Load(sdp, SDP_SESSION_LEVEL, results)) {
    return false;
  }

  if (!LoadOrigin(sdp, results)) {
    return false;
  }

  if (!LoadBandwidths(sdp, SDP_SESSION_LEVEL, results, mBandwidths)) {
    return false;
  }

  for (int i = 0; i < sdp_get_num_media_lines(sdp); ++i) {
    // note that we pass a "level" here that is one higher
    // sipcc counts media sections from 1, using 0xFFFF as the "session"
    UniquePtr<SipccSdpMediaSection> section(
        new SipccSdpMediaSection(i, &SipccAttributeList()));
    if (!section->Load(sdp, i + 1, results)) {
      return false;
    }
    mMediaSections.push_back(std::move(section));
  }
  return true;
}

}  // namespace mozilla
