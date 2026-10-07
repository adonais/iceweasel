/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "VulkanDeviceHolder.h"

#include <atomic>
#include <string>
#include <unordered_map>

#include "FFmpegLibWrapper.h"
#include "FFmpegLog.h"
#include "PlatformDecoderModule.h"
#include "libavutil/hwcontext.h"
#include "mozilla/Attributes.h"
#include "mozilla/DataMutex.h"

namespace mozilla {

// Strong cache keyed by FFmpegLibWrapper then VkPhysicalDevice deviceName.
using PerLibHolders =
    std::unordered_map<std::string, RefPtr<VulkanDeviceHolder>>;
using HolderMap = std::unordered_map<const FFmpegLibWrapper*, PerLibHolders>;
MOZ_RUNINIT static StaticDataMutex<HolderMap> sDeviceHolders(
    "VulkanDeviceHolder::sDeviceHolders");

// 0 is reserved to mean "no VulkanDeviceHolder was ever created" so it can't
// collide with a real generation.
static std::atomic<uint64_t> sNextGeneration{1};

static RefPtr<VulkanDeviceHolder> LookupHolder(HolderMap& aMap,
                                               const FFmpegLibWrapper* aLib,
                                               const char* aDeviceName) {
  const auto libIt = aMap.find(aLib);
  if (libIt == aMap.end()) {
    return nullptr;
  }
  const auto nameIt = libIt->second.find(aDeviceName);
  if (nameIt == libIt->second.end()) {
    return nullptr;
  }
  return nameIt->second;
}

static bool AnyClientLocked(const HolderMap& aMap) {
  for (const auto& [lib, holders] : aMap) {
    for (const auto& [name, holder] : holders) {
      // Map owns one ref. Extra refs are live decoders.
      if (!holder->hasOneRef()) {
        return true;
      }
    }
  }
  return false;
}

static void DestroyAllIfNoClientsLocked(HolderMap& aMap) {
  if (aMap.empty() || AnyClientLocked(aMap)) {
    return;
  }
  FFMPEGP_LOG("VulkanDeviceHolder: no clients, destroying cached VkDevices");
  aMap.clear();
}

/* static */
RefPtr<VulkanDeviceHolder> VulkanDeviceHolder::GetOrCreate(
    const FFmpegLibWrapper* aLib, const char* aDeviceName,
    const char* aDeviceExtensions) {
  if (!aDeviceName || !aDeviceName[0]) {
    FFMPEGP_LOG(
        "VulkanDeviceHolder: refusing to create VkDevice with empty name");
    return nullptr;
  }

  auto map = sDeviceHolders.Lock();
  if (RefPtr<VulkanDeviceHolder> instance =
          LookupHolder(*map, aLib, aDeviceName)) {
    FFMPEGP_LOG("VulkanDeviceHolder: reusing shared VkDevice for {}",
                aDeviceName);
    return instance;
  }

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

  RefPtr<VulkanDeviceHolder> instance = new VulkanDeviceHolder(aLib, ctx);
  FFMPEGP_LOG("VulkanDeviceHolder: created shared VkDevice for {} (gen {})",
              aDeviceName, instance->Generation());
  (*map)[aLib][aDeviceName] = instance;
  return instance;
}

/* static */
void VulkanDeviceHolder::Drop(RefPtr<VulkanDeviceHolder>& aHolder) {
  if (!aHolder) {
    return;
  }
  auto map = sDeviceHolders.Lock();
  aHolder = nullptr;
  DestroyAllIfNoClientsLocked(*map);
}

AVBufferRef* VulkanDeviceHolder::Ref() const {
  return mLib->av_buffer_ref(mDeviceContext);
}

VulkanDeviceHolder::VulkanDeviceHolder(const FFmpegLibWrapper* aLib,
                                       AVBufferRef* aDeviceContext)
    : mLib(aLib),
      mDeviceContext(aDeviceContext),
      mGeneration(sNextGeneration.fetch_add(1, std::memory_order_relaxed)) {}

VulkanDeviceHolder::~VulkanDeviceHolder() {
  FFMPEGP_LOG("VulkanDeviceHolder: destroying shared VkDevice (gen {})",
              mGeneration);
  mLib->av_buffer_unref(&mDeviceContext);
}

}  // namespace mozilla
