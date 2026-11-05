/*
 *  Copyright 2026 The WebRTC project authors. All Rights Reserved.
 *
 *  Use of this source code is governed by a BSD-style license
 *  that can be found in the LICENSE file in the root of the source
 *  tree. An additional intellectual property rights grant can be found
 *  in the file PATENTS.  All contributing project authors may
 *  be found in the AUTHORS file in the root of the source tree.
 */

#ifndef MODULES_RTP_RTCP_SOURCE_RTP_PACKETIZER_SFRAME_H_
#define MODULES_RTP_RTCP_SOURCE_RTP_PACKETIZER_SFRAME_H_

#include "api/media_types.h"
#include "api/rtc_error.h"
#include "modules/rtp_rtcp/source/rtp_packet_to_send.h"
#include "modules/rtp_rtcp/source/sframe_descriptor.h"

namespace webrtc {

// Prepends the Sframe RTP payload descriptor to `packet`'s payload.
// Returns an error if `packet` has no room for the descriptor.
RTCError PacketizeSframeRtpPacketOrError(
    MediaType media_type,
    RtpPacketToSend* packet,
    SframeEncryptionLevel encryption_level);

}  // namespace webrtc

#endif  // MODULES_RTP_RTCP_SOURCE_RTP_PACKETIZER_SFRAME_H_
