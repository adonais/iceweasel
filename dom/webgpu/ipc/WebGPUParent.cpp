/* -*- Mode: C++; tab-width: 20; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "WebGPUParent.h"

#include <unordered_set>

#include "mozilla/PodOperations.h"
#include "mozilla/ScopeExit.h"
#include "mozilla/dom/WebGPUBinding.h"
#include "mozilla/gfx/FileHandleWrapper.h"
#include "mozilla/layers/CompositorThread.h"
#include "mozilla/layers/ImageDataSerializer.h"
#include "mozilla/layers/RemoteTextureMap.h"
#include "mozilla/layers/TextureHost.h"
#include "mozilla/layers/WebRenderImageHost.h"
#include "mozilla/layers/WebRenderTextureHost.h"
#include "mozilla/webgpu/ExternalTexture.h"
#include "mozilla/webgpu/ffi/wgpu.h"

#if defined(XP_WIN)
#  include "mozilla/gfx/DeviceManagerDx.h"
#  include "mozilla/webgpu/ExternalTextureD3D11.h"
#endif

#if defined(XP_LINUX) && !defined(MOZ_WIDGET_ANDROID)
#  include "mozilla/webgpu/ExternalTextureDMABuf.h"
#endif

#if defined(XP_MACOSX)
#  include "mozilla/webgpu/ExternalTextureMacIOSurface.h"
#endif

namespace mozilla::webgpu {

const uint64_t POLL_TIME_MS = 100;

static mozilla::LazyLogModule sLogger("WebGPU");

namespace ffi {

extern bool wgpu_server_use_external_texture_for_swap_chain(
    void* aParam, WGPUSwapChainId aSwapChainId) {
  auto* parent = static_cast<WebGPUParent*>(aParam);

  return parent->UseExternalTextureForSwapChain(aSwapChainId);
}

extern void wgpu_server_disable_external_texture_for_swap_chain(
    void* aParam, WGPUSwapChainId aSwapChainId) {
  auto* parent = static_cast<WebGPUParent*>(aParam);

  parent->DisableExternalTextureForSwapChain(aSwapChainId);
}

extern bool wgpu_server_ensure_external_texture_for_swap_chain(
    void* aParam, WGPUSwapChainId aSwapChainId, WGPUDeviceId aDeviceId,
    WGPUTextureId aTextureId, uint32_t aWidth, uint32_t aHeight,
    struct WGPUTextureFormat aFormat, WGPUTextureUsages aUsage) {
  auto* parent = static_cast<WebGPUParent*>(aParam);

  return parent->EnsureExternalTextureForSwapChain(
      aSwapChainId, aDeviceId, aTextureId, aWidth, aHeight, aFormat, aUsage);
}

extern void wgpu_server_ensure_external_texture_for_readback(
    void* aParam, WGPUSwapChainId aSwapChainId, WGPUDeviceId aDeviceId,
    WGPUTextureId aTextureId, uint32_t aWidth, uint32_t aHeight,
    struct WGPUTextureFormat aFormat, WGPUTextureUsages aUsage) {
  auto* parent = static_cast<WebGPUParent*>(aParam);

  parent->EnsureExternalTextureForReadBackPresent(
      aSwapChainId, aDeviceId, aTextureId, aWidth, aHeight, aFormat, aUsage);
}

extern void* wgpu_server_get_external_texture_handle(void* aParam,
                                                     WGPUTextureId aId) {
  auto* parent = static_cast<WebGPUParent*>(aParam);

  auto texture = parent->GetExternalTexture(aId);
  if (!texture) {
    MOZ_ASSERT_UNREACHABLE("unexpected to be called");
    return nullptr;
  }

  void* sharedHandle = nullptr;
#ifdef XP_WIN
  auto* textureD3D11 = texture->AsExternalTextureD3D11();
  if (!textureD3D11) {
    MOZ_ASSERT_UNREACHABLE("unexpected to be called");
    return nullptr;
  }
  sharedHandle = textureD3D11->GetExternalTextureHandle();
  if (!sharedHandle) {
    MOZ_ASSERT_UNREACHABLE("unexpected to be called");
    gfxCriticalNoteOnce << "Failed to get shared handle";
    return nullptr;
  }
#else
  MOZ_ASSERT_UNREACHABLE("unexpected to be called");
#endif
  return sharedHandle;
}

extern int32_t wgpu_server_get_dma_buf_fd(void* aParam, WGPUTextureId aId) {
  auto* parent = static_cast<WebGPUParent*>(aParam);

  auto texture = parent->GetExternalTexture(aId);
  if (!texture) {
    MOZ_ASSERT_UNREACHABLE("unexpected to be called");
    return -1;
  }

#if defined(XP_LINUX) && !defined(MOZ_WIDGET_ANDROID)
  auto* textureDMABuf = texture->AsExternalTextureDMABuf();
  if (!textureDMABuf) {
    MOZ_ASSERT_UNREACHABLE("unexpected to be called");
    return -1;
  }
  auto fd = textureDMABuf->CloneDmaBufFd();
  // fd should be closed by the caller.
  return fd.release();
#else
  MOZ_ASSERT_UNREACHABLE("unexpected to be called");
  return -1;
#endif
}

#if !defined(XP_MACOSX)
extern const WGPUVkImageHandle* wgpu_server_get_vk_image_handle(
    void* aParam, WGPUTextureId aId) {
  auto* parent = static_cast<WebGPUParent*>(aParam);

  auto texture = parent->GetExternalTexture(aId);
  if (!texture) {
    MOZ_ASSERT_UNREACHABLE("unexpected to be called");
    return nullptr;
  }

#  if defined(XP_LINUX) && !defined(MOZ_WIDGET_ANDROID)
  auto* textureDMABuf = texture->AsExternalTextureDMABuf();
  if (!textureDMABuf) {
    return nullptr;
  }
  return textureDMABuf->GetHandle();
#  else
  return nullptr;
#  endif
}
#endif

extern uint32_t wgpu_server_get_external_io_surface_id(void* aParam,
                                                       WGPUTextureId aId) {
  auto* parent = static_cast<WebGPUParent*>(aParam);

  auto texture = parent->GetExternalTexture(aId);
  if (!texture) {
    MOZ_ASSERT_UNREACHABLE("unexpected to be called");
    return 0;
  }

#if defined(XP_MACOSX)
  auto* textureIOSurface = texture->AsExternalTextureMacIOSurface();
  if (!textureIOSurface) {
    MOZ_ASSERT_UNREACHABLE("unexpected to be called");
    return 0;
  }
  return textureIOSurface->GetIOSurfaceId();
#else
  MOZ_ASSERT_UNREACHABLE("unexpected to be called");
  return 0;
#endif
}

}  // namespace ffi

// A fixed-capacity buffer for receiving textual error messages from
// `wgpu_bindings`.
//
// The `ToFFI` method returns an `ffi::WGPUErrorBuffer` pointing to our
// buffer, for you to pass to fallible FFI-visible `wgpu_bindings`
// functions. These indicate failure by storing an error message in the
// buffer, which you can retrieve by calling `GetError`.
//
// If you call `ToFFI` on this type, you must also call `GetError` to check for
// an error. Otherwise, the destructor asserts.
//
// TODO: refactor this to avoid stack-allocating the buffer all the time.
class ErrorBuffer {
  // if the message doesn't fit, it will be truncated
  static constexpr unsigned BUFFER_SIZE = 512;
  ffi::WGPUErrorBufferType mType = ffi::WGPUErrorBufferType_None;
  char mMessageUtf8[BUFFER_SIZE] = {};
  bool mAwaitingGetError = false;

 public:
  ErrorBuffer() { mMessageUtf8[0] = 0; }
  ErrorBuffer(const ErrorBuffer&) = delete;
  ~ErrorBuffer() { MOZ_ASSERT(!mAwaitingGetError); }

  ffi::WGPUErrorBuffer ToFFI() {
    mAwaitingGetError = true;
    ffi::WGPUErrorBuffer errorBuf = {&mType, mMessageUtf8, BUFFER_SIZE};
    return errorBuf;
  }

  ffi::WGPUErrorBufferType GetType() { return mType; }

  static Maybe<dom::GPUErrorFilter> ErrorTypeToFilterType(
      ffi::WGPUErrorBufferType aType) {
    switch (aType) {
      case ffi::WGPUErrorBufferType_None:
      case ffi::WGPUErrorBufferType_DeviceLost:
        return {};
      case ffi::WGPUErrorBufferType_Internal:
        return Some(dom::GPUErrorFilter::Internal);
      case ffi::WGPUErrorBufferType_Validation:
        return Some(dom::GPUErrorFilter::Validation);
      case ffi::WGPUErrorBufferType_OutOfMemory:
        return Some(dom::GPUErrorFilter::Out_of_memory);
      case ffi::WGPUErrorBufferType_Sentinel:
        break;
    }

    MOZ_CRASH("invalid `ErrorBufferType`");
  }

  struct Error {
    dom::GPUErrorFilter type;
    bool isDeviceLost;
    nsCString message;
  };

  // Retrieve the error message was stored in this buffer. Asserts that
  // this instance actually contains an error (viz., that `GetType() !=
  // ffi::WGPUErrorBufferType_None`).
  //
  // Mark this `ErrorBuffer` as having been handled, so its destructor
  // won't assert.
  Maybe<Error> GetError() {
    mAwaitingGetError = false;
    if (mType == ffi::WGPUErrorBufferType_DeviceLost) {
      // This error is for a lost device, so we return an Error struct
      // with the isDeviceLost bool set to true. It doesn't matter what
      // GPUErrorFilter type we use, so we just use Validation. The error
      // will not be reported.
      return Some(Error{dom::GPUErrorFilter::Validation, true,
                        nsCString{mMessageUtf8}});
    }
    auto filterType = ErrorTypeToFilterType(mType);
    if (!filterType) {
      return {};
    }
    return Some(Error{*filterType, false, nsCString{mMessageUtf8}});
  }

  void CoerceValidationToInternal() {
    if (mType == ffi::WGPUErrorBufferType_Validation) {
      mType = ffi::WGPUErrorBufferType_Internal;
    }
  }
};

struct PendingSwapChainDrop {
  layers::RemoteTextureTxnType mTxnType;
  layers::RemoteTextureTxnId mTxnId;
};

class PresentationData {
  NS_INLINE_DECL_REFCOUNTING(PresentationData);

 public:
  WeakPtr<WebGPUParent> mParent;
  bool mUseExternalTextureInSwapChain;
  const RawId mDeviceId;
  const RawId mQueueId;
  Maybe<RawId> mLastSubmittedTextureId;
  const layers::RGBDescriptor mDesc;

  uint64_t mSubmissionIndex = 0;

  std::deque<std::shared_ptr<ExternalTexture>> mRecycledExternalTextures;

  std::unordered_set<layers::RemoteTextureId, layers::RemoteTextureId::HashFn>
      mWaitingReadbackTexturesForPresent;
  Maybe<PendingSwapChainDrop> mPendingSwapChainDrop;

  const uint32_t mSourcePitch;
  std::vector<RawId> mUnassignedBufferIds;
  std::vector<RawId> mAvailableBufferIds;
  std::vector<RawId> mQueuedBufferIds;

  bool mReadbackSnapshotCallbackCalled = false;

  PresentationData(WebGPUParent* aParent, bool aUseExternalTextureInSwapChain,
                   RawId aDeviceId, RawId aQueueId,
                   const layers::RGBDescriptor& aDesc, uint32_t aSourcePitch,
                   const nsTArray<RawId>& aBufferIds)
      : mParent(aParent),
        mUseExternalTextureInSwapChain(aUseExternalTextureInSwapChain),
        mDeviceId(aDeviceId),
        mQueueId(aQueueId),
        mDesc(aDesc),
        mSourcePitch(aSourcePitch) {
    MOZ_COUNT_CTOR(PresentationData);

    for (const RawId id : aBufferIds) {
      mUnassignedBufferIds.push_back(id);
    }
  }

 private:
  ~PresentationData() { MOZ_COUNT_DTOR(PresentationData); }
};

WebGPUParent::WebGPUParent() : mContext(ffi::wgpu_server_new(this)) {
  mTimer.Start(base::TimeDelta::FromMilliseconds(POLL_TIME_MS), this,
               &WebGPUParent::MaintainDevices);
}

WebGPUParent::~WebGPUParent() {}

void WebGPUParent::MaintainDevices() {
  ffi::wgpu_server_poll_all_devices(mContext.get(), false);
}

void WebGPUParent::LoseDevice(const RawId aDeviceId, Maybe<uint8_t> aReason,
                              const nsACString& aMessage) {
  if (mActiveDeviceIds.Contains(aDeviceId)) {
    mActiveDeviceIds.Remove(aDeviceId);
  }
  // Check to see if we've already sent a DeviceLost message to aDeviceId.
  if (mLostDeviceIds.Contains(aDeviceId)) {
    return;
  }

  // If the connection has been dropped, there is nobody to receive
  // the DeviceLost message anyway.
  if (!CanSend()) {
    return;
  }

  if (!SendDeviceLost(aDeviceId, aReason, aMessage)) {
    NS_ERROR("SendDeviceLost failed");
    return;
  }

  mLostDeviceIds.Insert(aDeviceId);
}

bool WebGPUParent::ForwardError(const Maybe<RawId> aDeviceId,
                                ErrorBuffer& aError) {
  if (auto error = aError.GetError()) {
    // If this is a error has isDeviceLost true, then instead of reporting
    // the error, we swallow it and call LoseDevice if we have an
    // aDeviceID. This is to comply with the spec declaration in
    // https://gpuweb.github.io/gpuweb/#lose-the-device
    // "No errors are generated after device loss."
    if (error->isDeviceLost) {
      if (aDeviceId.isSome()) {
        LoseDevice(*aDeviceId, Nothing(), error->message);
      }
    } else {
      ReportError(aDeviceId, error->type, error->message);
    }
    return true;
  }
  return false;
}

// Generate an error on the Device timeline of aDeviceId.
// aMessage is interpreted as UTF-8.
void WebGPUParent::ReportError(const Maybe<RawId> aDeviceId,
                               const GPUErrorFilter aType,
                               const nsCString& aMessage) {
  // find the appropriate error scope
  if (aDeviceId) {
    const auto& itr = mErrorScopeStackByDevice.find(*aDeviceId);
    if (itr != mErrorScopeStackByDevice.end()) {
      auto& stack = itr->second;
      for (auto& scope : Reversed(stack)) {
        if (scope.filter != aType) {
          continue;
        }
        if (!scope.firstMessage) {
          scope.firstMessage = Some(aMessage);
        }
        return;
      }
    }
  }
  // No error scope found, so fall back to the uncaptured error handler
  if (!SendUncapturedError(aDeviceId, aMessage)) {
    NS_ERROR("SendDeviceUncapturedError failed");
  }
}

ipc::IPCResult WebGPUParent::RecvInstanceRequestAdapter(
    const dom::GPURequestAdapterOptions& aOptions, RawId aAdapterId,
    InstanceRequestAdapterResolver&& resolver) {
  ffi::WGPURequestAdapterOptions options = {};
  if (aOptions.mPowerPreference.WasPassed()) {
    options.power_preference = static_cast<ffi::WGPUPowerPreference>(
        aOptions.mPowerPreference.Value());
  } else {
    options.power_preference = ffi::WGPUPowerPreference_LowPower;
  }
  options.force_fallback_adapter = aOptions.mForceFallbackAdapter;

  auto luid = GetCompositorDeviceLuid();

  ErrorBuffer error;
  bool success = ffi::wgpu_server_instance_request_adapter(
      mContext.get(), &options, aAdapterId, luid.ptrOr(nullptr), error.ToFFI());

  ByteBuf infoByteBuf;
  // Rust side expects an `Option`, so 0 maps to `None`.
  uint64_t adapterId = 0;
  if (success) {
    adapterId = aAdapterId;
  }
  ffi::wgpu_server_adapter_pack_info(mContext.get(), adapterId,
                                     ToFFI(&infoByteBuf));
  resolver(std::move(infoByteBuf));
  ForwardError(0, error);

  return IPC_OK();
}

struct OnDeviceLostRequest {
  WeakPtr<WebGPUParent> mParent;
  RawId mDeviceId;
};

static void DeviceLostCleanupCallback(uint8_t* aUserData) {
  auto req = std::unique_ptr<OnDeviceLostRequest>(
      reinterpret_cast<OnDeviceLostRequest*>(aUserData));
}

/* static */ void WebGPUParent::DeviceLostCallback(uint8_t* aUserData,
                                                   uint8_t aReason,
                                                   const char* aMessage) {
  auto req = std::unique_ptr<OnDeviceLostRequest>(
      reinterpret_cast<OnDeviceLostRequest*>(aUserData));
  if (!req->mParent) {
    // Parent is dead, never mind.
    return;
  }

  RawId deviceId = req->mDeviceId;

  // If aReason is 0, that corresponds to the unknown reason, which we
  // treat as a Nothing() value. aReason of 1 corresponds to destroyed.
  Maybe<uint8_t> reason;  // default to GPUDeviceLostReason::unknown
  if (aReason == 1) {
    reason = Some(uint8_t(0));  // this is GPUDeviceLostReason::destroyed
  }
  nsAutoCString message(aMessage);
  req->mParent->LoseDevice(deviceId, reason, message);

  auto it = req->mParent->mDeviceFenceHandles.find(deviceId);
  if (it != req->mParent->mDeviceFenceHandles.end()) {
    req->mParent->mDeviceFenceHandles.erase(it);
  }
}

