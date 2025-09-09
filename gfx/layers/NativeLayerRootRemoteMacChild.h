/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_layers_NativeLayerRootRemoteMacChild_h
#define mozilla_layers_NativeLayerRootRemoteMacChild_h

#include "mozilla/layers/NativeLayer.h"
#include "mozilla/layers/NativeLayerCommandQueue.h"
#include "mozilla/layers/NativeLayerRemoteChild.h"

namespace mozilla {
namespace layers {

// NativeLayerRootRemoteMacChild is a macOS-specific implementation of
// NativeLayerRoot that runs on the GPU process, and sends updates
// to the parent process.
class NativeLayerRootRemoteMacChild final : public NativeLayerRoot {
 public:
  NativeLayerRootRemoteMacChild();

  already_AddRefed<NativeLayer> CreateLayer(
      const gfx::IntSize& aSize, bool aIsOpaque,
      SurfacePoolHandle* aSurfacePoolHandle) override;
  already_AddRefed<NativeLayer> CreateLayerForExternalTexture(
      bool aIsOpaque) override;
  already_AddRefed<NativeLayer> CreateLayerForColor(
      gfx::DeviceColor aColor) override;

  void AppendLayer(NativeLayer* aLayer) override;
  void RemoveLayer(NativeLayer* aLayer) override;
  void SetLayers(const nsTArray<RefPtr<NativeLayer>>& aLayers) override;

  // Called before any layer content changes.
  void PrepareForCommit() override;

  // Publish the layer changes to the screen. Returns whether the commit was
  // successful.
  bool CommitToScreen() override;

  RefPtr<NativeLayerRemoteChild> GetRemoteChild() { return mRemoteChild; }

 protected:
  virtual ~NativeLayerRootRemoteMacChild();

  RefPtr<NativeLayerRemoteChild> mRemoteChild;
  RefPtr<NativeLayerCommandQueue> mCommandQueue;
  nsTArray<RefPtr<NativeLayer>> mNativeLayers;

  bool mNativeLayersChanged = false;
};

}  // namespace layers
}  // namespace mozilla

#endif  // mozilla_layers_NativeLayerRootRemoteMacChild_h
