/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "mozilla/dom/WebTransportSendStream.h"

#include "mozilla/CycleCollectedJSContext.h"
#include "mozilla/dom/AbortFollower.h"
#include "mozilla/dom/AbortSignal.h"
#include "mozilla/dom/Promise.h"
#include "mozilla/dom/ScriptSettings.h"
#include "mozilla/dom/UnderlyingSinkCallbackHelpers.h"
#include "mozilla/dom/WebTransport.h"
#include "mozilla/dom/WebTransportSendGroup.h"
#include "mozilla/dom/WebTransportSendReceiveStreamBinding.h"
#include "mozilla/dom/WritableStream.h"
#include "mozilla/dom/WritableStreamDefaultController.h"
#include "mozilla/ipc/DataPipe.h"

using namespace mozilla::ipc;

namespace mozilla::dom {

NS_IMPL_CYCLE_COLLECTION_INHERITED(WebTransportSendStream, WritableStream,
                                   mTransport, mSendGroup)
NS_IMPL_ADDREF_INHERITED(WebTransportSendStream, WritableStream)
NS_IMPL_RELEASE_INHERITED(WebTransportSendStream, WritableStream)
NS_INTERFACE_MAP_BEGIN_CYCLE_COLLECTION(WebTransportSendStream)
NS_INTERFACE_MAP_END_INHERITING(WritableStream)

WebTransportSendStream::WebTransportSendStream(nsIGlobalObject* aGlobal,
                                               WebTransport* aTransport)
    : WritableStream(aGlobal,
                     WritableStream::HoldDropJSObjectsCaller::Explicit),
      mTransport(aTransport) {
  mozilla::HoldJSObjects(this);
}

WebTransportSendStream::~WebTransportSendStream() {
  mozilla::DropJSObjects(this);
}

JSObject* WebTransportSendStream::WrapObject(
    JSContext* aCx, JS::Handle<JSObject*> aGivenProto) {
  return WebTransportSendStream_Binding::Wrap(aCx, this, aGivenProto);
}

namespace {

// Adds [[PendingOperation]] for close() to the generic output sink, so an
// abort() racing an in-flight close() resets the stream and rejects the close.
class WebTransportSendStreamSink final
    : public WritableStreamToOutputAlgorithms {
 public:
  NS_DECL_ISUPPORTS_INHERITED
  NS_DECL_CYCLE_COLLECTION_CLASS_INHERITED(WebTransportSendStreamSink,
                                           WritableStreamToOutputAlgorithms)

  WebTransportSendStreamSink(nsIGlobalObject* aParent,
                             nsIAsyncOutputStream* aOutput)
      : WritableStreamToOutputAlgorithms(aParent, aOutput) {}

  // https://w3c.github.io/webtransport/#webtransportsendstream-close
  already_AddRefed<Promise> CloseCallbackImpl(JSContext* aCx,
                                              ErrorResult& aRv) override;

  // ClearAlgorithms() runs right after the close algorithm; while a close is
  // deferred the FIN is sent from IssueDeferredClose() instead.
  void ReleaseObjects() override {
    if (!mPendingClose) {
      WritableStreamToOutputAlgorithms::ReleaseObjects();
    }
  }

  void IssueDeferredClose();

  // https://w3c.github.io/webtransport/#webtransportsendstream-create
  // Step 7: Add the following steps to abortSignal.
  void RunAbortSignalSteps(AbortSignalImpl* aSignal);

 private:
  ~WebTransportSendStreamSink() override = default;

  // The close() promise while its FIN has not been sent yet.
  RefPtr<Promise> mPendingClose;
};

NS_IMPL_CYCLE_COLLECTION_INHERITED(WebTransportSendStreamSink,
                                   WritableStreamToOutputAlgorithms,
                                   mPendingClose)
NS_IMPL_ADDREF_INHERITED(WebTransportSendStreamSink,
                         WritableStreamToOutputAlgorithms)
NS_IMPL_RELEASE_INHERITED(WebTransportSendStreamSink,
                          WritableStreamToOutputAlgorithms)
NS_INTERFACE_MAP_BEGIN_CYCLE_COLLECTION(WebTransportSendStreamSink)
NS_INTERFACE_MAP_END_INHERITING(WritableStreamToOutputAlgorithms)

class DeferredCloseMicroTask final : public MicroTaskRunnable {
 public:
  explicit DeferredCloseMicroTask(WebTransportSendStreamSink* aSink)
      : mSink(aSink) {}

