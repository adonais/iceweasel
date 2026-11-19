/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef MEDIA_WEBRTC_SIGNALING_GTEST_MOCKCONDUIT_H_
#define MEDIA_WEBRTC_SIGNALING_GTEST_MOCKCONDUIT_H_

#include "MediaConduitInterface.h"
#include "gmock/gmock.h"
#include "libwebrtcglue/FrameTransformer.h"

namespace webrtc {
inline std::ostream& operator<<(std::ostream& aStream,
                                const webrtc::Call::Stats& aObj) {
  aStream << aObj.ToString(0);
  return aStream;
}
}  // namespace webrtc

namespace mozilla {
// Mocks MediaSessionConduit's methods on top of the conduit class given, so
// that the mocks of a derived conduit class can extend it.
template <typename Conduit>
class MockConduitBase : public Conduit {
 public:
  using Type = MediaSessionConduit::Type;
  using PacketType = MediaSessionConduit::PacketType;

  MOCK_METHOD(Type, type, (), (const, override));
  MOCK_METHOD(Maybe<int>, ActiveSendPayloadType, (), (const, override));
  MOCK_METHOD(Maybe<int>, ActiveRecvPayloadType, (), (const, override));
  MOCK_METHOD(void, SetTransportActive, (bool), (override));
  MOCK_METHOD(MediaEventSourceExc<MediaPacket>&, SenderRtpSendEvent, (),
              (override));
  MOCK_METHOD(MediaEventSourceExc<MediaPacket>&, SenderRtcpSendEvent, (),
              (override));
  MOCK_METHOD(MediaEventSourceExc<MediaPacket>&, ReceiverRtcpSendEvent, (),
              (override));
  MOCK_METHOD(
      void, ConnectReceiverRtpEvent,
      ((MediaEventSourceExc<webrtc::RtpPacketReceived, webrtc::RTPHeader>&)),
      (override));
  MOCK_METHOD(void, ConnectReceiverRtcpEvent,
              (MediaEventSourceExc<webrtc::CopyOnWriteBuffer>&), (override));
  MOCK_METHOD(void, ConnectSenderRtcpEvent,
              (MediaEventSourceExc<webrtc::CopyOnWriteBuffer>&), (override));
  MOCK_METHOD(Maybe<DOMHighResTimeStamp>, LastRtcpReceived, (), (const));
  MOCK_METHOD(Maybe<uint16_t>, RtpSendBaseSeqFor, (uint32_t),
              (const, override));
  MOCK_METHOD(DOMHighResTimeStamp, GetNow, (), (const));
  MOCK_METHOD(dom::RTCStatsTimestampMaker&, GetTimestampMaker, (),
              (const, override));
  MOCK_METHOD(Ssrcs, GetLocalSSRCs, (), (const, override));
  MOCK_METHOD(Maybe<Ssrc>, GetRemoteSSRC, (), (const, override));
  MOCK_METHOD(void, UnsetRemoteSSRC, (Ssrc), (override));
  MOCK_METHOD(void, DisableSsrcChanges, (), (override));
  MOCK_METHOD(bool, HasCodecPluginID, (uint64_t), (const, override));
  MOCK_METHOD(MediaEventSource<void>&, RtcpByeEvent, (), (override));
  MOCK_METHOD(MediaEventSource<void>&, RtcpTimeoutEvent, (), (override));
  MOCK_METHOD(MediaEventSource<void>&, RtpPacketEvent, (), (override));
  MOCK_METHOD(bool, SendRtp,
              (const uint8_t*, size_t, const webrtc::PacketOptions&),
              (override));
  MOCK_METHOD(bool, SendSenderRtcp, (const uint8_t*, size_t), (override));
  MOCK_METHOD(bool, SendReceiverRtcp, (const uint8_t*, size_t), (override));
  MOCK_METHOD(void, DeliverPacket, (webrtc::CopyOnWriteBuffer, PacketType),
              (override));
  MOCK_METHOD(RefPtr<GenericPromise>, Shutdown, (), (override));
  MOCK_METHOD(bool, IsShutdown, (), (const, override));
  MOCK_METHOD(Maybe<RefPtr<AudioSessionConduit>>, AsAudioSessionConduit, (),
              (override));
  MOCK_METHOD(Maybe<RefPtr<VideoSessionConduit>>, AsVideoSessionConduit, (),
              (override));
  MOCK_METHOD(Maybe<webrtc::Call::Stats>, GetCallStats, (), (const, override));
  MOCK_METHOD(void, SetJitterBufferTarget, (DOMHighResTimeStamp), (override));
  MOCK_METHOD(const std::vector<webrtc::RtpSource>&, GetUpstreamRtpSources, (),
              (const, override));
};

class MockConduit : public MockConduitBase<MediaSessionConduit> {};

class MockVideoConduit : public MockConduitBase<VideoSessionConduit> {
 public:
  MOCK_METHOD(void, InitControl, (VideoConduitControlInterface*), (override));
  MOCK_METHOD(MediaConduitErrorCode, AttachRenderer,
              (RefPtr<mozilla::VideoRenderer>), (override));
  MOCK_METHOD(void, DetachRenderer, (), (override));
  MOCK_METHOD(void, SetTrackSource, (webrtc::VideoTrackSourceInterface*),
              (override));
  MOCK_METHOD(bool, LockScaling, (), (const, override));
  MOCK_METHOD(Maybe<webrtc::VideoReceiveStreamInterface::Stats>,
              GetReceiverStats, (), (const, override));
  MOCK_METHOD(Maybe<webrtc::VideoSendStream::Stats>, GetSenderStats, (),
              (const, override));
  MOCK_METHOD(void, CollectTelemetryData, (), (override));
  MOCK_METHOD(bool, AddFrameHistory,
              (dom::Sequence<dom::RTCVideoFrameHistoryInternal>*),
              (const, override));
  MOCK_METHOD(Maybe<Ssrc>, GetAssociatedLocalRtxSSRC, (Ssrc),
              (const, override));
  MOCK_METHOD(Maybe<Ssrc>, GetAssociatedRemoteRtxSSRC, (), (const, override));
  MOCK_METHOD(Maybe<gfx::IntSize>, GetLastResolution, (), (const, override));
  MOCK_METHOD(AbstractCanonical<Maybe<gfx::IntSize>>*, CanonicalReceivingSize,
              (), (override));
  MOCK_METHOD(void, RequestKeyFrame, (FrameTransformerProxy*), (override));
  MOCK_METHOD(void, GenerateKeyFrame,
              (const Maybe<std::string>&, FrameTransformerProxy*), (override));
  MOCK_METHOD(void, GenerateKeyFrames, (std::vector<std::string>), (override));
};
}  // namespace mozilla

#endif
