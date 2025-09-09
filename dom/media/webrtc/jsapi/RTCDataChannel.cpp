/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "RTCDataChannel.h"

#include "DataChannel.h"
#include "DataChannelLog.h"
#include "RTCDataChannelDeclarations.h"
#include "base/basictypes.h"
#include "mozilla/DOMEventTargetHelper.h"
#include "mozilla/EventListenerManager.h"
#include "mozilla/Logging.h"
#include "mozilla/dom/Blob.h"
#include "mozilla/dom/File.h"
#include "mozilla/dom/MessageEvent.h"
#include "mozilla/dom/MessageEventBinding.h"
#include "mozilla/dom/RTCStatsReportBinding.h"
#include "mozilla/dom/ScriptSettings.h"
#include "mozilla/dom/ToJSValue.h"
#include "mozilla/dom/TypedArray.h"
#include "nsContentUtils.h"
#include "nsCycleCollectionParticipant.h"
#include "nsError.h"
#include "nsIScriptContext.h"
#include "nsIScriptObjectPrincipal.h"
#include "nsProxyRelease.h"
#include "nsThreadManager.h"

// Since we've moved the windows.h include down here, we have to explicitly
// undef GetBinaryType, otherwise we'll get really odd conflicts
#ifdef GetBinaryType
#  undef GetBinaryType
#endif

