/*
 *  Copyright 2017 The WebRTC Project Authors. All rights reserved.
 *
 *  Use of this source code is governed by a BSD-style license
 *  that can be found in the LICENSE file in the root of the source
 *  tree. An additional intellectual property rights grant can be found
 *  in the file PATENTS.  All contributing project authors may
 *  be found in the AUTHORS file in the root of the source tree.
 */

#ifndef P2P_TEST_FAKE_ICE_TRANSPORT_H_
#define P2P_TEST_FAKE_ICE_TRANSPORT_H_

#include <cstddef>
#include <map>
#include <memory>
#include <optional>
#include <string>
#include <utility>

#include "absl/algorithm/container.h"
#include "absl/strings/string_view.h"
#include "api/candidate.h"
#include "api/ice_transport_interface.h"
#include "api/sequence_checker.h"
#include "api/task_queue/pending_task_safety_flag.h"
#include "api/transport/enums.h"
#include "api/units/time_delta.h"
#include "p2p/base/candidate_pair_interface.h"
#include "p2p/base/connection.h"
#include "p2p/base/connection_info.h"
#include "p2p/base/ice_transport_internal.h"
#include "p2p/base/port.h"
#include "p2p/base/transport_description.h"
#include "rtc_base/async_packet_socket.h"
#include "rtc_base/checks.h"
#include "rtc_base/copy_on_write_buffer.h"
#include "rtc_base/logging.h"
#include "rtc_base/network/received_packet.h"
#include "rtc_base/network/sent_packet.h"
#include "rtc_base/network_route.h"
#include "rtc_base/socket.h"
#include "rtc_base/task_queue_for_test.h"
#include "rtc_base/thread.h"
#include "rtc_base/thread_annotations.h"
#include "rtc_base/time_utils.h"

namespace cricket {
using ::webrtc::SafeTask;
using ::webrtc::TimeDelta;

// All methods must be called on the network thread (which is either the thread
// calling the constructor, or the separate thread explicitly passed to the
// constructor).
class FakeIceTransport : public IceTransportInternal {
 public:
  explicit FakeIceTransport(absl::string_view name,
                            int component,
                            rtc::Thread* network_thread = nullptr)
      : name_(name),
        component_(component),
        network_thread_(network_thread ? network_thread
                                       : rtc::Thread::Current()) {
    RTC_DCHECK(network_thread_);
  }

  // Must be called either on the network thread, or after the network thread
  // has been shut down.
  ~FakeIceTransport() override {
    if (dest_ && dest_->dest_ == this) {
      dest_->dest_ = nullptr;
    }
  }

  // If async, will send packets by "Post"-ing to message queue instead of
  // synchronously "Send"-ing.
  void SetAsync(bool async) {
    RTC_DCHECK_RUN_ON(network_thread_);
    async_ = async;
  }
  void SetAsyncDelay(int delay_ms) {
    RTC_DCHECK_RUN_ON(network_thread_);
    async_delay_ms_ = delay_ms;
  }

  // SetWritable, SetReceiving and SetDestination are the main methods that can
  // be used for testing, to simulate connectivity or lack thereof.
  void SetWritable(bool writable) {
    RTC_DCHECK_RUN_ON(network_thread_);
    set_writable(writable);
  }
  void SetReceiving(bool receiving) {
    RTC_DCHECK_RUN_ON(network_thread_);
    set_receiving(receiving);
  }

  // Simulates the two transports connecting to each other.
  // If `asymmetric` is true this method only affects this FakeIceTransport.
  // If false, it affects `dest` as well.
  void SetDestination(FakeIceTransport* dest, bool asymmetric = false) {
    RTC_DCHECK_RUN_ON(network_thread_);
    if (dest == dest_) {
      return;
    }
    RTC_DCHECK(!dest || !dest_)
        << "Changing fake destination from one to another is not supported.";
    if (dest) {
      // This simulates the delivery of candidates.
      dest_ = dest;
      set_writable(true);
      if (!asymmetric) {
        dest->SetDestination(this, true);
      }
    } else {
      // Simulates loss of connectivity, by asymmetrically forgetting dest_.
      dest_ = nullptr;
      set_writable(false);
    }
  }

