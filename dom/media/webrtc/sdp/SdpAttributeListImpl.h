/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef DOM_MEDIA_WEBRTC_SDP_SDPATTRIBUTELISTIMPL_H
#define DOM_MEDIA_WEBRTC_SDP_SDPATTRIBUTELISTIMPL_H

#include "sdp/SdpAttributeList.h"

namespace mozilla {
class SdpAttributeListImpl : public mozilla::SdpAttributeList {
 public:
  // Make sure we don't hide the default arg thunks
  using SdpAttributeList::GetAttribute;
  using SdpAttributeList::HasAttribute;

  virtual bool HasAttribute(const AttributeType type,
                            const bool sessionFallback) const override final;
  virtual const SdpAttribute* GetAttribute(
      const AttributeType type,
      const bool sessionFallback) const override final;
  virtual void SetAttribute(UniquePtr<SdpAttribute>&& attr) override final;
  virtual void RemoveAttribute(const AttributeType type) override final;
  virtual void Clear() override final;
  virtual uint32_t Count() const override final;

  virtual const SdpConnectionAttribute& GetConnection() const override final;
  virtual const SdpFingerprintAttributeList& GetFingerprint()
      const override final;
  virtual const SdpGroupAttributeList& GetGroup() const override final;
  virtual const SdpOptionsAttribute& GetIceOptions() const override final;
  virtual const SdpRtcpAttribute& GetRtcp() const override final;
  virtual const SdpRemoteCandidatesAttribute& GetRemoteCandidates()
      const override final;
  virtual const SdpSetupAttribute& GetSetup() const override final;
  virtual const SdpSsrcAttributeList& GetSsrc() const override final;
  virtual const SdpSsrcGroupAttributeList& GetSsrcGroup() const override final;
  virtual const SdpDtlsMessageAttribute& GetDtlsMessage() const override final;

  // These attributes can appear multiple times, so the returned
  // classes actually represent a collection of values.
  virtual const std::vector<std::string>& GetCandidate() const override final;
  virtual const SdpExtmapAttributeList& GetExtmap() const override final;
  virtual const SdpFmtpAttributeList& GetFmtp() const override final;
  virtual const SdpImageattrAttributeList& GetImageattr() const override final;
  const SdpSimulcastAttribute& GetSimulcast() const override final;
  virtual const SdpMsidAttributeList& GetMsid() const override final;
  virtual const SdpMsidSemanticAttributeList& GetMsidSemantic()
      const override final;
  const SdpRidAttributeList& GetRid() const override final;
  virtual const SdpRtcpFbAttributeList& GetRtcpFb() const override final;
  virtual const SdpRtpmapAttributeList& GetRtpmap() const override final;
  virtual const SdpSctpmapAttributeList& GetSctpmap() const override final;
  virtual uint32_t GetSctpPort() const override final;
  virtual uint32_t GetMaxMessageSize() const override final;

  // These attributes are effectively simple types, so we'll make life
  // easy by just returning their value.
  virtual const std::string& GetIcePwd() const override final;
  virtual const std::string& GetIceUfrag() const override final;
  virtual const std::string& GetIdentity() const override final;
  virtual const std::string& GetLabel() const override final;
  virtual unsigned int GetMaxptime() const override final;
  virtual const std::string& GetMid() const override final;
  virtual unsigned int GetPtime() const override final;

  virtual SdpDirectionAttribute::Direction GetDirection() const override final;

  virtual void Serialize(std::ostream&) const override final;

  virtual ~SdpAttributeListImpl() = default;

  SdpAttributeListImpl(const SdpAttributeListImpl& orig) = delete;
  SdpAttributeListImpl& operator=(const SdpAttributeListImpl& rhs) = delete;

  // Pass a session-level attribute list if constructing a media-level one,
  // otherwise pass nullptr
  explicit SdpAttributeListImpl(const SdpAttributeListImpl* sessionLevel);

  // Copy c'tor, sort of
  SdpAttributeListImpl(const SdpAttributeListImpl& aOrig,
                       const SdpAttributeListImpl* sessionLevel);

 protected:
  bool AtSessionLevel() const { return !mSessionLevel; }
  bool IsAllowedHere(const SdpAttribute::AttributeType type) const;

  const SdpAttributeListImpl* mSessionLevel;
  static const std::string kEmptyString;
  constexpr static size_t kNumAttributeTypes =
      AttributeType::kLastAttribute + 1;
  mozilla::UniquePtr<SdpAttribute> mAttributes[kNumAttributeTypes];
};
}  // namespace mozilla

#endif  // DOM_MEDIA_WEBRTC_SDP_SDPATTRIBUTELISTIMPL_H