namespace mozilla {
namespace dom {

static constexpr const char* ToString(RTCDataChannelState state) {
  switch (state) {
    case RTCDataChannelState::Connecting:
      return "connecting";
    case RTCDataChannelState::Open:
      return "open";
    case RTCDataChannelState::Closing:
      return "closing";
    case RTCDataChannelState::Closed:
      return "closed";
  }
  return "";
};

RTCDataChannel::~RTCDataChannel() {
  // Don't call us anymore!  Likely isn't an issue (or maybe just less of
  // one) once we block GC until all the (appropriate) onXxxx handlers
  // are dropped. (See WebRTC spec)
  DC_DEBUG(("%p: Close()ing %p", this, mDataChannel.get()));
  mDataChannel->SetDomDataChannel(nullptr);
  mDataChannel->FinishClose();
}

/* virtual */
JSObject* RTCDataChannel::WrapObject(JSContext* aCx,
                                     JS::Handle<JSObject*> aGivenProto) {
  return RTCDataChannel_Binding::Wrap(aCx, this, aGivenProto);
}

NS_IMPL_CYCLE_COLLECTION_CLASS(RTCDataChannel)

NS_IMPL_CYCLE_COLLECTION_TRAVERSE_BEGIN_INHERITED(RTCDataChannel,
                                                  DOMEventTargetHelper)
NS_IMPL_CYCLE_COLLECTION_TRAVERSE_END

NS_IMPL_CYCLE_COLLECTION_UNLINK_BEGIN_INHERITED(RTCDataChannel,
                                                DOMEventTargetHelper)
NS_IMPL_CYCLE_COLLECTION_UNLINK_END

NS_IMPL_ADDREF_INHERITED(RTCDataChannel, DOMEventTargetHelper)
NS_IMPL_RELEASE_INHERITED(RTCDataChannel, DOMEventTargetHelper)

NS_INTERFACE_MAP_BEGIN_CYCLE_COLLECTION(RTCDataChannel)
NS_INTERFACE_MAP_END_INHERITING(DOMEventTargetHelper)

RTCDataChannel::RTCDataChannel(const nsACString& aLabel, bool aOrdered,
                               Nullable<uint16_t> aMaxLifeTime,
                               Nullable<uint16_t> aMaxRetransmits,
                               const nsACString& aProtocol, bool aNegotiated,
                               already_AddRefed<DataChannel>& aDataChannel,
                               nsPIDOMWindowInner* aWindow)
    : DOMEventTargetHelper(aWindow),
      mUuid(nsID::GenerateUUID()),
      mLabel(aLabel),
      mOrdered(aOrdered),
      mMaxPacketLifeTime(aMaxLifeTime),
      mMaxRetransmits(aMaxRetransmits),
      mProtocol(aProtocol),
      mNegotiated(aNegotiated),
      mDataChannel(aDataChannel) {}

nsresult RTCDataChannel::Init(nsPIDOMWindowInner* aDOMWindow) {
  nsresult rv;
  nsAutoString urlParam;

  MOZ_ASSERT(mDataChannel);
  mDataChannel->SetDomDataChannel(this);

  // Now grovel through the objects to get a usable origin for onMessage
  nsCOMPtr<nsIScriptGlobalObject> sgo = do_QueryInterface(aDOMWindow);
  NS_ENSURE_STATE(sgo);
  nsCOMPtr<nsIScriptContext> scriptContext = sgo->GetContext();
  NS_ENSURE_STATE(scriptContext);

  nsCOMPtr<nsIScriptObjectPrincipal> scriptPrincipal(
      do_QueryInterface(aDOMWindow));
  NS_ENSURE_STATE(scriptPrincipal);
  nsCOMPtr<nsIPrincipal> principal = scriptPrincipal->GetPrincipal();
  NS_ENSURE_STATE(principal);

  // Attempt to kill "ghost" DataChannel (if one can happen): but usually too
  // early for check to fail
  rv = CheckCurrentGlobalCorrectness();
  NS_ENSURE_SUCCESS(rv, rv);

  rv = nsContentUtils::GetWebExposedOriginSerialization(principal, mOrigin);
  DC_DEBUG(("%s: origin = %s\n", __FUNCTION__,
            NS_LossyConvertUTF16toASCII(mOrigin).get()));
  return rv;
}

// Most of the GetFoo()/SetFoo()s don't need to touch shared resources and
// are safe after Close()
void RTCDataChannel::GetLabel(nsACString& aLabel) const { aLabel = mLabel; }

void RTCDataChannel::GetProtocol(nsACString& aProtocol) const {
  aProtocol = mProtocol;
}

Nullable<uint16_t> RTCDataChannel::GetId() const { return mId; }

void RTCDataChannel::SetId(uint16_t aId) { mId.SetValue(aId); }

void RTCDataChannel::SetMaxMessageSize(double aMaxMessageSize) {
  mMaxMessageSize = aMaxMessageSize;
}

Nullable<uint16_t> RTCDataChannel::GetMaxPacketLifeTime() const {
  return mMaxPacketLifeTime;
}

Nullable<uint16_t> RTCDataChannel::GetMaxRetransmits() const {
  return mMaxRetransmits;
}

bool RTCDataChannel::Negotiated() const { return mNegotiated; }

bool RTCDataChannel::Ordered() const { return mOrdered; }

RTCDataChannelState RTCDataChannel::ReadyState() const { return mReadyState; }

void RTCDataChannel::SetReadyState(const RTCDataChannelState aState) {
  MOZ_ASSERT(NS_IsMainThread());

  DC_DEBUG(
      ("RTCDataChannel labeled %s(%p) (stream %d) changing ready "
       "state "
       "%s -> %s",
       mLabel.get(), this, mId.IsNull() ? INVALID_STREAM : mId.Value(),
       ToString(mReadyState), ToString(aState)));

  mReadyState = aState;
}

size_t RTCDataChannel::BufferedAmount() const { return mBufferedAmount; }

size_t RTCDataChannel::BufferedAmountLowThreshold() const {
  return mBufferedThreshold;
}

void RTCDataChannel::SetBufferedAmountLowThreshold(size_t aThreshold) {
  mBufferedThreshold = aThreshold;
}

void RTCDataChannel::Close() {
  // close()

  // Closes the RTCDataChannel. It may be called regardless of whether the
  // RTCDataChannel object was created by this peer or the remote peer.

  // When the close method is called, the user agent MUST run the following
  // steps:

  // Let channel be the RTCDataChannel object which is about to be closed.

  // If channel.[[ReadyState]] is "closing" or "closed", then abort these
  // steps.
  if (mReadyState == RTCDataChannelState::Closed ||
      mReadyState == RTCDataChannelState::Closing) {
    DC_DEBUG(("Channel already closing/closed (%s)", ToString(mReadyState)));
    return;
  }

  // Set channel.[[ReadyState]] to "closing".
  SetReadyState(RTCDataChannelState::Closing);

  // If the closing procedure has not started yet, start it.
  GracefulClose();

  UpdateMustKeepAlive();
}

void RTCDataChannel::Send(const nsAString& aData, ErrorResult& aRv) {
  if (!CheckReadyState(aRv)) {
    return;
  }

  if (!CheckSendSize(aData.Length(), aRv)) {
    return;
  }

  nsCString msgString;
  if (!AppendUTF16toUTF8(aData, msgString, fallible_t())) {
    // Hmm, our max size was smaller than we thought...
    aRv.Throw(NS_ERROR_FILE_TOO_BIG);
    return;
  }

  size_t length = msgString.Length();
  if (!mDataChannel->SendMsg(std::move(msgString))) {
    IncrementBufferedAmount(length);
  } else {
    aRv.ThrowOperationError("Failed to queue message");
  }
}

void RTCDataChannel::Send(Blob& aData, ErrorResult& aRv) {
  MOZ_ASSERT(NS_IsMainThread(), "Not running on main thread");

  if (!CheckReadyState(aRv)) {
    return;
  }

  uint64_t msgLength = aData.GetSize(aRv);
  if (NS_WARN_IF(aRv.Failed())) {
    return;
  }

  if (!CheckSendSize(msgLength, aRv)) {
    return;
  }

  nsCOMPtr<nsIInputStream> msgStream;
  aData.CreateInputStream(getter_AddRefs(msgStream), aRv);
  if (NS_WARN_IF(aRv.Failed())) {
    return;
  }

  // TODO: If we cannot support this, it needs to be declared during negotiation
  if (msgLength > UINT32_MAX) {
    aRv.Throw(NS_ERROR_FILE_TOO_BIG);
    return;
  }

  if (!mDataChannel->SendBinaryBlob(msgStream)) {
    IncrementBufferedAmount(msgLength);
  } else {
    aRv.ThrowOperationError("Failed to queue message");
  }
}

void RTCDataChannel::Send(const ArrayBuffer& aData, ErrorResult& aRv) {
  MOZ_ASSERT(NS_IsMainThread(), "Not running on main thread");

  if (!CheckReadyState(aRv)) {
    return;
  }

  nsCString msgString;
  if (!aData.AppendDataTo(msgString)) {
    aRv.Throw(NS_ERROR_FILE_TOO_BIG);
    return;
  }

  if (!CheckSendSize(msgString.Length(), aRv)) {
    return;
  }

  size_t length = msgString.Length();
  if (!mDataChannel->SendBinaryMsg(std::move(msgString))) {
    IncrementBufferedAmount(length);
  } else {
    aRv.ThrowOperationError("Failed to queue message");
  }
}

void RTCDataChannel::Send(const ArrayBufferView& aData, ErrorResult& aRv) {
  MOZ_ASSERT(NS_IsMainThread(), "Not running on main thread");

  if (!CheckReadyState(aRv)) {
    return;
  }

  nsCString msgString;
  if (!aData.AppendDataTo(msgString)) {
    aRv.Throw(NS_ERROR_FILE_TOO_BIG);
    return;
  }

  if (!CheckSendSize(msgString.Length(), aRv)) {
    return;
  }

  size_t length = msgString.Length();
  if (!mDataChannel->SendBinaryMsg(std::move(msgString))) {
    ++mMessagesSent;
    mBytesSent += length;
    IncrementBufferedAmount(length);
  } else {
    aRv.ThrowOperationError("Failed to queue message");
  }
}

void RTCDataChannel::GracefulClose() {
  // An RTCDataChannel object's underlying data transport may be torn down in a
  // non-abrupt manner by running the closing procedure. When that happens the
  // user agent MUST queue a task to run the following steps:

  GetCurrentSerialEventTarget()->Dispatch(NS_NewRunnableFunction(
      __func__, [this, self = RefPtr<RTCDataChannel>(this)]() {
        // Let channel be the RTCDataChannel object whose underlying data
        // transport was closed.

        // Let connection be the RTCPeerConnection object associated with
        // channel.

        // Remove channel from connection.[[DataChannels]].
        // Note: We don't really have this slot. Reading the spec, it does not
        // appear this serves any function other than holding a ref to the
        // RTCDataChannel, which in our case is handled by mSelfRef.

        // Unless the procedure was initiated by channel.close, set
        // channel.[[ReadyState]] to "closing" and fire an event named closing
        // at channel. Note: channel.close will set [[ReadyState]] to Closing.
        // We also check for closed, just as belt and suspenders.
        if (mReadyState != RTCDataChannelState::Closing &&
            mReadyState != RTCDataChannelState::Closed) {
          SetReadyState(RTCDataChannelState::Closing);
          // TODO(bug 1611953): Fire event
        }

        // Run the following steps in parallel:
        // Finish sending all currently pending messages of the channel.
        // Note: We detect when all pending messages are sent with
        // mBufferedAmount. We do an initial check here, and subsequent checks
        // in DecrementBufferedAmount.
        // Caveat(bug 1979692): mBufferedAmount is decremented when the bytes
        // are first transmitted, _not_ when they are acked. We might need to do
        // some work to ensure that the SCTP stack has delivered these last
        // bytes to the other end before that channel/connection is fully
        // closed.
        if (!mBufferedAmount && mReadyState != RTCDataChannelState::Closed &&
            mDataChannel) {
          mDataChannel->FinishClose();
        }
      }));
}

void RTCDataChannel::AnnounceOpen() {
  // If the associated RTCPeerConnection object's [[IsClosed]] slot is true,
  // abort these steps.
  // TODO(bug 1978901): Fix this

  // Let channel be the RTCDataChannel object to be announced.

  // If channel.[[ReadyState]] is "closing" or "closed", abort these steps.
  if (mReadyState != RTCDataChannelState::Closing &&
      mReadyState != RTCDataChannelState::Closed) {
    // Set channel.[[ReadyState]] to "open".
    SetReadyState(RTCDataChannelState::Open);
    // Fire an event named open at channel.
    DC_DEBUG(("%s: sending open for %s/%s: %u", __FUNCTION__, mLabel.get(),
              mProtocol.get(), mId.Value()));
    OnSimpleEvent(u"open"_ns);
  }
}

void RTCDataChannel::AnnounceClosed() {
  // Let channel be the RTCDataChannel object whose
  // underlying data transport was closed. If
  // channel.[[ReadyState]] is "closed", abort
  // these steps.
  if (mReadyState == RTCDataChannelState::Closed) {
    return;
  }

  // Set channel.[[ReadyState]] to "closed".
  SetReadyState(RTCDataChannelState::Closed);

  // Remove channel from
  // connection.[[DataChannels]] if it is still
  // there. Note: We don't really have this slot.
  // Reading the spec, it does not appear this
  // serves any function other than holding a ref
  // to the RTCDataChannel, which in our case is
  // handled by a self ref in nsDOMDataChannel.

  // If the transport was closed with an error,
  // fire an event named error using the
  // RTCErrorEvent interface with its errorDetail
  // attribute set to "sctp-failure" at channel.
  // Note: We don't support this yet.

  // Fire an event named close at channel.
  OnSimpleEvent(u"close"_ns);
  DontKeepAliveAnyMore();
}

// TODO(bug 1209163): This will need to be converted to MozPromise similar to
// other stats that might not live on main, once this can be on a worker.
void RTCDataChannel::AppendStatsToReport(
    const UniquePtr<dom::RTCStatsCollection>& aReport,
    const DOMHighResTimeStamp aTimestamp) const {
  mozilla::dom::RTCDataChannelStats stats;
  nsString id = u"dc"_ns;
  id.Append(NS_ConvertASCIItoUTF16(mUuid.ToString().get()));
  stats.mId.Construct(id);
  stats.mTimestamp.Construct(aTimestamp);
  stats.mType.Construct(mozilla::dom::RTCStatsType::Data_channel);
  // webrtc-stats says the stats are DOMString, but webrtc-pc says the
  // attributes are USVString.
  stats.mLabel.Construct(NS_ConvertUTF8toUTF16(mLabel));
  stats.mProtocol.Construct(NS_ConvertUTF8toUTF16(mProtocol));
  if (!mId.IsNull()) {
    stats.mDataChannelIdentifier.Construct(mId.Value());
  }
  stats.mState.Construct(mReadyState);

  stats.mMessagesSent.Construct(mMessagesSent);
  stats.mBytesSent.Construct(mBytesSent);
  stats.mMessagesReceived.Construct(mMessagesReceived);
  stats.mBytesReceived.Construct(mBytesReceived);
  if (!aReport->mDataChannelStats.AppendElement(stats, fallible)) {
    mozalloc_handle_oom(0);
  }
}

void RTCDataChannel::IncrementBufferedAmount(size_t aSize) {
  MOZ_ASSERT(NS_IsMainThread());
  mBufferedAmount += aSize;
}

void RTCDataChannel::DecrementBufferedAmount(size_t aSize) {
  MOZ_ASSERT(aSize <= mBufferedAmount);
  aSize = std::min(aSize, mBufferedAmount);
  bool wasLow = mBufferedAmount <= mBufferedThreshold;
  mBufferedAmount -= aSize;
  if (!wasLow && mBufferedAmount <= mBufferedThreshold) {
    DC_DEBUG(("%s: sending bufferedamountlow for %s/%s: %u", __FUNCTION__,
              mLabel.get(), mProtocol.get(), mId.Value()));
    OnSimpleEvent(u"bufferedamountlow"_ns);
  }
  if (mBufferedAmount == 0) {
    DC_DEBUG(("%s: no queued sends for %s/%s: %u", __FUNCTION__, mLabel.get(),
              mProtocol.get(), mId.Value()));
    // In the rare case that we held off GC to let the buffer drain
    UpdateMustKeepAlive();
    if (mReadyState == RTCDataChannelState::Closing) {
      if (mDataChannel) {
        // We're done sending
        mDataChannel->FinishClose();
      }
    }
  }
}

bool RTCDataChannel::CheckSendSize(uint64_t aSize, ErrorResult& aRv) const {
  if (aSize > mMaxMessageSize) {
    nsPrintfCString err("Message size (%" PRIu64 ") exceeds maxMessageSize",
                        aSize);
    aRv.ThrowTypeError(err);
    return false;
  }
  return true;
}

bool RTCDataChannel::CheckReadyState(ErrorResult& aRv) {
  MOZ_ASSERT(NS_IsMainThread());
  // In reality, the DataChannel protocol allows this, but we want it to
  // look like WebSockets
  if (mReadyState == RTCDataChannelState::Connecting) {
    aRv.Throw(NS_ERROR_DOM_INVALID_STATE_ERR);
    return false;
  }

  if (mReadyState == RTCDataChannelState::Closing ||
      mReadyState == RTCDataChannelState::Closed) {
    return false;
  }

  MOZ_ASSERT(mReadyState == RTCDataChannelState::Open,
             "Unknown state in RTCDataChannel::Send");

  return true;
}

nsresult RTCDataChannel::DoOnMessageAvailable(const nsACString& aData,
                                              bool aBinary) {
  MOZ_ASSERT(NS_IsMainThread());

  if (mReadyState == RTCDataChannelState::Closed ||
      mReadyState == RTCDataChannelState::Closing) {
    // Closed by JS, probably
    return NS_OK;
  }

  DC_VERBOSE((
      "DoOnMessageAvailable%s\n",
      aBinary ? ((mBinaryType == DC_BINARY_TYPE_BLOB) ? " (blob)" : " (binary)")
              : ""));

  nsresult rv = CheckCurrentGlobalCorrectness();
  if (NS_FAILED(rv)) {
    return NS_OK;
  }

  AutoJSAPI jsapi;
  if (NS_WARN_IF(!jsapi.Init(GetOwnerWindow()))) {
    return NS_ERROR_FAILURE;
  }
  JSContext* cx = jsapi.cx();

  JS::Rooted<JS::Value> jsData(cx);

  if (aBinary) {
    if (mBinaryType == DC_BINARY_TYPE_BLOB) {
      RefPtr<Blob> blob =
          Blob::CreateStringBlob(GetOwnerGlobal(), aData, u""_ns);
      if (NS_WARN_IF(!blob)) {
        return NS_ERROR_FAILURE;
      }

      if (!ToJSValue(cx, blob, &jsData)) {
        return NS_ERROR_FAILURE;
      }
    } else if (mBinaryType == DC_BINARY_TYPE_ARRAYBUFFER) {
      ErrorResult error;
      JS::Rooted<JSObject*> arrayBuf(cx, ArrayBuffer::Create(cx, aData, error));
      RETURN_NSRESULT_ON_FAILURE(error);
      jsData.setObject(*arrayBuf);
    } else {
      MOZ_CRASH("Unknown binary type!");
      return NS_ERROR_UNEXPECTED;
    }
  } else {
    NS_ConvertUTF8toUTF16 utf16data(aData);
    JSString* jsString =
        JS_NewUCStringCopyN(cx, utf16data.get(), utf16data.Length());
    NS_ENSURE_TRUE(jsString, NS_ERROR_FAILURE);

    jsData.setString(jsString);
  }

  RefPtr<MessageEvent> event = new MessageEvent(this, nullptr, nullptr);

  event->InitMessageEvent(nullptr, u"message"_ns, CanBubble::eNo,
                          Cancelable::eNo, jsData, mOrigin, u""_ns, nullptr,
                          Sequence<OwningNonNull<MessagePort>>());
  event->SetTrusted(true);

  ++mMessagesReceived;
  mBytesReceived += aData.Length();

  DC_DEBUG(
      ("%p(%p): %s - Dispatching\n", this, (void*)mDataChannel, __FUNCTION__));
  ErrorResult err;
  DispatchEvent(*event, err);
  if (err.Failed()) {
    DC_ERROR(("%p(%p): %s - Failed to dispatch message", this,
              (void*)mDataChannel, __FUNCTION__));
    NS_WARNING("Failed to dispatch the message event!!!");
  }
  return err.StealNSResult();
}

nsresult RTCDataChannel::OnSimpleEvent(const nsAString& aName) {
  MOZ_ASSERT(NS_IsMainThread());

  nsresult rv = CheckCurrentGlobalCorrectness();
  if (NS_FAILED(rv)) {
    return NS_OK;
  }

  RefPtr<Event> event = NS_NewDOMEvent(this, nullptr, nullptr);

  event->InitEvent(aName, CanBubble::eNo, Cancelable::eNo);
  event->SetTrusted(true);

  ErrorResult err;
  DispatchEvent(*event, err);
  return err.StealNSResult();
}

//-----------------------------------------------------------------------------
// Methods that keep alive the DataChannel object when:
//   1. the object has registered event listeners that can be triggered
//      ("strong event listeners");
//   2. there are outgoing not sent messages.
//-----------------------------------------------------------------------------

void RTCDataChannel::UpdateMustKeepAlive() {
  MOZ_ASSERT(NS_IsMainThread());

  if (!mCheckMustKeepAlive) {
    return;
  }

  bool shouldKeepAlive = false;

  switch (mReadyState) {
    case RTCDataChannelState::Connecting: {
      if (mListenerManager &&
          (mListenerManager->HasListenersFor(nsGkAtoms::onopen) ||
           mListenerManager->HasListenersFor(nsGkAtoms::onmessage) ||
           mListenerManager->HasListenersFor(nsGkAtoms::onerror) ||
           mListenerManager->HasListenersFor(nsGkAtoms::onbufferedamountlow) ||
           mListenerManager->HasListenersFor(nsGkAtoms::onclose))) {
        shouldKeepAlive = true;
      }
    } break;

    case RTCDataChannelState::Open:
    case RTCDataChannelState::Closing: {
      if (mBufferedAmount != 0 ||
          (mListenerManager &&
           (mListenerManager->HasListenersFor(nsGkAtoms::onmessage) ||
            mListenerManager->HasListenersFor(nsGkAtoms::onerror) ||
            mListenerManager->HasListenersFor(nsGkAtoms::onbufferedamountlow) ||
            mListenerManager->HasListenersFor(nsGkAtoms::onclose)))) {
        shouldKeepAlive = true;
      }
    } break;

    case RTCDataChannelState::Closed: {
      shouldKeepAlive = false;
    }
  }

  if (mSelfRef && !shouldKeepAlive) {
    ReleaseSelf();
  } else if (!mSelfRef && shouldKeepAlive) {
    mSelfRef = this;
  }
}

void RTCDataChannel::DontKeepAliveAnyMore() {
  MOZ_ASSERT(NS_IsMainThread());

  if (mSelfRef) {
    // Since we're on MainThread, force an eventloop trip to avoid deleting
    // ourselves.
    ReleaseSelf();
  }

  mCheckMustKeepAlive = false;
}

void RTCDataChannel::ReleaseSelf() {
  // release our self-reference (safely) by putting it in an event (always)
  NS_ReleaseOnMainThread("RTCDataChannel::mSelfRef", mSelfRef.forget(), true);
}

void RTCDataChannel::EventListenerAdded(nsAtom* aType) {
  MOZ_ASSERT(NS_IsMainThread());
  UpdateMustKeepAlive();
}

void RTCDataChannel::EventListenerRemoved(nsAtom* aType) {
  MOZ_ASSERT(NS_IsMainThread());
  UpdateMustKeepAlive();
}

/* static */
nsresult NS_NewDOMDataChannel(already_AddRefed<DataChannel>&& aDataChannel,
                              const nsACString& aLabel, bool aOrdered,
                              Nullable<uint16_t> aMaxLifeTime,
                              Nullable<uint16_t> aMaxRetransmits,
                              const nsACString& aProtocol, bool aNegotiated,
                              nsPIDOMWindowInner* aWindow,
                              RTCDataChannel** aDomDataChannel) {
  RefPtr<RTCDataChannel> domdc =
      new RTCDataChannel(aLabel, aOrdered, aMaxLifeTime, aMaxRetransmits,
                         aProtocol, aNegotiated, aDataChannel, aWindow);

  nsresult rv = domdc->Init(aWindow);
  NS_ENSURE_SUCCESS(rv, rv);

  domdc.forget(aDomDataChannel);
  return NS_OK;
}

}  // end namespace dom
}  // end namespace mozilla
