/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef DOM_MEDIA_PLATFORMS_FFMPEG_VULKANDEVICEHOLDER_H_
#define DOM_MEDIA_PLATFORMS_FFMPEG_VULKANDEVICEHOLDER_H_

#include "mozilla/ThreadSafeWeakPtr.h"
#include "nsISupportsImpl.h"

struct AVBufferRef;

namespace mozilla {

struct FFmpegLibWrapper;

// Holds a shared AVHWDeviceContext (VkDevice) per FFmpegLibWrapper in the RDD
// process. Mirrors VADisplayHolder for VA-API.
//
// The first decoder for a given lib+device pays vkCreateDevice; subsequent
// decoders on the same lib receive av_buffer_ref() on that context. System
// FFmpeg and ffvpx each keep their own cached device (layouts/buffer ops
// differ). Destroyed when the last decoder drops its reference.
class VulkanDeviceHolder final
    : public SupportsThreadSafeWeakPtr<VulkanDeviceHolder> {
 public:
  MOZ_DECLARE_REFCOUNTED_TYPENAME(VulkanDeviceHolder)

  static RefPtr<VulkanDeviceHolder> GetOrCreate(const FFmpegLibWrapper* aLib,
                                                const char* aDeviceName,
                                                const char* aDeviceExtensions);

  // Returns a new av_buffer_ref(); caller must av_buffer_unref() it.
  AVBufferRef* Ref() const;

  // Uniquely identifies this VkInstance/VkDevice pair, unlike the raw
  // VkInstance handle: once destroyed (see above), a later GetOrCreate()
  // could in principle get a new VkInstance at the same, just-freed
  // address (unconfirmed in practice; defensive measure). Callers caching
  // anything keyed by VkInstance (e.g. function pointers) should fold
  // this generation into the key to guard against that.
  uint64_t Generation() const { return mGeneration; }

  const char* DeviceName() const { return mDeviceName; }

  ~VulkanDeviceHolder();

 private:
  VulkanDeviceHolder(const FFmpegLibWrapper* aLib, AVBufferRef* aDeviceContext,
                     const char* aDeviceName);

  const FFmpegLibWrapper* mLib;
  AVBufferRef* mDeviceContext;
  // VK_MAX_PHYSICAL_DEVICE_NAME_SIZE is defined as 256 in the Vulkan spec.
  char mDeviceName[256] = {'\0'};
  const uint64_t mGeneration;
};

}  // namespace mozilla

#endif  // DOM_MEDIA_PLATFORMS_FFMPEG_VULKANDEVICEHOLDER_H_