  void SetTransportState(webrtc::IceTransportState state,
                         IceTransportState legacy_state) {
    RTC_DCHECK_RUN_ON(network_thread_);
    transport_state_ = state;
    legacy_transport_state_ = legacy_state;
    SignalIceTransportStateChanged(this);
  }

  void SetConnectionCount(size_t connection_count) {
    RTC_DCHECK_RUN_ON(network_thread_);
    size_t old_connection_count = connection_count_;
    connection_count_ = connection_count;
    if (connection_count) {
      had_connection_ = true;
    }
    // In this fake transport channel, `connection_count_` determines the
    // transport state.
    if (connection_count_ < old_connection_count) {
      SignalStateChanged(this);
    }
  }

  void SetCandidatesGatheringComplete() {
    RTC_DCHECK_RUN_ON(network_thread_);
    if (gathering_state_ != kIceGatheringComplete) {
      gathering_state_ = kIceGatheringComplete;
      SendGatheringStateEvent();
    }
  }

  // Convenience functions for accessing ICE config and other things.
  int receiving_timeout() const {
    RTC_DCHECK_RUN_ON(network_thread_);
    return ice_config_.receiving_timeout_or_default();
  }
  bool gather_continually() const {
    RTC_DCHECK_RUN_ON(network_thread_);
    return ice_config_.gather_continually();
  }
  const Candidates& remote_candidates() const {
    RTC_DCHECK_RUN_ON(network_thread_);
    return remote_candidates_;
  }

  // Fake IceTransportInternal implementation.
  const std::string& transport_name() const override { return name_; }
  int component() const override { return component_; }
  IceMode remote_ice_mode() const {
    RTC_DCHECK_RUN_ON(network_thread_);
    return remote_ice_mode_;
  }
  const std::string& ice_ufrag() const { return ice_parameters_.ufrag; }
  const std::string& ice_pwd() const { return ice_parameters_.pwd; }
  const std::string& remote_ice_ufrag() const {
    return remote_ice_parameters_.ufrag;
  }
  const std::string& remote_ice_pwd() const {
    return remote_ice_parameters_.pwd;
  }
  const IceParameters& ice_parameters() const { return ice_parameters_; }
  const IceParameters& remote_ice_parameters() const {
    return remote_ice_parameters_;
  }

  IceTransportState GetState() const override {
    RTC_DCHECK_RUN_ON(network_thread_);
    if (legacy_transport_state_) {
      return *legacy_transport_state_;
    }

    if (connection_count_ == 0) {
      return had_connection_ ? IceTransportState::STATE_FAILED
                             : IceTransportState::STATE_INIT;
    }

    if (connection_count_ == 1) {
      return IceTransportState::STATE_COMPLETED;
    }

    return IceTransportState::STATE_CONNECTING;
  }

  webrtc::IceTransportState GetIceTransportState() const override {
    RTC_DCHECK_RUN_ON(network_thread_);
    if (transport_state_) {
      return *transport_state_;
    }

    if (connection_count_ == 0) {
      return had_connection_ ? webrtc::IceTransportState::kFailed
                             : webrtc::IceTransportState::kNew;
    }

    if (connection_count_ == 1) {
      return webrtc::IceTransportState::kCompleted;
    }

    return webrtc::IceTransportState::kConnected;
  }

