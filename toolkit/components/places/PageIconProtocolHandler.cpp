/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "PageIconProtocolHandler.h"

#include "mozilla/NullPrincipal.h"
#include "mozilla/ScopeExit.h"
#include "mozilla/Components.h"
#include "mozilla/Try.h"
#include "nsContentUtils.h"
#include "nsFaviconService.h"
#include "nsStringStream.h"
#include "nsStreamUtils.h"
#include "nsBaseChannel.h"
#include "nsInputStreamPump.h"
#include "nsIChannel.h"
#include "nsIFaviconService.h"
#include "nsIIOService.h"
#include "nsILoadInfo.h"
#include "nsIOutputStream.h"
#include "nsIPipe.h"
#include "nsIRequestObserver.h"
#include "nsIURIMutator.h"
#include "nsNetUtil.h"
#include "SimpleChannel.h"
#include "mozilla/glean/PlacesMetrics.h"

#define PAGE_ICON_SCHEME "page-icon"

using mozilla::net::IsNeckoChild;
using mozilla::net::NeckoChild;
using mozilla::net::RemoteStreamGetter;
using mozilla::net::RemoteStreamInfo;

namespace mozilla::places {

struct FaviconMetadata {
  nsCOMPtr<nsIInputStream> mStream;
  nsCString mContentType;
  int64_t mContentLength = 0;
  uint16_t mWidth = 0;
};

static nsresult GetFaviconMetadata(
    const FaviconPromise::ResolveOrRejectValue& aResult,
    FaviconMetadata& aMetadata) {
  if (aResult.IsReject()) {
    return NS_ERROR_NOT_AVAILABLE;
  }

  const nsCOMPtr<nsIFavicon>& favicon = aResult.ResolveValue();
  if (!favicon) {
    return NS_ERROR_NOT_AVAILABLE;
  }

  nsTArray<uint8_t> rawData;
  favicon->GetRawData(rawData);

  if (rawData.IsEmpty()) {
    return NS_ERROR_NOT_AVAILABLE;
  }

  nsCOMPtr<nsIInputStream> stream;
  nsresult rv = NS_NewByteInputStream(
      getter_AddRefs(stream),
      AsChars(Span{rawData.Elements(), rawData.Length()}), NS_ASSIGNMENT_COPY);
  NS_ENSURE_SUCCESS(rv, rv);

  favicon->GetWidth(&aMetadata.mWidth);
  favicon->GetMimeType(aMetadata.mContentType);
  aMetadata.mStream = std::move(stream);
  aMetadata.mContentLength = rawData.Length();

  return NS_OK;
}

void RecordIconSizeTelemetry(nsIURI* uri, const FaviconMetadata& metadata) {
  uint16_t preferredSize = INT16_MAX;
  auto* faviconService = nsFaviconService::GetFaviconService();

  if (!MOZ_UNLIKELY(!faviconService)) {
    faviconService->PreferredSizeFromURI(uri, &preferredSize);
    if (metadata.mWidth < preferredSize) {
      mozilla::glean::page_icon::small_icon_count.Add(1);
    } else {
      mozilla::glean::page_icon::fit_icon_count.Add(1);
    }
  }
}

StaticRefPtr<PageIconProtocolHandler> PageIconProtocolHandler::sSingleton;

namespace {

class DefaultFaviconObserver final : public nsIRequestObserver {
 public:
  explicit DefaultFaviconObserver(nsIOutputStream* aOutputStream)
      : mOutputStream(aOutputStream) {
    MOZ_ASSERT(aOutputStream);
  }

  NS_DECL_ISUPPORTS
  NS_DECL_NSIREQUESTOBSERVER
 private:
  ~DefaultFaviconObserver() = default;

