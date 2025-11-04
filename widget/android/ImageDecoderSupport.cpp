/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "ImageDecoderSupport.h"

#include "imgITools.h"
#include "gfxUtils.h"
#include "AndroidGraphics.h"
#include "JavaExceptions.h"
#include "mozilla/gfx/Point.h"
#include "mozilla/gfx/Swizzle.h"
#include "mozilla/image/FetchDecodedImage.h"
#include "mozilla/java/ImageWrappers.h"
#include "nsIChannel.h"
#include "nsNetUtil.h"

using namespace mozilla::gfx;

namespace mozilla::widget {

static void CompleteExceptionally(java::GeckoResult::Param aResult,
                                  nsresult aRv) {
  nsPrintfCString error("Could not process image: 0x%08X", uint32_t(aRv));
  aResult->CompleteExceptionally(
      java::Image::ImageProcessingException::New(error.get())
          .Cast<jni::Throwable>());
}

static nsresult SendBitmap(java::GeckoResult::Param aResult,
                           imgIContainer* aImage, int32_t aDesiredLength) {
  RefPtr<gfx::SourceSurface> surface;

  if (aDesiredLength > 0) {
    surface = aImage->GetFrameAtSize(
        gfx::IntSize(aDesiredLength, aDesiredLength),
        imgIContainer::FRAME_FIRST, imgIContainer::FLAG_ASYNC_NOTIFY);
  } else {
    surface = aImage->GetFrame(imgIContainer::FRAME_FIRST,
                               imgIContainer::FLAG_ASYNC_NOTIFY);
  }

  NS_ENSURE_TRUE(surface, NS_ERROR_FAILURE);
  RefPtr<DataSourceSurface> dataSurface = surface->GetDataSurface();

  NS_ENSURE_TRUE(dataSurface, NS_ERROR_FAILURE);
  int32_t width = dataSurface->GetSize().width;
  int32_t height = dataSurface->GetSize().height;

  DataSourceSurface::ScopedMap sourceMap(dataSurface, DataSourceSurface::READ);

  // Android's Bitmap only supports R8G8B8A8, so we need to convert the
  // data to the right format
  RefPtr<DataSourceSurface> destDataSurface =
      Factory::CreateDataSourceSurfaceWithStride(dataSurface->GetSize(),
                                                 SurfaceFormat::R8G8B8A8,
                                                 sourceMap.GetStride());
  NS_ENSURE_TRUE(destDataSurface, NS_ERROR_FAILURE);

  DataSourceSurface::ScopedMap destMap(destDataSurface,
                                       DataSourceSurface::READ_WRITE);

  SwizzleData(sourceMap.GetData(), sourceMap.GetStride(), surface->GetFormat(),
              destMap.GetData(), destMap.GetStride(), SurfaceFormat::R8G8B8A8,
              destDataSurface->GetSize());

  auto pixels = mozilla::jni::ByteBuffer::New(
      reinterpret_cast<int8_t*>(destMap.GetData()),
      destMap.GetStride() * height);
  auto bitmap = java::sdk::Bitmap::CreateBitmap(
      width, height, java::sdk::Bitmap::Config::ARGB_8888());
  bitmap->CopyPixelsFromBuffer(pixels);
  aResult->Complete(bitmap);

  return NS_OK;
}

/* static */ void ImageDecoderSupport::Decode(jni::String::Param aUri,
                                              int32_t aDesiredLength,
                                              jni::Object::Param aResult) {
  auto result = java::GeckoResult::LocalRef(aResult);

  nsCOMPtr<nsIURI> uri;
  nsresult rv = NS_NewURI(getter_AddRefs(uri), aUri->ToString());
  if (NS_FAILED(rv)) {
    CompleteExceptionally(result, rv);
    return;
  }

  gfx::IntSize size{};
  if (aDesiredLength > 0) {
    size = IntSize(aDesiredLength, aDesiredLength);
  }

  mozilla::image::FetchDecodedImage(uri, size,
                                    nsContentUtils::GetSystemPrincipal())
      ->Then(
          GetCurrentSerialEventTarget(), __func__,
          [result = java::GeckoResult::GlobalRef(result),
           aDesiredLength](already_AddRefed<imgIContainer> aImage) {
            nsCOMPtr<imgIContainer> image(std::move(aImage));

            nsresult rv = SendBitmap(result, image, aDesiredLength);
            if (NS_FAILED(rv)) {
              CompleteExceptionally(result, rv);
            }
          },
          [result = java::GeckoResult::GlobalRef(result)](nsresult aStatus) {
            CompleteExceptionally(result, aStatus);
          });
}

}  // namespace mozilla::widget