  void SetIceRole(IceRole role) override {
    RTC_DCHECK_RUN_ON(network_thread_);
    role_ = role;
  }
  IceRole GetIceRole() const override {
    RTC_DCHECK_RUN_ON(network_thread_);
    return role_;
  }
  void SetIceParameters(const IceParameters& ice_params) override {
    RTC_DCHECK_RUN_ON(network_thread_);
    ice_parameters_ = ice_params;
  }
  void SetRemoteIceParameters(const IceParameters& params) override {
    RTC_DCHECK_RUN_ON(network_thread_);
    remote_ice_parameters_ = params;
  }

  void SetRemoteIceMode(IceMode mode) override {
    RTC_DCHECK_RUN_ON(network_thread_);
    remote_ice_mode_ = mode;
  }

  void MaybeStartGathering() override {
    RTC_DCHECK_RUN_ON(network_thread_);
    if (gathering_state_ == kIceGatheringNew) {
      gathering_state_ = kIceGatheringGathering;
      SendGatheringStateEvent();
    }
  }

  IceGatheringState gathering_state() const override {
    RTC_DCHECK_RUN_ON(network_thread_);
    return gathering_state_;
  }

  void SetIceConfig(const IceConfig& config) override {
    RTC_DCHECK_RUN_ON(network_thread_);
    ice_config_ = config;
  }

  const IceConfig& config() const override { return ice_config_; }

  void AddRemoteCandidate(const Candidate& candidate) override {
    RTC_DCHECK_RUN_ON(network_thread_);
    remote_candidates_.push_back(candidate);
  }
  void RemoveRemoteCandidate(const Candidate& candidate) override {
    RTC_DCHECK_RUN_ON(network_thread_);
    auto it = absl::c_find(remote_candidates_, candidate);
    if (it == remote_candidates_.end()) {
      RTC_LOG(LS_INFO) << "Trying to remove a candidate which doesn't exist.";
      return;
    }

    remote_candidates_.erase(it);
  }

  void RemoveAllRemoteCandidates() override {
    RTC_DCHECK_RUN_ON(network_thread_);
    remote_candidates_.clear();
  }

  bool GetStats(IceTransportStats* ice_transport_stats) override {
    CandidateStats candidate_stats;
    ConnectionInfo candidate_pair_stats;
    ice_transport_stats->candidate_stats_list.clear();
    ice_transport_stats->candidate_stats_list.push_back(candidate_stats);
    ice_transport_stats->connection_infos.clear();
    ice_transport_stats->connection_infos.push_back(candidate_pair_stats);
    return true;
  }

  std::optional<int> GetRttEstimate() override { return rtt_estimate_; }

  const Connection* selected_connection() const override { return nullptr; }
  std::optional<const CandidatePair> GetSelectedCandidatePair() const override {
    return std::nullopt;
  }

  // Fake PacketTransportInternal implementation.
  bool writable() const override {
    RTC_DCHECK_RUN_ON(network_thread_);
    return writable_;
  }
  bool receiving() const override {
    RTC_DCHECK_RUN_ON(network_thread_);
    return receiving_;
  }
  // If combine is enabled, every two consecutive packets to be sent with
  // "SendPacket" will be combined into one outgoing packet.
  void combine_outgoing_packets(bool combine) {
    RTC_DCHECK_RUN_ON(network_thread_);
    combine_outgoing_packets_ = combine;
  }
  int SendPacket(const char* data,
                 size_t len,
                 const rtc::PacketOptions& options,
                 int flags) override {
    RTC_DCHECK_RUN_ON(network_thread_);
    if (!dest_) {
      return -1;
    }

    if (packet_send_filter_func_ &&
        packet_send_filter_func_(data, len, options, flags)) {
      RTC_DLOG(LS_INFO) << name_ << ": dropping packet len=" << len
                        << ", data[0]: " << static_cast<uint8_t>(data[0]);
    } else {
      send_packet_.AppendData(data, len);
      if (!combine_outgoing_packets_ || send_packet_.size() > len) {
        rtc::CopyOnWriteBuffer packet(std::move(send_packet_));
        if (async_) {
          network_thread_->PostDelayedTask(
              SafeTask(task_safety_.flag(),
                       [this, packet] {
                         RTC_DCHECK_RUN_ON(network_thread_);
                         FakeIceTransport::SendPacketInternal(packet);
                       }),
              TimeDelta::Millis(async_delay_ms_));
        } else {
          SendPacketInternal(packet);
        }
      }
    }
    rtc::SentPacket sent_packet(options.packet_id, rtc::TimeMillis());
    SignalSentPacket(this, sent_packet);
    return static_cast<int>(len);
  }