ipc::IPCResult WebGPUParent::RecvAdapterRequestDevice(
    RawId aAdapterId, const ipc::ByteBuf& aByteBuf, RawId aDeviceId,
    RawId aQueueId, AdapterRequestDeviceResolver&& resolver) {
  ErrorBuffer error;
  ffi::wgpu_server_adapter_request_device(mContext.get(), aAdapterId,
                                          ToFFI(&aByteBuf), aDeviceId, aQueueId,
                                          error.ToFFI());
  if (ForwardError(0, error)) {
    resolver(false);
    return IPC_OK();
  }

  mErrorScopeStackByDevice.insert({aDeviceId, {}});

  std::unique_ptr<OnDeviceLostRequest> request(
      new OnDeviceLostRequest{this, aDeviceId});
  ffi::WGPUDeviceLostClosure closure = {
      &DeviceLostCallback, &DeviceLostCleanupCallback,
      reinterpret_cast<uint8_t*>(request.release())};
  ffi::wgpu_server_set_device_lost_callback(mContext.get(), aDeviceId, closure);

  resolver(true);

#if defined(XP_WIN)
  HANDLE handle =
      wgpu_server_get_device_fence_handle(mContext.get(), aDeviceId);
  if (handle) {
    RefPtr<gfx::FileHandleWrapper> fenceHandle =
        new gfx::FileHandleWrapper(UniqueFileHandle(handle));
    mDeviceFenceHandles.emplace(aDeviceId, std::move(fenceHandle));
  }
#endif

  MOZ_ASSERT(!mActiveDeviceIds.Contains(aDeviceId));
  mActiveDeviceIds.Insert(aDeviceId);

  return IPC_OK();
}

ipc::IPCResult WebGPUParent::RecvAdapterDrop(RawId aAdapterId) {
  ffi::wgpu_server_adapter_drop(mContext.get(), aAdapterId);
  return IPC_OK();
}

