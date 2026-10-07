/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

// Original author: ekr@rtfm.com

// This is a wrapper around the nICEr ICE stack
#ifndef transportlayerice_h_
#define transportlayerice_h_

#include "m_cpp_utils.h"
#include "mozilla/RefPtr.h"
#include "nricemediastream.h"
#include "sigslot.h"
#include "transportlayer.h"

// An ICE transport layer -- corresponds to a single ICE
namespace mozilla {

class TransportLayerIce : public TransportLayer {
 public:
  TransportLayerIce();

  virtual ~TransportLayerIce();

  void SetParameters(RefPtr<NrIceMediaStream> stream, int component);

  void ResetOldStream();    // called after successful ice restart
  void RestoreOldStream();  // called after unsuccessful ice restart

  // Transport layer overrides.
  TransportResult SendPacket(MediaPacket& packet) override;

  // Slots for ICE
  void IceCandidate(NrIceMediaStream* stream, const std::string&);
  void IceReady(NrIceMediaStream* stream);
  void IceFailed(NrIceMediaStream* stream);
  void IcePacketReceived(NrIceMediaStream* stream, int component,
                         uint32_t dtls_id, MediaPacket& packet);

  // Useful for capturing encrypted packets
  sigslot::signal2<TransportLayer*, MediaPacket&> SignalPacketSending;

  TRANSPORT_LAYER_ID("ice")

 private:
  DISALLOW_COPY_ASSIGN(TransportLayerIce);
  void PostSetup();

  RefPtr<NrIceMediaStream> stream_;
  int component_;
  // The DTLS association this layer is bound to; packets for other associations
  // (during a fingerprint-changing ICE restart) are filtered out, and this id
  // is passed along to NrIceMediaStream when sending a packet so the correct
  // ICE stream is used.
  uint32_t dtls_id_;
};

}  // namespace mozilla
#endif
