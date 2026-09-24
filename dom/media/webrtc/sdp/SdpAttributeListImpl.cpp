/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "sdp/SdpAttributeListImpl.h"

#include <ostream>

#include "mozilla/Assertions.h"

namespace mozilla {

/* static */
MOZ_GLIBCXX_CONSTINIT const std::string SdpAttributeListImpl::kEmptyString;

SdpAttributeListImpl::SdpAttributeListImpl(
    const SdpAttributeListImpl* sessionLevel)
    : mSessionLevel(sessionLevel) {}

SdpAttributeListImpl::SdpAttributeListImpl(
    const SdpAttributeListImpl& aOrig, const SdpAttributeListImpl* sessionLevel)
    : SdpAttributeListImpl(sessionLevel) {
  for (size_t i = 0; i < kNumAttributeTypes; ++i) {
    if (aOrig.mAttributes[i]) {
      mAttributes[i] = aOrig.mAttributes[i]->Clone();
    }
  }
}

bool SdpAttributeListImpl::HasAttribute(const AttributeType type,
                                        const bool sessionFallback) const {
  return !!GetAttribute(type, sessionFallback);
}

const SdpAttribute* SdpAttributeListImpl::GetAttribute(
    const AttributeType type, const bool sessionFallback) const {
  const SdpAttribute* value = mAttributes[static_cast<size_t>(type)].get();
  // Only do fallback when the attribute can appear at both the media and
  // session level
  if (!value && !AtSessionLevel() && sessionFallback &&
      SdpAttribute::IsAllowedAtSessionLevel(type) &&
      SdpAttribute::IsAllowedAtMediaLevel(type)) {
    return mSessionLevel->GetAttribute(type, false);
  }
  return value;
}

void SdpAttributeListImpl::SetAttribute(UniquePtr<SdpAttribute>&& attr) {
  if (!attr) {
    return;
  }
  if (!IsAllowedHere(attr->GetType())) {
    MOZ_ASSERT(false, "This type of attribute is not allowed here");
    return;
  }
  mAttributes[attr->GetType()] = std::move(attr);
}

void SdpAttributeListImpl::RemoveAttribute(const AttributeType type) {
  mAttributes[static_cast<size_t>(type)] = nullptr;
}

void SdpAttributeListImpl::Clear() {
  for (size_t i = 0; i < kNumAttributeTypes; ++i) {
    RemoveAttribute(static_cast<AttributeType>(i));
  }
}

uint32_t SdpAttributeListImpl::Count() const {
  uint32_t count = 0;
  for (auto& attribute : mAttributes) {
    if (attribute) {
      count++;
    }
  }
  return count;
}

bool SdpAttributeListImpl::IsAllowedHere(
    const SdpAttribute::AttributeType type) const {
  if (AtSessionLevel() && !SdpAttribute::IsAllowedAtSessionLevel(type)) {
    return false;
  }

  if (!AtSessionLevel() && !SdpAttribute::IsAllowedAtMediaLevel(type)) {
    return false;
  }

  return true;
}

const std::vector<std::string>& SdpAttributeListImpl::GetCandidate() const {
  if (!HasAttribute(SdpAttribute::kCandidateAttribute)) {
    MOZ_CRASH();
  }

  return static_cast<const SdpMultiStringAttribute*>(
             GetAttribute(SdpAttribute::kCandidateAttribute))
      ->mValues;
}

const SdpConnectionAttribute& SdpAttributeListImpl::GetConnection() const {
  if (!HasAttribute(SdpAttribute::kConnectionAttribute)) {
    MOZ_CRASH();
  }

  return *static_cast<const SdpConnectionAttribute*>(
      GetAttribute(SdpAttribute::kConnectionAttribute));
}

SdpDirectionAttribute::Direction SdpAttributeListImpl::GetDirection() const {
  if (!HasAttribute(SdpAttribute::kDirectionAttribute)) {
    MOZ_CRASH();
  }

  const SdpAttribute* attr = GetAttribute(SdpAttribute::kDirectionAttribute);
  return static_cast<const SdpDirectionAttribute*>(attr)->mValue;
}

const SdpDtlsMessageAttribute& SdpAttributeListImpl::GetDtlsMessage() const {
  if (!HasAttribute(SdpAttribute::kDtlsMessageAttribute)) {
    MOZ_CRASH();
  }
  const SdpAttribute* attr = GetAttribute(SdpAttribute::kDtlsMessageAttribute);
  return *static_cast<const SdpDtlsMessageAttribute*>(attr);
}

const SdpExtmapAttributeList& SdpAttributeListImpl::GetExtmap() const {
  if (!HasAttribute(SdpAttribute::kExtmapAttribute)) {
    MOZ_CRASH();
  }

  return *static_cast<const SdpExtmapAttributeList*>(
      GetAttribute(SdpAttribute::kExtmapAttribute));
}

const SdpFingerprintAttributeList& SdpAttributeListImpl::GetFingerprint()
    const {
  if (!HasAttribute(SdpAttribute::kFingerprintAttribute)) {
    MOZ_CRASH();
  }
  const SdpAttribute* attr = GetAttribute(SdpAttribute::kFingerprintAttribute);
  return *static_cast<const SdpFingerprintAttributeList*>(attr);
}

const SdpFmtpAttributeList& SdpAttributeListImpl::GetFmtp() const {
  if (!HasAttribute(SdpAttribute::kFmtpAttribute)) {
    MOZ_CRASH();
  }

  return *static_cast<const SdpFmtpAttributeList*>(
      GetAttribute(SdpAttribute::kFmtpAttribute));
}

const SdpGroupAttributeList& SdpAttributeListImpl::GetGroup() const {
  if (!HasAttribute(SdpAttribute::kGroupAttribute)) {
    MOZ_CRASH();
  }

  return *static_cast<const SdpGroupAttributeList*>(
      GetAttribute(SdpAttribute::kGroupAttribute));
}

const SdpOptionsAttribute& SdpAttributeListImpl::GetIceOptions() const {
  if (!HasAttribute(SdpAttribute::kIceOptionsAttribute)) {
    MOZ_CRASH();
  }

  const SdpAttribute* attr = GetAttribute(SdpAttribute::kIceOptionsAttribute);
  return *static_cast<const SdpOptionsAttribute*>(attr);
}

const std::string& SdpAttributeListImpl::GetIcePwd() const {
  if (!HasAttribute(SdpAttribute::kIcePwdAttribute)) {
    return kEmptyString;
  }
  const SdpAttribute* attr = GetAttribute(SdpAttribute::kIcePwdAttribute);
  return static_cast<const SdpStringAttribute*>(attr)->mValue;
}

const std::string& SdpAttributeListImpl::GetIceUfrag() const {
  if (!HasAttribute(SdpAttribute::kIceUfragAttribute)) {
    return kEmptyString;
  }
  const SdpAttribute* attr = GetAttribute(SdpAttribute::kIceUfragAttribute);
  return static_cast<const SdpStringAttribute*>(attr)->mValue;
}

const std::string& SdpAttributeListImpl::GetIdentity() const {
  if (!HasAttribute(SdpAttribute::kIdentityAttribute)) {
    return kEmptyString;
  }
  const SdpAttribute* attr = GetAttribute(SdpAttribute::kIdentityAttribute);
  return static_cast<const SdpStringAttribute*>(attr)->mValue;
}

const SdpImageattrAttributeList& SdpAttributeListImpl::GetImageattr() const {
  if (!HasAttribute(SdpAttribute::kImageattrAttribute)) {
    MOZ_CRASH();
  }
  const SdpAttribute* attr = GetAttribute(SdpAttribute::kImageattrAttribute);
  return *static_cast<const SdpImageattrAttributeList*>(attr);
}

const SdpSimulcastAttribute& SdpAttributeListImpl::GetSimulcast() const {
  if (!HasAttribute(SdpAttribute::kSimulcastAttribute)) {
    MOZ_CRASH();
  }
  const SdpAttribute* attr = GetAttribute(SdpAttribute::kSimulcastAttribute);
  return *static_cast<const SdpSimulcastAttribute*>(attr);
}

const std::string& SdpAttributeListImpl::GetLabel() const {
  if (!HasAttribute(SdpAttribute::kLabelAttribute)) {
    return kEmptyString;
  }
  const SdpAttribute* attr = GetAttribute(SdpAttribute::kLabelAttribute);
  return static_cast<const SdpStringAttribute*>(attr)->mValue;
}

unsigned int SdpAttributeListImpl::GetMaxptime() const {
  if (!HasAttribute(SdpAttribute::kMaxptimeAttribute)) {
    MOZ_CRASH();
  }
  const SdpAttribute* attr = GetAttribute(SdpAttribute::kMaxptimeAttribute);
  return static_cast<const SdpNumberAttribute*>(attr)->mValue;
}

const std::string& SdpAttributeListImpl::GetMid() const {
  if (!HasAttribute(SdpAttribute::kMidAttribute)) {
    return kEmptyString;
  }
  const SdpAttribute* attr = GetAttribute(SdpAttribute::kMidAttribute);
  return static_cast<const SdpStringAttribute*>(attr)->mValue;
}

const SdpMsidAttributeList& SdpAttributeListImpl::GetMsid() const {
  if (!HasAttribute(SdpAttribute::kMsidAttribute)) {
    MOZ_CRASH();
  }
  const SdpAttribute* attr = GetAttribute(SdpAttribute::kMsidAttribute);
  return *static_cast<const SdpMsidAttributeList*>(attr);
}

const SdpMsidSemanticAttributeList& SdpAttributeListImpl::GetMsidSemantic()
    const {
  if (!HasAttribute(SdpAttribute::kMsidSemanticAttribute)) {
    MOZ_CRASH();
  }
  const SdpAttribute* attr = GetAttribute(SdpAttribute::kMsidSemanticAttribute);
  return *static_cast<const SdpMsidSemanticAttributeList*>(attr);
}

const SdpRidAttributeList& SdpAttributeListImpl::GetRid() const {
  if (!HasAttribute(SdpAttribute::kRidAttribute)) {
    MOZ_CRASH();
  }
  const SdpAttribute* attr = GetAttribute(SdpAttribute::kRidAttribute);
  return *static_cast<const SdpRidAttributeList*>(attr);
}

unsigned int SdpAttributeListImpl::GetPtime() const {
  if (!HasAttribute(SdpAttribute::kPtimeAttribute)) {
    MOZ_CRASH();
  }
  const SdpAttribute* attr = GetAttribute(SdpAttribute::kPtimeAttribute);
  return static_cast<const SdpNumberAttribute*>(attr)->mValue;
}

const SdpRtcpAttribute& SdpAttributeListImpl::GetRtcp() const {
  if (!HasAttribute(SdpAttribute::kRtcpAttribute)) {
    MOZ_CRASH();
  }
  const SdpAttribute* attr = GetAttribute(SdpAttribute::kRtcpAttribute);
  return *static_cast<const SdpRtcpAttribute*>(attr);
}

const SdpRtcpFbAttributeList& SdpAttributeListImpl::GetRtcpFb() const {
  if (!HasAttribute(SdpAttribute::kRtcpFbAttribute)) {
    MOZ_CRASH();
  }
  const SdpAttribute* attr = GetAttribute(SdpAttribute::kRtcpFbAttribute);
  return *static_cast<const SdpRtcpFbAttributeList*>(attr);
}

const SdpRemoteCandidatesAttribute& SdpAttributeListImpl::GetRemoteCandidates()
    const {
  MOZ_CRASH("Not yet implemented");
}

const SdpRtpmapAttributeList& SdpAttributeListImpl::GetRtpmap() const {
  if (!HasAttribute(SdpAttribute::kRtpmapAttribute)) {
    MOZ_CRASH();
  }
  const SdpAttribute* attr = GetAttribute(SdpAttribute::kRtpmapAttribute);
  return *static_cast<const SdpRtpmapAttributeList*>(attr);
}

const SdpSctpmapAttributeList& SdpAttributeListImpl::GetSctpmap() const {
  if (!HasAttribute(SdpAttribute::kSctpmapAttribute)) {
    MOZ_CRASH();
  }
  const SdpAttribute* attr = GetAttribute(SdpAttribute::kSctpmapAttribute);
  return *static_cast<const SdpSctpmapAttributeList*>(attr);
}

uint32_t SdpAttributeListImpl::GetSctpPort() const {
  if (!HasAttribute(SdpAttribute::kSctpPortAttribute)) {
    MOZ_CRASH();
  }

  const SdpAttribute* attr = GetAttribute(SdpAttribute::kSctpPortAttribute);
  return static_cast<const SdpNumberAttribute*>(attr)->mValue;
}

uint32_t SdpAttributeListImpl::GetMaxMessageSize() const {
  if (!HasAttribute(SdpAttribute::kMaxMessageSizeAttribute)) {
    MOZ_CRASH();
  }

  const SdpAttribute* attr =
      GetAttribute(SdpAttribute::kMaxMessageSizeAttribute);
  return static_cast<const SdpNumberAttribute*>(attr)->mValue;
}

const SdpSetupAttribute& SdpAttributeListImpl::GetSetup() const {
  if (!HasAttribute(SdpAttribute::kSetupAttribute)) {
    MOZ_CRASH();
  }
  const SdpAttribute* attr = GetAttribute(SdpAttribute::kSetupAttribute);
  return *static_cast<const SdpSetupAttribute*>(attr);
}

const SdpSsrcAttributeList& SdpAttributeListImpl::GetSsrc() const {
  if (!HasAttribute(SdpAttribute::kSsrcAttribute)) {
    MOZ_CRASH();
  }
  const SdpAttribute* attr = GetAttribute(SdpAttribute::kSsrcAttribute);
  return *static_cast<const SdpSsrcAttributeList*>(attr);
}

const SdpSsrcGroupAttributeList& SdpAttributeListImpl::GetSsrcGroup() const {
  if (!HasAttribute(SdpAttribute::kSsrcGroupAttribute)) {
    MOZ_CRASH();
  }
  const SdpAttribute* attr = GetAttribute(SdpAttribute::kSsrcGroupAttribute);
  return *static_cast<const SdpSsrcGroupAttributeList*>(attr);
}

void SdpAttributeListImpl::Serialize(std::ostream& os) const {
  for (auto& attribute : mAttributes) {
    if (attribute) {
      os << *attribute;
    }
  }
}

}  // namespace mozilla