ipc::IPCResult WebGPUParent::RecvDeviceDestroy(RawId aDeviceId) {
  ffi::wgpu_server_device_destroy(mContext.get(), aDeviceId);
  return IPC_OK();
}

ipc::IPCResult WebGPUParent::RecvDeviceDrop(RawId aDeviceId) {
  if (mActiveDeviceIds.Contains(aDeviceId)) {
    mActiveDeviceIds.Remove(aDeviceId);
  }

  ffi::wgpu_server_device_drop(mContext.get(), aDeviceId);

  mErrorScopeStackByDevice.erase(aDeviceId);
  mLostDeviceIds.Remove(aDeviceId);
  return IPC_OK();
}

WebGPUParent::BufferMapData* WebGPUParent::GetBufferMapData(RawId aBufferId) {
  const auto iter = mSharedMemoryMap.find(aBufferId);
  if (iter == mSharedMemoryMap.end()) {
    return nullptr;
  }

  return &iter->second;
}

ipc::IPCResult WebGPUParent::RecvDeviceCreateBuffer(
    RawId aDeviceId, RawId aBufferId, dom::GPUBufferDescriptor&& aDesc,
    ipc::MutableSharedMemoryHandle&& aShmem) {
  webgpu::StringHelper label(aDesc.mLabel);

  auto shmem = aShmem.Map();

  bool hasMapFlags = aDesc.mUsage & (dom::GPUBufferUsage_Binding::MAP_WRITE |
                                     dom::GPUBufferUsage_Binding::MAP_READ);
  bool shmAllocationFailed = false;
  if (hasMapFlags || aDesc.mMappedAtCreation) {
    if (shmem.Size() < aDesc.mSize) {
      MOZ_RELEASE_ASSERT(shmem.Size() == 0);
      // If we requested a non-zero mappable buffer and get a size of zero, it
      // indicates that the shmem allocation failed on the client side.
      shmAllocationFailed = true;
    } else {
      uint64_t offset = 0;
      uint64_t size = 0;

      if (aDesc.mMappedAtCreation) {
        size = aDesc.mSize;
      }

      BufferMapData data = {std::move(shmem), hasMapFlags, offset, size,
                            aDeviceId};
      mSharedMemoryMap.insert({aBufferId, std::move(data)});
    }
  }

  ErrorBuffer error;
  ffi::wgpu_server_device_create_buffer(mContext.get(), aDeviceId, aBufferId,
                                        label.Get(), aDesc.mSize, aDesc.mUsage,
                                        aDesc.mMappedAtCreation,
                                        shmAllocationFailed, error.ToFFI());
  ForwardError(aDeviceId, error);
  return IPC_OK();
}

struct MapRequest {
  RefPtr<WebGPUParent> mParent;
  ffi::WGPUGlobal* mContext;
  ffi::WGPUBufferId mBufferId;
  ffi::WGPUHostMap mHostMap;
  uint64_t mOffset;
  uint64_t mSize;
  WebGPUParent::BufferMapResolver mResolver;
};

static const char* MapStatusString(ffi::WGPUBufferMapAsyncStatus status) {
  switch (status) {
    case ffi::WGPUBufferMapAsyncStatus_Success:
      return "Success";
    case ffi::WGPUBufferMapAsyncStatus_AlreadyMapped:
      return "Already mapped";
    case ffi::WGPUBufferMapAsyncStatus_MapAlreadyPending:
      return "Map is already pending";
    case ffi::WGPUBufferMapAsyncStatus_ContextLost:
      return "Context lost";
    case ffi::WGPUBufferMapAsyncStatus_Invalid:
      return "Invalid buffer";
    case ffi::WGPUBufferMapAsyncStatus_InvalidRange:
      return "Invalid range";
    case ffi::WGPUBufferMapAsyncStatus_InvalidAlignment:
      return "Invalid alignment";
    case ffi::WGPUBufferMapAsyncStatus_InvalidUsageFlags:
      return "Invalid usage flags";
    case ffi::WGPUBufferMapAsyncStatus_Error:
      return "Map failed";
    case ffi::WGPUBufferMapAsyncStatus_Sentinel:  // For -Wswitch
      break;
  }

  MOZ_CRASH("Bad ffi::WGPUBufferMapAsyncStatus");
}

void WebGPUParent::MapCallback(uint8_t* aUserData,
                               ffi::WGPUBufferMapAsyncStatus aStatus) {
  auto req =
      std::unique_ptr<MapRequest>(reinterpret_cast<MapRequest*>(aUserData));

  if (!req->mParent->CanSend()) {
    return;
  }

  BufferMapResult result;

  auto bufferId = req->mBufferId;
  auto* mapData = req->mParent->GetBufferMapData(bufferId);
  MOZ_RELEASE_ASSERT(mapData);

  if (aStatus != ffi::WGPUBufferMapAsyncStatus_Success) {
    // A buffer map operation that fails with a DeviceError gets
    // mapped to the ContextLost status. If we have this status, we
    // need to lose the device.
    if (aStatus == ffi::WGPUBufferMapAsyncStatus_ContextLost) {
      req->mParent->LoseDevice(
          mapData->mDeviceId, Nothing(),
          nsPrintfCString("Buffer %" PRIu64 " invalid", bufferId));
    }

    result = BufferMapError(nsPrintfCString("Mapping WebGPU buffer failed: %s",
                                            MapStatusString(aStatus)));
  } else {
    auto size = req->mSize;
    auto offset = req->mOffset;

    if (req->mHostMap == ffi::WGPUHostMap_Read && size > 0) {
      ErrorBuffer error;
      const auto src = ffi::wgpu_server_buffer_get_mapped_range(
          req->mContext, req->mBufferId, offset, size, error.ToFFI());

      MOZ_RELEASE_ASSERT(!error.GetError());

      MOZ_RELEASE_ASSERT(mapData->mShmem.Size() >= offset + size);
      if (src.ptr != nullptr && src.length >= size) {
        auto dst = mapData->mShmem.DataAsSpan<uint8_t>().Subspan(offset, size);
        memcpy(dst.data(), src.ptr, size);
      }
    }

    result =
        BufferMapSuccess(offset, size, req->mHostMap == ffi::WGPUHostMap_Write);

    mapData->mMappedOffset = offset;
    mapData->mMappedSize = size;
  }

  req->mResolver(result);
}

ipc::IPCResult WebGPUParent::RecvBufferMap(RawId aDeviceId, RawId aBufferId,
                                           uint32_t aMode, uint64_t aOffset,
                                           uint64_t aSize,
                                           BufferMapResolver&& aResolver) {
  MOZ_LOG(sLogger, LogLevel::Info,
          ("RecvBufferMap %" PRIu64 " offset=%" PRIu64 " size=%" PRIu64 "\n",
           aBufferId, aOffset, aSize));

  ffi::WGPUHostMap mode;
  switch (aMode) {
    case dom::GPUMapMode_Binding::READ:
      mode = ffi::WGPUHostMap_Read;
      break;
    case dom::GPUMapMode_Binding::WRITE:
      mode = ffi::WGPUHostMap_Write;
      break;
    default: {
      nsCString errorString(
          "GPUBuffer.mapAsync 'mode' argument must be either GPUMapMode.READ "
          "or GPUMapMode.WRITE");
      aResolver(BufferMapError(errorString));
      return IPC_OK();
    }
  }

  auto* mapData = GetBufferMapData(aBufferId);

  if (!mapData) {
    nsCString errorString("Buffer is not mappable");
    aResolver(BufferMapError(errorString));
    return IPC_OK();
  }

  std::unique_ptr<MapRequest> request(
      new MapRequest{this, mContext.get(), aBufferId, mode, aOffset, aSize,
                     std::move(aResolver)});

  ffi::WGPUBufferMapClosure closure = {
      &MapCallback, reinterpret_cast<uint8_t*>(request.release())};
  ErrorBuffer mapError;
  ffi::wgpu_server_buffer_map(mContext.get(), aBufferId, aOffset, aSize, mode,
                              closure, mapError.ToFFI());
  ForwardError(aDeviceId, mapError);

  return IPC_OK();
}

ipc::IPCResult WebGPUParent::RecvBufferUnmap(RawId aDeviceId, RawId aBufferId,
                                             bool aFlush) {
  MOZ_LOG(sLogger, LogLevel::Info,
          ("RecvBufferUnmap %" PRIu64 " flush=%d\n", aBufferId, aFlush));

  auto* mapData = GetBufferMapData(aBufferId);

  if (mapData && aFlush) {
    uint64_t offset = mapData->mMappedOffset;
    uint64_t size = mapData->mMappedSize;

    ErrorBuffer getRangeError;
    const auto mapped = ffi::wgpu_server_buffer_get_mapped_range(
        mContext.get(), aBufferId, offset, size, getRangeError.ToFFI());
    ForwardError(aDeviceId, getRangeError);

    if (mapped.ptr != nullptr && mapped.length >= size) {
      auto shmSize = mapData->mShmem.Size();
      MOZ_RELEASE_ASSERT(offset <= shmSize);
      MOZ_RELEASE_ASSERT(size <= shmSize - offset);

      auto src = mapData->mShmem.DataAsSpan<uint8_t>().Subspan(offset, size);
      memcpy(mapped.ptr, src.data(), size);
    }

    mapData->mMappedOffset = 0;
    mapData->mMappedSize = 0;
  }

  ErrorBuffer unmapError;
  ffi::wgpu_server_buffer_unmap(mContext.get(), aBufferId, unmapError.ToFFI());
  ForwardError(aDeviceId, unmapError);

  if (mapData && !mapData->mHasMapFlags) {
    // We get here if the buffer was mapped at creation without map flags.
    // We don't need the shared memory anymore.
    DeallocBufferShmem(aBufferId);
  }

  return IPC_OK();
}

