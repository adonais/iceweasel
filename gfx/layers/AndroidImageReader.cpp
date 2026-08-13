/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "AndroidImageReader.h"

#include <android/hardware_buffer.h>
#include <media/NdkImage.h>
#include <media/NdkImageReader.h>

#include "GLContext.h"
#include "GLContextEGL.h"
#include "GLContextProvider.h"
#include "GLLibraryEGL.h"
#include "GLReadTexImageHelper.h"
#include "OGLShaderConfig.h"
#include "ScopedGLHelpers.h"
#include "mozilla/RemoteMediaManagerParent.h"
#include "mozilla/ScopeExit.h"
#include "mozilla/TimeStamp.h"
#include "mozilla/gfx/2D.h"
#include "mozilla/gfx/Logging.h"
#include "mozilla/layers/AndroidImageConsumer.h"
#include "mozilla/webrender/RenderThread.h"
#include "nsProxyRelease.h"

namespace mozilla {
namespace layers {

constinit static RefPtr<gl::GLContext> sAImageSnapshotContext;

AndroidImageReaderImage::AndroidImageReaderImage(
    const GpuProcessAndroidImageReaderId aImageReaderId,
    const gfx::IntSize& aSize, const bool aHasAlpha)
    : Image(nullptr, ImageFormat::ANDROID_IMAGE_READER),
      mImageReaderId(aImageReaderId),
      mFrameId(AndroidMediaCodecFrameId::GetNext()),
      mSize(aSize),
      mHasAlpha(aHasAlpha) {
  MOZ_ASSERT(XRE_IsGPUProcess());
}

AndroidImageReaderImage::~AndroidImageReaderImage() {
  auto* imageReaderMap = layers::GpuProcessAndroidImageReaderMap::Get();
  if (imageReaderMap) {
    imageReaderMap->MaybeReleaseFrameToCodec(mImageReaderId, mFrameId,
                                             /* aRender */ false);
  }
}

Maybe<SurfaceDescriptor> AndroidImageReaderImage::GetDesc() {
  return Nothing();
}

void AndroidImageReaderImage::OnSetCurrent() {}

bool AndroidImageReaderImage::MaybeReleaseFrameToCodec(bool aRender) {
  if (!mSetCurrentCallback) {
    return false;
  }

  bool ret = (*mSetCurrentCallback)(aRender);
  mSetCurrentCallback.reset();
  return ret;
}

nsresult AndroidImageReaderImage::BuildSurfaceDescriptorBuffer(
    SurfaceDescriptorBuffer& aSdBuffer, BuildSdbFlags aFlags,
    const std::function<MemoryOrShmem(uint32_t)>& aAllocate) {
  MOZ_ASSERT(RemoteMediaManagerParent::OnManagerThread());

  if (!sAImageSnapshotContext) {
    nsCString discardFailureId;
    sAImageSnapshotContext =
        gl::GLContextProvider::CreateHeadless({}, &discardFailureId);
    if (!sAImageSnapshotContext) {
      NS_WARNING("Failed to create snapshot GLContext");
      return NS_ERROR_FAILURE;
    }
  }

  auto* imageReaderMap = layers::GpuProcessAndroidImageReaderMap::Get();
  if (!imageReaderMap) {
    return NS_ERROR_FAILURE;
  }

  RefPtr<AndroidImageReader> imageReader =
      imageReaderMap->GetImageReader(mImageReaderId);
  if (!imageReader) {
    return NS_ERROR_FAILURE;
  }

  gfx::IntSize size = GetSize();
  // auto format = gfx::SurfaceFormat::R8G8B8X8
  auto format = gfx::SurfaceFormat::B8G8R8A8;

  uint8_t* buffer = nullptr;
  int32_t stride = 0;
  nsresult rv = Image::AllocateSurfaceDescriptorBufferRgb(
      size, format, buffer, aSdBuffer, stride, aAllocate);
  if (NS_FAILED(rv)) {
    return rv;
  }

  RefPtr<gfx::DataSourceSurface> surface;
  surface = gfx::Factory::CreateWrappingDataSourceSurface(buffer, stride, size,
                                                          format);
  if (!surface) {
    return NS_ERROR_FAILURE;
  }

  bool ret = imageReader->UpdateTexImageWithReadback(
      mFrameId, sAImageSnapshotContext, surface, size, format);
  if (!ret) {
    return NS_ERROR_FAILURE;
  }

  return NS_OK;
}

AndroidImageWrapper::AndroidImageWrapper(AndroidImageReader* aImageReader,
                                         AImage* aImage,
                                         AHardwareBuffer* aHardwareBuffer,
                                         const gfx::IntSize aSize,
                                         const gfx::SurfaceFormat aFormat,
                                         mozilla::UniqueFileHandle&& aFence)
    : mHardwareBuffer(aHardwareBuffer),
      mSize(aSize),
      mFormat(aFormat),
      mImageReader(aImageReader),
      mImage(aImage),
      mFence(std::move(aFence)) {
  MOZ_ASSERT(mImageReader);
  mImageReader->mAcquiredImageCount++;
}

AndroidImageWrapper::~AndroidImageWrapper() {
  AImage_delete(mImage);
  // XXX Add fence handling
  // AImage_deleteAsync(mImage fence);
  mImageReader->mAcquiredImageCount--;
}

mozilla::UniqueFileHandle AndroidImageWrapper::CloneFence() {
  auto fence = ipc::FileDescriptor(GetHandle());
  return fence.TakePlatformHandle();
}

/* static */
already_AddRefed<AndroidImageReader> AndroidImageReader::Create() {
  if (!XRE_IsGPUProcess()) {
    MOZ_ASSERT_UNREACHABLE("unexpected to be called");
    return nullptr;
  }

  auto* imageReaderMap = layers::GpuProcessAndroidImageReaderMap::Get();
  if (!imageReaderMap) {
    return nullptr;
  }

  RefPtr<AndroidImageReader> imageReader = new AndroidImageReader();
  bool ret = imageReader->Init();
  if (!ret) {
    return nullptr;
  }

  imageReaderMap->Register(imageReader);

  return imageReader.forget();
}

AndroidImageReader::AndroidImageReader()
    : mImageReaderId(GpuProcessAndroidImageReaderId::GetNext()),
      mMonitor("mozilla.layers.AndroidImageReader.mMonitor") {}

AndroidImageReader::~AndroidImageReader() {
  auto* imageReaderMap = layers::GpuProcessAndroidImageReaderMap::Get();
  if (imageReaderMap) {
    imageReaderMap->Unregister(mImageReaderId);
  }
  ReleaseResources();
}

bool AndroidImageReader::Init() {
  MonitorAutoLock lock(mMonitor);

  MOZ_ASSERT(!mInited);

  // Set the width, height and format to some default value. This parameters
  // are/maybe overriden by the producer sending buffers to this imageReader's
  // Surface.
  const int32_t width = 1, height = 1;
  uint64_t usage = AHARDWAREBUFFER_USAGE_GPU_SAMPLED_IMAGE;

  // XXX set if video could be used for overlay.
  // usage |= AHARDWAREBUFFER_USAGE_COMPOSER_OVERLAY;

  media_status_t result;
  AImageReader* reader = nullptr;
  result = AImageReader_newWithUsage(width, height, AIMAGE_FORMAT_PRIVATE,
                                     usage, mMaxImageCount, &reader);
  if (result != AMEDIA_OK) {
    gfxCriticalNoteOnce << "AImageReader_newWithUsage failed"
                        << static_cast<int32_t>(result);
    return false;
  }

  mAImageReader = reader;

  ANativeWindow* window = nullptr;
  result = AImageReader_getWindow(reader, &window);
  if (result != AMEDIA_OK) {
    gfxCriticalNoteOnce << "AImageReader_getWindow failed"
                        << static_cast<int32_t>(result);
    return false;
  }
  mNativeWindow = window;

  auto listener = std::make_unique<AImageReader_ImageListener>();
  listener->context = reinterpret_cast<void*>(this);
  listener->onImageAvailable = &AndroidImageReader::OnFrameAvailable;

  result = AImageReader_setImageListener(reader, listener.get());
  if (result != AMEDIA_OK) {
    gfxCriticalNoteOnce << "setImageListener failed"
                        << static_cast<int32_t>(result);
    return false;
  }

  MOZ_ASSERT(mAImageReader);
  MOZ_ASSERT(mNativeWindow);
  mInited = true;

  return true;
}

void AndroidImageReader::ReleaseResources() {
  MonitorAutoLock lock(mMonitor);

  if (!mAImageReader) {
    return;
  }

  AImageReader_setImageListener(mAImageReader, nullptr);

  // Delete all images before closing the associated image reader.

  // Delete the image reader.
  AImageReader_delete(mAImageReader);
  mAImageReader = nullptr;
  // mNativeWindow is not owned by AndroidImageReader.
  // It is owned by AImageReader.
  mNativeWindow = nullptr;
}

/* static */
void AndroidImageReader::OnFrameAvailable(void* aContext,
                                          AImageReader* aReader) {
  auto* reader = static_cast<AndroidImageReader*>(aContext);

  reader->NotifyFrameAvailable();
}

void AndroidImageReader::NotifyFrameAvailable() {
  MonitorAutoLock lock(mMonitor);
  mWaitingFrameAvailable = false;
  mMonitor.NotifyAll();
}

bool AndroidImageReader::UpdateTexImage(const AndroidMediaCodecFrameId aFrameId,
                                        gl::GLContext* aGL, GLuint aTexture,
                                        AndroidImageWrapper** aImage) {
  MOZ_ASSERT(aGL);
  MOZ_ASSERT(aImage);

  MonitorAutoLock lock(mMonitor);

  DebugOnly<bool> ret = DoUpdateTexImage(lock, aFrameId);
  if (!mCurrentImage || *aImage == mCurrentImage) {
    MOZ_ASSERT(!ret);
    return false;
  }

  MOZ_ASSERT(mCurrentImage);

  // XXX add fence handling

  const auto& gle = gl::GLContextEGL::Cast(aGL);
  const auto& egl = gle->mEgl;

  const EGLint attrs[] = {
      LOCAL_EGL_IMAGE_PRESERVED,
      LOCAL_EGL_TRUE,
      LOCAL_EGL_NONE,
  };

  auto* nativeBuffer = mCurrentImage->mHardwareBuffer;

  EGLClientBuffer clientBuffer =
      egl->mLib->fGetNativeClientBufferANDROID(nativeBuffer);
  EGLImage eglImage = egl->fCreateImage(
      EGL_NO_CONTEXT, LOCAL_EGL_NATIVE_BUFFER_ANDROID, clientBuffer, attrs);

  MOZ_ASSERT(eglImage);
  if (!eglImage) {
    return false;
  }

  aGL->fBindTexture(LOCAL_GL_TEXTURE_EXTERNAL, aTexture);
  aGL->fTexParameteri(LOCAL_GL_TEXTURE_EXTERNAL, LOCAL_GL_TEXTURE_WRAP_T,
                      LOCAL_GL_CLAMP_TO_EDGE);
  aGL->fTexParameteri(LOCAL_GL_TEXTURE_EXTERNAL, LOCAL_GL_TEXTURE_WRAP_S,
                      LOCAL_GL_CLAMP_TO_EDGE);
  aGL->fEGLImageTargetTexture2D(LOCAL_GL_TEXTURE_EXTERNAL, eglImage);
  egl->fDestroyImage(eglImage);

  *aImage = mCurrentImage;
  NS_ADDREF(*aImage);

  return true;
}

bool AndroidImageReader::UpdateTexImageWithReadback(
    AndroidMediaCodecFrameId aFrameId, gl::GLContext* aGL,
    gfx::DataSourceSurface* aSurface, const gfx::IntSize aSize,
    const gfx::SurfaceFormat aFormat) {
  MOZ_ASSERT(aGL);
  MOZ_ASSERT(aSurface);

  MonitorAutoLock lock(mMonitor);

  DoUpdateTexImage(lock, aFrameId);
  if (!mCurrentImage) {
    MOZ_ASSERT_UNREACHABLE("unexpected to be called");
    return false;
  }

  aGL->MakeCurrent();
  gl::ScopedTexture scopedTex(aGL);

  const auto& gle = gl::GLContextEGL::Cast(aGL);
  const auto& egl = gle->mEgl;

  const EGLint attrs[] = {
      LOCAL_EGL_IMAGE_PRESERVED,
      LOCAL_EGL_TRUE,
      LOCAL_EGL_NONE,
  };

  auto* nativeBuffer = mCurrentImage->mHardwareBuffer;

  EGLClientBuffer clientBuffer =
      egl->mLib->fGetNativeClientBufferANDROID(nativeBuffer);
  EGLImage eglImage = egl->fCreateImage(
      EGL_NO_CONTEXT, LOCAL_EGL_NATIVE_BUFFER_ANDROID, clientBuffer, attrs);

  MOZ_ASSERT(eglImage);

  if (!eglImage) {
    return false;
  }

  aGL->fBindTexture(LOCAL_GL_TEXTURE_EXTERNAL, scopedTex.Texture());
  aGL->fTexParameteri(LOCAL_GL_TEXTURE_EXTERNAL, LOCAL_GL_TEXTURE_WRAP_T,
                      LOCAL_GL_CLAMP_TO_EDGE);
  aGL->fTexParameteri(LOCAL_GL_TEXTURE_EXTERNAL, LOCAL_GL_TEXTURE_WRAP_S,
                      LOCAL_GL_CLAMP_TO_EDGE);
  aGL->fEGLImageTargetTexture2D(LOCAL_GL_TEXTURE_EXTERNAL, eglImage);
  egl->fDestroyImage(eglImage);

  ShaderConfigOGL config =
      ShaderConfigFromTargetAndFormat(LOCAL_GL_TEXTURE_EXTERNAL, aFormat);
  int shaderConfig = config.mFeatures;

  bool ret = aGL->ReadTexImageHelper()->ReadTexImage(
      aSurface, scopedTex.Texture(), LOCAL_GL_TEXTURE_EXTERNAL, aSize,
      gfx::Matrix4x4(), shaderConfig, /* aYInvert */ false);
  if (!ret) {
    return false;
  }

  return true;
}

bool AndroidImageReader::DoUpdateTexImage(const MonitorAutoLock& aProofOfLock,
                                          AndroidMediaCodecFrameId aFrameId) {
  MOZ_ASSERT(static_cast<int32_t>(mAcquiredImageCount) <= mMaxImageCount);

  if (mCurrentFrameId == aFrameId) {
    return false;
  }

  // Limit as only one thread could do DoUpdateTexImage()
  const TimeDuration pendingTimeout = TimeDuration::FromMilliseconds(20);
  while (mIsPendingNextImage) {
    CVStatus status = mMonitor.Wait(pendingTimeout);
    if (status == CVStatus::Timeout) {
      gfxCriticalNoteOnce << "Pending next image wait timeout";
      return false;
    }
  }
  MOZ_ASSERT(!mIsPendingNextImage);

  auto scopeExit = MakeScopeExit([&]() MOZ_REQUIRES(mMonitor) {
    mIsPendingNextImage = false;
    mMonitor.NotifyAll();
  });

  mIsPendingNextImage = true;

  MOZ_ASSERT(!mWaitingFrameAvailable);
  mWaitingFrameAvailable = true;

  if (!MaybeReleaseFrameToCodec(aProofOfLock, aFrameId, /* aRender */ true)) {
    mWaitingFrameAvailable = false;
    return false;
  }

  const TimeDuration timeout = TimeDuration::FromMilliseconds(20);

  while (mWaitingFrameAvailable) {
    CVStatus status = mMonitor.Wait(timeout);
    if (status == CVStatus::Timeout) {
      gfxCriticalNoteOnce << "UpdateTexImage wait timeout";
      return false;
    }
  }

  mWaitingFrameAvailable = false;

  AImage* image = nullptr;
  media_status_t ret = AMEDIA_OK;
  UniqueFileHandle fence;
  ret = AImageReader_acquireNextImageAsync(mAImageReader, &image,
                                           getter_Transfers(fence));
  // XXX Add AImageReader_acquireLatestImageAsync() usage

  switch (ret) {
    case AMEDIA_ERROR_INVALID_PARAMETER:
      MOZ_ASSERT_UNREACHABLE("unexpected to be called");
      return false;
    case AMEDIA_IMGREADER_MAX_IMAGES_ACQUIRED:
      MOZ_ASSERT_UNREACHABLE("unexpected to be called");
      return false;
    case AMEDIA_IMGREADER_NO_BUFFER_AVAILABLE:
      return false;
    case AMEDIA_ERROR_UNKNOWN:
      return false;
    case AMEDIA_OK:
      // Call succeeded.
      break;
    default:
      MOZ_ASSERT_UNREACHABLE("unexpected to be called");
      return false;
  }

  if (!image) {
    return false;
  }

  AHardwareBuffer* nativeBuffer = nullptr;
  media_status_t result = AImage_getHardwareBuffer(image, &nativeBuffer);
  if (!nativeBuffer) {
    gfxCriticalNoteOnce << "AImage_getHardwareBuffer failed"
                        << static_cast<int32_t>(result);
    AImage_delete(image);
    // XXX Add fence handling
    // AImage_deleteAsync(image, fence);
    return false;
  }

  AHardwareBuffer_Desc bufferInfo = {};
  AHardwareBuffer_describe(nativeBuffer, &bufferInfo);

  const gfx::IntSize size = gfx::IntSize(bufferInfo.width, bufferInfo.height);
  // XXX
  const gfx::SurfaceFormat format = gfx::SurfaceFormat::R8G8B8X8;

  // XXX add crop handling

  mCurrentImage = new AndroidImageWrapper(this, image, nativeBuffer, size,
                                          format, std::move(fence));

  MOZ_ASSERT(static_cast<int32_t>(mAcquiredImageCount) <= mMaxImageCount);

  return true;
}

ANativeWindow* AndroidImageReader::GetANativeWindow() {
  MonitorAutoLock lock(mMonitor);
  return mNativeWindow;
}

RefPtr<AndroidImageWrapper> AndroidImageReader::GetCurrentImage() {
  MonitorAutoLock lock(mMonitor);
  return mCurrentImage;
}

void AndroidImageReader::RegisterReaderImage(
    AndroidImageReaderImage* aReaderImage) {
  if (!aReaderImage) {
    MOZ_ASSERT_UNREACHABLE("unexpected to be called");
    return;
  }
  MonitorAutoLock lock(mMonitor);

  MOZ_ASSERT(mPendingFrames.find(aReaderImage->mFrameId) ==
             mPendingFrames.end());
  mPendingFrames.emplace(aReaderImage->mFrameId, aReaderImage);
}

bool AndroidImageReader::MaybeReleaseFrameToCodec(
    const AndroidMediaCodecFrameId aFrameId, const bool aRender) {
  MonitorAutoLock lock(mMonitor);
  return MaybeReleaseFrameToCodec(lock, aFrameId, aRender);
}
bool AndroidImageReader::MaybeReleaseFrameToCodec(
    const MonitorAutoLock& aProofOfLock,
    const AndroidMediaCodecFrameId aFrameId, const bool aRender) {
  auto it = mPendingFrames.find(aFrameId);
  if (it == mPendingFrames.end()) {
    return false;
  }

  bool ret = it->second->MaybeReleaseFrameToCodec(aRender);
  mPendingFrames.erase(it);

  return ret;
}

StaticAutoPtr<GpuProcessAndroidImageReaderMap>
    GpuProcessAndroidImageReaderMap::sInstance;

/* static */
void GpuProcessAndroidImageReaderMap::Init() {
  MOZ_ASSERT(XRE_IsGPUProcess());

  sInstance = new GpuProcessAndroidImageReaderMap();
}

/* static */
void GpuProcessAndroidImageReaderMap::Shutdown() { sInstance = nullptr; }

GpuProcessAndroidImageReaderMap::GpuProcessAndroidImageReaderMap()
    : mMonitor("GpuProcessAndroidImageReaderMap.mMonitor") {}

void GpuProcessAndroidImageReaderMap::Register(
    AndroidImageReader* aImageReader) {
  MOZ_ASSERT(aImageReader);

  if (!aImageReader) {
    MOZ_ASSERT_UNREACHABLE("unexpected to be called");
    return;
  }

  MonitorAutoLock lock(mMonitor);

  auto it = mImageReaders.find(aImageReader->mImageReaderId);
  if (it != mImageReaders.end()) {
    MOZ_ASSERT_UNREACHABLE("unexpected to be called");
    return;
  }

  mImageReaders.emplace(aImageReader->mImageReaderId,
                        MakeUnique<ImageReaderHolder>(aImageReader));
}

void GpuProcessAndroidImageReaderMap::Unregister(
    GpuProcessAndroidImageReaderId aImageReaderId) {
  MonitorAutoLock lock(mMonitor);

  const auto it = mImageReaders.find(aImageReaderId);
  MOZ_ASSERT(it != mImageReaders.end());
  if (it == mImageReaders.end()) {
    MOZ_ASSERT_UNREACHABLE("unexpected to be called");
    return;
  }
  mImageReaders.erase(it);
}

RefPtr<AndroidImageReader> GpuProcessAndroidImageReaderMap::GetImageReader(
    GpuProcessAndroidImageReaderId aImageReaderId) {
  MonitorAutoLock lock(mMonitor);

  const auto it = mImageReaders.find(aImageReaderId);
  if (it == mImageReaders.end()) {
    return nullptr;
  }
  return it->second->mImageReader;
}

bool GpuProcessAndroidImageReaderMap::MaybeReleaseFrameToCodec(
    const GpuProcessAndroidImageReaderId aImageReaderId,
    const AndroidMediaCodecFrameId aFrameId, const bool aRender) {
  RefPtr<AndroidImageReader> reader = GetImageReader(aImageReaderId);
  if (!reader) {
    return false;
  }
  return reader->MaybeReleaseFrameToCodec(aFrameId, aRender);
}

RefPtr<AndroidImageConsumer> GpuProcessAndroidImageReaderMap::GetImageConsumer(
    const GpuProcessAndroidImageReaderId aImageReaderId, gl::GLContext* aGL) {
  MOZ_ASSERT(wr::RenderThread::IsInRenderThread());
  MOZ_ASSERT(aGL);

  MonitorAutoLock lock(mMonitor);

  const auto it = mImageReaders.find(aImageReaderId);
  if (it == mImageReaders.end()) {
    return nullptr;
  }

  auto* holder = it->second.get();

  if (holder->mImageConsumer) {
    if (holder->mImageConsumer->mGL == aGL) {
      return holder->mImageConsumer;
    }
    MOZ_ASSERT_UNREACHABLE("unexpected to be called");
    return nullptr;
  }

  RefPtr<AndroidImageConsumer> imageConsumer;
  imageConsumer = AndroidImageConsumer::Create(holder->mImageReader, aGL);
  if (!imageConsumer) {
    MOZ_ASSERT_UNREACHABLE("unexpected to be called");
    return nullptr;
  }

  holder->mImageConsumer = imageConsumer;

  return imageConsumer;
}

void GpuProcessAndroidImageReaderMap::UnregisterImageConsumer(
    GpuProcessAndroidImageReaderId aImageReaderId) {
  MOZ_ASSERT(wr::RenderThread::IsInRenderThread());

  MonitorAutoLock lock(mMonitor);

  const auto it = mImageReaders.find(aImageReaderId);
  if (it == mImageReaders.end()) {
    return;
  }

  auto* holder = it->second.get();

  MOZ_ASSERT(holder->mImageConsumer);
  holder->mImageConsumer = nullptr;
}

GpuProcessAndroidImageReaderMap::ImageReaderHolder::ImageReaderHolder(
    AndroidImageReader* aImageReader)
    : mImageReader(aImageReader) {}

GpuProcessAndroidImageReaderMap::ImageReaderHolder::~ImageReaderHolder() {}

}  // namespace layers
}  // namespace mozilla
