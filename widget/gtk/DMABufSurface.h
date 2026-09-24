/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef DMABufSurface_h_
#define DMABufSurface_h_

#include <stdint.h>

#include <functional>

#include "GLTypes.h"
#include "ImageContainer.h"
#include "mozilla/Mutex.h"
#include "mozilla/gfx/Types.h"
#include "mozilla/webgpu/ffi/wgpu.h"
#include "mozilla/widget/BufferSurface.h"
#include "mozilla/widget/DMABufFormats.h"
#include "mozilla/widget/va_drmcommon.h"
#include "nsISupportsImpl.h"

typedef void* EGLImageKHR;
typedef void* EGLSyncKHR;

#define DMABUF_BUFFER_PLANES 4

namespace mozilla {
namespace gfx {
class DataSourceSurface;
class FileHandleWrapper;
}  // namespace gfx
namespace layers {
class MemoryOrShmem;
class SurfaceDescriptor;
class SurfaceDescriptorBuffer;
class SurfaceDescriptorDMABuf;
}  // namespace layers
namespace gl {
class GLContext;
}
namespace webgpu {
namespace ffi {
struct WGPUDMABufInfo;
}
}  // namespace webgpu
namespace widget {
class DMABufDeviceLock;
}  // namespace widget
}  // namespace mozilla

typedef enum {
  // Use alpha pixel format
  DMABUF_ALPHA = 1 << 0,
  // Surface is used as texture and may be also shared
  DMABUF_TEXTURE = 1 << 1,
  // Surface is used for direct rendering (wl_buffer).
  DMABUF_SCANOUT = 1 << 2,
  // Use modifiers. Such dmabuf surface may have more planes
  // and complex internal structure (tiling/compression/etc.)
  // so we can't do direct rendering to it.
  DMABUF_USE_MODIFIERS = 1 << 3,
} DMABufSurfaceFlags;

class DMABufSurfaceRGBA;
class DMABufSurfaceYUV;
struct wl_buffer;

namespace mozilla::layers {
class PlanarYCbCrImage;
}

class DMABufSurface : public BufferSurface {
 public:
  nsAutoCString GetDebugTag() const;

  // Import surface from SurfaceDescriptor. This is usually
  // used to copy surface from another process over IPC.
  // When a global reference counter was created for the surface
  // (see bellow) it's automatically referenced.
  static already_AddRefed<DMABufSurface> CreateDMABufSurface(
      const mozilla::layers::SurfaceDescriptor& aDesc);

  // Export surface to another process via. SurfaceDescriptor.
  virtual bool Serialize(
      mozilla::layers::SurfaceDescriptor& aOutDescriptor) = 0;

  // WidthAligned/HeightAligned is size of buffer while
  // Width/Height is size of actual content.
  virtual int GetWidthAligned(int aPlane = 0) = 0;
  virtual int GetHeightAligned(int aPlane = 0) = 0;

  virtual bool HoldsTexture() = 0;

#ifdef MOZ_LOGGING
  bool IsMapped(int aPlane = 0) { return (mMappedRegion[aPlane] != nullptr); };
  void Unmap(int aPlane = 0);
#endif

  virtual DMABufSurfaceRGBA* GetAsDMABufSurfaceRGBA() { return nullptr; }
  virtual DMABufSurfaceYUV* GetAsDMABufSurfaceYUV() { return nullptr; }
  already_AddRefed<mozilla::gfx::DataSourceSurface> GetAsSourceSurface()
      override;

  virtual nsresult BuildSurfaceDescriptorBuffer(
      mozilla::layers::SurfaceDescriptorBuffer& aSdBuffer,
      mozilla::layers::Image::BuildSdbFlags aFlags,
      const std::function<mozilla::layers::MemoryOrShmem(uint32_t)>& aAllocate);

