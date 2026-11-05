/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef DOM_MEDIA_GTEST_MOCKGPUVIDEOSURFACEMANAGER_H_
#define DOM_MEDIA_GTEST_MOCKGPUVIDEOSURFACEMANAGER_H_

#include "GPUVideoImage.h"
#include "mozilla/layers/LayersSurfaces.h"

namespace mozilla::layers {

class MockGPUVideoSurfaceManager : public IGPUVideoSurfaceManager {
 public:
  NS_INLINE_DECL_THREADSAFE_REFCOUNTING(MockGPUVideoSurfaceManager, override)

  already_AddRefed<gfx::SourceSurface> Readback(
      const SurfaceDescriptorGPUVideo&) override {
    return nullptr;
  }
  already_AddRefed<Image> TransferToImage(const SurfaceDescriptorGPUVideo&,
                                          const gfx::IntSize&,
                                          const gfx::ColorDepth&,
                                          gfx::YUVColorSpace, gfx::ColorSpace2,
                                          gfx::TransferFunction,
                                          gfx::ColorRange) override {
    return nullptr;
  }
  void DeallocateSurfaceDescriptor(const SurfaceDescriptorGPUVideo&) override {}
  void OnSetCurrent(const SurfaceDescriptorGPUVideo&) override {}

 protected:
  virtual ~MockGPUVideoSurfaceManager() = default;
};

}  // namespace mozilla::layers

#endif  // DOM_MEDIA_GTEST_MOCKGPUVIDEOSURFACEMANAGER_H_
