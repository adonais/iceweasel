/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "sdp/SdpMediaSectionImpl.h"

#include <ostream>

#ifdef CRLF
#  undef CRLF
#endif
#define CRLF "\r\n"

namespace mozilla {

void SdpBandwidths::Serialize(std::ostream& os) const {
  for (auto i = begin(); i != end(); ++i) {
    os << "b=" << i->first << ":" << i->second << CRLF;
  }
}

SdpMediaSectionImpl::SdpMediaSectionImpl(
    const size_t level, UniquePtr<SdpAttributeListImpl>&& attributeList)
    : SdpMediaSection(level),
      mMediaType(static_cast<MediaType>(0)),
      mPort(0),
      mPortCount(0),
      mProtocol(static_cast<Protocol>(0)),
      mAttributeList(std::move(attributeList)) {}

SdpMediaSectionImpl::SdpMediaSectionImpl(
    const SdpMediaSectionImpl& aOrig,
    UniquePtr<SdpAttributeListImpl>&& attributeList)
    : SdpMediaSection(aOrig),
      mMediaType(aOrig.mMediaType),
      mPort(aOrig.mPort),
      mPortCount(aOrig.mPortCount),
      mProtocol(aOrig.mProtocol),
      mFormats(aOrig.mFormats),
      mConnection(aOrig.mConnection
                      ? MakeUnique<SdpConnection>(*aOrig.mConnection)
                      : nullptr),
      mBandwidths(aOrig.mBandwidths),
      mAttributeList(std::move(attributeList)) {}

unsigned int SdpMediaSectionImpl::GetPort() const { return mPort; }

void SdpMediaSectionImpl::SetPort(const unsigned int port) { mPort = port; }

unsigned int SdpMediaSectionImpl::GetPortCount() const { return mPortCount; }

SdpMediaSection::Protocol SdpMediaSectionImpl::GetProtocol() const {
  return mProtocol;
}

const SdpConnection& SdpMediaSectionImpl::GetConnection() const {
  return *mConnection;
}

SdpConnection& SdpMediaSectionImpl::GetConnection() { return *mConnection; }

uint32_t SdpMediaSectionImpl::GetBandwidth(const std::string& type) const {
  auto found = mBandwidths.find(type);
  if (found == mBandwidths.end()) {
    return 0;
  }
  return found->second;
}

const std::vector<std::string>& SdpMediaSectionImpl::GetFormats() const {
  return mFormats;
}

const SdpAttributeList& SdpMediaSectionImpl::GetAttributeList() const {
  return *mAttributeList;
}

SdpAttributeList& SdpMediaSectionImpl::GetAttributeList() {
  return *mAttributeList;
}

SdpDirectionAttribute SdpMediaSectionImpl::GetDirectionAttribute() const {
  return SdpDirectionAttribute(mAttributeList->GetDirection());
}

void SdpMediaSectionImpl::AddCodec(const std::string& pt,
                                   const std::string& name,
                                   const uint32_t clockrate,
                                   const uint16_t channels) {
  mFormats.push_back(pt);

  auto rtpmap = MakeUnique<SdpRtpmapAttributeList>();
  if (mAttributeList->HasAttribute(SdpAttribute::kRtpmapAttribute)) {
    const SdpRtpmapAttributeList& old = mAttributeList->GetRtpmap();
    for (auto it = old.mRtpmaps.begin(); it != old.mRtpmaps.end(); ++it) {
      rtpmap->mRtpmaps.push_back(*it);
    }
  }
  SdpRtpmapAttributeList::CodecType codec = SdpRtpmapAttributeList::kOtherCodec;
  if (name == "opus") {
    codec = SdpRtpmapAttributeList::kOpus;
  } else if (name == "G722") {
    codec = SdpRtpmapAttributeList::kG722;
  } else if (name == "PCMU") {
    codec = SdpRtpmapAttributeList::kPCMU;
  } else if (name == "PCMA") {
    codec = SdpRtpmapAttributeList::kPCMA;
  } else if (name == "VP8") {
    codec = SdpRtpmapAttributeList::kVP8;
  } else if (name == "VP9") {
    codec = SdpRtpmapAttributeList::kVP9;
  } else if (name == "H264") {
    codec = SdpRtpmapAttributeList::kH264;
  }

  rtpmap->PushEntry(pt, codec, name, clockrate, channels);
  mAttributeList->SetAttribute(std::move(rtpmap));
}

void SdpMediaSectionImpl::ClearCodecs() {
  mFormats.clear();
  mAttributeList->RemoveAttribute(SdpAttribute::kRtpmapAttribute);
  mAttributeList->RemoveAttribute(SdpAttribute::kFmtpAttribute);
  mAttributeList->RemoveAttribute(SdpAttribute::kSctpmapAttribute);
  mAttributeList->RemoveAttribute(SdpAttribute::kRtcpFbAttribute);
}

void SdpMediaSectionImpl::AddDataChannel(const std::string& name,
                                         const uint16_t port,
                                         const uint16_t streams,
                                         const uint32_t message_size) {
  // Only one allowed, for now. This may change as the specs (and deployments)
  // evolve.
  mFormats.clear();
  if ((mProtocol == kUdpDtlsSctp) || (mProtocol == kTcpDtlsSctp)) {
    // new data channel format according to draft 21
    mFormats.push_back(name);
    mAttributeList->SetAttribute(
        MakeUnique<SdpNumberAttribute>(SdpAttribute::kSctpPortAttribute, port));
    if (message_size) {
      mAttributeList->SetAttribute(MakeUnique<SdpNumberAttribute>(
          SdpAttribute::kMaxMessageSizeAttribute, message_size));
    }
  } else {
    // old data channels format according to draft 05
    std::string port_str = std::to_string(port);
    mFormats.push_back(port_str);
    auto sctpmap = MakeUnique<SdpSctpmapAttributeList>();
    sctpmap->PushEntry(port_str, name, streams);
    mAttributeList->SetAttribute(std::move(sctpmap));
    if (message_size) {
      // This is a workaround to allow detecting Firefox's w/o EOR support
      mAttributeList->SetAttribute(MakeUnique<SdpNumberAttribute>(
          SdpAttribute::kMaxMessageSizeAttribute, message_size));
    }
  }
}

void SdpMediaSectionImpl::Serialize(std::ostream& os) const {
  os << "m=" << mMediaType << " " << mPort;
  if (mPortCount) {
    os << "/" << mPortCount;
  }
  os << " " << mProtocol;
  for (auto i = mFormats.begin(); i != mFormats.end(); ++i) {
    os << " " << (*i);
  }
  os << CRLF;

  // We don't do i=

  if (mConnection) {
    os << *mConnection;
  }

  mBandwidths.Serialize(os);

  // We don't do k= because they're evil

  os << *mAttributeList;
}

}  // namespace mozilla