void WebGPUParent::DeallocBufferShmem(RawId aBufferId) {
  const auto iter = mSharedMemoryMap.find(aBufferId);
  if (iter != mSharedMemoryMap.end()) {
    mSharedMemoryMap.erase(iter);
  }
}

ipc::IPCResult WebGPUParent::RecvBufferDrop(RawId aBufferId) {
  ffi::wgpu_server_buffer_drop(mContext.get(), aBufferId);
  MOZ_LOG(sLogger, LogLevel::Info, ("RecvBufferDrop %" PRIu64 "\n", aBufferId));

  DeallocBufferShmem(aBufferId);

  return IPC_OK();
}

ipc::IPCResult WebGPUParent::RecvBufferDestroy(RawId aBufferId) {
  ffi::wgpu_server_buffer_destroy(mContext.get(), aBufferId);
  MOZ_LOG(sLogger, LogLevel::Info,
          ("RecvBufferDestroy %" PRIu64 "\n", aBufferId));

  DeallocBufferShmem(aBufferId);

  return IPC_OK();
}

void WebGPUParent::RemoveExternalTexture(RawId aTextureId) {
  auto it = mExternalTextures.find(aTextureId);
  if (it != mExternalTextures.end()) {
    mExternalTextures.erase(it);
  }
}

ipc::IPCResult WebGPUParent::RecvTextureDestroy(RawId aTextureId,
                                                RawId aDeviceId) {
  ffi::wgpu_server_texture_destroy(mContext.get(), aTextureId);
  RemoveExternalTexture(aTextureId);
  return IPC_OK();
}

ipc::IPCResult WebGPUParent::RecvTextureDrop(RawId aTextureId) {
  ffi::wgpu_server_texture_drop(mContext.get(), aTextureId);
  RemoveExternalTexture(aTextureId);
  return IPC_OK();
}

ipc::IPCResult WebGPUParent::RecvTextureViewDrop(RawId aTextureViewId) {
  ffi::wgpu_server_texture_view_drop(mContext.get(), aTextureViewId);
  return IPC_OK();
}

ipc::IPCResult WebGPUParent::RecvSamplerDrop(RawId aSamplerId) {
  ffi::wgpu_server_sampler_drop(mContext.get(), aSamplerId);
  return IPC_OK();
}

ipc::IPCResult WebGPUParent::RecvQuerySetDrop(RawId aQuerySetId) {
  ffi::wgpu_server_query_set_drop(mContext.get(), aQuerySetId);
  return IPC_OK();
}

ipc::IPCResult WebGPUParent::RecvCommandEncoderFinish(
    RawId aEncoderId, RawId aDeviceId,
    const dom::GPUCommandBufferDescriptor& aDesc) {
  Unused << aDesc;
  ffi::WGPUCommandBufferDescriptor desc = {};

  webgpu::StringHelper label(aDesc.mLabel);
  desc.label = label.Get();

  ErrorBuffer error;
  ffi::wgpu_server_encoder_finish(mContext.get(), aEncoderId, &desc,
                                  error.ToFFI());

  ForwardError(aDeviceId, error);
  return IPC_OK();
}

ipc::IPCResult WebGPUParent::RecvCommandEncoderDrop(RawId aEncoderId) {
  ffi::wgpu_server_encoder_drop(mContext.get(), aEncoderId);
  return IPC_OK();
}

ipc::IPCResult WebGPUParent::RecvRenderBundleDrop(RawId aBundleId) {
  ffi::wgpu_server_render_bundle_drop(mContext.get(), aBundleId);
  return IPC_OK();
}

ipc::IPCResult WebGPUParent::RecvQueueSubmit(
    RawId aQueueId, RawId aDeviceId, const nsTArray<RawId>& aCommandBuffers,
    const nsTArray<RawId>& aTextureIds) {
  for (const auto& textureId : aTextureIds) {
    auto it = mExternalTextures.find(textureId);
    if (it != mExternalTextures.end()) {
      auto& externalTexture = it->second;
      externalTexture->onBeforeQueueSubmit(aQueueId);
    }
  }

  ErrorBuffer error;
  auto index = ffi::wgpu_server_queue_submit(
      mContext.get(), aQueueId, aCommandBuffers.Elements(),
      aCommandBuffers.Length(), error.ToFFI());
  // Check if index is valid. 0 means error.
  if (index != 0) {
    for (const auto& textureId : aTextureIds) {
      auto it = mExternalTextures.find(textureId);
      if (it != mExternalTextures.end()) {
        auto& externalTexture = it->second;

        externalTexture->SetSubmissionIndex(index);
        // Update mLastSubmittedTextureId
        auto ownerId = externalTexture->GetOwnerId();
        const auto& lookup = mPresentationDataMap.find(ownerId);
        if (lookup != mPresentationDataMap.end()) {
          RefPtr<PresentationData> data = lookup->second.get();
          data->mLastSubmittedTextureId = Some(textureId);
        }
      }
    }
  }
  ForwardError(aDeviceId, error);
  return IPC_OK();
}

struct OnSubmittedWorkDoneRequest {
  RefPtr<WebGPUParent> mParent;
  WebGPUParent::QueueOnSubmittedWorkDoneResolver mResolver;
};

void OnSubmittedWorkDoneCallback(uint8_t* userdata) {
  auto req = std::unique_ptr<OnSubmittedWorkDoneRequest>(
      reinterpret_cast<OnSubmittedWorkDoneRequest*>(userdata));
  if (req->mParent->CanSend()) {
    req->mResolver(void_t());
  }
}

ipc::IPCResult WebGPUParent::RecvQueueOnSubmittedWorkDone(
    RawId aQueueId, std::function<void(mozilla::void_t)>&& aResolver) {
  std::unique_ptr<OnSubmittedWorkDoneRequest> request(
      new OnSubmittedWorkDoneRequest{this, std::move(aResolver)});

  ffi::WGPUSubmittedWorkDoneClosure closure = {
      &OnSubmittedWorkDoneCallback,
      reinterpret_cast<uint8_t*>(request.release())};
  ffi::wgpu_server_on_submitted_work_done(mContext.get(), aQueueId, closure);
  return IPC_OK();
}

ipc::IPCResult WebGPUParent::RecvQueueWriteAction(
    RawId aQueueId, RawId aDeviceId, const ipc::ByteBuf& aByteBuf,
    ipc::MutableSharedMemoryHandle&& aShmem) {
  // `aShmem` may be an invalid handle, however this will simply result in an
  // invalid mapping with 0 size, which is used safely below.
  auto mapping = aShmem.Map();

  ErrorBuffer error;
  ffi::wgpu_server_queue_write_action(
      mContext.get(), aQueueId, ToFFI(&aByteBuf), mapping.DataAs<uint8_t>(),
      mapping.Size(), error.ToFFI());
  ForwardError(aDeviceId, error);
  return IPC_OK();
}

ipc::IPCResult WebGPUParent::RecvBindGroupLayoutDrop(RawId aBindGroupLayoutId) {
  ffi::wgpu_server_bind_group_layout_drop(mContext.get(), aBindGroupLayoutId);
  return IPC_OK();
}

ipc::IPCResult WebGPUParent::RecvPipelineLayoutDrop(RawId aPipelineLayoutId) {
  ffi::wgpu_server_pipeline_layout_drop(mContext.get(), aPipelineLayoutId);
  return IPC_OK();
}

ipc::IPCResult WebGPUParent::RecvBindGroupDrop(RawId aBindGroupId) {
  ffi::wgpu_server_bind_group_drop(mContext.get(), aBindGroupId);
  return IPC_OK();
}

ipc::IPCResult WebGPUParent::RecvShaderModuleDrop(RawId aModuleId) {
  ffi::wgpu_server_shader_module_drop(mContext.get(), aModuleId);
  return IPC_OK();
}

ipc::IPCResult WebGPUParent::RecvComputePipelineDrop(RawId aPipelineId) {
  ffi::wgpu_server_compute_pipeline_drop(mContext.get(), aPipelineId);
  return IPC_OK();
}

ipc::IPCResult WebGPUParent::RecvRenderPipelineDrop(RawId aPipelineId) {
  ffi::wgpu_server_render_pipeline_drop(mContext.get(), aPipelineId);
  return IPC_OK();
}

ipc::IPCResult WebGPUParent::RecvImplicitLayoutDrop(
    RawId aImplicitPlId, const nsTArray<RawId>& aImplicitBglIds) {
  ffi::wgpu_server_pipeline_layout_drop(mContext.get(), aImplicitPlId);
  for (const auto& id : aImplicitBglIds) {
    ffi::wgpu_server_bind_group_layout_drop(mContext.get(), id);
  }
  return IPC_OK();
}

// TODO: proper destruction

ipc::IPCResult WebGPUParent::RecvDeviceCreateSwapChain(
    RawId aDeviceId, RawId aQueueId, const RGBDescriptor& aDesc,
    const nsTArray<RawId>& aBufferIds,
    const layers::RemoteTextureOwnerId& aOwnerId,
    bool aUseExternalTextureInSwapChain) {
  switch (aDesc.format()) {
    case gfx::SurfaceFormat::R8G8B8A8:
    case gfx::SurfaceFormat::B8G8R8A8:
      break;
    default:
      MOZ_ASSERT_UNREACHABLE("Invalid surface format!");
      return IPC_OK();
  }

  const auto bufferStrideWithMask =
      Device::BufferStrideWithMask(aDesc.size(), aDesc.format());
  if (!bufferStrideWithMask.isValid()) {
    MOZ_ASSERT_UNREACHABLE("Invalid width / buffer stride!");
    return IPC_OK();
  }

  constexpr uint32_t kBufferAlignmentMask = 0xff;
  const uint32_t bufferStride =
      bufferStrideWithMask.value() & ~kBufferAlignmentMask;

  const auto rows = CheckedInt<uint32_t>(aDesc.size().height);
  if (!rows.isValid()) {
    MOZ_ASSERT_UNREACHABLE("Invalid height!");
    return IPC_OK();
  }

  if (!mRemoteTextureOwner) {
    mRemoteTextureOwner =
        MakeRefPtr<layers::RemoteTextureOwnerClient>(OtherPid());
  }
  mRemoteTextureOwner->RegisterTextureOwner(aOwnerId);

  auto data = MakeRefPtr<PresentationData>(this, aUseExternalTextureInSwapChain,
                                           aDeviceId, aQueueId, aDesc,
                                           bufferStride, aBufferIds);
  if (!mPresentationDataMap.emplace(aOwnerId, data).second) {
    NS_ERROR("External image is already registered as WebGPU canvas!");
  }
  return IPC_OK();
}

