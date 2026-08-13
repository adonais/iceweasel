/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef nricecandidate_h_
#define nricecandidate_h_

#include "mozilla/Maybe.h"
#include "mozilla/UniquePtr.h"
#include "nsString.h"

// |ice_candidate.h| is not self-contained (it depends on a nICEr-internal
// preamble), so we use pImpl to keep nICEr types out of this header.
struct nr_ice_candidate_parsedbits;

namespace mozilla {

// This exists to give Gecko a RAII-friendly handle on an
// nr_ice_candidate_parsedbits, and to avoid the need to include stuff from
// nICEr.
class NrIceCandidateAttribute final {
 public:
  enum class CandidateType : uint8_t {
    Host = 1,
    ServerReflexive = 2,
    PeerReflexive = 3,
    Relayed = 4,
  };

  enum class TcpType : uint8_t {
    None = 0,
    Active = 1,
    Passive = 2,
    SimultaneousOpen = 3,
  };

  enum class Protocol : uint8_t {
    Udp,
    Tcp,
  };

  static Maybe<NrIceCandidateAttribute> Parse(const nsACString& aAttr);

  ~NrIceCandidateAttribute();

  // Move-only.
  NrIceCandidateAttribute(NrIceCandidateAttribute&& aOther);
  NrIceCandidateAttribute& operator=(NrIceCandidateAttribute&& aOther);
  NrIceCandidateAttribute(const NrIceCandidateAttribute&) = delete;
  NrIceCandidateAttribute& operator=(const NrIceCandidateAttribute&) = delete;

  nsCString Foundation() const;
  uint8_t ComponentId() const;
  uint32_t Priority() const;
  nsCString Address() const;
  uint16_t Port() const;
  Protocol GetProtocol() const;
  CandidateType Type() const;
  TcpType GetTcpType() const;
  // Present for SERVER_REFLEXIVE, PEER_REFLEXIVE, RELAYED candidates.
  Maybe<nsCString> RelatedAddress() const;
  Maybe<uint16_t> RelatedPort() const;

 private:
  NrIceCandidateAttribute();

  UniquePtr<nr_ice_candidate_parsedbits> mBits;
};

}  // namespace mozilla

#endif  // nricecandidate_h_
