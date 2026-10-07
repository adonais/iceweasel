/*
 *  Copyright (c) 2018 The WebRTC project authors. All Rights Reserved.
 *
 *  Use of this source code is governed by a BSD-style license
 *  that can be found in the LICENSE file in the root of the source
 *  tree. An additional intellectual property rights grant can be found
 *  in the file PATENTS.  All contributing project authors may
 *  be found in the AUTHORS file in the root of the source tree.
 */

#include "call/audio_receive_stream.h"

namespace webrtc {

AudioReceiveStreamInterface::Stats::Stats() = default;
AudioReceiveStreamInterface::Stats::~Stats() = default;

AudioReceiveStreamInterface::Config::Config() = default;
AudioReceiveStreamInterface::Config::Config(Config&&) = default;
AudioReceiveStreamInterface::Config&
AudioReceiveStreamInterface::Config::operator=(Config&&) = default;
AudioReceiveStreamInterface::Config::~Config() = default;

AudioReceiveStreamInterface::Config AudioReceiveStreamInterface::Config::Copy()
    const {
  AudioReceiveStreamInterface::Config config_copy;
  config_copy.rtp = rtp;
  config_copy.enable_non_sender_rtt = enable_non_sender_rtt;
  config_copy.rtcp_send_transport = rtcp_send_transport;
  config_copy.jitter_buffer_max_packets = jitter_buffer_max_packets;
  config_copy.jitter_buffer_fast_accelerate = jitter_buffer_fast_accelerate;
  config_copy.jitter_buffer_min_delay_ms = jitter_buffer_min_delay_ms;
  config_copy.sync_group = sync_group;
  config_copy.decoder_map = decoder_map;
  config_copy.decoder_factory = decoder_factory;
  config_copy.codec_pair_id = codec_pair_id;
  config_copy.crypto_options = crypto_options;
  config_copy.frame_decryptor = frame_decryptor;
  config_copy.frame_transformer = frame_transformer;
  // Note: `on_first_packet` is a one-shot move-only callback.
  // It is moved out during construction and should not be copied.
  return config_copy;
}

AudioReceiveStreamInterface::Config::Rtp::Rtp() = default;
AudioReceiveStreamInterface::Config::Rtp::~Rtp() = default;

}  // namespace webrtc