ipc::IPCResult WebGPUParent::RecvDeviceCreateShaderModule(
    RawId aDeviceId, RawId aModuleId, const nsString& aLabel,
    const nsCString& aCode, DeviceCreateShaderModuleResolver&& aOutMessage) {
  // TODO: this should probably be an optional label in the IPC message.
  const nsACString* label = nullptr;
  NS_ConvertUTF16toUTF8 utf8Label(aLabel);
  if (!utf8Label.IsEmpty()) {
    label = &utf8Label;
  }

  ffi::WGPUShaderModuleCompilationMessage message;
  ErrorBuffer error;

  bool ok = ffi::wgpu_server_device_create_shader_module(
      mContext.get(), aDeviceId, aModuleId, label, &aCode, &message,
      error.ToFFI());

  ForwardError(aDeviceId, error);

  nsTArray<WebGPUCompilationMessage> messages;

  if (!ok) {
    WebGPUCompilationMessage msg;
    msg.lineNum = message.line_number;
    msg.linePos = message.line_pos;
    msg.offset = message.utf16_offset;
    msg.length = message.utf16_length;
    msg.message = message.message;
    // wgpu currently only returns errors.
    msg.messageType = WebGPUCompilationMessageType::Error;

    messages.AppendElement(msg);
  }

  aOutMessage(messages);

  return IPC_OK();
}

struct ReadbackPresentRequest {
  ReadbackPresentRequest(
      const ffi::WGPUGlobal* aContext, RefPtr<PresentationData>& aData,
      RefPtr<layers::RemoteTextureOwnerClient>& aRemoteTextureOwner,
      const layers::RemoteTextureId aTextureId,
      const layers::RemoteTextureOwnerId aOwnerId)
      : mContext(aContext),
        mData(aData),
        mRemoteTextureOwner(aRemoteTextureOwner),
        mTextureId(aTextureId),
        mOwnerId(aOwnerId) {}

  const ffi::WGPUGlobal* mContext;
  RefPtr<PresentationData> mData;
  RefPtr<layers::RemoteTextureOwnerClient> mRemoteTextureOwner;
  const layers::RemoteTextureId mTextureId;
  const layers::RemoteTextureOwnerId mOwnerId;
};

static void ReadbackPresentCallback(uint8_t* userdata,
                                    ffi::WGPUBufferMapAsyncStatus status) {
  UniquePtr<ReadbackPresentRequest> req(
      reinterpret_cast<ReadbackPresentRequest*>(userdata));

  const auto onExit = mozilla::MakeScopeExit([&]() {
    auto& waitingTextures = req->mData->mWaitingReadbackTexturesForPresent;
    auto it = waitingTextures.find(req->mTextureId);
    MOZ_ASSERT(it != waitingTextures.end());
    if (it != waitingTextures.end()) {
      waitingTextures.erase(it);
    }
    if (req->mData->mPendingSwapChainDrop.isSome() && waitingTextures.empty()) {
      if (req->mData->mParent) {
        auto& pendingDrop = req->mData->mPendingSwapChainDrop.ref();
        req->mData->mParent->RecvSwapChainDrop(
            req->mOwnerId, pendingDrop.mTxnType, pendingDrop.mTxnId);
        req->mData->mPendingSwapChainDrop = Nothing();
      }
    }
  });

  if (!req->mRemoteTextureOwner->IsRegistered(req->mOwnerId)) {
    // SwapChain is already Destroyed
    return;
  }

  RefPtr<PresentationData> data = req->mData;
  // get the buffer ID
  RawId bufferId;
  {
    bufferId = data->mQueuedBufferIds.back();
    data->mQueuedBufferIds.pop_back();
  }

  // Ensure we'll make the bufferId available for reuse
  data->mAvailableBufferIds.push_back(bufferId);

  MOZ_LOG(sLogger, LogLevel::Info,
          ("ReadbackPresentCallback for buffer %" PRIu64 " status=%d\n",
           bufferId, status));
  // copy the data
  if (status == ffi::WGPUBufferMapAsyncStatus_Success) {
    const auto bufferSize = data->mDesc.size().height * data->mSourcePitch;
    ErrorBuffer getRangeError;
    const auto mapped = ffi::wgpu_server_buffer_get_mapped_range(
        req->mContext, bufferId, 0, bufferSize, getRangeError.ToFFI());
    getRangeError.CoerceValidationToInternal();
    if (req->mData->mParent) {
      req->mData->mParent->ForwardError(data->mDeviceId, getRangeError);
    }
    if (auto innerError = getRangeError.GetError()) {
      MOZ_LOG(sLogger, LogLevel::Info,
              ("WebGPU present: buffer get_mapped_range for internal "
               "presentation readback failed: %s\n",
               innerError->message.get()));
      return;
    }

    MOZ_RELEASE_ASSERT(mapped.length >= bufferSize);
    auto textureData =
        req->mRemoteTextureOwner->CreateOrRecycleBufferTextureData(
            data->mDesc.size(), data->mDesc.format(), req->mOwnerId);
    if (!textureData) {
      gfxCriticalNoteOnce << "Failed to allocate BufferTextureData";
      return;
    }
    layers::MappedTextureData mappedData;
    if (textureData && textureData->BorrowMappedData(mappedData)) {
      uint8_t* src = mapped.ptr;
      uint8_t* dst = mappedData.data;
      for (auto row = 0; row < data->mDesc.size().height; ++row) {
        memcpy(dst, src, mappedData.stride);
        dst += mappedData.stride;
        src += data->mSourcePitch;
      }
      req->mRemoteTextureOwner->PushTexture(req->mTextureId, req->mOwnerId,
                                            std::move(textureData));
    } else {
      NS_WARNING("WebGPU present skipped: the swapchain is resized!");
    }
    ErrorBuffer unmapError;
    wgpu_server_buffer_unmap(req->mContext, bufferId, unmapError.ToFFI());
    unmapError.CoerceValidationToInternal();
    if (req->mData->mParent) {
      req->mData->mParent->ForwardError(data->mDeviceId, unmapError);
    }
    if (auto innerError = unmapError.GetError()) {
      MOZ_LOG(sLogger, LogLevel::Info,
              ("WebGPU present: buffer unmap for internal presentation "
               "readback failed: %s\n",
               innerError->message.get()));
    }
  } else {
    // TODO: better handle errors
    NS_WARNING("WebGPU frame mapping failed!");
  }
}

struct ReadbackSnapshotRequest {
  ReadbackSnapshotRequest(const ffi::WGPUGlobal* aContext,
                          RefPtr<PresentationData>& aData,
                          ffi::WGPUBufferId aBufferId,
                          const ipc::Shmem& aDestShmem)
      : mContext(aContext),
        mData(aData),
        mBufferId(aBufferId),
        mDestShmem(aDestShmem) {}

  const ffi::WGPUGlobal* mContext;
  RefPtr<PresentationData> mData;
  const ffi::WGPUBufferId mBufferId;
  const ipc::Shmem& mDestShmem;
};

static void ReadbackSnapshotCallback(uint8_t* userdata,
                                     ffi::WGPUBufferMapAsyncStatus status) {
  UniquePtr<ReadbackSnapshotRequest> req(
      reinterpret_cast<ReadbackSnapshotRequest*>(userdata));

  RefPtr<PresentationData> data = req->mData;
  data->mReadbackSnapshotCallbackCalled = true;

  // Ensure we'll make the bufferId available for reuse
  data->mAvailableBufferIds.push_back(req->mBufferId);

  MOZ_LOG(sLogger, LogLevel::Info,
          ("ReadbackSnapshotCallback for buffer %" PRIu64 " status=%d\n",
           req->mBufferId, status));
  if (status != ffi::WGPUBufferMapAsyncStatus_Success) {
    return;
  }
  // copy the data
  const auto bufferSize = data->mDesc.size().height * data->mSourcePitch;
  ErrorBuffer getRangeError;
  const auto mapped = ffi::wgpu_server_buffer_get_mapped_range(
      req->mContext, req->mBufferId, 0, bufferSize, getRangeError.ToFFI());
  getRangeError.CoerceValidationToInternal();
  if (req->mData->mParent) {
    req->mData->mParent->ForwardError(data->mDeviceId, getRangeError);
  }
  if (auto innerError = getRangeError.GetError()) {
    MOZ_LOG(sLogger, LogLevel::Info,
            ("WebGPU present: buffer get_mapped_range for internal "
             "presentation readback failed: %s\n",
             innerError->message.get()));
    return;
  }

  MOZ_RELEASE_ASSERT(mapped.length >= bufferSize);

  uint8_t* src = mapped.ptr;
  uint8_t* dst = req->mDestShmem.get<uint8_t>();
  const uint32_t stride = layers::ImageDataSerializer::ComputeRGBStride(
      gfx::SurfaceFormat::B8G8R8A8, data->mDesc.size().width);

  for (auto row = 0; row < data->mDesc.size().height; ++row) {
    memcpy(dst, src, stride);
    src += data->mSourcePitch;
    dst += stride;
  }

  ErrorBuffer unmapError;
  wgpu_server_buffer_unmap(req->mContext, req->mBufferId, unmapError.ToFFI());
  unmapError.CoerceValidationToInternal();
  if (req->mData->mParent) {
    req->mData->mParent->ForwardError(data->mDeviceId, unmapError);
  }
  if (auto innerError = unmapError.GetError()) {
    MOZ_LOG(sLogger, LogLevel::Info,
            ("WebGPU snapshot: buffer unmap for internal presentation "
             "readback failed: %s\n",
             innerError->message.get()));
  }
}

