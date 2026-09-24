/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "RTCDTMFSender.h"

#include <algorithm>
#include <bitset>

#include "RTCRtpTransceiver.h"
#include "mozilla/dom/RTCDTMFSenderBinding.h"
#include "mozilla/dom/RTCDTMFToneChangeEvent.h"
#include "nsITimer.h"
#include "transport/logging.h"

namespace mozilla::dom {

NS_IMPL_CYCLE_COLLECTION_INHERITED(RTCDTMFSender, DOMEventTargetHelper,
                                   mTransceiver, mSendTimer)

NS_IMPL_ADDREF_INHERITED(RTCDTMFSender, DOMEventTargetHelper)
NS_IMPL_RELEASE_INHERITED(RTCDTMFSender, DOMEventTargetHelper)

NS_INTERFACE_MAP_BEGIN_CYCLE_COLLECTION(RTCDTMFSender)
  NS_WRAPPERCACHE_INTERFACE_MAP_ENTRY
  NS_INTERFACE_MAP_ENTRY(nsITimerCallback)
  NS_INTERFACE_MAP_ENTRY(nsINamed)
NS_INTERFACE_MAP_END_INHERITING(DOMEventTargetHelper)

LazyLogModule gDtmfLog("RTCDTMFSender");

RTCDTMFSender::RTCDTMFSender(nsPIDOMWindowInner* aWindow,
                             RTCRtpTransceiver* aTransceiver)
    : DOMEventTargetHelper(aWindow), mTransceiver(aTransceiver) {}

JSObject* RTCDTMFSender::WrapObject(JSContext* aCx,
                                    JS::Handle<JSObject*> aGivenProto) {
  return RTCDTMFSender_Binding::Wrap(aCx, this, aGivenProto);
}

static int GetDTMFToneCode(uint16_t c) {
  const char* DTMF_TONECODES = "0123456789*#ABCD";

  if (c == ',') {
    // , is a special character indicating a 2 second delay
    return -1;
  }

  const char* i = strchr(DTMF_TONECODES, c);
  MOZ_ASSERT(i);
  return static_cast<int>(i - DTMF_TONECODES);
}

static std::bitset<256> GetCharacterBitset(const std::string& aCharsInSet) {
  std::bitset<256> result;
  for (unsigned char c : aCharsInSet) {
    result[c] = true;
  }
  return result;
}

static bool IsUnrecognizedChar(const unsigned char c) {
  static const std::bitset<256> recognized =
      GetCharacterBitset("0123456789ABCD#*,");
  return !recognized[c];
}

void RTCDTMFSender::SetPayloadType(int32_t aPayloadType,
                                   int32_t aPayloadFrequency) {
  MOZ_ASSERT(NS_IsMainThread());
  mPayloadType = Some(aPayloadType);
  mPayloadFrequency = Some(aPayloadFrequency);
}

bool RTCDTMFSender::CanInsertDTMF() const {
  return mTransceiver->CanSendDTMF();
}

void RTCDTMFSender::InsertDTMF(const nsAString& aTones, uint32_t aDuration,
                               uint32_t aInterToneGap, ErrorResult& aRv) {
  // If determine if DTMF can be sent for dtmf returns false, throw an
  // InvalidStateError.
  if (!mTransceiver->CanSendDTMF()) {
    aRv.Throw(NS_ERROR_DOM_INVALID_STATE_ERR);
    return;
  }

  std::string utf8Tones = NS_ConvertUTF16toUTF8(aTones).get();

  std::transform(utf8Tones.begin(), utf8Tones.end(), utf8Tones.begin(),
                 [](const unsigned char c) { return std::toupper(c); });

  // If tones contains any unrecognized characters, throw an
  // InvalidCharacterError.
  if (std::any_of(utf8Tones.begin(), utf8Tones.end(), IsUnrecognizedChar)) {
    aRv.Throw(NS_ERROR_DOM_INVALID_CHARACTER_ERR);
    return;
  }

  // Set the object's [[ToneBuffer]] slot to tones.
  CopyUTF8toUTF16(utf8Tones, mToneBuffer);

  // Set dtmf.[[Duration]] to the value of duration.
  // If the value of duration is less than 40 ms, set dtmf.[[Duration]] to 40
  // ms.
  // If the value of duration parameter is greater than 6000 ms, set
  // dtmf.[[Duration]] to 6000 ms.
  mDuration = std::clamp(aDuration, 40U, 6000U);

  // Set dtmf.[[InterToneGap]] to the value of interToneGap.
  // If the value of interToneGap is less than 30 ms, set dtmf.[[InterToneGap]]
  // to 30 ms.
  // If the value of interToneGap is greater than 6000 ms, set
  // dtmf.[[InterToneGap]] to 6000 ms.
  mInterToneGap = std::clamp(aInterToneGap, 30U, 6000U);

  // If [[ToneBuffer]] slot is an empty string, abort these steps.
  if (!mToneBuffer.Length()) {
    return;
  }

  // If a task to run the DTMF playout task steps is scheduled to be run, abort
  // these steps; otherwise queue a task that runs the following DTMF playout
  // task steps:
  if (!mPlayoutScheduled) {
    mPlayoutScheduled = true;
    GetCurrentSerialEventTarget()->Dispatch(NS_NewRunnableFunction(
        __func__,
        [this, self = RefPtr<RTCDTMFSender>(this)]() { DoPlayout(); }));
  }
}

void RTCDTMFSender::SchedulePlayout(uint32_t aDelay) {
  MOZ_ASSERT(NS_IsMainThread());
  if (!mSendTimer) {
    mSendTimer = NS_NewTimer();
    mSendTimer->InitWithCallback(this, aDelay, nsITimer::TYPE_ONE_SHOT);
    mPlayoutScheduled = true;
  }
}

nsresult RTCDTMFSender::Notify(nsITimer*) {
  MOZ_ASSERT(NS_IsMainThread());
  if (mSendTimer) {
    mSendTimer->Cancel();
    mSendTimer = nullptr;
  }
  DoPlayout();
  return NS_OK;
}

// This is "DTMF playout task steps" from webrtc-pc
void RTCDTMFSender::DoPlayout() {
  MOZ_ASSERT(NS_IsMainThread());
  mPlayoutScheduled = false;

  // If determine if DTMF can be sent for dtmf returns false, abort these
  // steps.
  if (!mTransceiver->CanSendDTMF()) {
    return;
  }

  // If the [[ToneBuffer]] slot is the empty string, fire an event named
  // tonechange using the RTCDTMFToneChangeEvent interface with the tone
  // attribute set to an empty string at the RTCDTMFSender object and abort
  // these steps.
  RTCDTMFToneChangeEventInit init;
  if (!mToneBuffer.IsEmpty()) {
    // Remove the first character from the [[ToneBuffer]] slot and let that
    // character be tone.
    uint16_t toneChar = mToneBuffer.CharAt(0);
    int tone = GetDTMFToneCode(toneChar);
    init.mTone.Assign(toneChar);
    mToneBuffer.Cut(0, 1);

    if (tone == -1) {
      // If tone is "," delay sending tones for 2000 ms on the associated RTP
      // media stream, and queue a task to be executed in 2000 ms from now that
      // runs the DTMF playout task steps.
      SchedulePlayout(2000);
    } else {
      // If tone is not "," start playout of tone for [[Duration]] ms on the
      // associated RTP media stream, using the appropriate codec, then queue a
      // task to be executed in [[Duration]] + [[InterToneGap]] ms from now
      // that runs the DTMF playout task steps.
      mDtmfEvent.Notify(DtmfEvent(mPayloadType.ref(), mPayloadFrequency.ref(),
                                  tone, mDuration));
      SchedulePlayout(mDuration + mInterToneGap);
    }
  }

  // Fire an event named tonechange using the RTCDTMFToneChangeEvent interface
  // with the tone attribute set to tone at the RTCDTMFSender object.
  RefPtr<RTCDTMFToneChangeEvent> event =
      RTCDTMFToneChangeEvent::Constructor(this, u"tonechange"_ns, init);
  DispatchTrustedEvent(event);
}

nsresult RTCDTMFSender::GetName(nsACString& aName) {
  aName.AssignLiteral("RTCDTMFSender");
  return NS_OK;
}

void RTCDTMFSender::GetToneBuffer(nsAString& aOutToneBuffer) {
  aOutToneBuffer = mToneBuffer;
}

}  // namespace mozilla::dom

#undef LOGTAG
