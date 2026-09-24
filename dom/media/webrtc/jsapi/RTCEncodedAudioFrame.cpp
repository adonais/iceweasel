/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

#include "jsapi/RTCEncodedAudioFrame.h"

#include <stdint.h>

#include <cmath>  // std::pow
#include <memory>
#include <utility>

#include "api/frame_transformer_interface.h"
#include "js/RootingAPI.h"
#include "jsapi/RTCEncodedFrameBase.h"
#include "jsapi/RTCRtpScriptTransform.h"
#include "jsapi/RTCStatsReport.h"
#include "mozilla/RefPtr.h"
#include "mozilla/dom/RTCEncodedAudioFrameBinding.h"
#include "mozilla/dom/RTCRtpScriptTransformer.h"
#include "mozilla/dom/StructuredCloneHolder.h"
#include "mozilla/dom/StructuredCloneTags.h"
#include "mozilla/fallible.h"
#include "nsContentUtils.h"
#include "nsIGlobalObject.h"

namespace mozilla::dom {

RTCEncodedAudioFrame::RTCEncodedAudioFrame(
    nsIGlobalObject* aGlobal,
    std::unique_ptr<webrtc::TransformableFrameInterface> aFrame,
    uint64_t aCounter, RTCRtpScriptTransformer* aOwner,
    const Maybe<RTCStatsTimestampMaker>& aTimestampMaker)
    : RTCEncodedFrameBase(aGlobal, std::move(aFrame), aCounter, aOwner) {
  mMetadata.mSynchronizationSource.Construct(mFrame->GetSsrc());
  mMetadata.mPayloadType.Construct(mFrame->GetPayloadType());
  mMetadata.mMimeType.Construct(NS_ConvertASCIItoUTF16(mFrame->GetMimeType()));
  mMetadata.mRtpTimestamp.Construct(mFrame->GetTimestamp());
  const DebugOnly<bool> isReceived =
      mFrame->GetDirection() ==
      webrtc::TransformableFrameInterface::Direction::kReceiver;
  MOZ_ASSERT_IF(isReceived, aTimestampMaker);
  MOZ_ASSERT_IF(isReceived, mFrame->ReceiveTime());
  if (aTimestampMaker) {
    if (const auto receiveTime = mFrame->ReceiveTime()) {
      mMetadata.mReceiveTime.Construct(
          RTCStatsTimestamp::FromRealtime(*aTimestampMaker, *receiveTime)
              .ToDomNoTimeOrigin());
    }
  }
  const auto& audioFrame(
      static_cast<webrtc::TransformableAudioFrameInterface&>(*mFrame));
  mMetadata.mContributingSources.Construct();
  for (const auto csrc : audioFrame.GetContributingSources()) {
    (void)mMetadata.mContributingSources.Value().AppendElement(csrc, fallible);
  }
  if (const auto optionalSeqNum = audioFrame.SequenceNumber()) {
    mMetadata.mSequenceNumber.Construct(*optionalSeqNum);
  }
  if (const auto optionalAudioLevel = audioFrame.AudioLevel()) {
    // Audio level is in dBov with a range [0, 127] and needs to be converted.
    // See
    // https://w3c.github.io/webrtc-encoded-transform/#dom-rtcencodedaudioframemetadata-audiolevel
    if (optionalAudioLevel >= 127u) {
      mMetadata.mAudioLevel.Construct(0.0);
    } else {
      mMetadata.mAudioLevel.Construct(
          std::pow(10.0, -static_cast<double>(*optionalAudioLevel) / 20.0));
    }
  }
}

RTCEncodedAudioFrame::RTCEncodedAudioFrame(nsIGlobalObject* aGlobal,
                                           RTCEncodedAudioFrameData aData,
                                           JS::Handle<JSObject*> aBuffer)
    : RTCEncodedFrameBase(aGlobal, aBuffer),
      mMetadata(std::move(aData.mMetadata)) {}

RTCEncodedAudioFrameData RTCEncodedAudioFrame::CloneMetadata() const {
  return {RTCEncodedAudioFrameMetadata(mMetadata)};
}

JSObject* RTCEncodedAudioFrame::WrapObject(JSContext* aCx,
                                           JS::Handle<JSObject*> aGivenProto) {
  return RTCEncodedAudioFrame_Binding::Wrap(aCx, this, aGivenProto);
}

// https://w3c.github.io/webrtc-encoded-transform/#RTCEncodedAudioFrame-constructor
/* static */
already_AddRefed<RTCEncodedAudioFrame> RTCEncodedAudioFrame::Constructor(
    const GlobalObject& aGlobal, const RTCEncodedAudioFrame& aOriginalFrame,
    const RTCEncodedAudioFrameOptions& aOptions, ErrorResult& aRv) {
  nsCOMPtr<nsIGlobalObject> global = do_QueryInterface(aGlobal.GetAsSupports());
  if (!global) {
    aRv.Throw(NS_ERROR_FAILURE);
    return nullptr;
  }

  JSContext* cx = aGlobal.Context();
  JS::Rooted<JSObject*> buffer(cx);
  if (!aOriginalFrame.CopyData(cx, &buffer)) {
    aRv.NoteJSContextException(cx);
    return nullptr;
  }
  auto frame = MakeRefPtr<RTCEncodedAudioFrame>(
      global, aOriginalFrame.CloneMetadata(), buffer);

  if (aOptions.mMetadata.WasPassed()) {
    const auto& src = aOptions.mMetadata.Value();
    auto& dst = frame->mMetadata;

    auto set_if = [](auto& dst, const auto& src) {
      if (!src.WasPassed()) {
        return;
      }
      if (!dst.WasPassed()) {
        // The original frame's metadata need not have the field at all
        dst.Construct();
      }
      dst.Value() = src.Value();
    };
    set_if(dst.mSynchronizationSource, src.mSynchronizationSource);
    set_if(dst.mPayloadType, src.mPayloadType);
    set_if(dst.mMimeType, src.mMimeType);
    set_if(dst.mRtpTimestamp, src.mRtpTimestamp);
    set_if(dst.mReceiveTime, src.mReceiveTime);
    set_if(dst.mContributingSources, src.mContributingSources);
    set_if(dst.mSequenceNumber, src.mSequenceNumber);
    set_if(dst.mAudioLevel, src.mAudioLevel);
  }
  return frame.forget();
}

unsigned long RTCEncodedAudioFrame::Timestamp() const {
  return mMetadata.mRtpTimestamp.WasPassed() ? mMetadata.mRtpTimestamp.Value()
                                             : 0;
}

void RTCEncodedAudioFrame::GetMetadata(
    RTCEncodedAudioFrameMetadata& aMetadata) const {
  aMetadata = mMetadata;
}

// https://www.w3.org/TR/webrtc-encoded-transform/#RTCEncodedAudioFrame-serialization
/* static */
JSObject* RTCEncodedAudioFrame::ReadStructuredClone(
    JSContext* aCx, nsIGlobalObject* aGlobal, JSStructuredCloneReader* aReader,
    RTCEncodedAudioFrameData aData) {
  JS::Rooted<JSObject*> buffer(aCx);
  if (!ReadData(aCx, aReader, &buffer)) {
    return nullptr;
  }

  JS::Rooted<JS::Value> value(aCx, JS::NullValue());
  // To avoid a rooting hazard error from returning a raw JSObject* before
  // running the RefPtr destructor, RefPtr needs to be destructed before
  // returning the raw JSObject*, which is why the RefPtr<RTCEncodedAudioFrame>
  // is created in the scope below. Otherwise, the static analysis infers the
  // RefPtr cannot be safely destructed while the unrooted return JSObject* is
  // on the stack.
  {
    auto frame =
        MakeRefPtr<RTCEncodedAudioFrame>(aGlobal, std::move(aData), buffer);
    if (!GetOrCreateDOMReflector(aCx, frame, &value) || !value.isObject()) {
      return nullptr;
    }
  }
  return value.toObjectOrNull();
}

bool RTCEncodedAudioFrame::WriteStructuredClone(
    JSContext* aCx, JSStructuredCloneWriter* aWriter,
    StructuredCloneHolder* aHolder) const {
  AssertIsOnOwningThread();

  // Indexing the chunk and send the index to the receiver. The data buffer
  // follows the pair in the stream; only the metadata needs the side channel.
  const uint32_t index =
      static_cast<uint32_t>(aHolder->RtcEncodedAudioFrames().Length());
  if (NS_WARN_IF(!JS_WriteUint32Pair(aWriter, SCTAG_DOM_RTCENCODEDAUDIOFRAME,
                                     index)) ||
      !WriteData(aCx, aWriter)) {
    return false;
  }

  aHolder->RtcEncodedAudioFrames().AppendElement(CloneMetadata());
  return true;
}

}  // namespace mozilla::dom
