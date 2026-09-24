/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "sdp/RsdparsaSdp.h"

#include "sdp/RsdparsaSdpInc.h"
#include "sdp/RsdparsaSdpMediaSection.h"

namespace mozilla {

namespace ffi = mozilla::sdp::ffi;

UniquePtr<SdpAttributeListImpl> RsdparsaSdp::CreateAttributeList(
    const RsdparsaSessionHandle& session) {
  RsdparsaSessionHandle attributeSession(sdp_new_reference(session.get()));
  return UniquePtr<SdpAttributeListImpl>(
      new RsdparsaSdpAttributeList(std::move(attributeSession)));
}

RsdparsaSdp::RsdparsaSdp(RsdparsaSessionHandle session, const SdpOrigin& origin)
    : SdpImpl(origin, CreateAttributeList(session)),
      mSession(std::move(session)) {
  size_t section_count = sdp_media_section_count(mSession.get());
  for (size_t level = 0; level < section_count; level++) {
    RsdparsaSessionHandle newSession(sdp_new_reference(mSession.get()));
    mMediaSections.emplace_back(new RsdparsaSdpMediaSection(
        level, std::move(newSession), &RsdparsaAttributeList()));
  }

  LoadBandwidths();
}

void RsdparsaSdp::LoadBandwidths() {
  convertBandwidths(sdp_get_session_bandwidth_vec(mSession.get()), mBandwidths);
}

}  // namespace mozilla
