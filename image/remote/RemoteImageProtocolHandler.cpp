/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "RemoteImageProtocolHandler.h"

#include "ImageRegion.h"
#include "gfxContext.h"
#include "gfxUtils.h"
#include "imgITools.h"
#include "mozilla/SVGImageContext.h"
#include "mozilla/dom/ContentParent.h"
#include "mozilla/dom/ContentProcessManager.h"
#include "mozilla/dom/ipc/IdType.h"
#include "mozilla/gfx/2D.h"
#include "nsContentUtils.h"
#include "nsIPipe.h"
#include "nsIURI.h"
#include "nsMimeTypes.h"
#include "nsNetUtil.h"
#include "nsStreamUtils.h"
#include "nsURLHelper.h"

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
      dom::RemoteType(dom::RemoteType::Kind::Extension),
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
                               bool aStretch,
                               const Maybe<ContentParentId> aContentParentId,
                               ColorScheme aColorScheme,
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
          [remoteURI = nsCOMPtr{aRemoteURI}, aSize, aStretch,
           aColorScheme](UniqueContentParentKeepAlive&& aCp) {
            return aCp->SendDecodeImage(WrapNotNull(remoteURI), aSize, aStretch,
                                        aColorScheme);
          },
          [](nsresult aError) {
            return ContentParent::DecodeImagePromise::CreateAndReject(
                ipc::ResponseRejectReason::SendError, __func__);
          })
      ->Then(
          GetCurrentSerialEventTarget(), __func__,
          [cp = std::move(cp), outputStream = nsCOMPtr{aOutputStream}, aSize,
           aStretch](const std::tuple<nsresult, mozilla::Maybe<dom::IPCImage>>&
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
            if (aStretch && aSize.Width() && aSize.Height() &&
                image->size() != aSize) {
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
                         bool* aStretch,
                         Maybe<ContentParentId>& aContentParentId,
                         ColorScheme* aColorScheme) {
  MOZ_ASSERT(aURI->SchemeIs("moz-remote-image"));

  nsAutoCString query;
  MOZ_TRY(aURI->GetQuery(query));

  bool hasURL;
  int32_t width = 0;
  int32_t height = 0;

  *aStretch = false;

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
        } else if (aName.EqualsLiteral("stretch")) {
          *aStretch = !aValue.EqualsLiteral("false");
        } else if (aName.EqualsLiteral("contentParentId")) {
          int64_t id = aValue.ToInteger(&rv);
          if (NS_FAILED(rv) || id < 0) {
            return false;
          }
          aContentParentId = Some(ContentParentId(uint64_t(id)));
        } else if (aName.EqualsLiteral("colorScheme")) {
          if (aValue.EqualsLiteral("light")) {
            *aColorScheme = ColorScheme::Light;
          } else if (aValue.EqualsLiteral("dark")) {
            *aColorScheme = ColorScheme::Dark;
          } else {
            return false;
          }
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

  if (!nsContentUtils::IsImageType(aLoadInfo->GetExternalContentPolicyType())) {
    return NS_ERROR_CONTENT_BLOCKED;
  }

  nsCOMPtr<nsIURI> remoteURI;
  ImageIntSize size;
  bool stretch;
  Maybe<ContentParentId> contentParentId;
  ColorScheme colorScheme = ColorScheme::Light;
  MOZ_TRY(ParseURI(aURI, getter_AddRefs(remoteURI), &size, &stretch,
                   contentParentId, &colorScheme));

  nsCOMPtr<nsIAsyncInputStream> pipeIn;
  nsCOMPtr<nsIAsyncOutputStream> pipeOut;
  NS_NewPipe2(getter_AddRefs(pipeIn), getter_AddRefs(pipeOut), true, true);

  nsCOMPtr<nsIChannel> channel;
  MOZ_TRY(NS_NewInputStreamChannelInternal(
      getter_AddRefs(channel), aURI, pipeIn.forget(),
      /* aContentType */ nsLiteralCString(IMAGE_PNG),
      /* aContentCharset */ ""_ns, aLoadInfo));

  AsyncReEncodeImage(remoteURI, size, stretch, contentParentId, colorScheme,
                     pipeOut);

  channel.forget(aOutChannel);
  return NS_OK;
}

/* static */
already_AddRefed<gfx::SourceSurface>
RemoteImageProtocolHandler::GetImageSurface(imgIContainer* aContainer,
                                            gfx::IntSize aSize, bool aStretch,
                                            ColorScheme aColorScheme) {
  const int32_t kFlags = imgIContainer::FLAG_SYNC_DECODE |
                         imgIContainer::FLAG_ASYNC_NOTIFY |
                         imgIContainer::FLAG_HIGH_QUALITY_SCALING;

  gfx::IntSize size = aSize;
  if (aStretch && size.IsEmpty()) {
    NS_ERROR("Can't stretch without a desired image size");
    return nullptr;
  }

  if (!aStretch) {
    ImageIntrinsicSize intrinsicSize;
    aContainer->GetIntrinsicSize(&intrinsicSize);
    if (size.IsEmpty()) {
      // No desired size. Use the intrinsic size if the image has one.
      size = gfx::IntSize(intrinsicSize.mWidth.valueOr(0),
                          intrinsicSize.mHeight.valueOr(0));
    } else {
      // Preserve the image's intrinsic ratio and use the smaller of `aSize` or
      // the intrinsic size as the maximum bounds. Note that images may have an
      // intrinsic ratio but no intrinsic size.
      AspectRatio ratio = aContainer->GetIntrinsicRatio();
      if (ratio) {
        auto finalMaxWidth =
            std::min(size.Width(), intrinsicSize.mWidth.valueOr(size.Width()));
        auto finalMaxHeight = std::min(
            size.Height(), intrinsicSize.mHeight.valueOr(size.Height()));
        auto sizeAtMaxWidth = ImageIntSize::Ceil(
            finalMaxWidth, ratio.Inverted().ApplyToFloat(finalMaxWidth));
        auto sizeAtMaxHeight = ImageIntSize::Ceil(
            ratio.ApplyToFloat(finalMaxHeight), finalMaxHeight);
        size = Min(sizeAtMaxWidth, sizeAtMaxHeight).ToUnknownSize();
      }
    }

    if (size.IsEmpty()) {
      NS_ERROR("Image has no intrinsic size and no desired size was given");
      return nullptr;
    }
  }

  if (aContainer->GetType() == imgIContainer::TYPE_VECTOR) {
    RefPtr<gfx::DrawTarget> drawTarget =
        gfxPlatform::GetPlatform()->CreateOffscreenContentDrawTarget(
            size, gfx::SurfaceFormat::B8G8R8A8);
    if (!drawTarget || !drawTarget->IsValid()) {
      NS_ERROR("Failed to create valid DrawTarget");
      return nullptr;
    }

    gfxContext context(drawTarget);

    SVGImageContext svgContext;
    svgContext.SetViewportSize(Some(CSSSize(size.width, size.height)));
    svgContext.SetColorScheme(Some(aColorScheme));

    ImgDrawResult res = aContainer->Draw(
        &context, size, ImageRegion::Create(size), imgIContainer::FRAME_FIRST,
        gfx::SamplingFilter::LINEAR, svgContext, kFlags, 1.0);

    if (res != ImgDrawResult::SUCCESS) {
      return nullptr;
    }

    return drawTarget->Snapshot();
  }

  RefPtr<gfx::SourceSurface> surface =
      aContainer->GetFrameAtSize(size, imgIContainer::FRAME_FIRST, kFlags);
  if (surface && surface->GetSize() != size) {
    surface = gfxUtils::ScaleSourceSurface(*surface, size);
  }

  return surface.forget();
}

}  // namespace mozilla::image
