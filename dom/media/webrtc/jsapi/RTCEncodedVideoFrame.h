/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

#ifndef MOZILLA_DOM_MEDIA_WEBRTC_JSAPI_RTCENCODEDVIDEOFRAME_H_
#define MOZILLA_DOM_MEDIA_WEBRTC_JSAPI_RTCENCODEDVIDEOFRAME_H_

#include "mozilla/Maybe.h"
#include "mozilla/dom/RTCEncodedFrameBase.h"
#include "mozilla/dom/RTCEncodedVideoFrameBinding.h"
#include "nsIGlobalObject.h"

namespace mozilla::dom {

class RTCRtpScriptTransformer;
class RTCStatsTimestampMaker;
class StructuredCloneHolder;
struct RTCEncodedVideoFrameOptions;

// Everything a copy of an RTCEncodedVideoFrame carries apart from the data
// buffer itself, which travels in the clone stream (see
// RTCEncodedFrameBase::WriteData). Used only to ferry a copy to the new frame,
// either while structured cloning, or while copy constructing.
struct RTCEncodedVideoFrameData {
  RTCEncodedVideoFrameType mType = RTCEncodedVideoFrameType::Delta;
  RTCEncodedVideoFrameMetadata mMetadata;
  Maybe<nsCString> mRid;
};

// Wraps a libwebrtc frame, allowing the frame buffer to be modified, and
// providing read-only access to various metadata. After the libwebrtc frame is
// extracted (with RTCEncodedFrameBase::TakeFrame), the frame buffer is
// detached, but the metadata remains accessible.
class RTCEncodedVideoFrame final : public RTCEncodedFrameBase {
 public:
  explicit RTCEncodedVideoFrame(
      nsIGlobalObject* aGlobal,
      std::unique_ptr<webrtc::TransformableFrameInterface> aFrame,
      uint64_t aCounter, RTCRtpScriptTransformer* aOwner,
      const Maybe<RTCStatsTimestampMaker>& aTimestampMaker);

  // For structured clone and copy construction. JS engine supplies the buffer.
  RTCEncodedVideoFrame(nsIGlobalObject* aGlobal, RTCEncodedVideoFrameData aData,
                       JS::Handle<JSObject*> aBuffer);

  // webidl (data accessors live in base class)
  JSObject* WrapObject(JSContext* aCx,
                       JS::Handle<JSObject*> aGivenProto) override;

  static already_AddRefed<RTCEncodedVideoFrame> Constructor(
      const GlobalObject& aGlobal, const RTCEncodedVideoFrame& aOriginalFrame,
      const RTCEncodedVideoFrameOptions& aOptions, ErrorResult& aRv);

  RTCEncodedVideoFrameType Type() const;

  // legacy name for the rtpTimestamp in the metadata
  unsigned long Timestamp() const;

  void GetMetadata(RTCEncodedVideoFrameMetadata& aMetadata);

  // Not in webidl right now. Probably will change.
  // https://github.com/w3c/webrtc-encoded-transform/issues/147
  Maybe<nsCString> Rid() const;

  static JSObject* ReadStructuredClone(JSContext* aCx, nsIGlobalObject* aGlobal,
                                       JSStructuredCloneReader* aReader,
                                       RTCEncodedVideoFrameData aData);
  bool WriteStructuredClone(JSContext* aCx, JSStructuredCloneWriter* aWriter,
                            StructuredCloneHolder* aHolder) const;

 private:
  virtual ~RTCEncodedVideoFrame() = default;

  RTCEncodedVideoFrameData CloneMetadata() const;

  // RTCEncodedVideoFrame can run on either main thread or worker thread.
  void AssertIsOnOwningThread() const {
    NS_ASSERT_OWNINGTHREAD(RTCEncodedVideoFrame);
  }

  RTCEncodedVideoFrameType mType = RTCEncodedVideoFrameType::Delta;
  RTCEncodedVideoFrameMetadata mMetadata;
  Maybe<nsCString> mRid;
};

}  // namespace mozilla::dom
#endif  // MOZILLA_DOM_MEDIA_WEBRTC_JSAPI_RTCENCODEDVIDEOFRAME_H_
