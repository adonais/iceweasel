/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "SHMBufSurface.h"

#include <errno.h>
#include <fcntl.h>
#include <string.h>
#include <sys/mman.h>

#include "GLContextEGL.h"
#include "GLContextProvider.h"
#include "gfxPlatform.h"
#include "mozilla/ipc/SharedMemoryHandle.h"
#include "nsGtkUtils.h"
#include "nsWaylandDisplay.h"

#undef LOGDMABUF
#ifdef MOZ_LOGGING
#  include "mozilla/Logging.h"
extern mozilla::LazyLogModule gDmabufLog;
#  define LOGDMABUF(...) \
    MOZ_LOG(gDmabufLog, mozilla::LogLevel::Debug, (__VA_ARGS__))
#else
#  define LOGDMABUF(...)
#endif /* MOZ_LOGGING */

namespace mozilla::widget {

/* static */
RefPtr<SHMBufSurface> SHMBufSurface::Create(const LayoutDeviceIntSize& aSize,
                                            int32_t aFOURCCFormat) {
  RefPtr<SHMBufSurface> surface = new SHMBufSurface();
  if (!surface->CreateImpl(aSize, aFOURCCFormat)) {
    LOGDMABUF("SHMBufSurface::Create() failed size [%d x %d] format %x",
              aSize.width, aSize.height, aFOURCCFormat);
    return nullptr;
  }
  LOGDMABUF("SHMBufSurface::Create() [%p] [%d x %d] format %x", (void*)surface,
            aSize.width, aSize.height, aFOURCCFormat);
  return surface;
}

void* SHMBufSurface::GetImageData() {
  if (!mShm) {
    mShm = mShmHandle.Map();
    if (!mShm) {
      NS_WARNING("SHMBufSurface: Failed to map Shm!");
      return nullptr;
    }
  }
  return mShm.Address();
}

already_AddRefed<gfx::DrawTarget> SHMBufSurface::Lock() {
  LOGDMABUF("SHMBufSurface::Lock() [%p]\n", (void*)this);
  return gfxPlatform::CreateDrawTargetForData(
      static_cast<unsigned char*>(GetImageData()), mSize.ToUnknownSize(),
      GetFormatBPP() * mSize.width, GetFormat());
}

void SHMBufSurface::Clear() {
  LOGDMABUF("SHMBufSurface::Clear() [%p]\n", (void*)this);
  memset(GetImageData(), 0xff, mSize.height * mSize.width * GetFormatBPP());
}

#ifdef MOZ_WAYLAND
wl_buffer* SHMBufSurface::CreateWlBuffer() {
  auto* buffer =
      wl_shm_pool_create_buffer(mShmPool, 0, mSize.width, mSize.height,
                                mSize.width * GetFormatBPP(), GetWLFormat());

  LOGDMABUF("SHMBufSurface::CreateWlBuffer() [%p] wl_buffer [%p]", (void*)this,
            buffer);

  return buffer;
}
#endif

already_AddRefed<gfx::DataSourceSurface> SHMBufSurface::GetAsSourceSurface() {
  LOGDMABUF("SHMBufSurface::GetAsSourceSurface()");

  gfx::IntSize size(GetWidth(), GetHeight());
  const auto format = gfx::SurfaceFormat::B8G8R8A8;
  RefPtr<gfx::DataSourceSurface> source =
      gfx::Factory::CreateDataSourceSurface(size, format);
  if (NS_WARN_IF(!source)) {
    LOGDMABUF(
        "SHMBufSurface::GetAsSourceSurface(): CreateDataSourceSurface failed.");
    return nullptr;
  }

  gfx::DataSourceSurface::ScopedMap map(source,
                                        gfx::DataSourceSurface::READ_WRITE);
  if (NS_WARN_IF(!map.IsMapped())) {
    LOGDMABUF("SHMBufSurface::GetAsSourceSurface(): Mapping surface failed.");
    return nullptr;
  }
  if (map.GetStride() != GetWidth() * GetFormatBPP()) {
    LOGDMABUF("SHMBufSurface::GetAsSourceSurface(): wrong stride %d vs. %d",
              map.GetStride(), GetWidth() * GetFormatBPP());
    return nullptr;
  }

  memcpy(map.GetData(), GetImageData(),
         GetHeight() * GetWidth() * GetFormatBPP());
  return source.forget();
}

bool SHMBufSurface::CreateImpl(const LayoutDeviceIntSize& aSize,
                               int32_t aFOURCCFormat) {
  nsWaylandDisplay* waylandDisplay = WaylandDisplayGet();
  if (!waylandDisplay->GetShm()) {
    NS_WARNING("SHMBufSurface: Missing Wayland shm interface!");
    return false;
  }

  mSize = aSize;
  mFOURCCFormat = aFOURCCFormat;
  const int size = mSize.width * mSize.height * GetFormatBPP();
  mShmHandle = ipc::shared_memory::Create(size);
  if (!mShmHandle) {
    NS_WARNING("SHMBufSurface: Unable to allocate shared memory!");
    return false;
  }
  mShmPool =
      wl_shm_create_pool(waylandDisplay->GetShm(),
                         mShmHandle.Clone().TakePlatformHandle().get(), size);
  if (!mShmPool) {
    NS_WARNING("SHMBufSurface: Unable to allocate shared memory pool!");
    return false;
  }

  LOGDMABUF("SHMBufSurface::Create() [%p] size [%d x %d] format %x\n",
            (void*)this, mSize.width, mSize.height, mFOURCCFormat);
  return true;
}

SHMBufSurface::~SHMBufSurface() {
  LOGDMABUF("SHMBufSurface::~SHMBufSurface() [%p]\n", (void*)this);
  MozClearPointer(mShmPool, wl_shm_pool_destroy);
}

}  // namespace mozilla::widget
