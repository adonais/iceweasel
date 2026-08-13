/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef DOM_MEDIA_MEDIASESSION_MEDIASESSIONIPCUTILS_H_
#define DOM_MEDIA_MEDIASESSION_MEDIASESSIONIPCUTILS_H_

#include "MediaMetadata.h"
#include "ipc/EnumSerializer.h"
#include "ipc/IPCMessageUtils.h"
#include "mozilla/Maybe.h"
#include "mozilla/dom/BindingIPCUtils.h"
#include "mozilla/dom/DOMTypes.h"
#include "mozilla/dom/MediaSession.h"
#include "mozilla/dom/MediaSessionBinding.h"
#include "nsContentUtils.h"

namespace mozilla {
namespace dom {

typedef Maybe<MediaMetadataBase> MaybeMediaMetadataBase;

}  // namespace dom
}  // namespace mozilla

namespace IPC {

template <>
struct ParamTraits<mozilla::dom::MediaImageData> {
  typedef mozilla::dom::MediaImageData paramType;

  static void Write(MessageWriter* aWriter, const paramType& aParam) {
    WriteParam(aWriter, aParam.mSizes);
    WriteParam(aWriter, aParam.mSrc);
    WriteParam(aWriter, aParam.mType);

    mozilla::Maybe<mozilla::dom::IPCImage> image;
    if (aParam.mDataSurface) {
      image = nsContentUtils::SurfaceToIPCImage(*aParam.mDataSurface);
    }
    WriteParam(aWriter, std::move(image));
  }

  static bool Read(MessageReader* aReader, paramType* aResult) {
    if (!ReadParam(aReader, &(aResult->mSizes)) ||
        !ReadParam(aReader, &(aResult->mSrc)) ||
        !ReadParam(aReader, &(aResult->mType))) {
      return false;
    }

    mozilla::Maybe<mozilla::dom::IPCImage> image;
    if (!ReadParam(aReader, &image)) {
      return false;
    }
    if (image) {
      aResult->mDataSurface = nsContentUtils::IPCImageToSurface(*image);
    }
    return true;
  }
};

DEFINE_IPC_SERIALIZER_WITH_FIELDS(mozilla::dom::MediaMetadataBase, mTitle,
                                  mArtist, mAlbum, mUrl, mArtwork);

DEFINE_IPC_SERIALIZER_WITH_FIELDS(mozilla::dom::PositionState, mDuration,
                                  mPlaybackRate, mLastReportedPlaybackPosition,
                                  mPositionUpdatedTime);

template <>
struct ParamTraits<mozilla::dom::MediaSessionPlaybackState>
    : public mozilla::dom::WebIDLEnumSerializer<
          mozilla::dom::MediaSessionPlaybackState> {};

template <>
struct ParamTraits<mozilla::dom::MediaSessionAction>
    : public mozilla::dom::WebIDLEnumSerializer<
          mozilla::dom::MediaSessionAction> {};

}  // namespace IPC

#endif  // DOM_MEDIA_MEDIASESSION_MEDIASESSIONIPCUTILS_H_