ipc::IPCResult WebGPUParent::GetFrontBufferSnapshot(
    IProtocol* aProtocol, const layers::RemoteTextureOwnerId& aOwnerId,
    const RawId& aCommandEncoderId, Maybe<Shmem>& aShmem, gfx::IntSize& aSize,
    uint32_t& aByteStride) {
  const auto& lookup = mPresentationDataMap.find(aOwnerId);
  if (lookup == mPresentationDataMap.end()) {
    MOZ_ASSERT_UNREACHABLE("unexpected to be called");
    return IPC_OK();
  }

  RefPtr<PresentationData> data = lookup->second.get();
  data->mReadbackSnapshotCallbackCalled = false;
  aSize = data->mDesc.size();
  uint32_t stride = layers::ImageDataSerializer::ComputeRGBStride(
      data->mDesc.format(), aSize.width);
  aByteStride = stride;
  uint32_t len = data->mDesc.size().height * stride;
  Shmem shmem;
  if (!AllocShmem(len, &shmem)) {
    return IPC_OK();
  }

  if (data->mLastSubmittedTextureId.isNothing()) {
    return IPC_OK();
  }

  auto it = mExternalTextures.find(data->mLastSubmittedTextureId.ref());
  // External texture is already invalid and posted to RemoteTextureMap
  if (it == mExternalTextures.end()) {
    if (!mRemoteTextureOwner || !mRemoteTextureOwner->IsRegistered(aOwnerId)) {
      MOZ_ASSERT_UNREACHABLE("unexpected to be called");
      return IPC_OK();
    }
    if (!data->mUseExternalTextureInSwapChain) {
      ffi::wgpu_server_device_poll(mContext.get(), data->mDeviceId, true);
    }
    mRemoteTextureOwner->GetLatestBufferSnapshot(aOwnerId, shmem, aSize);
    aShmem.emplace(std::move(shmem));
    return IPC_OK();
  }

  // Readback synchronously

  RawId bufferId = 0;
  const auto& size = data->mDesc.size();
  const auto bufferSize = data->mDesc.size().height * data->mSourcePitch;

  // step 1: find an available staging buffer, or create one
  {
    if (!data->mAvailableBufferIds.empty()) {
      bufferId = data->mAvailableBufferIds.back();
      data->mAvailableBufferIds.pop_back();
    } else if (!data->mUnassignedBufferIds.empty()) {
      bufferId = data->mUnassignedBufferIds.back();
      data->mUnassignedBufferIds.pop_back();

      ffi::WGPUBufferUsages usage =
          WGPUBufferUsages_COPY_DST | WGPUBufferUsages_MAP_READ;

      ErrorBuffer error;
      ffi::wgpu_server_device_create_buffer(mContext.get(), data->mDeviceId,
                                            bufferId, nullptr, bufferSize,
                                            usage, false, false, error.ToFFI());
      if (ForwardError(data->mDeviceId, error)) {
        return IPC_OK();
      }
    } else {
      bufferId = 0;
    }
  }

  MOZ_LOG(sLogger, LogLevel::Info,
          ("GetFrontBufferSnapshot with buffer %" PRIu64 "\n", bufferId));
  if (!bufferId) {
    // TODO: add a warning - no buffer are available!
    return IPC_OK();
  }

  // step 3: submit a copy command for the frame
  ffi::WGPUCommandEncoderDescriptor encoderDesc = {};
  {
    ErrorBuffer error;
    ffi::wgpu_server_device_create_encoder(mContext.get(), data->mDeviceId,
                                           &encoderDesc, aCommandEncoderId,
                                           error.ToFFI());
    if (ForwardError(data->mDeviceId, error)) {
      return IPC_OK();
    }
  }

  if (data->mLastSubmittedTextureId.isNothing()) {
    return IPC_OK();
  }

  const ffi::WGPUTexelCopyTextureInfo texView = {
      data->mLastSubmittedTextureId.ref(),
  };
  const ffi::WGPUTexelCopyBufferLayout bufLayout = {
      0,
      &data->mSourcePitch,
      nullptr,
  };
  const ffi::WGPUExtent3d extent = {
      static_cast<uint32_t>(size.width),
      static_cast<uint32_t>(size.height),
      1,
  };

  {
    ErrorBuffer error;
    ffi::wgpu_server_encoder_copy_texture_to_buffer(
        mContext.get(), aCommandEncoderId, &texView, bufferId, &bufLayout,
        &extent, error.ToFFI());
    if (ForwardError(data->mDeviceId, error)) {
      return IPC_OK();
    }
  }
  ffi::WGPUCommandBufferDescriptor commandDesc = {};
  {
    ErrorBuffer error;
    ffi::wgpu_server_encoder_finish(mContext.get(), aCommandEncoderId,
                                    &commandDesc, error.ToFFI());
    if (ForwardError(data->mDeviceId, error)) {
      ffi::wgpu_server_encoder_drop(mContext.get(), aCommandEncoderId);
      return IPC_OK();
    }
  }

  {
    ErrorBuffer error;
    ffi::wgpu_server_queue_submit(mContext.get(), data->mQueueId,
                                  &aCommandEncoderId, 1, error.ToFFI());
    ffi::wgpu_server_encoder_drop(mContext.get(), aCommandEncoderId);
    if (ForwardError(data->mDeviceId, error)) {
      return IPC_OK();
    }
  }

  auto snapshotRequest = MakeUnique<ReadbackSnapshotRequest>(
      mContext.get(), data, bufferId, shmem);

  ffi::WGPUBufferMapClosure closure = {
      &ReadbackSnapshotCallback,
      reinterpret_cast<uint8_t*>(snapshotRequest.release())};

  ErrorBuffer error;
  ffi::wgpu_server_buffer_map(mContext.get(), bufferId, 0, bufferSize,
                              ffi::WGPUHostMap_Read, closure, error.ToFFI());
  if (ForwardError(data->mDeviceId, error)) {
    return IPC_OK();
  }

  // Callback should be called during the poll.
  ffi::wgpu_server_poll_all_devices(mContext.get(), true);

  // Check if ReadbackSnapshotCallback is called.
  MOZ_RELEASE_ASSERT(data->mReadbackSnapshotCallbackCalled == true);

  aShmem.emplace(std::move(shmem));
  return IPC_OK();
}

void WebGPUParent::PostExternalTexture(
    const std::shared_ptr<ExternalTexture>&& aExternalTexture,
    const layers::RemoteTextureId aRemoteTextureId,
    const layers::RemoteTextureOwnerId aOwnerId) {
  const auto& lookup = mPresentationDataMap.find(aOwnerId);
  if (lookup == mPresentationDataMap.end() || !mRemoteTextureOwner ||
      !mRemoteTextureOwner->IsRegistered(aOwnerId)) {
    NS_WARNING("WebGPU presenting on a destroyed swap chain!");
    return;
  }

  const auto surfaceFormat = gfx::SurfaceFormat::B8G8R8A8;
  const auto size = aExternalTexture->GetSize();

  RefPtr<PresentationData> data = lookup->second.get();

  Maybe<layers::SurfaceDescriptor> desc =
      aExternalTexture->ToSurfaceDescriptor();
  if (!desc) {
    MOZ_ASSERT_UNREACHABLE("unexpected to be called");
    return;
  }

  mRemoteTextureOwner->PushTexture(aRemoteTextureId, aOwnerId, aExternalTexture,
                                   size, surfaceFormat, *desc);

  auto recycledTexture = mRemoteTextureOwner->GetRecycledExternalTexture(
      size, surfaceFormat, desc->type(), aOwnerId);
  if (recycledTexture) {
    recycledTexture->CleanForRecycling();
    data->mRecycledExternalTextures.push_back(recycledTexture);
  }
}

RefPtr<gfx::FileHandleWrapper> WebGPUParent::GetDeviceFenceHandle(
    const RawId aDeviceId) {
  auto it = mDeviceFenceHandles.find(aDeviceId);
  if (it == mDeviceFenceHandles.end()) {
    return nullptr;
  }
  return it->second;
}

