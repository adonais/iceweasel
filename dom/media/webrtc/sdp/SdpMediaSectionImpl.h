/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef DOM_MEDIA_WEBRTC_SDP_SDPMEDIASECTIONIMPL_H
#define DOM_MEDIA_WEBRTC_SDP_SDPMEDIASECTIONIMPL_H

#include <map>
#include <ostream>
#include <string>
#include <vector>

#include "mozilla/UniquePtr.h"
#include "sdp/SdpAttributeListImpl.h"
#include "sdp/SdpMediaSection.h"

namespace mozilla {

class SdpBandwidths : public std::map<std::string, uint32_t> {
 public:
  void Serialize(std::ostream& os) const;
};

class SdpMediaSectionImpl : public SdpMediaSection {
  // Fills in the m= line of the sections it creates in AddMediaSection
  friend class SdpImpl;

 public:
  MediaType GetMediaType() const override final { return mMediaType; }

  unsigned int GetPort() const override final;
  void SetPort(const unsigned int port) override final;
  unsigned int GetPortCount() const override final;
  Protocol GetProtocol() const override final;
  const SdpConnection& GetConnection() const override final;
  SdpConnection& GetConnection() override final;
  uint32_t GetBandwidth(const std::string& type) const override final;
  const std::vector<std::string>& GetFormats() const override final;

  const SdpAttributeList& GetAttributeList() const override final;
  SdpAttributeList& GetAttributeList() override final;
  SdpDirectionAttribute GetDirectionAttribute() const override final;

  void AddCodec(const std::string& pt, const std::string& name,
                const uint32_t clockrate,
                const uint16_t channels) override final;
  void ClearCodecs() override final;

  void AddDataChannel(const std::string& name, const uint16_t port,
                      const uint16_t streams,
                      const uint32_t message_size) override final;

  void Serialize(std::ostream&) const override final;

  // SdpImpl owns media sections through this type, so this must be virtual
  virtual ~SdpMediaSectionImpl() = default;

  SdpMediaSectionImpl(const SdpMediaSectionImpl& orig) = delete;
  SdpMediaSectionImpl& operator=(const SdpMediaSectionImpl& rhs) = delete;

 protected:
  // Takes ownership of the attribute list, which must not be null
  SdpMediaSectionImpl(const size_t level,
                      UniquePtr<SdpAttributeListImpl>&& attributeList);

  // Copy c'tor, sort of
  SdpMediaSectionImpl(const SdpMediaSectionImpl& aOrig,
                      UniquePtr<SdpAttributeListImpl>&& attributeList);

  // the following values are cached on first get
  MediaType mMediaType;
  uint16_t mPort;
  uint16_t mPortCount;
  Protocol mProtocol;
  std::vector<std::string> mFormats;

  UniquePtr<SdpConnection> mConnection;
  SdpBandwidths mBandwidths;

  UniquePtr<SdpAttributeListImpl> mAttributeList;
};
}  // namespace mozilla

#endif  // DOM_MEDIA_WEBRTC_SDP_SDPMEDIASECTIONIMPL_H