  int SetOption(rtc::Socket::Option opt, int value) override {
    RTC_DCHECK_RUN_ON(network_thread_);
    socket_options_[opt] = value;
    return true;
  }
  bool GetOption(rtc::Socket::Option opt, int* value) override {
    RTC_DCHECK_RUN_ON(network_thread_);
    auto it = socket_options_.find(opt);
    if (it != socket_options_.end()) {
      *value = it->second;
      return true;
    } else {
      return false;
    }
  }

  int GetError() override { return 0; }

  rtc::CopyOnWriteBuffer last_sent_packet() {
    RTC_DCHECK_RUN_ON(network_thread_);
    return last_sent_packet_;
  }

  std::optional<rtc::NetworkRoute> network_route() const override {
    RTC_DCHECK_RUN_ON(network_thread_);
    return network_route_;
  }
  void SetNetworkRoute(std::optional<rtc::NetworkRoute> network_route) {
    RTC_DCHECK_RUN_ON(network_thread_);
    network_route_ = network_route;
    SendTask(network_thread_, [this] {
      RTC_DCHECK_RUN_ON(network_thread_);
      SignalNetworkRouteChanged(network_route_);
    });
  }

  // If `func` return TRUE means that packet will be dropped.
  void set_packet_send_filter(
      absl::AnyInvocable<bool(const char* data,
                              size_t len,
                              const rtc::PacketOptions& options,
                              int /* flags */)> func) {
    RTC_DCHECK_RUN_ON(network_thread_);
    RTC_DLOG(LS_INFO) << this << ": "
                      << ((func == nullptr) ? "Clearing" : "Setting")
                      << " packet send filter func";
    packet_send_filter_func_ = std::move(func);
  }

  // If `func` return TRUE means that packet will be dropped.
  void set_packet_recv_filter(
      absl::AnyInvocable<bool(const rtc::CopyOnWriteBuffer& packet,
                              uint32_t time_ms)> func) {
    RTC_DCHECK_RUN_ON(network_thread_);
    RTC_DLOG(LS_INFO) << this << ": "
                      << ((func == nullptr) ? "Clearing" : "Setting")
                      << " packet recv filter func";
    packet_recv_filter_func_ = std::move(func);
  }

  void set_rtt_estimate(std::optional<int> value, bool set_async = false) {
    rtt_estimate_ = value;
    if (value && set_async) {
      SetAsync(true);
      SetAsyncDelay(*value / 2);
    }
  }

 private:
  void set_writable(bool writable)
      RTC_EXCLUSIVE_LOCKS_REQUIRED(network_thread_) {
    if (writable_ == writable) {
      return;
    }
    RTC_LOG(LS_INFO) << "Change writable_ to " << writable;
    writable_ = writable;
    if (writable_) {
      SignalReadyToSend(this);
    }
    SignalWritableState(this);
  }

  void set_receiving(bool receiving)
      RTC_EXCLUSIVE_LOCKS_REQUIRED(network_thread_) {
    if (receiving_ == receiving) {
      return;
    }
    receiving_ = receiving;
    SignalReceivingState(this);
  }

  void SendPacketInternal(const rtc::CopyOnWriteBuffer& packet)
      RTC_EXCLUSIVE_LOCKS_REQUIRED(network_thread_) {
    if (dest_) {
      last_sent_packet_ = packet;
      dest_->ReceivePacketInternal(packet);
    }
  }

