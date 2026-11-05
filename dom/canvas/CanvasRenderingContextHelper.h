/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef MOZILLA_DOM_CANVASRENDERINGCONTEXTHELPER_H_
#define MOZILLA_DOM_CANVASRENDERINGCONTEXTHELPER_H_

#include "mozilla/Maybe.h"
#include "mozilla/UniquePtr.h"
#include "mozilla/Variant.h"
#include "mozilla/dom/BindingDeclarations.h"
#include "mozilla/dom/CanvasRenderingContext2DBinding.h"
#include "mozilla/dom/WebGLRenderingContextBinding.h"
#include "mozilla/gfx/Point.h"
#include "mozilla/layers/LayersTypes.h"
#include "nsSize.h"

class nsICanvasRenderingContextInternal;
class nsICookieJarSettings;
class nsIGlobalObject;

namespace mozilla {

class ErrorResult;

namespace layers {
class SurfaceDescriptor;
}  // namespace layers

namespace CanvasUtils {
enum class ImageExtraction;
}
namespace dom {

class BlobCallback;
class EncodeCompleteCallback;

enum class CanvasContextType : uint8_t {
  NoContext,
  Canvas2D,
  OffscreenCanvas2D,
  WebGL1,
  WebGL2,
  WebGPU,
  ImageBitmap
};

class CanvasRenderingContextOptions {
 public:
  CanvasRenderingContextOptions() : mVariant(UnknownOptions()) {}

  template <typename T>
  bool is() const {
    return mVariant.is<T>();
  }

  template <typename T>
  const T& as() const {
    return mVariant.as<T>();
  }

  MOZ_IMPLICIT operator bool() const { return !mVariant.is<UnknownOptions>(); }

  bool Init(JSContext* aCx, CanvasContextType aContextType,
            JS::Handle<JS::Value> aContextOptions, ErrorResult& aRv);

 private:
  struct UnknownOptions {};
  Variant<CanvasRenderingContext2DSettings, WebGLContextAttributes,
          UnknownOptions>
      mVariant;
};

/**
 * Povides common RenderingContext functionality used by both OffscreenCanvas
 * and HTMLCanvasElement.
 */
class CanvasRenderingContextHelper {
 public:
  CanvasRenderingContextHelper();

  virtual bool GetOpaqueAttr() = 0;

 protected:
  bool InitOrUpdateContext(
      const nsCOMPtr<nsICanvasRenderingContextInternal>& aContext,
      const CanvasRenderingContextOptions* aOptions);
  void UpdateContext();

  // Called after UpdateContext, but only if it succeeded.
  virtual void AfterUpdateContext() {}

  virtual nsresult ParseParams(JSContext* aCx, const nsAString& aType,
                               const JS::Value& aEncoderOptions,
                               nsAString& outParams,
                               bool* const outCustomParseOptions);

  void ToBlob(JSContext* aCx, EncodeCompleteCallback* aCallback,
              const nsAString& aType, JS::Handle<JS::Value> aParams,
              CanvasUtils::ImageExtraction aExtractionBehavior,
              ErrorResult& aRv);

  void ToBlob(EncodeCompleteCallback* aCallback, nsAString& aType,
              const nsAString& aEncodeOptions, bool aUsingCustomOptions,
              CanvasUtils::ImageExtraction aExtractionBehavior,
              ErrorResult& aRv);

  virtual UniquePtr<uint8_t[]> GetImageBuffer(
      CanvasUtils::ImageExtraction aExtractionBehavior, int32_t* aOutFormat,
      gfx::IntSize* aOutImageSize);

  nsICookieJarSettings* GetCookieJarSettings() const;

  bool GetOrCreateContext(CanvasContextType aContextType,
                          const CanvasRenderingContextOptions& aContextOptions,
                          ErrorResult& aRv);

  virtual already_AddRefed<nsICanvasRenderingContextInternal> CreateContext(
      CanvasContextType aContextType);

  already_AddRefed<nsICanvasRenderingContextInternal> CreateContextHelper(
      CanvasContextType aContextType, layers::LayersBackend aCompositorBackend);

  virtual CSSIntSize GetWidthHeight() = 0;

  CanvasContextType mCurrentContextType;
  nsCOMPtr<nsICanvasRenderingContextInternal> mCurrentContext;
};

bool ValidSurfaceDescriptorForRemoteCanvas2d(
    const layers::SurfaceDescriptor& aSd,
    Maybe<layers::SurfaceDescriptor>* aResultSd = nullptr);

}  // namespace dom
namespace CanvasUtils {
bool GetCanvasContextType(const nsAString&, dom::CanvasContextType* const);
}  // namespace CanvasUtils
}  // namespace mozilla

#endif  // MOZILLA_DOM_CANVASRENDERINGCONTEXTHELPER_H_