  nsCOMPtr<nsIOutputStream> mOutputStream;
};

NS_IMPL_ISUPPORTS(DefaultFaviconObserver, nsIRequestObserver);

NS_IMETHODIMP DefaultFaviconObserver::OnStartRequest(nsIRequest*) {
  return NS_OK;
}

NS_IMETHODIMP DefaultFaviconObserver::OnStopRequest(nsIRequest*, nsresult) {
  // We must close the outputStream regardless.
  mOutputStream->Close();
  return NS_OK;
}

}  // namespace

static nsresult MakeDefaultFaviconChannel(nsIURI* aURI, nsILoadInfo* aLoadInfo,
                                          nsIChannel** aOutChannel) {
  nsCOMPtr<nsIIOService> ios = mozilla::components::IO::Service();
  nsCOMPtr<nsIChannel> chan;
  nsCOMPtr<nsIURI> defaultFaviconURI;

  auto* faviconService = nsFaviconService::GetFaviconService();
  if (MOZ_UNLIKELY(!faviconService)) {
    return NS_ERROR_UNEXPECTED;
  }

  nsresult rv =
      faviconService->GetDefaultFavicon(getter_AddRefs(defaultFaviconURI));
  NS_ENSURE_SUCCESS(rv, rv);
  rv = ios->NewChannelFromURIWithLoadInfo(defaultFaviconURI, aLoadInfo,
                                          getter_AddRefs(chan));
  NS_ENSURE_SUCCESS(rv, rv);
  chan->SetOriginalURI(aURI);
  chan->SetContentType(nsLiteralCString(FAVICON_DEFAULT_MIMETYPE));
  chan.forget(aOutChannel);
  return NS_OK;
}

static nsresult StreamDefaultFavicon(nsIURI* aURI, nsILoadInfo* aLoadInfo,
                                     nsIOutputStream* aOutputStream) {
  auto closeStreamOnError =
      mozilla::MakeScopeExit([&] { aOutputStream->Close(); });

  auto observer = MakeRefPtr<DefaultFaviconObserver>(aOutputStream);

  nsCOMPtr<nsIStreamListener> listener;
  nsresult rv = NS_NewSimpleStreamListener(getter_AddRefs(listener),
                                           aOutputStream, observer);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIChannel> defaultIconChannel;
  rv = MakeDefaultFaviconChannel(aURI, aLoadInfo,
                                 getter_AddRefs(defaultIconChannel));
  NS_ENSURE_SUCCESS(rv, rv);

  rv = defaultIconChannel->AsyncOpen(listener);
  NS_ENSURE_SUCCESS(rv, rv);

  closeStreamOnError.release();
  return NS_OK;
}

namespace {

class FaviconLoader final : public nsICancelable {
 public:
  NS_DECL_ISUPPORTS

  static already_AddRefed<FaviconLoader> Start(RefPtr<FaviconPromise> aPromise,
                                               nsIStreamListener* aListener,
                                               nsIChannel* aChannel,
                                               nsIURI* aPageIconURI) {
    auto loader = MakeRefPtr<FaviconLoader>();
    aPromise->Then(GetMainThreadSerialEventTarget(), __func__,
                   [loader, listener = nsCOMPtr{aListener},
                    channel = nsCOMPtr{aChannel}, uri = nsCOMPtr{aPageIconURI}](
                       const FaviconPromise::ResolveOrRejectValue& aResult) {
                     loader->OnFaviconData(aResult, listener, channel, uri);
                   });
    return loader.forget();
  }

  FaviconLoader() = default;

  NS_IMETHOD Cancel(nsresult aStatus) override {
    mCanceled = true;
    mStatus = aStatus;
    if (mPump) {
      mPump->Cancel(aStatus);
      mPump = nullptr;
    }
    return NS_OK;
  }

 private:
  ~FaviconLoader() = default;

  // SimpleChannel's listener requires OnStartRequest before OnStopRequest to
  // properly finalize the channel and release internal state. Must be called
  // for all error/cancel paths that don't go through the pump.
  void FinishWithStatus(nsIStreamListener* aListener, nsIChannel* aChannel,
                        nsresult aStatus) {
    aListener->OnStartRequest(aChannel);
    aListener->OnStopRequest(aChannel, aStatus);
  }