  void ReceivePacketInternal(const rtc::CopyOnWriteBuffer& packet) {
    RTC_DCHECK_RUN_ON(network_thread_);
    auto now = rtc::TimeMicros();
    if (packet_recv_filter_func_ && packet_recv_filter_func_(packet, now)) {
      RTC_DLOG(LS_INFO) << name_
                        << ": dropping packet at receiver len=" << packet.size()
                        << ", data[0]: "
                        << static_cast<uint8_t>(packet.data()[0]);
    } else {
      NotifyPacketReceived(rtc::ReceivedPacket::CreateFromLegacy(
          packet.data(), packet.size(), now));
    }
  }

  const std::string name_;
  const int component_;
  FakeIceTransport* dest_ RTC_GUARDED_BY(network_thread_) = nullptr;
  bool async_ RTC_GUARDED_BY(network_thread_) = false;
  int async_delay_ms_ RTC_GUARDED_BY(network_thread_) = 0;
  Candidates remote_candidates_ RTC_GUARDED_BY(network_thread_);
  IceConfig ice_config_ RTC_GUARDED_BY(network_thread_);
  IceRole role_ RTC_GUARDED_BY(network_thread_) = ICEROLE_UNKNOWN;
  IceParameters ice_parameters_ RTC_GUARDED_BY(network_thread_);
  IceParameters remote_ice_parameters_ RTC_GUARDED_BY(network_thread_);
  IceMode remote_ice_mode_ RTC_GUARDED_BY(network_thread_) = ICEMODE_FULL;
  size_t connection_count_ RTC_GUARDED_BY(network_thread_) = 0;
  std::optional<webrtc::IceTransportState> transport_state_
      RTC_GUARDED_BY(network_thread_);
  std::optional<IceTransportState> legacy_transport_state_
      RTC_GUARDED_BY(network_thread_);
  IceGatheringState gathering_state_ RTC_GUARDED_BY(network_thread_) =
      kIceGatheringNew;
  bool had_connection_ RTC_GUARDED_BY(network_thread_) = false;
  bool writable_ RTC_GUARDED_BY(network_thread_) = false;
  bool receiving_ RTC_GUARDED_BY(network_thread_) = false;
  bool combine_outgoing_packets_ RTC_GUARDED_BY(network_thread_) = false;
  rtc::CopyOnWriteBuffer send_packet_ RTC_GUARDED_BY(network_thread_);
  std::optional<rtc::NetworkRoute> network_route_
      RTC_GUARDED_BY(network_thread_);
  std::map<rtc::Socket::Option, int> socket_options_
      RTC_GUARDED_BY(network_thread_);
  rtc::CopyOnWriteBuffer last_sent_packet_ RTC_GUARDED_BY(network_thread_);
  rtc::Thread* const network_thread_;
  webrtc::ScopedTaskSafetyDetached task_safety_;
  std::optional<int> rtt_estimate_;

  // If filter func return TRUE means that packet will be dropped.
  absl::AnyInvocable<bool(const char*, size_t, const rtc::PacketOptions&, int)>
      packet_send_filter_func_ RTC_GUARDED_BY(network_thread_) = nullptr;
  absl::AnyInvocable<bool(const rtc::CopyOnWriteBuffer&, uint64_t)>
      packet_recv_filter_func_ RTC_GUARDED_BY(network_thread_) = nullptr;
};

class FakeIceTransportWrapper : public webrtc::IceTransportInterface {
 public:
  explicit FakeIceTransportWrapper(
      std::unique_ptr<cricket::FakeIceTransport> internal)
      : internal_(std::move(internal)) {}

  cricket::IceTransportInternal* internal() override { return internal_.get(); }

 private:
  std::unique_ptr<cricket::FakeIceTransport> internal_;
};

}  // namespace cricket

#endif  // P2P_TEST_FAKE_ICE_TRANSPORT_H_
