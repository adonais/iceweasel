/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef DOM_MEDIA_WEBRTC_SDP_RSDPARSASDP_H_
#define DOM_MEDIA_WEBRTC_SDP_RSDPARSASDP_H_

#include "mozilla/UniquePtr.h"
#include "sdp/RsdparsaSdpAttributeList.h"
#include "sdp/RsdparsaSdpGlue.h"
#include "sdp/RsdparsaSdpInc.h"
#include "sdp/RsdparsaSdpMediaSection.h"
#include "sdp/SdpImpl.h"

namespace mozilla {

class RsdparsaSdpParser;
class SdpParser;

class RsdparsaSdp final : public SdpImpl {
  friend class RsdparsaSdpParser;

 public:
  explicit RsdparsaSdp(RsdparsaSessionHandle session, const SdpOrigin& origin);
  RsdparsaSdp() = delete;

 private:
  // Built before mSession is initialized, so it takes the session it is to
  // reference rather than reading the member
  static UniquePtr<SdpAttributeListImpl> CreateAttributeList(
      const RsdparsaSessionHandle& session);

  // mAttributeList is always a RsdparsaSdpAttributeList for this sdp
  RsdparsaSdpAttributeList& RsdparsaAttributeList() {
    return *static_cast<RsdparsaSdpAttributeList*>(mAttributeList.get());
  }

  void LoadBandwidths();

  RsdparsaSessionHandle mSession;
};

}  // namespace mozilla

#endif
