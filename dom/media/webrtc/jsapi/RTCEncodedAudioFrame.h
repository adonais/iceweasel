/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

#ifndef MOZILLA_DOM_MEDIA_WEBRTC_JSAPI_RTCENCODEDAUDIOFRAME_H_
#define MOZILLA_DOM_MEDIA_WEBRTC_JSAPI_RTCENCODEDAUDIOFRAME_H_

#include "mozilla/Maybe.h"
#include "mozilla/dom/RTCEncodedAudioFrameBinding.h"
#include "mozilla/dom/RTCEncodedFrameBase.h"
#include "nsIGlobalObject.h"

namespace mozilla::dom {

class RTCStatsTimestampMaker;
class StructuredCloneHolder;
struct RTCEncodedAudioFrameOptions;

// Everything a copy of an RTCEncodedAudioFrame carries apart from the data
// buffer itself, which travels in the clone stream (see
// RTCEncodedFrameBase::WriteData). Used only to ferry a copy to the new frame,
// either while structured cloning, or while copy constructing.
struct RTCEncodedAudioFrameData {
  RTCEncodedAudioFrameMetadata mMetadata;
};

// Wraps a libwebrtc frame, allowing the frame buffer to be modified, and
// providing read-only access to various metadata. After the libwebrtc frame is
// extracted (with RTCEncodedFrameBase::TakeFrame), the frame buffer is
// detached, but the metadata remains accessible.
class RTCEncodedAudioFrame final : public RTCEncodedFrameBase {
 public:
  explicit RTCEncodedAudioFrame(
      nsIGlobalObject* aGlobal,
      std::unique_ptr<webrtc::TransformableFrameInterface> aFrame,
      uint64_t aCounter, RTCRtpScriptTransformer* aOwner,
      const Maybe<RTCStatsTimestampMaker>& aTimestampMaker);

  // For structured clone and copy construction. JS engine supplies the buffer.
  RTCEncodedAudioFrame(nsIGlobalObject* aGlobal, RTCEncodedAudioFrameData aData,
                       JS::Handle<JSObject*> aBuffer);

  // webidl (data accessors live in base class)
  JSObject* WrapObject(JSContext* aCx,
                       JS::Handle<JSObject*> aGivenProto) override;

  static already_AddRefed<RTCEncodedAudioFrame> Constructor(
      const GlobalObject& aGlobal, const RTCEncodedAudioFrame& aOriginalFrame,
      const RTCEncodedAudioFrameOptions& aOptions, ErrorResult& aRv);

  // legacy name for the rtpTimestamp in the metadata
  unsigned long Timestamp() const;

  void GetMetadata(RTCEncodedAudioFrameMetadata& aMetadata) const;

  static JSObject* ReadStructuredClone(JSContext* aCx, nsIGlobalObject* aGlobal,
                                       JSStructuredCloneReader* aReader,
                                       RTCEncodedAudioFrameData aData);
  bool WriteStructuredClone(JSContext* aCx, JSStructuredCloneWriter* aWriter,
                            StructuredCloneHolder* aHolder) const;

 private:
  virtual ~RTCEncodedAudioFrame() = default;

  RTCEncodedAudioFrameData CloneMetadata() const;

  // RTCEncodedAudioFrame can run on either main thread or worker thread.
  void AssertIsOnOwningThread() const {
    NS_ASSERT_OWNINGTHREAD(RTCEncodedAudioFrame);
  }

  RTCEncodedAudioFrameMetadata mMetadata;
};

}  // namespace mozilla::dom
#endif  // MOZILLA_DOM_MEDIA_WEBRTC_JSAPI_RTCENCODEDAUDIOFRAME_H_
