/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "mozilla/dom/MediaMetadata.h"

#include "mozilla/dom/Document.h"
#include "mozilla/dom/MediaSessionBinding.h"
#include "mozilla/dom/ReferrerInfo.h"
#include "mozilla/dom/ScriptSettings.h"
#include "mozilla/dom/ToJSValue.h"
#include "mozilla/image/FetchDecodedImage.h"
#include "nsIHttpChannel.h"
#include "nsNetUtil.h"
#include "nsString.h"
#include "nsWhitespaceTokenizer.h"

extern mozilla::LazyLogModule gMediaControlLog;

// avoid redefined macro in unified build
#undef LOG
#define LOG(msg, ...)                                                   \
  MOZ_LOG_FMT(gMediaControlLog, LogLevel::Debug, "MediaMetadata, " msg, \
              ##__VA_ARGS__)

namespace mozilla::dom {

MediaImage MediaImageData::ToMediaImage() const {
  MediaImage image;
  image.mSizes = mSizes;
  image.mSrc = mSrc;
  image.mType = mType;
  return image;
}

// Only needed for refcounted objects.
NS_IMPL_CYCLE_COLLECTION_WRAPPERCACHE(MediaMetadata, mParent)
NS_IMPL_CYCLE_COLLECTING_ADDREF(MediaMetadata)
NS_IMPL_CYCLE_COLLECTING_RELEASE(MediaMetadata)
NS_INTERFACE_MAP_BEGIN_CYCLE_COLLECTION(MediaMetadata)
  NS_WRAPPERCACHE_INTERFACE_MAP_ENTRY
  NS_INTERFACE_MAP_ENTRY(nsISupports)
NS_INTERFACE_MAP_END

MediaMetadata::MediaMetadata(nsIGlobalObject* aParent, const nsString& aTitle,
                             const nsString& aArtist, const nsString& aAlbum)
    : MediaMetadataBase(aTitle, aArtist, aAlbum), mParent(aParent) {
  MOZ_ASSERT(mParent);
}

nsIGlobalObject* MediaMetadata::GetParentObject() const { return mParent; }

JSObject* MediaMetadata::WrapObject(JSContext* aCx,
                                    JS::Handle<JSObject*> aGivenProto) {
  return MediaMetadata_Binding::Wrap(aCx, this, aGivenProto);
}

already_AddRefed<MediaMetadata> MediaMetadata::Constructor(
    const GlobalObject& aGlobal, const MediaMetadataInit& aInit,
    ErrorResult& aRv) {
  nsCOMPtr<nsIGlobalObject> global = do_QueryInterface(aGlobal.GetAsSupports());
  if (!global) {
    aRv.Throw(NS_ERROR_FAILURE);
    return nullptr;
  }

  RefPtr<MediaMetadata> mediaMetadata =
      new MediaMetadata(global, aInit.mTitle, aInit.mArtist, aInit.mAlbum);
  mediaMetadata->SetArtworkInternal(aInit.mArtwork, aRv);
  return aRv.Failed() ? nullptr : mediaMetadata.forget();
}

void MediaMetadata::GetTitle(nsString& aRetVal) const { aRetVal = mTitle; }

void MediaMetadata::SetTitle(const nsAString& aTitle) {
  if (mTitle == aTitle) {
    return;
  }
  mTitle = aTitle;
  mMetadataChangeEvent.Notify();
}

void MediaMetadata::GetArtist(nsString& aRetVal) const { aRetVal = mArtist; }

void MediaMetadata::SetArtist(const nsAString& aArtist) {
  if (mArtist == aArtist) {
    return;
  }
  mArtist = aArtist;
  mMetadataChangeEvent.Notify();
}

void MediaMetadata::GetAlbum(nsString& aRetVal) const { aRetVal = mAlbum; }

void MediaMetadata::SetAlbum(const nsAString& aAlbum) {
  if (mAlbum == aAlbum) {
    return;
  }
  mAlbum = aAlbum;
  mMetadataChangeEvent.Notify();
}

void MediaMetadata::GetArtwork(JSContext* aCx, nsTArray<JSObject*>& aRetVal,
                               ErrorResult& aRv) const {
  // Convert the MediaImages to JS Objects
  if (!aRetVal.SetCapacity(mArtwork.Length(), fallible)) {
    aRv.Throw(NS_ERROR_OUT_OF_MEMORY);
    return;
  }

  for (size_t i = 0; i < mArtwork.Length(); ++i) {
    JS::Rooted<JS::Value> value(aCx);
    if (!ToJSValue(aCx, mArtwork[i].ToMediaImage(), &value)) {
      aRv.NoteJSContextException(aCx);
      return;
    }

    JS::Rooted<JSObject*> object(aCx, &value.toObject());
    if (!JS_FreezeObject(aCx, object)) {
      aRv.NoteJSContextException(aCx);
      return;
    }

    aRetVal.AppendElement(object);
  }
}

void MediaMetadata::SetArtwork(JSContext* aCx,
                               const Sequence<JSObject*>& aArtwork,
                               ErrorResult& aRv) {
  // Convert the JS Objects to MediaImages
  Sequence<MediaImage> artwork;
  if (!artwork.SetCapacity(aArtwork.Length(), fallible)) {
    aRv.Throw(NS_ERROR_OUT_OF_MEMORY);
    return;
  }

  for (JSObject* object : aArtwork) {
    JS::Rooted<JS::Value> value(aCx, JS::ObjectValue(*object));

    MediaImage* image = artwork.AppendElement(fallible);
    MOZ_ASSERT(image, "The capacity is preallocated");
    if (!image->Init(aCx, value)) {
      aRv.NoteJSContextException(aCx);
      return;
    }
  }

  SetArtworkInternal(artwork, aRv);
  mMetadataChangeEvent.Notify();
}

namespace {

// Parses an ASCII digit run in range 1..kMaxArtworkDimension; rejects empty
// input, non-digits, zero, values exceeding kMaxArtworkDimension and overflow.
bool ParseArtworkDimension(const nsAString& aStr, int32_t* aOut) {
  MOZ_ASSERT(aOut);
  if (aStr.IsEmpty()) {
    return false;
  }
  for (size_t i = 0; i < aStr.Length(); ++i) {
    if (aStr[i] < u'0' || aStr[i] > u'9') {
      return false;
    }
  }
  nsresult rv = NS_OK;
  int32_t value = aStr.ToInteger(&rv);
  if (NS_FAILED(rv) || value <= 0 || value > kMaxArtworkDimension) {
    return false;
  }
  *aOut = value;
  return true;
}

struct ArtworkFetchOrderComparator {
  const nsTArray<int64_t>& mAreas;
  explicit ArtworkFetchOrderComparator(const nsTArray<int64_t>& aAreas)
      : mAreas(aAreas) {}
  bool LessThan(const size_t& aLeft, const size_t& aRight) const {
    return mAreas[aLeft] > mAreas[aRight];
  }
};

}  // namespace

// Parses the 'sizes' attribute of a MediaImage (such as "any", "60x60", or
// "60x60 120x120") as a space-separated sequence of tokens. Tokens matching
// "any" (ASCII case-insensitive) indicate scalable/vector artwork and are
// assigned kAnyArtworkArea (INT64_MAX) so they are selected first. Tokens
// matching <width>x<height> (ASCII case-insensitive 'x'/'X') are limited to
// kMaxArtworkDimension (1024). Returns the maximum area among valid entries,
// or 0 if empty or unparseable.
int64_t GetMediaArtworkArea(const nsAString& aSizes) {
  int64_t maxArea = 0;
  nsWhitespaceTokenizer tokenizer(aSizes);
  while (tokenizer.hasMoreTokens()) {
    const nsDependentSubstring token = tokenizer.nextToken();
    if (token.LowerCaseEqualsLiteral("any")) {
      maxArea = std::max(maxArea, kAnyArtworkArea);
      continue;
    }
    int32_t xPos = token.FindChar(u'x');
    if (xPos == kNotFound) {
      xPos = token.FindChar(u'X');
    }
    if (xPos <= 0 || static_cast<size_t>(xPos) + 1 >= token.Length()) {
      continue;
    }
    const size_t xPosU = static_cast<size_t>(xPos);
    int32_t width = 0;
    if (!ParseArtworkDimension(Substring(token, 0, xPosU), &width)) {
      continue;
    }
    int32_t height = 0;
    if (!ParseArtworkDimension(Substring(token, xPosU + 1), &height)) {
      continue;
    }
    int64_t area = int64_t(width) * int64_t(height);
    if (area > maxArea) {
      maxArea = area;
    }
  }
  return maxArea;
}

CopyableTArray<size_t> GetMediaArtworkFetchOrder(
    const MediaMetadataBase& aMetadata) {
  CopyableTArray<size_t> order;
  nsTArray<int64_t> areas;
  for (size_t i = 0; i < aMetadata.mArtwork.Length(); ++i) {
    order.AppendElement(i);
    areas.AppendElement(GetMediaArtworkArea(aMetadata.mArtwork[i].mSizes));
  }
  // Stable so artworks without usable sizes keep page order. Only the fetch
  // order changes; mArtwork keeps page order for JS and IPC.
  order.StableSort(ArtworkFetchOrderComparator(areas));
  return order;
}

RefPtr<MediaMetadataBasePromise> MediaMetadata::FetchArtwork(
    const MediaMetadataBase& aMetadata, Document* aDoc,
    const nsTArray<size_t>& aOrder, size_t aPos) {
  MOZ_ASSERT(aDoc);
  MOZ_ASSERT(aOrder.Length() == aMetadata.mArtwork.Length());
  if (aOrder.Length() != aMetadata.mArtwork.Length() ||
      aPos >= aOrder.Length()) {
    // No image loaded successfully, but still resolve without
    // any image data.
    LOG("FetchArtwork loaded no image.");
    return MediaMetadataBasePromise::CreateAndResolve(aMetadata, __func__);
  }
  const size_t realIndex = aOrder[aPos];
  MOZ_ASSERT(realIndex < aMetadata.mArtwork.Length());
  if (realIndex >= aMetadata.mArtwork.Length()) {
    return FetchArtwork(aMetadata, aDoc, aOrder, aPos + 1);
  }

  nsCOMPtr<nsIURI> uri;
  if (NS_WARN_IF(NS_FAILED(NS_NewURI(getter_AddRefs(uri),
                                     aMetadata.mArtwork[realIndex].mSrc)))) {
    return FetchArtwork(aMetadata, aDoc, aOrder, aPos + 1);
  }

  nsCOMPtr<nsIChannel> channel;
  if (NS_FAILED(
          NS_NewChannel(getter_AddRefs(channel), uri, aDoc,
                        nsILoadInfo::SEC_ALLOW_CROSS_ORIGIN_SEC_CONTEXT_IS_NULL,
                        nsIContentPolicy::TYPE_INTERNAL_IMAGE))) {
    return FetchArtwork(aMetadata, aDoc, aOrder, aPos + 1);
  }

  if (nsCOMPtr<nsIHttpChannel> httpChannel = do_QueryInterface(channel)) {
    auto referrerInfo = MakeRefPtr<ReferrerInfo>(*aDoc);
    if (NS_FAILED(httpChannel->SetReferrerInfo(referrerInfo))) {
      return FetchArtwork(aMetadata, aDoc, aOrder, aPos + 1);
    }
  }

  return image::FetchDecodedImage(uri, channel, gfx::IntSize{})
      ->Then(
          GetCurrentSerialEventTarget(), __func__,
          [metadata = aMetadata, doc = RefPtr{aDoc},
           order = CopyableTArray<size_t>(aOrder), pos = aPos,
           realIndex](already_AddRefed<imgIContainer> aImage) {
            nsCOMPtr<imgIContainer> image(std::move(aImage));
            // The promise should only be resolved for decoded images, so using
            // FLAG_SYNC_DECODE is just a precaution.
            if (RefPtr<mozilla::gfx::SourceSurface> surface =
                    image->GetFrame(imgIContainer::FRAME_FIRST,
                                    imgIContainer::FLAG_SYNC_DECODE |
                                        imgIContainer::FLAG_ASYNC_NOTIFY)) {
              if (RefPtr<mozilla::gfx::DataSourceSurface> dataSurface =
                      surface->GetDataSurface()) {
                MediaMetadataBase data(metadata);
                data.mArtwork[realIndex].mDataSurface = dataSurface;
                LOG("FetchArtwork successfully loaded and decoded an image.");
                return MediaMetadataBasePromise::CreateAndResolve(data,
                                                                  __func__);
              }
            }
            return FetchArtwork(metadata, doc, order, pos + 1);
          },
          [metadata = aMetadata, doc = RefPtr{aDoc},
           order = CopyableTArray<size_t>(aOrder),
           pos = aPos](nsresult aStatus) {
            return FetchArtwork(metadata, doc, order, pos + 1);
          });
}

RefPtr<MediaMetadataBasePromise> MediaMetadata::LoadMetadataArtwork(
    Document* aDoc) {
  MOZ_ASSERT(aDoc);
  // Try the largest artwork first so high-resolution artwork is preferred.
  CopyableTArray<size_t> order = GetMediaArtworkFetchOrder(*this);
  return FetchArtwork(*this, aDoc, order, 0);
}

static nsIURI* GetEntryBaseURL() {
  nsCOMPtr<Document> doc = GetEntryDocument();
  return doc ? doc->GetDocBaseURI() : nullptr;
}

// `aURL` is an inout parameter.
static nsresult ResolveURL(nsString& aURL, nsIURI* aBaseURI) {
  nsCOMPtr<nsIURI> uri;
  nsresult rv = NS_NewURI(getter_AddRefs(uri), aURL,
                          /* UTF-8 for charset */ nullptr, aBaseURI);
  if (NS_FAILED(rv)) {
    return rv;
  }

  nsAutoCString spec;
  rv = uri->GetSpec(spec);
  if (NS_FAILED(rv)) {
    return rv;
  }

  CopyUTF8toUTF16(spec, aURL);
  return NS_OK;
}

void MediaMetadata::SetArtworkInternal(const Sequence<MediaImage>& aArtwork,
                                       ErrorResult& aRv) {
  nsCOMPtr<nsIURI> baseURI = GetEntryBaseURL();

  nsTArray<MediaImageData> artwork;
  for (const MediaImage& image : aArtwork) {
    MediaImageData imageData(image);
    nsresult rv = ResolveURL(imageData.mSrc, baseURI);
    if (NS_WARN_IF(NS_FAILED(rv))) {
      aRv.ThrowTypeError<MSG_INVALID_URL>(NS_ConvertUTF16toUTF8(image.mSrc));
      return;
    }
    artwork.AppendElement(std::move(imageData));
  }

  mArtwork = std::move(artwork);
}

}  // namespace mozilla::dom
