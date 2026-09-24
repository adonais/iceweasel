/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef DOM_MEDIA_WEBRTC_SDP_RSDPARSASDPATTRIBUTELIST_H_
#define DOM_MEDIA_WEBRTC_SDP_RSDPARSASDPATTRIBUTELIST_H_

#include "sdp/RsdparsaSdpGlue.h"
#include "sdp/RsdparsaSdpInc.h"
#include "sdp/SdpAttributeListImpl.h"

namespace mozilla {

class RsdparsaSdp;
class RsdparsaSdpMediaSection;
class SdpParser;

class RsdparsaSdpAttributeList final : public SdpAttributeListImpl {
  friend class RsdparsaSdpMediaSection;
  friend class RsdparsaSdp;

 public:
  virtual ~RsdparsaSdpAttributeList() = default;

  RsdparsaSdpAttributeList(const RsdparsaSdpAttributeList& orig) = delete;
  RsdparsaSdpAttributeList& operator=(const RsdparsaSdpAttributeList& rhs) =
      delete;

 private:
  using RustAttributeList = const sdp::ffi::Vec<sdp::ffi::SdpAttribute>;
  using RustMediaSection = sdp::ffi::SdpMedia;

  explicit RsdparsaSdpAttributeList(RsdparsaSessionHandle session)
      : SdpAttributeListImpl(nullptr),
        mSession(std::move(session)),
        mIsVideo(false) {
    RustAttributeList* attributes = get_sdp_session_attributes(mSession.get());
    LoadAll(attributes);
  }

  RsdparsaSdpAttributeList(RsdparsaSessionHandle session,
                           const RustMediaSection* const msection,
                           const RsdparsaSdpAttributeList* sessionAttributes)
      : SdpAttributeListImpl(sessionAttributes), mSession(std::move(session)) {
    mIsVideo =
        sdp_rust_get_media_type(msection) == sdp::ffi::RustSdpMediaValue::Video;
    RustAttributeList* attributes = sdp_get_media_attribute_list(msection);
    LoadAll(attributes);
  }

  const RsdparsaSessionHandle mSession;
  bool mIsVideo;

  const RsdparsaSdpAttributeList* SessionAttributes() const {
    return static_cast<const RsdparsaSdpAttributeList*>(mSessionLevel);
  }

  void LoadAll(RustAttributeList* attributeList);
  void LoadAttribute(RustAttributeList* attributeList,
                     const AttributeType type);
  void LoadIceUfrag(RustAttributeList* attributeList);
  void LoadIcePwd(RustAttributeList* attributeList);
  void LoadIdentity(RustAttributeList* attributeList);
  void LoadIceOptions(RustAttributeList* attributeList);
  void LoadFingerprint(RustAttributeList* attributeList);
  void LoadDtlsMessage(RustAttributeList* attributeList);
  void LoadSetup(RustAttributeList* attributeList);
  void LoadSsrc(RustAttributeList* attributeList);
  void LoadSsrcGroup(RustAttributeList* attributeList);
  void LoadRtpmap(RustAttributeList* attributeList);
  void LoadFmtp(RustAttributeList* attributeList);
  void LoadPtime(RustAttributeList* attributeList);
  void LoadFlags(RustAttributeList* attributeList);
  void LoadMaxMessageSize(RustAttributeList* attributeList);
  void LoadMid(RustAttributeList* attributeList);
  void LoadMsid(RustAttributeList* attributeList);
  void LoadMsidSemantics(RustAttributeList* attributeList);
  void LoadGroup(RustAttributeList* attributeList);
  void LoadRtcp(RustAttributeList* attributeList);
  void LoadRtcpFb(RustAttributeList* attributeList);
  void LoadSctpPort(RustAttributeList* attributeList);
  void LoadSimulcast(RustAttributeList* attributeList);
  void LoadImageattr(RustAttributeList* attributeList);
  void LoadSctpmaps(RustAttributeList* attributeList);
  void LoadDirection(RustAttributeList* attributeList);
  void LoadRemoteCandidates(RustAttributeList* attributeList);
  void LoadRids(RustAttributeList* attributeList);
  void LoadExtmap(RustAttributeList* attributeList);
  void LoadMaxPtime(RustAttributeList* attributeList);
  void LoadCandidate(RustAttributeList* attributeList);

  void WarnAboutMisplacedAttribute(SdpAttribute::AttributeType type,
                                   uint32_t lineNumber, SdpParser& errorHolder);
};

}  // namespace mozilla

#endif