  void FenceSet();
  void FenceWait(mozilla::gl::GLContext* aGLContext = nullptr);
  static void FenceWaitFd(RefPtr<mozilla::gl::GLContext> aGL,
                          RefPtr<mozilla::gfx::FileHandleWrapper> aSyncFd);

  void MaybeSemaphoreWait(GLuint aGlTexture);
  void SetSemaphoreFd(int aDuppedRawFd, bool aIsSyncFd = false);

  // Set and get a global surface UID. The UID is shared across process
  // and it's used to track surface lifetime in various parts of rendering
  // engine.
  uint32_t GetUID() const { return mUID; };

  // Get PID of process where surface was created. PID+UID gives global
  // surface ID which is unique for all used surfaces.
  uint32_t GetPID() const { return mPID; };

  bool Matches(DMABufSurface* aSurface) const {
    return mUID == aSurface->mUID && mPID == aSurface->mPID;
  }

  bool CanRecycle() const { return mCanRecycle && mPID; }
  void DisableRecycle() { mCanRecycle = false; }

  // Creates a global reference counter objects attached to the surface.
  // It's created as unreferenced, i.e. IsGlobalRefSet() returns false
  // right after GlobalRefCountCreate() call.
  //
  // The counter is shared by all surface instances across processes
  // so it tracks global surface usage.
  //
  // The counter is automatically referenced when a new surface instance is
  // created with SurfaceDescriptor (usually copied to another process over IPC)
  // and it's unreferenced when surface is deleted.
  //
  // So without any additional GlobalRefAdd()/GlobalRefRelease() calls
  // the IsGlobalRefSet() returns true if any other process use the surface.
  void GlobalRefCountCreate();
  void GlobalRefCountDelete();

  // If global reference counter was created by GlobalRefCountCreate()
  // returns true when there's an active surface reference.
  bool IsGlobalRefSet();

  // Add/Remove additional reference to the surface global reference counter.
  void GlobalRefAdd();
  void GlobalRefAddLocked(const mozilla::MutexAutoLock& aProofOfLock);

  void GlobalRefRelease();

  // Release all underlying data.
  virtual void ReleaseSurface() = 0;

#ifdef MOZ_LOGGING
  virtual void Clear(unsigned int aValue) {};
#endif

  static bool UseDmaBufGL(mozilla::gl::GLContext* aGLContext);
  static bool UseDmaBufExportExtension(mozilla::gl::GLContext* aGLContext);

  static void ReleaseSnapshotGLContext();

  static void InitMemoryReporting();

  DMABufSurface(SurfaceType aSurfaceType);

 protected:
  virtual bool Create(const mozilla::layers::SurfaceDescriptor& aDesc) = 0;

  static RefPtr<mozilla::gl::GLContext> ClaimSnapshotGLContext();
  static void ReturnSnapshotGLContext(
      RefPtr<mozilla::gl::GLContext> aGLContext);

  // Import global ref count object from IPC by file descriptor.
  // This adds global ref count reference to the surface.
  void GlobalRefCountImport(int aFd);
  // Export global ref count object by file descriptor.
  int GlobalRefCountExport();

  // Returns true if the mem was actually released as it can be called
  // for empty surface too.
  [[nodiscard]] bool ReleaseDMABuf();

#ifdef MOZ_LOGGING
  void* MapInternal(uint32_t aX, uint32_t aY, uint32_t aWidth, uint32_t aHeight,
                    uint32_t* aStride, int aGbmFlags, int aPlane = 0);
#endif

  virtual bool OpenFileDescriptorForPlane(
      mozilla::widget::DMABufDeviceLock* aDeviceLock, int aPlane) = 0;

  bool OpenFileDescriptors(mozilla::widget::DMABufDeviceLock* aDeviceLock);
  bool CloseFileDescriptors();

  nsresult ReadIntoBuffer(mozilla::gl::GLContext* aGLContext, uint8_t* aData,
                          int32_t aStride, const mozilla::gfx::IntSize& aSize,
                          mozilla::gfx::SurfaceFormat aFormat);

