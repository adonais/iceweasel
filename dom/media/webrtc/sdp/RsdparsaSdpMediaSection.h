/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef DOM_MEDIA_WEBRTC_SDP_RSDPARSASDPMEDIASECTION_H_
#define DOM_MEDIA_WEBRTC_SDP_RSDPARSASDPMEDIASECTION_H_

#include "mozilla/UniquePtr.h"
#include "sdp/RsdparsaSdpAttributeList.h"
#include "sdp/RsdparsaSdpGlue.h"
#include "sdp/RsdparsaSdpInc.h"
#include "sdp/SdpMediaSectionImpl.h"

namespace mozilla {

class RsdparsaSdp;
class SdpParser;

class RsdparsaSdpMediaSection final : public SdpMediaSectionImpl {
  friend class RsdparsaSdp;

 public:
  ~RsdparsaSdpMediaSection() = default;

 private:
  RsdparsaSdpMediaSection(size_t level, RsdparsaSessionHandle session,
                          const RsdparsaSdpAttributeList* sessionLevel);

  using RustMediaSection = sdp::ffi::SdpMedia;
  RustMediaSection* GetSection() const;

  // Built before mSession is initialized, so it takes the session it is to
  // reference rather than reading the member
  static UniquePtr<SdpAttributeListImpl> CreateAttributeList(
      const RsdparsaSessionHandle& session, size_t level,
      const RsdparsaSdpAttributeList* sessionLevel);

  void LoadPort();
  void LoadProtocol();
  void LoadFormats();
  void LoadConnection();
  void LoadBandwidths();

  RsdparsaSessionHandle mSession;
};
}  // namespace mozilla

#endif