  void OnFaviconData(const FaviconPromise::ResolveOrRejectValue& aResult,
                     nsIStreamListener* aListener, nsIChannel* aChannel,
                     nsIURI* aPageIconURI) {
    if (mCanceled) {
      FinishWithStatus(aListener, aChannel, mStatus);
      return;
    }
    FaviconMetadata metadata;
    if (NS_SUCCEEDED(GetFaviconMetadata(aResult, metadata))) {
      aChannel->SetContentType(metadata.mContentType);
      aChannel->SetContentLength(metadata.mContentLength);

      nsresult rv =
          nsInputStreamPump::Create(getter_AddRefs(mPump), metadata.mStream, 0,
                                    0, true, GetMainThreadSerialEventTarget());
      if (NS_WARN_IF(NS_FAILED(rv)) ||
          NS_WARN_IF(NS_FAILED(rv = mPump->AsyncRead(aListener)))) {
        mPump = nullptr;
        FinishWithStatus(aListener, aChannel, rv);
        return;
      }
      RecordIconSizeTelemetry(aPageIconURI, metadata);
    } else {
      // aChannel is always a SimpleChannel which inherits nsBaseChannel.
      auto* simpleChannel = static_cast<nsBaseChannel*>(aChannel);
      nsCOMPtr<nsIStreamListener> outerListener =
          simpleChannel->StreamListener();
      nsCOMPtr<nsILoadInfo> loadInfo = simpleChannel->LoadInfo();
      nsCOMPtr<nsIChannel> defaultIconChannel;
      nsresult rv = MakeDefaultFaviconChannel(
          aPageIconURI, loadInfo, getter_AddRefs(defaultIconChannel));
      if (NS_SUCCEEDED(rv)) {
        // Propagate properties from the original channel.
        nsCOMPtr<nsILoadGroup> loadGroup;
        aChannel->GetLoadGroup(getter_AddRefs(loadGroup));
        defaultIconChannel->SetLoadGroup(loadGroup);
        nsCOMPtr<nsIInterfaceRequestor> callbacks;
        aChannel->GetNotificationCallbacks(getter_AddRefs(callbacks));
        defaultIconChannel->SetNotificationCallbacks(callbacks);
        nsLoadFlags loadFlags = 0;
        aChannel->GetLoadFlags(&loadFlags);
        defaultIconChannel->SetLoadFlags(loadFlags | nsIChannel::LOAD_REPLACE);
        // Open the default icon channel directly with the outer listener,
        // rather than via Redirect(), so that:
        // - The image loader receives OnStartRequest from the chrome://
        //   channel (required for -moz-pref() evaluation in SVGs).
        // - No async runnables are queued that could outlive a test
        //   shutdown and cause FaviconLoader to leak.
        // Clear SimpleChannel's listener first so the FinishWithStatus
        // call below does not forward a duplicate OnStart/OnStop to the
        // outer listener.
        simpleChannel->SetStreamListener(nullptr);
        rv = defaultIconChannel->AsyncOpen(outerListener);
        if (NS_FAILED(rv)) {
          simpleChannel->SetStreamListener(outerListener);
        }
      }
      FinishWithStatus(aListener, aChannel, NS_SUCCEEDED(rv) ? NS_OK : rv);
    }
  }

