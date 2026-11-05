/*
 *  Copyright 2026 The WebRTC project authors. All Rights Reserved.
 *
 *  Use of this source code is governed by a BSD-style license
 *  that can be found in the LICENSE file in the root of the source
 *  tree. An additional intellectual property rights grant can be found
 *  in the file PATENTS.  All contributing project authors may
 *  be found in the AUTHORS file in the root of the source tree.
 */

#include "modules/rtp_rtcp/source/rtp_packetizer_sframe.h"

#include <algorithm>
#include <bitset>
#include <cstddef>
#include <cstdint>
#include <span>
#include <utility>

#include "api/media_types.h"
#include "api/rtc_error.h"
#include "modules/rtp_rtcp/source/rtp_packet_to_send.h"
#include "modules/rtp_rtcp/source/sframe_descriptor.h"
#include "rtc_base/checks.h"

namespace webrtc {
namespace {

// Returns S and E bits for the Sframe descriptor.
// - Video uses frame fragmentation flags on `packet`;
// - Audio always sets both (one RTP packet per frame).
std::pair<bool, bool> GetSframeStartAndEndBits(MediaType media_type,
                                               const RtpPacketToSend& packet) {
  if (media_type == MediaType::AUDIO) {
    return {true, true};
  }

  return {packet.is_first_packet_of_frame(), packet.is_last_packet_of_frame()};
}

uint8_t BuildDescriptorByte(bool start,
                            bool end,
                            SframeEncryptionLevel encryption_level) {
  std::bitset<SframeDescriptor::kNumBits> bits;
  bits.set(SframeDescriptor::kSBit, start);
  bits.set(SframeDescriptor::kEBit, end);
  bits.set(SframeDescriptor::kTBit,
           encryption_level == SframeEncryptionLevel::kPacket);
  return static_cast<uint8_t>(bits.to_ulong());
}

}  // namespace

RTCError PacketizeSframeRtpPacketOrError(
    MediaType media_type,
    RtpPacketToSend* packet,
    SframeEncryptionLevel encryption_level) {
  RTC_DCHECK(media_type == MediaType::AUDIO || media_type == MediaType::VIDEO);
  RTC_DCHECK(packet);

  const size_t payload_size = packet->payload_size();
  const size_t padding_size = packet->padding_size();
  const size_t restored_padding_size =
      std::max(padding_size, SframeDescriptor::kSize) - SframeDescriptor::kSize;

  if (payload_size + SframeDescriptor::kSize + restored_padding_size >
      packet->MaxPayloadSize()) {
    return RTCError::InvalidParameter(
        "RTP packet has no room for Sframe descriptor");
  }

  packet->SetPadding(0);

  std::span<uint8_t> payload(
      packet->SetPayloadSize(payload_size + SframeDescriptor::kSize),
      payload_size + SframeDescriptor::kSize);

  if (payload_size > 0) {
    auto src = payload.first(payload_size);
    std::copy_backward(src.begin(), src.end(), payload.end());
  }

  const auto [start, end] = GetSframeStartAndEndBits(media_type, *packet);
  payload[0] = BuildDescriptorByte(start, end, encryption_level);

  if (restored_padding_size > 0 && !packet->SetPadding(restored_padding_size)) {
    return RTCError::InternalError("Failed to restore RTP padding");
  }

  return RTCError::OK();
}

}  // namespace webrtc
