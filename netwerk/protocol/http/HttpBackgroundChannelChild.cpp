/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// HttpLog.h should generally be included first
#include "HttpBackgroundChannelChild.h"

#include "HttpChannelChild.h"
#include "HttpLog.h"
#include "mozilla/IntegerPrintfMacros.h"
#include "mozilla/ipc/BackgroundChild.h"
#include "mozilla/ipc/Endpoint.h"
#include "mozilla/ipc/PBackgroundChild.h"
#include "nsSocketTransportService2.h"

using mozilla::ipc::BackgroundChild;
using mozilla::ipc::IPCResult;

namespace mozilla {
namespace net {

// HttpBackgroundChannelChild
HttpBackgroundChannelChild::HttpBackgroundChannelChild() = default;

HttpBackgroundChannelChild::~HttpBackgroundChannelChild() = default;

nsresult HttpBackgroundChannelChild::Init(HttpChannelChild* aChannelChild) {
  LOG(
      ("HttpBackgroundChannelChild::Init [this=%p httpChannel=%p "
       "channelId=%" PRIu64 "]\n",
       this, aChannelChild, aChannelChild->ChannelId()));
  MOZ_ASSERT(OnSocketThread());
  NS_ENSURE_ARG(aChannelChild);

  mChannelChild = aChannelChild;

  if (NS_WARN_IF(!CreateBackgroundChannel())) {
#ifdef MOZ_DIAGNOSTIC_ASSERT_ENABLED
    // mChannelChild may be nulled already. Use aChannelChild
    aChannelChild->mCreateBackgroundChannelFailed = true;
#endif
    mChannelChild = nullptr;
    return NS_ERROR_FAILURE;
  }

  return NS_OK;
}

void HttpBackgroundChannelChild::OnChannelClosed() {
  LOG(("HttpBackgroundChannelChild::OnChannelClosed [this=%p]\n", this));
  MOZ_ASSERT(OnSocketThread());

#ifdef MOZ_DIAGNOSTIC_ASSERT_ENABLED
  if (mChannelChild) {
    mChannelChild->mBackgroundChildQueueFinalState =
        mQueuedRunnables.IsEmpty() ? HttpChannelChild::BCKCHILD_EMPTY
                                   : HttpChannelChild::BCKCHILD_NON_EMPTY;
  }
#endif

  // HttpChannelChild is not going to handle any incoming message.
  mChannelChild = nullptr;

  // Remove pending IPC messages as well.
  mQueuedRunnables.Clear();
}

void HttpBackgroundChannelChild::OnStartRequestReceived(
    Maybe<uint32_t> aMultiPartID) {
  LOG(("HttpBackgroundChannelChild::OnStartRequestReceived [this=%p]\n", this));
  MOZ_ASSERT(OnSocketThread());
  MOZ_ASSERT(mChannelChild);
  MOZ_ASSERT(!mStartReceived || *aMultiPartID > 0);

  mStartReceived = true;

  nsTArray<nsCOMPtr<nsIRunnable>> runnables = std::move(mQueuedRunnables);

  for (const auto& event : runnables) {
    // Note: these runnables call Recv* methods on HttpBackgroundChannelChild
    // but not the Process* methods on HttpChannelChild.
    event->Run();
  }

  // Ensure no new message is enqueued.
  MOZ_ASSERT(mQueuedRunnables.IsEmpty());
}

bool HttpBackgroundChannelChild::CreateBackgroundChannel() {
  LOG(("HttpBackgroundChannelChild::CreateBackgroundChannel [this=%p]\n",
       this));
  MOZ_ASSERT(OnSocketThread());
  MOZ_ASSERT(mChannelChild);

  PBackgroundChild* actorChild = BackgroundChild::GetOrCreateForCurrentThread();
  if (NS_WARN_IF(!actorChild)) {
    return false;
  }

  const uint64_t channelId = mChannelChild->ChannelId();
  if (!actorChild->SendPHttpBackgroundChannelConstructor(this, channelId)) {
    return false;
  }

  mChannelChild->OnBackgroundChildReady(this);
  return true;
}

IPCResult HttpBackgroundChannelChild::RecvOnAfterLastPart(
    const nsresult& aStatus) {
  LOG(("HttpBackgroundChannelChild::RecvOnAfterLastPart [this=%p]\n", this));
  MOZ_ASSERT(OnSocketThread());

  if (NS_WARN_IF(!mChannelChild)) {
    return IPC_OK();
  }

  mChannelChild->ProcessOnAfterLastPart(aStatus);
  return IPC_OK();
}

IPCResult HttpBackgroundChannelChild::RecvOnProgress(
    const int64_t& aProgress, const int64_t& aProgressMax) {
  LOG(("HttpBackgroundChannelChild::RecvOnProgress [this=%p]\n", this));
  MOZ_ASSERT(OnSocketThread());

  if (NS_WARN_IF(!mChannelChild)) {
    return IPC_OK();
  }

  mChannelChild->ProcessOnProgress(aProgress, aProgressMax);
  return IPC_OK();
}

IPCResult HttpBackgroundChannelChild::RecvOnStatus(const nsresult& aStatus) {
  LOG(("HttpBackgroundChannelChild::RecvOnStatus [this=%p]\n", this));
  MOZ_ASSERT(OnSocketThread());

  if (NS_WARN_IF(!mChannelChild)) {
    return IPC_OK();
  }

  mChannelChild->ProcessOnStatus(aStatus);
  return IPC_OK();
}

bool HttpBackgroundChannelChild::IsWaitingOnStartRequest() {
  MOZ_ASSERT(OnSocketThread());

  // Need to wait for OnStartRequest if it is sent by
  // parent process but not received by content process.
  return !mStartReceived;
}

// PHttpBackgroundChannelChild
IPCResult HttpBackgroundChannelChild::RecvOnStartRequest(
    const nsHttpResponseHead& aResponseHead, const bool& aUseResponseHead,
    const nsHttpHeaderArray& aRequestHeaders,
    const HttpChannelOnStartRequestArgs& aArgs,
    const HttpChannelAltDataStream& aAltData,
    const TimeStamp& aOnStartRequestStart) {
  LOG((
      "HttpBackgroundChannelChild::RecvOnStartRequest [this=%p, status=%" PRIx32
      "]\n",
      this, static_cast<uint32_t>(aArgs.channelStatus())));
  MOZ_ASSERT(OnSocketThread());

  if (NS_WARN_IF(!mChannelChild)) {
    return IPC_OK();
  }

  mChannelChild->ProcessOnStartRequest(aResponseHead, aUseResponseHead,
                                       aRequestHeaders, aArgs, aAltData,
                                       aOnStartRequestStart);
  // Allow to queue other runnable since OnStartRequest Event already hits the
  // child's mEventQ.
  OnStartRequestReceived(aArgs.multiPartID());

  return IPC_OK();
}

IPCResult HttpBackgroundChannelChild::RecvOnTransportAndData(
    const nsresult& aChannelStatus, const nsresult& aTransportStatus,
    const uint64_t& aOffset, const nsACString& aData,
    const TimeStamp& aOnDataAvailableStart) {
  RefPtr<HttpBackgroundChannelChild> self = this;
  std::function<void()> callProcessOnTransportAndData =
      [self, aChannelStatus, aTransportStatus, aOffset, data = nsCString(aData),
       aOnDataAvailableStart]() {
        LOG(("HttpBackgroundChannelChild::RecvOnTransportAndData [this=%p]\n",
             self.get()));
        MOZ_ASSERT(OnSocketThread());

        if (NS_WARN_IF(!self->mChannelChild)) {
          return;
        }

        // The request may have been cancelled or failed due to the IPC delay.
        // In this case, we should not forward ODA to HttpChannelChild.
        nsresult channelStatus;
        self->mChannelChild->GetStatus(&channelStatus);
        if (NS_FAILED(channelStatus)) {
          return;
        }

        self->mChannelChild->ProcessOnTransportAndData(
            aChannelStatus, aTransportStatus, aOffset, data,
            aOnDataAvailableStart);
      };

  if (IsWaitingOnStartRequest()) {
    LOG(("  > pending until OnStartRequest [offset=%" PRIu64 " count=%zu]\n",
         aOffset, aData.Length()));

    mQueuedRunnables.AppendElement(NS_NewRunnableFunction(
        "HttpBackgroundChannelChild::RecvOnTransportAndData",
        std::move(callProcessOnTransportAndData)));
    return IPC_OK();
  }

  callProcessOnTransportAndData();
  return IPC_OK();
}

IPCResult HttpBackgroundChannelChild::RecvOnStopRequest(
    const nsresult& aChannelStatus, const ResourceTimingStructArgs& aTiming,
    const TimeStamp& aLastActiveTabOptHit,
    const nsHttpHeaderArray& aResponseTrailers,
    nsTArray<ConsoleReportCollected>&& aConsoleReports,
    const TimeStamp& aOnStopRequestStart) {
  LOG(("HttpBackgroundChannelChild::RecvOnStopRequest [this=%p]\n", this));
  MOZ_ASSERT(gSocketTransportService);
  MOZ_ASSERT(gSocketTransportService->IsOnCurrentThreadInfallible());

  // It's enough to set this from (just before) OnStopRequest notification,
  // since we don't need this value sooner than a channel was done loading -
  // everything this timestamp affects takes place only after a channel's
  // OnStopRequest.
  nsHttp::SetLastActiveTabLoadOptimizationHit(aLastActiveTabOptHit);

  if (NS_WARN_IF(!mChannelChild)) {
    return IPC_OK();
  }

  if (IsWaitingOnStartRequest()) {
    LOG(("  > pending until OnStartRequest [status=%" PRIx32 "]\n",
         static_cast<uint32_t>(aChannelStatus)));

    RefPtr<HttpBackgroundChannelChild> self = this;

    nsCOMPtr<nsIRunnable> task = NS_NewRunnableFunction(
        "HttpBackgroundChannelChild::RecvOnStopRequest",
        [self, aChannelStatus, aTiming, aLastActiveTabOptHit, aResponseTrailers,
         consoleReports = CopyableTArray{std::move(aConsoleReports)},
         aOnStopRequestStart]() mutable {
          self->RecvOnStopRequest(aChannelStatus, aTiming, aLastActiveTabOptHit,
                                  aResponseTrailers, std::move(consoleReports),
                                  aOnStopRequestStart);
        });

    mQueuedRunnables.AppendElement(task.forget());
    return IPC_OK();
  }

  mChannelChild->ProcessOnStopRequest(
      aChannelStatus, aTiming, aResponseTrailers, std::move(aConsoleReports),
      aOnStopRequestStart);
  return IPC_OK();
}

IPCResult HttpBackgroundChannelChild::RecvNotifyClassificationFlags(
    const uint32_t& aClassificationFlags, const bool& aIsThirdParty) {
  LOG(
      ("HttpBackgroundChannelChild::RecvNotifyClassificationFlags "
       "classificationFlags=%" PRIu32 ", thirdparty=%d [this=%p]\n",
       aClassificationFlags, static_cast<int>(aIsThirdParty), this));
  MOZ_ASSERT(OnSocketThread());

  if (NS_WARN_IF(!mChannelChild)) {
    return IPC_OK();
  }

  // NotifyClassificationFlags has no order dependency to OnStartRequest.
  // It this be handled as soon as possible
  mChannelChild->ProcessNotifyClassificationFlags(aClassificationFlags,
                                                  aIsThirdParty);

  return IPC_OK();
}

IPCResult HttpBackgroundChannelChild::RecvSetClassifierMatchedInfo(
    const ClassifierInfo& info) {
  LOG(("HttpBackgroundChannelChild::RecvSetClassifierMatchedInfo [this=%p]\n",
       this));
  MOZ_ASSERT(OnSocketThread());

  if (NS_WARN_IF(!mChannelChild)) {
    return IPC_OK();
  }

  // SetClassifierMatchedInfo has no order dependency to OnStartRequest.
  // It this be handled as soon as possible
  mChannelChild->ProcessSetClassifierMatchedInfo(info.list(), info.provider(),
                                                 info.fullhash());

  return IPC_OK();
}

IPCResult HttpBackgroundChannelChild::RecvSetClassifierMatchedTrackingInfo(
    const ClassifierInfo& info) {
  LOG(
      ("HttpBackgroundChannelChild::RecvSetClassifierMatchedTrackingInfo "
       "[this=%p]\n",
       this));
  MOZ_ASSERT(OnSocketThread());

  if (NS_WARN_IF(!mChannelChild)) {
    return IPC_OK();
  }

  // SetClassifierMatchedTrackingInfo has no order dependency to
  // OnStartRequest. It this be handled as soon as possible
  mChannelChild->ProcessSetClassifierMatchedTrackingInfo(info.list(),
                                                         info.fullhash());

  return IPC_OK();
}

IPCResult HttpBackgroundChannelChild::RecvAttachStreamFilter(
    Endpoint<extensions::PStreamFilterParent>&& aEndpoint) {
  LOG(("HttpBackgroundChannelChild::RecvAttachStreamFilter [this=%p]\n", this));
  MOZ_ASSERT(OnSocketThread());

  if (NS_WARN_IF(!mChannelChild)) {
    return IPC_OK();
  }

  mChannelChild->ProcessAttachStreamFilter(std::move(aEndpoint));
  return IPC_OK();
}

IPCResult HttpBackgroundChannelChild::RecvDetachStreamFilters() {
  LOG(("HttpBackgroundChannelChild::RecvDetachStreamFilters [this=%p]\n",
       this));
  MOZ_ASSERT(OnSocketThread());

  if (NS_WARN_IF(!mChannelChild)) {
    return IPC_OK();
  }

  mChannelChild->ProcessDetachStreamFilters();
  return IPC_OK();
}

void HttpBackgroundChannelChild::ActorDestroy(ActorDestroyReason aWhy) {
  LOG(("HttpBackgroundChannelChild::ActorDestroy[this=%p reason=%d]\n", this,
       static_cast<int>(aWhy)));
  // This function might be called during shutdown phase, so OnSocketThread()
  // might return false even on STS thread. Use IsOnCurrentThreadInfallible()
  // to get correct information.
  MOZ_ASSERT(gSocketTransportService);
  MOZ_ASSERT(gSocketTransportService->IsOnCurrentThreadInfallible());

  // Drop any IPC runnables that were queued waiting for OnStartRequest. After
  // ActorDestroy returns, no further Recv* calls fire to drain the queue, and
  // each entry holds a RefPtr<self> via its capture; without clearing them
  // the actor (and everything it transitively owns) is kept alive forever.
  mQueuedRunnables.Clear();

  if (mChannelChild) {
    RefPtr<HttpChannelChild> channelChild = std::move(mChannelChild);

    channelChild->OnBackgroundChildDestroyed(this);
  }
}

}  // namespace net
}  // namespace mozilla
