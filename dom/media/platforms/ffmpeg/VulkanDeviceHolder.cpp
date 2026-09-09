/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "VulkanDeviceHolder.h"

#include <atomic>
#include <cstring>
#include <unordered_map>

#include "FFmpegLibWrapper.h"
#include "FFmpegLog.h"
#include "PlatformDecoderModule.h"
#include "libavutil/hwcontext.h"
#include "mozilla/Attributes.h"
#include "mozilla/DataMutex.h"

namespace mozilla {

// One weak holder per FFmpegLibWrapper (system vs ffvpx), so both can keep a
// shared VkDevice without overwriting each other or mixing lavu ABIs.
using HolderMap = std::unordered_map<const FFmpegLibWrapper*,
                                     ThreadSafeWeakPtr<VulkanDeviceHolder>>;
MOZ_RUNINIT static StaticDataMutex<HolderMap> sDeviceHolders(
    "VulkanDeviceHolder::sDeviceHolders");

// 0 is reserved to mean "no VulkanDeviceHolder was ever created" so it can't
// collide with a real generation.
static std::atomic<uint64_t> sNextGeneration{1};

static RefPtr<VulkanDeviceHolder> LookupHolder(HolderMap& aMap,
                                               const FFmpegLibWrapper* aLib,
                                               const char* aDeviceName) {
  const auto it = aMap.find(aLib);
  if (it == aMap.end()) {
    return nullptr;
  }
  RefPtr<VulkanDeviceHolder> instance(it->second);
  if (!instance) {
    aMap.erase(it);
    return nullptr;
  }
  if (strcmp(instance->DeviceName(), aDeviceName) != 0) {
    FFMPEGP_LOG(
        "VulkanDeviceHolder: device name mismatch ('{}' vs '{}'), creating "
        "new device",
        instance->DeviceName(), aDeviceName);
    return nullptr;
  }
  return instance;
}

/* static */
RefPtr<VulkanDeviceHolder> VulkanDeviceHolder::GetOrCreate(
    const FFmpegLibWrapper* aLib, const char* aDeviceName,
    const char* aDeviceExtensions) {
  {
    auto map = sDeviceHolders.Lock();
    if (RefPtr<VulkanDeviceHolder> instance =
            LookupHolder(*map, aLib, aDeviceName)) {
      FFMPEGP_LOG("VulkanDeviceHolder: reusing shared VkDevice for {}",
                  aDeviceName);
      return instance;
    }
  }

  // Create the VkDevice outside the lock: av_hwdevice_ctx_create can take
  // hundreds of milliseconds and must not hold sDeviceHolders while it runs.
  AVDictionary* opts = nullptr;
  if (aDeviceExtensions) {
    aLib->av_dict_set(&opts, "device_extensions", aDeviceExtensions, 0);
  }
  AVBufferRef* ctx = nullptr;
  int ret = aLib->av_hwdevice_ctx_create(&ctx, AV_HWDEVICE_TYPE_VULKAN,
                                         aDeviceName, opts, 0);
  if (opts) {
    aLib->av_dict_free(&opts);
  }
  if (ret < 0 || !ctx) {
    FFMPEGP_LOG("VulkanDeviceHolder: av_hwdevice_ctx_create failed for {}",
                aDeviceName);
    return nullptr;
  }

  RefPtr<VulkanDeviceHolder> instance =
      new VulkanDeviceHolder(aLib, ctx, aDeviceName);
  FFMPEGP_LOG("VulkanDeviceHolder: created shared VkDevice for {} (gen {})",
              aDeviceName, instance->Generation());

  auto map = sDeviceHolders.Lock();
  // A concurrent caller may have created a device while we were unlocked.
  if (RefPtr<VulkanDeviceHolder> existing =
          LookupHolder(*map, aLib, aDeviceName)) {
    FFMPEGP_LOG("VulkanDeviceHolder: discarding redundant VkDevice for {}",
                aDeviceName);
    return existing;
  }
  (*map)[aLib] = instance;
  return instance;
}

AVBufferRef* VulkanDeviceHolder::Ref() const {
  return mLib->av_buffer_ref(mDeviceContext);
}

VulkanDeviceHolder::VulkanDeviceHolder(const FFmpegLibWrapper* aLib,
                                       AVBufferRef* aDeviceContext,
                                       const char* aDeviceName)
    : mLib(aLib),
      mDeviceContext(aDeviceContext),
      mGeneration(sNextGeneration.fetch_add(1, std::memory_order_relaxed)) {
  strncpy(mDeviceName, aDeviceName, sizeof(mDeviceName) - 1);
  mDeviceName[sizeof(mDeviceName) - 1] = '\0';
}

VulkanDeviceHolder::~VulkanDeviceHolder() {
  FFMPEGP_LOG("VulkanDeviceHolder: destroying shared VkDevice (gen {})",
              mGeneration);
  mLib->av_buffer_unref(&mDeviceContext);
}

}  // namespace mozilla