ipc::IPCResult WebGPUParent::RecvSwapChainPresent(
    RawId aTextureId, RawId aCommandEncoderId,
    const layers::RemoteTextureId& aRemoteTextureId,
    const layers::RemoteTextureOwnerId& aOwnerId) {
  // step 0: get the data associated with the swapchain
  const auto& lookup = mPresentationDataMap.find(aOwnerId);
  if (lookup == mPresentationDataMap.end() || !mRemoteTextureOwner ||
      !mRemoteTextureOwner->IsRegistered(aOwnerId)) {
    NS_WARNING("WebGPU presenting on a destroyed swap chain!");
    return IPC_OK();
  }

  RefPtr<PresentationData> data = lookup->second.get();

  if (data->mUseExternalTextureInSwapChain) {
    auto it = mExternalTextures.find(aTextureId);
    if (it == mExternalTextures.end()) {
      MOZ_ASSERT_UNREACHABLE("unexpected to be called");
      return IPC_OK();
    }
    std::shared_ptr<ExternalTexture> externalTexture = it->second;
    mExternalTextures.erase(it);

    MOZ_ASSERT(externalTexture->GetOwnerId() == aOwnerId);

    PostExternalTexture(std::move(externalTexture), aRemoteTextureId, aOwnerId);
    return IPC_OK();
  }

  RawId bufferId = 0;
  const auto& size = data->mDesc.size();
  const auto bufferSize = data->mDesc.size().height * data->mSourcePitch;

  // step 1: find an available staging buffer, or create one
  {
    if (!data->mAvailableBufferIds.empty()) {
      bufferId = data->mAvailableBufferIds.back();
      data->mAvailableBufferIds.pop_back();
    } else if (!data->mUnassignedBufferIds.empty()) {
      bufferId = data->mUnassignedBufferIds.back();
      data->mUnassignedBufferIds.pop_back();

      ffi::WGPUBufferUsages usage =
          WGPUBufferUsages_COPY_DST | WGPUBufferUsages_MAP_READ;

      ErrorBuffer error;
      ffi::wgpu_server_device_create_buffer(mContext.get(), data->mDeviceId,
                                            bufferId, nullptr, bufferSize,
                                            usage, false, false, error.ToFFI());
      if (ForwardError(data->mDeviceId, error)) {
        return IPC_OK();
      }
    } else {
      bufferId = 0;
    }

    if (bufferId) {
      data->mQueuedBufferIds.insert(data->mQueuedBufferIds.begin(), bufferId);
    }
  }

  MOZ_LOG(sLogger, LogLevel::Info,
          ("RecvSwapChainPresent with buffer %" PRIu64 "\n", bufferId));
  if (!bufferId) {
    // TODO: add a warning - no buffer are available!
    return IPC_OK();
  }

  // step 3: submit a copy command for the frame
  ffi::WGPUCommandEncoderDescriptor encoderDesc = {};
  {
    ErrorBuffer error;
    ffi::wgpu_server_device_create_encoder(mContext.get(), data->mDeviceId,
                                           &encoderDesc, aCommandEncoderId,
                                           error.ToFFI());
    if (ForwardError(data->mDeviceId, error)) {
      return IPC_OK();
    }
  }

  const ffi::WGPUTexelCopyTextureInfo texView = {
      aTextureId,
  };
  const ffi::WGPUTexelCopyBufferLayout bufLayout = {
      0,
      &data->mSourcePitch,
      nullptr,
  };
  const ffi::WGPUExtent3d extent = {
      static_cast<uint32_t>(size.width),
      static_cast<uint32_t>(size.height),
      1,
  };

  {
    ErrorBuffer error;
    ffi::wgpu_server_encoder_copy_texture_to_buffer(
        mContext.get(), aCommandEncoderId, &texView, bufferId, &bufLayout,
        &extent, error.ToFFI());
    if (ForwardError(data->mDeviceId, error)) {
      return IPC_OK();
    }
  }
  ffi::WGPUCommandBufferDescriptor commandDesc = {};
  {
    ErrorBuffer error;
    ffi::wgpu_server_encoder_finish(mContext.get(), aCommandEncoderId,
                                    &commandDesc, error.ToFFI());
    if (ForwardError(data->mDeviceId, error)) {
      ffi::wgpu_server_encoder_drop(mContext.get(), aCommandEncoderId);
      return IPC_OK();
    }
  }

  {
    ErrorBuffer error;
    ffi::wgpu_server_queue_submit(mContext.get(), data->mQueueId,
                                  &aCommandEncoderId, 1, error.ToFFI());
    ffi::wgpu_server_encoder_drop(mContext.get(), aCommandEncoderId);
    if (ForwardError(data->mDeviceId, error)) {
      return IPC_OK();
    }
  }

  auto& waitingTextures = data->mWaitingReadbackTexturesForPresent;
  auto it = waitingTextures.find(aRemoteTextureId);
  MOZ_ASSERT(it == waitingTextures.end());
  if (it == waitingTextures.end()) {
    waitingTextures.emplace(aRemoteTextureId);
  }

  // step 4: request the pixels to be copied into the external texture
  // TODO: this isn't strictly necessary. When WR wants to Lock() the external
  // texture,
  // we can just give it the contents of the last mapped buffer instead of the
  // copy.
  auto presentRequest = MakeUnique<ReadbackPresentRequest>(
      mContext.get(), data, mRemoteTextureOwner, aRemoteTextureId, aOwnerId);

  ffi::WGPUBufferMapClosure closure = {
      &ReadbackPresentCallback,
      reinterpret_cast<uint8_t*>(presentRequest.release())};

  ErrorBuffer error;
  ffi::wgpu_server_buffer_map(mContext.get(), bufferId, 0, bufferSize,
                              ffi::WGPUHostMap_Read, closure, error.ToFFI());
  if (ForwardError(data->mDeviceId, error)) {
    return IPC_OK();
  }

  return IPC_OK();
}

ipc::IPCResult WebGPUParent::RecvSwapChainDrop(
    const layers::RemoteTextureOwnerId& aOwnerId,
    layers::RemoteTextureTxnType aTxnType, layers::RemoteTextureTxnId aTxnId) {
  const auto& lookup = mPresentationDataMap.find(aOwnerId);
  MOZ_ASSERT(lookup != mPresentationDataMap.end());
  if (lookup == mPresentationDataMap.end()) {
    NS_WARNING("WebGPU presenting on a destroyed swap chain!");
    return IPC_OK();
  }

  RefPtr<PresentationData> data = lookup->second.get();

  auto waitingCount = data->mWaitingReadbackTexturesForPresent.size();
  if (waitingCount > 0) {
    // Defer SwapChainDrop until readback complete
    data->mPendingSwapChainDrop = Some(PendingSwapChainDrop{aTxnType, aTxnId});
    return IPC_OK();
  }

  if (mRemoteTextureOwner) {
    if (aTxnType && aTxnId) {
      mRemoteTextureOwner->WaitForTxn(aOwnerId, aTxnType, aTxnId);
    }
    mRemoteTextureOwner->UnregisterTextureOwner(aOwnerId);
  }

  mPresentationDataMap.erase(lookup);

  for (const auto bid : data->mAvailableBufferIds) {
    ffi::wgpu_server_buffer_drop(mContext.get(), bid);
  }
  for (const auto bid : data->mQueuedBufferIds) {
    ffi::wgpu_server_buffer_drop(mContext.get(), bid);
  }
  return IPC_OK();
}

void WebGPUParent::ActorDestroy(ActorDestroyReason aWhy) {
  mTimer.Stop();
  mPresentationDataMap.clear();
  if (mRemoteTextureOwner) {
    mRemoteTextureOwner->UnregisterAllTextureOwners();
    mRemoteTextureOwner = nullptr;
  }
  mActiveDeviceIds.Clear();
  ffi::wgpu_server_poll_all_devices(mContext.get(), true);
  mContext = nullptr;
}

ipc::IPCResult WebGPUParent::RecvDeviceAction(RawId aDeviceId,
                                              const ipc::ByteBuf& aByteBuf) {
  ErrorBuffer error;
  ffi::wgpu_server_device_action(mContext.get(), aDeviceId, ToFFI(&aByteBuf),
                                 error.ToFFI());

  ForwardError(aDeviceId, error);
  return IPC_OK();
}

ipc::IPCResult WebGPUParent::RecvDeviceActionWithAck(
    RawId aDeviceId, const ipc::ByteBuf& aByteBuf,
    DeviceActionWithAckResolver&& aResolver) {
  auto result = RecvDeviceAction(aDeviceId, aByteBuf);
  aResolver(true);
  return result;
}

ipc::IPCResult WebGPUParent::RecvTextureAction(RawId aTextureId,
                                               RawId aDeviceId,
                                               const ipc::ByteBuf& aByteBuf) {
  ErrorBuffer error;
  ffi::wgpu_server_texture_action(mContext.get(), aTextureId, ToFFI(&aByteBuf),
                                  error.ToFFI());

  ForwardError(aDeviceId, error);
  return IPC_OK();
}

ipc::IPCResult WebGPUParent::RecvCommandEncoderAction(
    RawId aEncoderId, RawId aDeviceId, const ipc::ByteBuf& aByteBuf) {
  ErrorBuffer error;
  ffi::wgpu_server_command_encoder_action(mContext.get(), aEncoderId,
                                          ToFFI(&aByteBuf), error.ToFFI());
  ForwardError(aDeviceId, error);
  return IPC_OK();
}

ipc::IPCResult WebGPUParent::RecvRenderPass(RawId aEncoderId, RawId aDeviceId,
                                            const ipc::ByteBuf& aByteBuf) {
  ErrorBuffer error;
  ffi::wgpu_server_render_pass(mContext.get(), aEncoderId, ToFFI(&aByteBuf),
                               error.ToFFI());
  ForwardError(aDeviceId, error);
  return IPC_OK();
}

ipc::IPCResult WebGPUParent::RecvComputePass(RawId aEncoderId, RawId aDeviceId,
                                             const ipc::ByteBuf& aByteBuf) {
  ErrorBuffer error;
  ffi::wgpu_server_compute_pass(mContext.get(), aEncoderId, ToFFI(&aByteBuf),
                                error.ToFFI());
  ForwardError(aDeviceId, error);
  return IPC_OK();
}

ipc::IPCResult WebGPUParent::RecvDevicePushErrorScope(
    RawId aDeviceId, const dom::GPUErrorFilter aFilter) {
  const auto& itr = mErrorScopeStackByDevice.find(aDeviceId);
  if (itr == mErrorScopeStackByDevice.end()) {
    // Content can cause this simply by destroying a device and then
    // calling `pushErrorScope`.
    return IPC_OK();
  }
  auto& stack = itr->second;

  // Let's prevent `while (true) { pushErrorScope(); }`.
  constexpr size_t MAX_ERROR_SCOPE_STACK_SIZE = 1'000'000;
  if (stack.size() >= MAX_ERROR_SCOPE_STACK_SIZE) {
    nsPrintfCString m("pushErrorScope: Hit MAX_ERROR_SCOPE_STACK_SIZE of %zu",
                      MAX_ERROR_SCOPE_STACK_SIZE);
    ReportError(Some(aDeviceId), dom::GPUErrorFilter::Out_of_memory, m);
    return IPC_OK();
  }

  const auto newScope = ErrorScope{aFilter};
  stack.push_back(newScope);
  return IPC_OK();
}