  virtual ~DMABufSurface();

  // Configuration of surface planes, it depends on surface modifiers.
  // RGBA surface may use one RGBA plane or two planes (RGB + A)
  // YUV surfaces use various planes setup (Y + UV planes or Y+U+V planes)
  int mBufferPlaneCount = 0;
  RefPtr<mozilla::gfx::FileHandleWrapper> mDmabufFds[DMABUF_BUFFER_PLANES];
  int32_t mStrides[DMABUF_BUFFER_PLANES] = {};
  int32_t mOffsets[DMABUF_BUFFER_PLANES] = {};

  struct gbm_bo* mGbmBufferObject[DMABUF_BUFFER_PLANES];
  uint32_t mGbmBufferFlags;

#ifdef MOZ_LOGGING
  void* mMappedRegion[DMABUF_BUFFER_PLANES];
  void* mMappedRegionData[DMABUF_BUFFER_PLANES];
  uint32_t mMappedRegionStride[DMABUF_BUFFER_PLANES];
#endif

  RefPtr<mozilla::gfx::FileHandleWrapper> mSyncFd;
  RefPtr<mozilla::gfx::FileHandleWrapper> mSemaphoreFd;
  bool mSemaphoreFdIsSyncFd = false;

  // Inter process properties, used to share DMABuf among various processes
  // like RDD/Main.

  // Global refcount tracks DMABuf usage by rendering process,
  // it's used for surface recycle.
  int mGlobalRefCountFd;

  // mUID/mPID is set when DMABuf is created and/or exported to different
  // process. Allows to identify surfaces created by different process.
  uint32_t mUID;
  uint32_t mPID;

  // Internal DMABuf flag, it's not exported (Serialized).
  // If set to false we can't recycle this surfaces as we can't ensure
  // mUID/mPID consistency. Also mPID may be zero in this case.
  // Applies to copied DMABuf surfaces for instance.
  bool mCanRecycle;

  mozilla::Mutex mSurfaceLock MOZ_UNANNOTATED;
};

class DMABufSurfaceRGBA final : public DMABufSurface {
 public:
  static already_AddRefed<DMABufSurfaceRGBA> CreateDMABufSurface(
      mozilla::gl::GLContext* aGLContext, int aWidth, int aHeight,
      int aDMABufSurfaceFlags = 0,
      RefPtr<mozilla::widget::DRMFormat> aFormat = nullptr);
  static already_AddRefed<DMABufSurface> CreateDMABufSurface(
      RefPtr<mozilla::gfx::FileHandleWrapper>&& aFd,
      const mozilla::webgpu::ffi::WGPUDMABufInfo& aDMABufInfo, int aWidth,
      int aHeight);

  bool Serialize(mozilla::layers::SurfaceDescriptor& aOutDescriptor) override;

  DMABufSurfaceRGBA* GetAsDMABufSurfaceRGBA() override { return this; }

  void ReleaseSurface() override;

  bool CopyFrom(class DMABufSurface* aSourceSurface);

  int GetWidth(int aPlane = 0) override { return mWidth; };
  int GetHeight(int aPlane = 0) override { return mHeight; };
  int GetWidthAligned(int aPlane = 0) override { return mWidth; };
  int GetHeightAligned(int aPlane = 0) override { return mHeight; };

#ifdef MOZ_LOGGING
  void* MapReadOnly(uint32_t aX, uint32_t aY, uint32_t aWidth, uint32_t aHeight,
                    uint32_t* aStride = nullptr);
  void* MapReadOnly(uint32_t* aStride = nullptr);
  void* Map(uint32_t aX, uint32_t aY, uint32_t aWidth, uint32_t aHeight,
            uint32_t* aStride = nullptr);
  void* Map(uint32_t* aStride = nullptr);
  void* GetMappedRegion(int aPlane = 0) { return mMappedRegion[aPlane]; };
  uint32_t GetMappedRegionStride(int aPlane = 0) {
    return mMappedRegionStride[aPlane];
  };
  virtual void Clear(unsigned int aValue) override;
#endif

