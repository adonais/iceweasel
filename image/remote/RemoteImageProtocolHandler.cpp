/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "RemoteImageProtocolHandler.h"

#include "imgITools.h"
#include "nsContentUtils.h"
#include "nsIPipe.h"
#include "nsIURI.h"
#include "nsMimeTypes.h"
#include "nsNetUtil.h"
#include "nsStreamUtils.h"
#include "nsURLHelper.h"
#include "mozilla/dom/ipc/IdType.h"
#include "mozilla/dom/ContentParent.h"
#include "mozilla/dom/ContentProcessManager.h"
#include "mozilla/gfx/2D.h"

namespace mozilla::image {

using mozilla::dom::ContentParent;
using mozilla::dom::ContentParentId;
using mozilla::dom::ContentProcessManager;
using mozilla::dom::UniqueContentParentKeepAlive;

StaticRefPtr<RemoteImageProtocolHandler> RemoteImageProtocolHandler::sSingleton;

NS_IMPL_ISUPPORTS(RemoteImageProtocolHandler, nsIProtocolHandler,
                  nsISupportsWeakReference);

NS_IMETHODIMP RemoteImageProtocolHandler::GetScheme(nsACString& aScheme) {
  aScheme.AssignLiteral("moz-remote-image");
  return NS_OK;
}

NS_IMETHODIMP RemoteImageProtocolHandler::AllowPort(int32_t, const char*,
                                                    bool* aAllow) {
  *aAllow = false;
  return NS_OK;
}

static UniqueContentParentKeepAlive GetLaunchingContentParentForDecode(
    const Maybe<ContentParentId>& aContentParentId) {
  if (aContentParentId.isSome()) {
    if (ContentProcessManager* cpm = ContentProcessManager::GetSingleton()) {
      if (ContentParent* cp = cpm->GetContentProcessById(*aContentParentId)) {
        return cp->TryAddKeepAlive(/* aBrowserId */ 0);
      }
    }
  }

  // We use the extension process as a fallback, because
  // it is usually running, and should be OK to parse images.
  return ContentParent::GetNewOrUsedLaunchingBrowserProcess(
      EXTENSION_REMOTE_TYPE,
      /* aGroup */ nullptr,
      /* aPriority */ hal::PROCESS_PRIORITY_FOREGROUND,
      /* aPreferUsed */ true);
}

static nsresult EncodeImage(const dom::IPCImage& aImage,
                            nsIAsyncOutputStream* aOutputStream) {
  // TODO(Bug 1997538): Use the internal image/icon format for the
  // moz-remote-image: protocol
  nsresult rv;
  nsCOMPtr<imgITools> imgTools =
      do_GetService("@mozilla.org/image/tools;1", &rv);
  MOZ_TRY(rv);

  nsCOMPtr<imgIContainer> imgContainer =
      nsContentUtils::IPCImageToImage(aImage);
  if (!imgContainer) {
    return NS_ERROR_FAILURE;
  }

  nsCOMPtr<nsIInputStream> stream;
  MOZ_TRY(imgTools->EncodeImage(imgContainer, nsLiteralCString(IMAGE_PNG),
                                u"png-zlib-level=0"_ns,
                                getter_AddRefs(stream)));

  nsCOMPtr<nsIEventTarget> target =
      do_GetService(NS_STREAMTRANSPORTSERVICE_CONTRACTID, &rv);
  MOZ_TRY(rv);

  return NS_AsyncCopy(stream, aOutputStream, target);
}

static void AsyncReEncodeImage(nsIURI* aRemoteURI, ImageIntSize aSize,
                               const Maybe<ContentParentId> aContentParentId,
                               nsIAsyncOutputStream* aOutputStream) {
  UniqueContentParentKeepAlive cp =
      GetLaunchingContentParentForDecode(aContentParentId);
  if (NS_WARN_IF(!cp)) {
    aOutputStream->CloseWithStatus(NS_ERROR_FAILURE);
    return;
  }

  cp->WaitForLaunchAsync()
      ->Then(
          GetCurrentSerialEventTarget(), __func__,
          [remoteURI = nsCOMPtr{aRemoteURI},
           aSize](UniqueContentParentKeepAlive&& aCp) {
            return aCp->SendDecodeImage(WrapNotNull(remoteURI), aSize);
          },
          [](nsresult aError) {
            return ContentParent::DecodeImagePromise::CreateAndReject(
                ipc::ResponseRejectReason::SendError, __func__);
          })
      ->Then(
          GetCurrentSerialEventTarget(), __func__,
          [cp = std::move(cp), outputStream = nsCOMPtr{aOutputStream},
           aSize](const std::tuple<nsresult, mozilla::Maybe<dom::IPCImage>>&
                      aResult) {
            nsresult rv = std::get<0>(aResult);
            const mozilla::Maybe<dom::IPCImage>& image = std::get<1>(aResult);

            if (NS_FAILED(rv)) {
              outputStream->CloseWithStatus(rv);
              return;
            }

            if (image.isNothing()) {
              outputStream->CloseWithStatus(NS_ERROR_UNEXPECTED);
              return;
            }

            // Make sure the image size matches if a specific size was
            // requested.
            if (aSize.Width() && aSize.Height() && image->size() != aSize) {
              outputStream->CloseWithStatus(NS_ERROR_UNEXPECTED);
              return;
            }

            rv = EncodeImage(*image, outputStream);
            if (NS_FAILED(rv)) {
              outputStream->CloseWithStatus(rv);
            }
          },
          [outputStream =
               nsCOMPtr{aOutputStream}](mozilla::ipc::ResponseRejectReason) {
            outputStream->CloseWithStatus(NS_ERROR_FAILURE);
          });
}

// Parse out the relevant parts of the moz-remote-image URL
static nsresult ParseURI(nsIURI* aURI, nsIURI** aRemoteURI, ImageIntSize* aSize,
                         Maybe<ContentParentId>& aContentParentId) {
  MOZ_ASSERT(aURI->SchemeIs("moz-remote-image"));

  nsAutoCString query;
  MOZ_TRY(aURI->GetQuery(query));

  bool hasURL;
  int32_t width = 0;
  int32_t height = 0;

  bool ok = URLParams::Parse(
      query, true, [&](const nsACString& aName, const nsACString& aValue) {
        nsresult rv;
        if (aName.EqualsLiteral("url")) {
          hasURL = true;
          rv = NS_NewURI(aRemoteURI, aValue);
          if (NS_FAILED(rv)) {
            return false;
          }
        } else if (aName.EqualsLiteral("width")) {
          width = aValue.ToInteger(&rv);
          if (NS_FAILED(rv) || width < 0) {
            return false;
          }
        } else if (aName.EqualsLiteral("height")) {
          height = aValue.ToInteger(&rv);
          if (NS_FAILED(rv) || height < 0) {
            return false;
          }
        } else if (aName.EqualsLiteral("contentParentId")) {
          int64_t id = aValue.ToInteger(&rv);
          if (NS_FAILED(rv) || id < 0) {
            return false;
          }
          aContentParentId = Some(ContentParentId(uint64_t(id)));
        }
        return true;
      });
  if (NS_WARN_IF(!ok || !hasURL)) {
    return NS_ERROR_DOM_MALFORMED_URI;
  }

  *aSize = ImageIntSize(width, height);
  return NS_OK;
}

NS_IMETHODIMP RemoteImageProtocolHandler::NewChannel(nsIURI* aURI,
                                                     nsILoadInfo* aLoadInfo,
                                                     nsIChannel** aOutChannel) {
  if (!aLoadInfo->TriggeringPrincipal()->IsSystemPrincipal()) {
    return NS_ERROR_UNEXPECTED;
  }

  nsCOMPtr<nsIURI> remoteURI;
  ImageIntSize size;
  Maybe<ContentParentId> contentParentId;
  MOZ_TRY(ParseURI(aURI, getter_AddRefs(remoteURI), &size, contentParentId));

  nsCOMPtr<nsIAsyncInputStream> pipeIn;
  nsCOMPtr<nsIAsyncOutputStream> pipeOut;
  NS_NewPipe2(getter_AddRefs(pipeIn), getter_AddRefs(pipeOut), true, true);

  nsCOMPtr<nsIChannel> channel;
  MOZ_TRY(NS_NewInputStreamChannelInternal(
      getter_AddRefs(channel), aURI, pipeIn.forget(),
      /* aContentType */ nsLiteralCString(IMAGE_PNG),
      /* aContentCharset */ ""_ns, aLoadInfo));

  AsyncReEncodeImage(remoteURI, size, contentParentId, pipeOut);

  channel.forget(aOutChannel);
  return NS_OK;
}

}  // namespace mozilla::image