ipc::IPCResult WebGPUParent::RecvDevicePopErrorScope(
    RawId aDeviceId, DevicePopErrorScopeResolver&& aResolver) {
  const auto popResult = [&]() {
    const auto& itr = mErrorScopeStackByDevice.find(aDeviceId);
    if (itr == mErrorScopeStackByDevice.end()) {
      // Content can cause this simply by destroying a device and then
      // calling `popErrorScope`.
      return PopErrorScopeResult{PopErrorScopeResultType::DeviceLost};
    }

    auto& stack = itr->second;
    if (!stack.size()) {
      // Content can cause this simply by calling `popErrorScope` when
      // there is no error scope pushed.
      return PopErrorScopeResult{PopErrorScopeResultType::ThrowOperationError,
                                 "popErrorScope on empty stack"_ns};
    }

    const auto& scope = stack.back();
    const auto popLater = MakeScopeExit([&]() { stack.pop_back(); });

    auto ret = PopErrorScopeResult{PopErrorScopeResultType::NoError};
    if (scope.firstMessage) {
      ret.message = *scope.firstMessage;
      switch (scope.filter) {
        case dom::GPUErrorFilter::Validation:
          ret.resultType = PopErrorScopeResultType::ValidationError;
          break;
        case dom::GPUErrorFilter::Out_of_memory:
          ret.resultType = PopErrorScopeResultType::OutOfMemory;
          break;
        case dom::GPUErrorFilter::Internal:
          ret.resultType = PopErrorScopeResultType::InternalError;
          break;
      }
    }
    return ret;
  }();
  aResolver(popResult);
  return IPC_OK();
}

ipc::IPCResult WebGPUParent::RecvReportError(RawId aDeviceId,
                                             GPUErrorFilter aType,
                                             const nsCString& aMessage) {
  this->ReportError(Some(aDeviceId), aType, aMessage);
  return IPC_OK();
}

bool WebGPUParent::UseExternalTextureForSwapChain(
    ffi::WGPUSwapChainId aSwapChainId) {
  auto ownerId = layers::RemoteTextureOwnerId{aSwapChainId._0};
  const auto& lookup = mPresentationDataMap.find(ownerId);
  if (lookup == mPresentationDataMap.end()) {
    MOZ_ASSERT_UNREACHABLE("unexpected to be called");
    return false;
  }

  RefPtr<PresentationData> data = lookup->second.get();

  return data->mUseExternalTextureInSwapChain;
}

void WebGPUParent::DisableExternalTextureForSwapChain(
    ffi::WGPUSwapChainId aSwapChainId) {
  auto ownerId = layers::RemoteTextureOwnerId{aSwapChainId._0};
  const auto& lookup = mPresentationDataMap.find(ownerId);
  if (lookup == mPresentationDataMap.end()) {
    MOZ_ASSERT_UNREACHABLE("unexpected to be called");
    return;
  }

  RefPtr<PresentationData> data = lookup->second.get();

  if (data->mUseExternalTextureInSwapChain) {
    gfxCriticalNote << "Disable ExternalTexture for SwapChain:  "
                    << aSwapChainId._0;
  }

  data->mUseExternalTextureInSwapChain = false;
}

bool WebGPUParent::EnsureExternalTextureForSwapChain(
    ffi::WGPUSwapChainId aSwapChainId, ffi::WGPUDeviceId aDeviceId,
    ffi::WGPUTextureId aTextureId, uint32_t aWidth, uint32_t aHeight,
    struct ffi::WGPUTextureFormat aFormat, ffi::WGPUTextureUsages aUsage) {
  auto ownerId = layers::RemoteTextureOwnerId{aSwapChainId._0};
  const auto& lookup = mPresentationDataMap.find(ownerId);
  if (lookup == mPresentationDataMap.end()) {
    MOZ_ASSERT_UNREACHABLE("unexpected to be called");
    return false;
  }

  RefPtr<PresentationData> data = lookup->second.get();
  if (!data->mUseExternalTextureInSwapChain) {
    MOZ_ASSERT_UNREACHABLE("unexpected to be called");
    return false;
  }

  // Recycled ExternalTexture if it exists.
  if (!data->mRecycledExternalTextures.empty()) {
    std::shared_ptr<ExternalTexture> texture =
        data->mRecycledExternalTextures.front();
    // Check if the texture is recyclable.
    if (texture->mWidth == aWidth && texture->mHeight == aHeight &&
        texture->mFormat.tag == aFormat.tag && texture->mUsage == aUsage) {
      texture->SetOwnerId(ownerId);
      data->mRecycledExternalTextures.pop_front();
      mExternalTextures.emplace(aTextureId, texture);
      return true;
    }
    data->mRecycledExternalTextures.clear();
  }

  auto externalTexture = CreateExternalTexture(
      ownerId, aDeviceId, aTextureId, aWidth, aHeight, aFormat, aUsage);
  return static_cast<bool>(externalTexture);
}

void WebGPUParent::EnsureExternalTextureForReadBackPresent(
    ffi::WGPUSwapChainId aSwapChainId, ffi::WGPUDeviceId aDeviceId,
    ffi::WGPUTextureId aTextureId, uint32_t aWidth, uint32_t aHeight,
    struct ffi::WGPUTextureFormat aFormat, ffi::WGPUTextureUsages aUsage) {
  auto ownerId = layers::RemoteTextureOwnerId{aSwapChainId._0};
  const auto& lookup = mPresentationDataMap.find(ownerId);
  if (lookup == mPresentationDataMap.end()) {
    MOZ_ASSERT_UNREACHABLE("unexpected to be called");
    return;
  }

  RefPtr<PresentationData> data = lookup->second.get();
  if (data->mUseExternalTextureInSwapChain) {
    MOZ_ASSERT_UNREACHABLE("unexpected to be called");
    return;
  }

  UniquePtr<ExternalTexture> texture =
      ExternalTextureReadBackPresent::Create(aWidth, aHeight, aFormat, aUsage);
  if (!texture) {
    MOZ_ASSERT_UNREACHABLE("unexpected to be called");
    return;
  }

  texture->SetOwnerId(ownerId);
  std::shared_ptr<ExternalTexture> shared(texture.release());
  mExternalTextures[aTextureId] = shared;
}

std::shared_ptr<ExternalTexture> WebGPUParent::CreateExternalTexture(
    const layers::RemoteTextureOwnerId& aOwnerId, ffi::WGPUDeviceId aDeviceId,
    ffi::WGPUTextureId aTextureId, uint32_t aWidth, uint32_t aHeight,
    const struct ffi::WGPUTextureFormat aFormat,
    ffi::WGPUTextureUsages aUsage) {
  MOZ_RELEASE_ASSERT(mExternalTextures.find(aTextureId) ==
                     mExternalTextures.end());

  UniquePtr<ExternalTexture> texture = ExternalTexture::Create(
      this, aDeviceId, aWidth, aHeight, aFormat, aUsage);
  if (!texture) {
    return nullptr;
  }

  texture->SetOwnerId(aOwnerId);
  std::shared_ptr<ExternalTexture> shared(texture.release());
  mExternalTextures.emplace(aTextureId, shared);

  return shared;
}

std::shared_ptr<ExternalTexture> WebGPUParent::GetExternalTexture(
    ffi::WGPUTextureId aId) {
  auto it = mExternalTextures.find(aId);
  if (it == mExternalTextures.end()) {
    return nullptr;
  }
  return it->second;
}

/* static */
Maybe<ffi::WGPUFfiLUID> WebGPUParent::GetCompositorDeviceLuid() {
#if defined(XP_WIN)
  const RefPtr<ID3D11Device> d3d11Device =
      gfx::DeviceManagerDx::Get()->GetCompositorDevice();
  if (!d3d11Device) {
    gfxCriticalNoteOnce << "CompositorDevice does not exist";
    return Nothing();
  }

  RefPtr<IDXGIDevice> dxgiDevice;
  d3d11Device->QueryInterface((IDXGIDevice**)getter_AddRefs(dxgiDevice));

  RefPtr<IDXGIAdapter> dxgiAdapter;
  dxgiDevice->GetAdapter(getter_AddRefs(dxgiAdapter));

  DXGI_ADAPTER_DESC desc;
  if (FAILED(dxgiAdapter->GetDesc(&desc))) {
    gfxCriticalNoteOnce << "Failed to get DXGI_ADAPTER_DESC";
    return Nothing();
  }

  return Some(
      ffi::WGPUFfiLUID{desc.AdapterLuid.LowPart, desc.AdapterLuid.HighPart});
#else
  return Nothing();
#endif
}

#if defined(XP_LINUX) && !defined(MOZ_WIDGET_ANDROID)
VkImageHandle::~VkImageHandle() {
  if (!mParent) {
    return;
  }
  auto* context = mParent->GetContext();
  if (context && mParent->IsDeviceActive(mDeviceId) && mVkImageHandle) {
    wgpu_vkimage_destroy(context, mDeviceId, mVkImageHandle);
  }
  wgpu_vkimage_delete(mVkImageHandle);
}

VkSemaphoreHandle::~VkSemaphoreHandle() {
  if (!mParent) {
    return;
  }
  auto* context = mParent->GetContext();
  if (context && mParent->IsDeviceActive(mDeviceId) && mVkSemaphoreHandle) {
    wgpu_vksemaphore_destroy(context, mDeviceId, mVkSemaphoreHandle);
  }
  wgpu_vksemaphore_delete(mVkSemaphoreHandle);
}
#endif

}  // namespace mozilla::webgpu