  bool CreateTexture(mozilla::gl::GLContext* aGLContext,
                     int aPlane = 0) override;
  void ReleaseTextures() override;
  GLuint GetTexture(int aPlane = 0) override { return mTexture; };
  EGLImageKHR GetEGLImage(int aPlane = 0) override { return mEGLImage; };

#ifdef MOZ_WAYLAND
  wl_buffer* CreateWlBuffer() override;
#endif

  int GetTextureCount() override { return 1; };
  bool HoldsTexture() override;

  DMABufSurfaceRGBA();
  DMABufSurfaceRGBA(const DMABufSurfaceRGBA&) = delete;
  DMABufSurfaceRGBA& operator=(const DMABufSurfaceRGBA&) = delete;

 private:
  ~DMABufSurfaceRGBA();

  bool Create(mozilla::gl::GLContext* aGLContext, int aWidth, int aHeight,
              int aDMABufSurfaceFlags,
              RefPtr<mozilla::widget::DRMFormat> aFormat = nullptr);
  bool CreateGBM(int aWidth, int aHeight, int aDMABufSurfaceFlags,
                 RefPtr<mozilla::widget::DRMFormat> aFormat);
  bool CreateExport(mozilla::gl::GLContext* aGLContext, int aWidth, int aHeight,
                    int aDMABufSurfaceFlags,
                    const mozilla::widget::DRMFormat* aFormat);

  bool Create(const mozilla::layers::SurfaceDescriptor& aDesc) override;
  bool Create(RefPtr<mozilla::gfx::FileHandleWrapper>&& aFd,
              const mozilla::webgpu::ffi::WGPUDMABufInfo& aDMABufInfo,
              int aWidth, int aHeight);

  bool ImportSurfaceDescriptor(const mozilla::layers::SurfaceDescriptor& aDesc);
  bool OpenFileDescriptorForPlane(
      mozilla::widget::DMABufDeviceLock* aDeviceLock, int aPlane) override;

 private:
  int mWidth;
  int mHeight;

  EGLImageKHR mEGLImage;
  GLuint mTexture;
  uint64_t mBufferModifier;
};

class DMABufSurfaceYUV final : public DMABufSurface {
 public:
  DMABufSurfaceYUV(const DMABufSurfaceYUV&) = delete;
  DMABufSurfaceYUV& operator=(const DMABufSurfaceYUV&) = delete;

  static already_AddRefed<DMABufSurfaceYUV> CreateYUVSurface(
      const VADRMPRIMESurfaceDescriptor& aDesc, int aWidth, int aHeight);
  static already_AddRefed<DMABufSurfaceYUV> CopyYUVSurface(
      const VADRMPRIMESurfaceDescriptor& aVaDesc, int aWidth, int aHeight);
  static void ReleaseVADRMPRIMESurfaceDescriptor(
      VADRMPRIMESurfaceDescriptor& aDesc);

  bool Serialize(mozilla::layers::SurfaceDescriptor& aOutDescriptor) override;

  DMABufSurfaceYUV* GetAsDMABufSurfaceYUV() override { return this; };

  nsresult BuildSurfaceDescriptorBuffer(
      mozilla::layers::SurfaceDescriptorBuffer& aSdBuffer,
      mozilla::layers::Image::BuildSdbFlags aFlags,
      const std::function<mozilla::layers::MemoryOrShmem(uint32_t)>& aAllocate)
      override;

  int GetWidth(int aPlane = 0) override { return mWidth[aPlane]; }
  int GetHeight(int aPlane = 0) override { return mHeight[aPlane]; }

  int GetWidthAligned(int aPlane = 0) override { return mWidthAligned[aPlane]; }
  int GetHeightAligned(int aPlane = 0) override {
    return mHeightAligned[aPlane];
  }

