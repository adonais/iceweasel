/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nricecandidate.h"

#include <stdlib.h>

// nICEr includes
// clang-format off
#include "nr_api.h"
#include "transport_addr.h"
#include "nr_socket.h"
#include "ice_ctx.h"
#include "ice_candidate.h"
// clang-format on

namespace mozilla {

// Sanity-check that our public enum values match nICEr's. If a future nICEr
// change shuffles them, this catches it at compile time.
static_assert(static_cast<int>(NrIceCandidateAttribute::CandidateType::Host) ==
              HOST);
static_assert(
    static_cast<int>(NrIceCandidateAttribute::CandidateType::ServerReflexive) ==
    SERVER_REFLEXIVE);
static_assert(
    static_cast<int>(NrIceCandidateAttribute::CandidateType::PeerReflexive) ==
    PEER_REFLEXIVE);
static_assert(static_cast<int>(
                  NrIceCandidateAttribute::CandidateType::Relayed) == RELAYED);
static_assert(static_cast<int>(NrIceCandidateAttribute::TcpType::None) ==
              TCP_TYPE_NONE);
static_assert(static_cast<int>(NrIceCandidateAttribute::TcpType::Active) ==
              TCP_TYPE_ACTIVE);
static_assert(static_cast<int>(NrIceCandidateAttribute::TcpType::Passive) ==
              TCP_TYPE_PASSIVE);
static_assert(
    static_cast<int>(NrIceCandidateAttribute::TcpType::SimultaneousOpen) ==
    TCP_TYPE_SO);

NrIceCandidateAttribute::NrIceCandidateAttribute()
    : mBits(MakeUnique<nr_ice_candidate_parsedbits>()) {
  *mBits = {};
}

NrIceCandidateAttribute::~NrIceCandidateAttribute() {
  if (mBits) {
    free(mBits->foundation);
    free(mBits->raw_addr);
    free(mBits->raw_raddr);
  }
}

NrIceCandidateAttribute::NrIceCandidateAttribute(
    NrIceCandidateAttribute&& aOther) = default;

NrIceCandidateAttribute& NrIceCandidateAttribute::operator=(
    NrIceCandidateAttribute&& aOther) = default;

/* static */
Maybe<NrIceCandidateAttribute> NrIceCandidateAttribute::Parse(
    const nsACString& aAttr) {
  NrIceCandidateAttribute result;
  if (nr_ice_parse_candidate_attribute(aAttr.Data(), result.mBits.get())) {
    return Nothing();
  }
  return Some(std::move(result));
}

nsCString NrIceCandidateAttribute::Foundation() const {
  return nsCString(mBits->foundation);
}

uint8_t NrIceCandidateAttribute::ComponentId() const {
  return mBits->component_id;
}

uint32_t NrIceCandidateAttribute::Priority() const { return mBits->priority; }

nsCString NrIceCandidateAttribute::Address() const {
  // Prefer the raw text from the candidate-attribute string; round-
  // tripping via nr_transport_addr_get_addrstring would normalize (e.g.
  // compress IPv6), and no other browser does that today.
  if (mBits->raw_addr) {
    return nsCString(mBits->raw_addr);
  }
  return nsCString();
}

uint16_t NrIceCandidateAttribute::Port() const {
  uint16_t port = 0;
  if (nr_transport_addr_get_port(&mBits->addr, &port)) {
    return 0;
  }
  return port;
}

NrIceCandidateAttribute::Protocol NrIceCandidateAttribute::GetProtocol() const {
  return mBits->addr.protocol == IPPROTO_TCP ? Protocol::Tcp : Protocol::Udp;
}

NrIceCandidateAttribute::CandidateType NrIceCandidateAttribute::Type() const {
  return static_cast<CandidateType>(mBits->type);
}

NrIceCandidateAttribute::TcpType NrIceCandidateAttribute::GetTcpType() const {
  return static_cast<TcpType>(mBits->tcp_type);
}

Maybe<nsCString> NrIceCandidateAttribute::RelatedAddress() const {
  if (mBits->type == HOST || !mBits->raw_raddr) {
    return Nothing();
  }
  // See Address(): preserve the raw textual form.
  return Some(nsCString(mBits->raw_raddr));
}

Maybe<uint16_t> NrIceCandidateAttribute::RelatedPort() const {
  if (mBits->type == HOST) {
    return Nothing();
  }
  uint16_t port = 0;
  if (nr_transport_addr_get_port(&mBits->base, &port)) {
    return Nothing();
  }
  return Some(port);
}

}  // namespace mozilla