  MOZ_CAN_RUN_SCRIPT_BOUNDARY void Run(AutoSlowOperation& aAso) override {
    mSink->IssueDeferredClose();
  }

 private:
  RefPtr<WebTransportSendStreamSink> mSink;
};

already_AddRefed<Promise> WebTransportSendStreamSink::CloseCallbackImpl(
    JSContext* aCx, ErrorResult& aRv) {
  // Step 2: Let promise be a new promise.
  RefPtr<Promise> promise = Promise::CreateInfallible(GetParent());

  // Step 3: Remove stream from transport.[[SendStreams]].
  // Not implemented; entries stay until transport cleanup.

  // Step 4: Set stream.[[PendingOperation]] to promise.
  mPendingClose = promise;

  // Step 5: Run the following steps in parallel:
  // Steps 5.1-5.3 run in IssueDeferredClose().  The FIN goes out from a
  // microtask so that an abort() in the same turn still finds it unsent and
  // can reset the stream instead.
  CycleCollectedJSContext::Get()->DispatchToMicroTask(
      MakeAndAddRef<DeferredCloseMicroTask>(this));

  // Step 6: Return promise.
  return promise.forget();
}

void WebTransportSendStreamSink::IssueDeferredClose() {
  RefPtr<Promise> promise = std::move(mPendingClose);
  if (!promise) {
    // An abort preempted the close and already reset the stream.
    return;
  }

  // Step 5.1: Send FIN on stream.[[InternalStream]] and wait for the
  // operation to complete.
  CloseOutput();

  // Step 5.2: Wait for stream.[[InternalStream]] to enter the "all data
  // committed" state.
  // Step 5.3: Queue a network task with transport to run these steps:
  // Step 5.3.1: Set stream.[[PendingOperation]] to null.
  // Step 5.3.2: Resolve promise with undefined.
  // Nothing waits for the commit: the promise resolves once the FIN is in the
  // pipe, so [[PendingOperation]] spans only the microtask that got us here
  // rather than the window the spec gives it (see bug 2073981).
  promise->MaybeResolveWithUndefined();
}

void WebTransportSendStreamSink::RunAbortSignalSteps(AbortSignalImpl* aSignal) {
  // Step 7.1: Let pendingOperation be stream.[[PendingOperation]].
  // Step 7.2: If pendingOperation is null, then abort these steps.
  // Step 7.3: Set stream.[[PendingOperation]] to null.
  RefPtr<Promise> pendingOperation = std::move(mPendingClose);
  if (!pendingOperation) {
    return;
  }

  AutoJSAPI jsapi;
  if (!jsapi.Init(GetParent())) {
    return;
  }
  JSContext* cx = jsapi.cx();

  // Step 7.4: Let reason be abortSignal's abort reason.
  JS::Rooted<JS::Value> reason(cx);
  aSignal->GetReason(cx, &reason);

  // Step 7.5: Let promise be the result of aborting stream with reason.
  // Closing the pipe with an error status makes the parent send RESET_STREAM
  // instead of the FIN.
  Optional<JS::Handle<JS::Value>> optionalReason(cx, reason);
  CloseOutputWithStatus(BuildErrorStatus(cx, optionalReason));

  // Step 7.6: Upon fulfillment of promise, reject pendingOperation with
  // reason.
  // Aborting completes synchronously, so there is no promise to wait on.
  pendingOperation->MaybeReject(reason);
}

class SendStreamAbortWatcher final : public AbortFollower {
 public:
  NS_DECL_CYCLE_COLLECTING_ISUPPORTS_FINAL
  NS_DECL_CYCLE_COLLECTION_CLASS(SendStreamAbortWatcher)

  explicit SendStreamAbortWatcher(WebTransportSendStreamSink* aSink)
      : mSink(aSink) {}

  void RunAbortAlgorithm() override {
    RefPtr<WebTransportSendStreamSink> sink = mSink;
    sink->RunAbortSignalSteps(Signal());
  }