  RefPtr<nsInputStreamPump> mPump;
  nsresult mStatus = NS_OK;
  bool mCanceled = false;
};

NS_IMPL_ISUPPORTS(FaviconLoader, nsICancelable)

}  // namespace

NS_IMPL_ISUPPORTS(PageIconProtocolHandler, nsIProtocolHandler,
                  nsISupportsWeakReference);

NS_IMETHODIMP PageIconProtocolHandler::GetScheme(nsACString& aScheme) {
  aScheme.AssignLiteral(PAGE_ICON_SCHEME);
  return NS_OK;
}

NS_IMETHODIMP PageIconProtocolHandler::AllowPort(int32_t, const char*,
                                                 bool* aAllow) {
  *aAllow = false;
  return NS_OK;
}

NS_IMETHODIMP PageIconProtocolHandler::NewChannel(nsIURI* aURI,
                                                  nsILoadInfo* aLoadInfo,
                                                  nsIChannel** aOutChannel) {
  if (!nsContentUtils::IsImageType(aLoadInfo->GetExternalContentPolicyType())) {
    return NS_ERROR_CONTENT_BLOCKED;
  }

  // Load the URI remotely if accessed from a child.
  if (IsNeckoChild()) {
    MOZ_TRY(SubstituteRemoteChannel(aURI, aLoadInfo, aOutChannel));
    return NS_OK;
  }

  nsresult rv = NewChannelInternal(aURI, aLoadInfo, aOutChannel);
  if (NS_SUCCEEDED(rv)) {
    return rv;
  }
  return MakeDefaultFaviconChannel(aURI, aLoadInfo, aOutChannel);
}

Result<Ok, nsresult> PageIconProtocolHandler::SubstituteRemoteChannel(
    nsIURI* aURI, nsILoadInfo* aLoadInfo, nsIChannel** aRetVal) {
  MOZ_ASSERT(IsNeckoChild());
  MOZ_TRY(aURI ? NS_OK : NS_ERROR_INVALID_ARG);
  MOZ_TRY(aLoadInfo ? NS_OK : NS_ERROR_INVALID_ARG);

  RefPtr<RemoteStreamGetter> streamGetter =
      new RemoteStreamGetter(aURI, aLoadInfo);

  NewSimpleChannel(aURI, aLoadInfo, streamGetter, aRetVal);
  return Ok();
}

nsresult PageIconProtocolHandler::NewChannelInternal(nsIURI* aURI,
                                                     nsILoadInfo* aLoadInfo,
                                                     nsIChannel** aOutChannel) {
  nsCOMPtr<nsIChannel> channel = NS_NewSimpleChannel(
      aURI, aLoadInfo, this,
      [](nsIStreamListener* aListener, nsIChannel* aChannel,
         PageIconProtocolHandler* aSelf) -> RequestOrReason {
        nsCOMPtr<nsIURI> uri;
        aChannel->GetURI(getter_AddRefs(uri));
        RefPtr<FaviconLoader> loader = FaviconLoader::Start(
            aSelf->GetFaviconData(uri), aListener, aChannel, uri);
        nsCOMPtr<nsICancelable> cancelable(loader.forget());
        return RequestOrCancelable(WrapNotNull(cancelable));
      });
  NS_ENSURE_TRUE(channel, NS_ERROR_OUT_OF_MEMORY);
  channel.forget(aOutChannel);
  return NS_OK;
}

RefPtr<FaviconPromise> PageIconProtocolHandler::GetFaviconData(
    nsIURI* aPageIconURI) {
  auto* faviconService = nsFaviconService::GetFaviconService();
  if (MOZ_UNLIKELY(!faviconService)) {
    return FaviconPromise::CreateAndReject(NS_ERROR_UNEXPECTED, __func__);
  }

  uint16_t preferredSize = 0;
  faviconService->PreferredSizeFromURI(aPageIconURI, &preferredSize);

  nsCOMPtr<nsIURI> pageURI;
  nsresult rv;
  // NOTE: We don't need to strip #size= fragments because
  // AsyncGetFaviconForPage strips them when doing the database lookup.
  nsAutoCString pageQuery;
  aPageIconURI->GetPathQueryRef(pageQuery);
  rv = NS_NewURI(getter_AddRefs(pageURI), pageQuery);
  if (NS_FAILED(rv)) {
    return FaviconPromise::CreateAndReject(rv, __func__);
  }

  return faviconService->AsyncGetFaviconForPage(pageURI, preferredSize, true);
}

RefPtr<RemoteStreamPromise> PageIconProtocolHandler::NewStream(
    nsIURI* aChildURI, nsILoadInfo* aLoadInfo, bool* aTerminateSender) {
  MOZ_ASSERT(!IsNeckoChild());
  MOZ_ASSERT(NS_IsMainThread());

  if (!aChildURI || !aLoadInfo || !aTerminateSender) {
    return RemoteStreamPromise::CreateAndReject(NS_ERROR_INVALID_ARG, __func__);
  }

  *aTerminateSender = true;

  // We should never receive a URI that isn't for a page-icon because
  // these requests ordinarily come from the child's PageIconProtocolHandler.
  // Ensure this request is for a page-icon URI. A compromised child process
  // could send us any URI.
  bool isPageIconScheme = false;
  if (NS_FAILED(aChildURI->SchemeIs(PAGE_ICON_SCHEME, &isPageIconScheme)) ||
      !isPageIconScheme) {
    return RemoteStreamPromise::CreateAndReject(NS_ERROR_UNKNOWN_PROTOCOL,
                                                __func__);
  }

  if (!nsContentUtils::IsImageType(aLoadInfo->GetExternalContentPolicyType())) {
    return RemoteStreamPromise::CreateAndReject(NS_ERROR_CONTENT_BLOCKED,
                                                __func__);
  }

  // For errors after this point, we want to propagate the error to
  // the child, but we don't force the child process to be terminated.
  *aTerminateSender = false;

  RefPtr<RemoteStreamPromise::Private> outerPromise =
      new RemoteStreamPromise::Private(__func__);
  nsCOMPtr<nsIURI> uri(aChildURI);
  nsCOMPtr<nsILoadInfo> loadInfo(aLoadInfo);
  RefPtr<PageIconProtocolHandler> self = this;

  GetFaviconData(uri)->Then(
      GetMainThreadSerialEventTarget(), __func__,
      [self, uri, loadInfo, outerPromise, childURI = nsCOMPtr{aChildURI}](
          const FaviconPromise::ResolveOrRejectValue& aResult) {
        FaviconMetadata metadata;
        if (NS_SUCCEEDED(GetFaviconMetadata(aResult, metadata))) {
          RecordIconSizeTelemetry(childURI, metadata);
          RemoteStreamInfo info(metadata.mStream, metadata.mContentType,
                                metadata.mContentLength);
          outerPromise->Resolve(std::move(info), __func__);
        } else {
          nsCOMPtr<nsIAsyncInputStream> pipeIn;
          nsCOMPtr<nsIAsyncOutputStream> pipeOut;
          self->GetStreams(getter_AddRefs(pipeIn), getter_AddRefs(pipeOut));

          RemoteStreamInfo info(pipeIn,
                                nsLiteralCString(FAVICON_DEFAULT_MIMETYPE), -1);
          (void)StreamDefaultFavicon(uri, loadInfo, pipeOut);
          outerPromise->Resolve(std::move(info), __func__);
        }
      });

  return outerPromise;
}

void PageIconProtocolHandler::GetStreams(nsIAsyncInputStream** inStream,
                                         nsIAsyncOutputStream** outStream) {
  static constexpr size_t kSegmentSize = 4096;
  nsCOMPtr<nsIAsyncInputStream> pipeIn;
  nsCOMPtr<nsIAsyncOutputStream> pipeOut;
  NS_NewPipe2(getter_AddRefs(pipeIn), getter_AddRefs(pipeOut), true, true,
              kSegmentSize,
              nsIFaviconService::MAX_FAVICON_BUFFER_SIZE / kSegmentSize);

  pipeIn.forget(inStream);
  pipeOut.forget(outStream);
}

// static
void PageIconProtocolHandler::NewSimpleChannel(
    nsIURI* aURI, nsILoadInfo* aLoadInfo, RemoteStreamGetter* aStreamGetter,
    nsIChannel** aRetVal) {
  nsCOMPtr<nsIChannel> channel = NS_NewSimpleChannel(
      aURI, aLoadInfo, aStreamGetter,
      [](nsIStreamListener* listener, nsIChannel* simpleChannel,
         RemoteStreamGetter* getter) -> RequestOrReason {
        return getter->GetAsync(listener, simpleChannel,
                                &NeckoChild::SendGetPageIconStream);
      });

  channel.swap(*aRetVal);
}

}  // namespace mozilla::places