  // Get hardware compatible format for SW decoded one.
  // It's used for uploading SW decoded images to DMABuf.
  mozilla::gfx::SurfaceFormat GetHWFormat(
      mozilla::gfx::SurfaceFormat aSWFormat);

  bool CreateTexture(mozilla::gl::GLContext* aGLContext,
                     int aPlane = 0) override;
  bool CreateTextureViaCopyYUV(mozilla::gl::GLContext* aGLContext,
                               int aPlane = 0);
  bool CreateTextureViaCopyP010(mozilla::gl::GLContext* aGLContext,
                                int aPlane = 0);
  void ReleaseTextures() override;

  void ReleaseSurface() override;

  GLuint GetTexture(int aPlane = 0) override { return mTexture[aPlane]; };
  EGLImageKHR GetEGLImage(int aPlane = 0) override {
    return mEGLImage[aPlane];
  };

  int GetTextureCount() override;
  bool HoldsTexture() override;

  void SetWPChromaLocation(uint32_t aWPChromaLocation) {
    mWPChromaLocation = aWPChromaLocation;
  }
  uint32_t GetWPChromaLocation() { return mWPChromaLocation; }

  DMABufSurfaceYUV();

  bool UpdateYUVData(const VADRMPRIMESurfaceDescriptor& aDesc, int aWidth,
                     int aHeight, bool aCopy);
  bool UpdateYUVData(const mozilla::layers::PlanarYCbCrData& aData,
                     mozilla::gfx::SurfaceFormat aImageFormat);
  bool VerifyTextureCreation();

#ifdef MOZ_WAYLAND
  wl_buffer* CreateWlBuffer() override;
#endif

 private:
  ~DMABufSurfaceYUV();

  bool Create(const mozilla::layers::SurfaceDescriptor& aDesc) override;
  bool CreateYUVPlane(mozilla::gl::GLContext* aGLContext, int aPlane,
                      mozilla::widget::DRMFormat* aFormat = nullptr);
  bool CreateYUVPlaneGBM(int aPlane,
                         mozilla::widget::DRMFormat* aFormat = nullptr);
  bool CreateYUVPlaneExport(mozilla::gl::GLContext* aGLContext, int aPlane);

  bool MoveYUVDataImpl(const VADRMPRIMESurfaceDescriptor& aDesc, int aWidth,
                       int aHeight);
  bool CopyYUVDataImpl(const VADRMPRIMESurfaceDescriptor& aDesc, int aWidth,
                       int aHeight);

  bool ImportPRIMESurfaceDescriptor(const VADRMPRIMESurfaceDescriptor& aDesc,
                                    int aWidth, int aHeight);
  bool ImportSurfaceDescriptor(
      const mozilla::layers::SurfaceDescriptorDMABuf& aDesc);

  bool OpenFileDescriptorForPlane(
      mozilla::widget::DMABufDeviceLock* aDeviceLock, int aPlane) override;

  int mWidth[DMABUF_BUFFER_PLANES];
  int mHeight[DMABUF_BUFFER_PLANES];
  // Aligned size of the surface imported from VADRMPRIMESurfaceDescriptor.
  // It's used only internally to create EGLImage as some GL drivers
  // needs that (Bug 1724385).
  int mWidthAligned[DMABUF_BUFFER_PLANES];
  int mHeightAligned[DMABUF_BUFFER_PLANES];
  // DRM (fourcc) formats for each plane.
  int32_t mDrmFormats[DMABUF_BUFFER_PLANES];
  EGLImageKHR mEGLImage[DMABUF_BUFFER_PLANES];
  GLuint mTexture[DMABUF_BUFFER_PLANES];
  uint64_t mBufferModifiers[DMABUF_BUFFER_PLANES];
  // Chroma location in wp_color_representation_surface_v1_chroma_location
  // format.
  uint32_t mWPChromaLocation = 0;
};

#endif
