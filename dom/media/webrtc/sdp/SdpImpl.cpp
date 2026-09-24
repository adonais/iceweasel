/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "sdp/SdpImpl.h"

#include <ostream>

#include "mozilla/Assertions.h"

#ifdef CRLF
#  undef CRLF
#endif
#define CRLF "\r\n"

namespace mozilla {

SdpImpl::SdpImpl(const SdpOrigin& origin,
                 UniquePtr<SdpAttributeListImpl>&& attributeList)
    : mOrigin(origin), mAttributeList(std::move(attributeList)) {}

SdpImpl::SdpImpl(const SdpImpl& aOrig,
                 UniquePtr<SdpAttributeListImpl>&& attributeList)
    : mOrigin(aOrig.mOrigin),
      mBandwidths(aOrig.mBandwidths),
      mAttributeList(std::move(attributeList)) {}

UniquePtr<Sdp> SdpImpl::Clone() const {
  UniquePtr<SdpImpl> sdp(new SdpImpl(
      *this, MakeUnique<SdpAttributeListImpl>(*mAttributeList, nullptr)));
  for (const auto& msection : mMediaSections) {
    sdp->mMediaSections.emplace_back(new SdpMediaSectionImpl(
        *msection, MakeUnique<SdpAttributeListImpl>(
                       *msection->mAttributeList, sdp->mAttributeList.get())));
  }
  return sdp;
}

UniquePtr<SdpMediaSectionImpl> SdpImpl::CreateMediaSection(const size_t level) {
  return UniquePtr<SdpMediaSectionImpl>(new SdpMediaSectionImpl(
      level, MakeUnique<SdpAttributeListImpl>(mAttributeList.get())));
}

const SdpOrigin& SdpImpl::GetOrigin() const { return mOrigin; }

uint32_t SdpImpl::GetBandwidth(const std::string& type) const {
  auto found = mBandwidths.find(type);
  if (found == mBandwidths.end()) {
    return 0;
  }
  return found->second;
}

const SdpAttributeList& SdpImpl::GetAttributeList() const {
  return *mAttributeList;
}

SdpAttributeList& SdpImpl::GetAttributeList() { return *mAttributeList; }

const SdpMediaSection& SdpImpl::GetMediaSection(const size_t level) const {
  if (level >= mMediaSections.size()) {
    MOZ_CRASH();
  }
  return *mMediaSections[level];
}

SdpMediaSection& SdpImpl::GetMediaSection(const size_t level) {
  if (level >= mMediaSections.size()) {
    MOZ_CRASH();
  }
  return *mMediaSections[level];
}

SdpMediaSection& SdpImpl::AddMediaSection(
    const SdpMediaSection::MediaType mediaType,
    const SdpDirectionAttribute::Direction dir, const uint16_t port,
    const SdpMediaSection::Protocol protocol, const sdp::AddrType addrType,
    const std::string& addr) {
  UniquePtr<SdpMediaSectionImpl> media =
      CreateMediaSection(mMediaSections.size());
  media->mMediaType = mediaType;
  media->mPort = port;
  media->mPortCount = 0;
  media->mProtocol = protocol;
  media->mConnection = MakeUnique<SdpConnection>(addrType, addr);
  media->GetAttributeList().SetAttribute(
      MakeUnique<SdpDirectionAttribute>(dir));
  mMediaSections.emplace_back(std::move(media));
  return *mMediaSections.back();
}

void SdpImpl::Serialize(std::ostream& os) const {
  os << "v=0" << CRLF << mOrigin << "s=-" << CRLF;

  // We don't support creating i=, u=, e=, p=
  // We don't generate c= at the session level (only in media)

  mBandwidths.Serialize(os);
  os << "t=0 0" << CRLF;

  // We don't support r= or z=

  // attributes
  os << *mAttributeList;

  // media sections
  for (const auto& msection : mMediaSections) {
    os << *msection;
  }
}

}  // namespace mozilla
