/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef DOM_MEDIA_WEBRTC_SDP_SDPIMPL_H
#define DOM_MEDIA_WEBRTC_SDP_SDPIMPL_H

#include <ostream>
#include <string>
#include <vector>

#include "mozilla/UniquePtr.h"
#include "sdp/Sdp.h"
#include "sdp/SdpAttributeListImpl.h"
#include "sdp/SdpMediaSectionImpl.h"

namespace mozilla {

class SdpImpl : public Sdp {
 public:
  // For sdp documents that are created rather than parsed
  explicit SdpImpl(const SdpOrigin& origin)
      : SdpImpl(origin, MakeUnique<SdpAttributeListImpl>(nullptr)) {}

  // Deep copies into a generic SdpImpl, with generic media sections. An
  // implementation that needs its clone to keep its own type must override.
  UniquePtr<Sdp> Clone() const override;

  const SdpOrigin& GetOrigin() const override final;
  uint32_t GetBandwidth(const std::string& type) const override final;

  const SdpAttributeList& GetAttributeList() const override final;
  SdpAttributeList& GetAttributeList() override final;

  size_t GetMediaSectionCount() const override final {
    return mMediaSections.size();
  }
  const SdpMediaSection& GetMediaSection(size_t level) const override final;
  SdpMediaSection& GetMediaSection(size_t level) override final;

  SdpMediaSection& AddMediaSection(const SdpMediaSection::MediaType media,
                                   const SdpDirectionAttribute::Direction dir,
                                   const uint16_t port,
                                   const SdpMediaSection::Protocol proto,
                                   const sdp::AddrType addrType,
                                   const std::string& addr) override final;

  void Serialize(std::ostream&) const override final;

  virtual ~SdpImpl() = default;

  SdpImpl(const SdpImpl& orig) = delete;
  SdpImpl& operator=(const SdpImpl& rhs) = delete;

 protected:
  // Takes ownership of the session-level attribute list, which must not be null
  SdpImpl(const SdpOrigin& origin,
          UniquePtr<SdpAttributeListImpl>&& attributeList);

  // Copy c'tor, sort of. Media sections are not copied; the caller clones
  // them, since only it knows what concrete type they should be.
  SdpImpl(const SdpImpl& aOrig,
          UniquePtr<SdpAttributeListImpl>&& attributeList);

  // Creates an empty media section of the implementation's own type. The
  // default creates a generic one, holding a generic media-level attribute
  // list parented on this sdp's session-level attributes.
  virtual UniquePtr<SdpMediaSectionImpl> CreateMediaSection(const size_t level);

  SdpOrigin mOrigin;
  SdpBandwidths mBandwidths;
  UniquePtr<SdpAttributeListImpl> mAttributeList;
  std::vector<UniquePtr<SdpMediaSectionImpl>> mMediaSections;
};
}  // namespace mozilla

#endif  // DOM_MEDIA_WEBRTC_SDP_SDPIMPL_H