 private:
  ~SendStreamAbortWatcher() = default;

  RefPtr<WebTransportSendStreamSink> mSink;
};

NS_IMPL_CYCLE_COLLECTION(SendStreamAbortWatcher, mSink)
NS_IMPL_CYCLE_COLLECTING_ADDREF(SendStreamAbortWatcher)
NS_IMPL_CYCLE_COLLECTING_RELEASE(SendStreamAbortWatcher)
NS_INTERFACE_MAP_BEGIN_CYCLE_COLLECTION(SendStreamAbortWatcher)
  NS_INTERFACE_MAP_ENTRY(nsISupports)
NS_INTERFACE_MAP_END

}  // namespace

// NOTE: this does not yet implement SendOrder; see bug 1816925
/* static */
already_AddRefed<WebTransportSendStream> WebTransportSendStream::Create(
    WebTransport* aWebTransport, nsIGlobalObject* aGlobal, uint64_t aStreamId,
    DataPipeSender* aSender, int64_t aSendOrder,
    WebTransportSendGroup* aSendGroup, ErrorResult& aRv) {
  // https://w3c.github.io/webtransport/#webtransportsendstream-create
  AutoJSAPI jsapi;
  if (!jsapi.Init(aGlobal)) {
    return nullptr;
  }
  JSContext* cx = jsapi.cx();

  auto stream = MakeRefPtr<WebTransportSendStream>(aGlobal, aWebTransport);

  nsCOMPtr<nsIAsyncOutputStream> outputStream = aSender;
  auto algorithms = MakeRefPtr<WebTransportSendStreamSink>(
      stream->GetParentObject(), outputStream);

  stream->mStreamId = aStreamId;
  stream->mSendGroup = aSendGroup;

  stream->mSendOrder = aSendOrder;

  // Steps 2-5
  RefPtr<QueuingStrategySize> writableSizeAlgorithm;
  stream->SetUpNative(cx, *algorithms, Nothing(), writableSizeAlgorithm, aRv);

  // Step 6: Let abortSignal be stream's [[controller]].[[abortController]].
  // [[signal]].
  // Step 7: Add the following steps to abortSignal.  (Implemented in
  // WebTransportSendStreamSink::RunAbortSignalSteps.)  The signal holds a
  // strong reference to its followers, so the watcher needs no other owner.
  if (WritableStreamDefaultController* controller = stream->Controller()) {
    if (AbortSignal* signal = controller->Signal()) {
      MakeRefPtr<SendStreamAbortWatcher>(algorithms)->Follow(signal);
    }
  }

  // Step 8: Append stream to transport.[[SendStreams]].
  aWebTransport->mSendStreams.InsertOrUpdate(aStreamId, stream);
  // Step 9: Return stream.
  return stream.forget();
}

void WebTransportSendStream::SetSendOrder(int64_t aSendOrder) {
  mSendOrder = aSendOrder;
  mTransport->SendSetSendOrder(mStreamId, aSendOrder);
}

void WebTransportSendStream::SetSendGroup(WebTransportSendGroup* aSendGroup,
                                          ErrorResult& aRv) {
  // https://w3c.github.io/webtransport/#send-stream-attributes (sendGroup
  // setter)

  // Step 1: If value is non-null and value.[[Transport]] ≠
  // this.[[Transport]], throw an "InvalidStateError" DOMException.
  if (aSendGroup && aSendGroup->GetTransport() != mTransport) {
    aRv.ThrowInvalidStateError("SendGroup belongs to different transport");
    return;
  }
  // Step 2: Set this.[[SendGroup]] to value.
  mSendGroup = aSendGroup;
  // Propagate the new send group to the parent process so the neqo scheduler
  // sees the updated group assignment. groupId 0 means no group (null
  // sendGroup).
  uint64_t groupId = aSendGroup ? aSendGroup->GetGroupId() : 0;
  mTransport->SendSetSendGroup(mStreamId, groupId);
}

already_AddRefed<Promise> WebTransportSendStream::GetStats() {
  RefPtr<Promise> promise = Promise::CreateInfallible(WritableStream::mGlobal);
  promise->MaybeRejectWithNotSupportedError("GetStats isn't supported yet");
  return promise.forget();
}

}  // namespace mozilla::dom
