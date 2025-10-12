/* -*- Mode: C++; tab-width: 20; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "mozilla/layers/NativeLayerRemoteMac.h"
#include "mozilla/layers/NativeLayerRootRemoteMacChild.h"
#include "mozilla/layers/SurfacePool.h"

namespace mozilla {
namespace layers {

already_AddRefed<NativeLayer> NativeLayerRootRemoteMacChild::CreateLayer(
    const gfx::IntSize& aSize, bool aIsOpaque,
    SurfacePoolHandle* aSurfacePoolHandle) {
  RefPtr<NativeLayerRemoteMac> layer = new NativeLayerRemoteMac(
      aSize, aIsOpaque, aSurfacePoolHandle->AsSurfacePoolHandleCA());
  mCommandQueue->AppendCommand(mozilla::layers::CommandCreateLayer(
      reinterpret_cast<uint64_t>(layer.get()), aSize, aIsOpaque));
  // Share our command queue.
  layer->mCommandQueue = mCommandQueue;
  return layer.forget();
}

already_AddRefed<NativeLayer>
NativeLayerRootRemoteMacChild::CreateLayerForExternalTexture(bool aIsOpaque) {
  RefPtr<NativeLayerRemoteMac> layer = new NativeLayerRemoteMac(aIsOpaque);
  mCommandQueue->AppendCommand(
      mozilla::layers::CommandCreateLayerForExternalTexture(
          reinterpret_cast<uint64_t>(layer.get()), aIsOpaque));
  // Share our command queue.
  layer->mCommandQueue = mCommandQueue;
  return layer.forget();
}

already_AddRefed<NativeLayer>
NativeLayerRootRemoteMacChild::CreateLayerForColor(gfx::DeviceColor aColor) {
  RefPtr<NativeLayerRemoteMac> layer = new NativeLayerRemoteMac(aColor);
  mCommandQueue->AppendCommand(mozilla::layers::CommandCreateLayerForColor(
      reinterpret_cast<uint64_t>(layer.get()), aColor));
  // Share our command queue.
  layer->mCommandQueue = mCommandQueue;
  return layer.forget();
}

void NativeLayerRootRemoteMacChild::AppendLayer(NativeLayer* aLayer) {}

void NativeLayerRootRemoteMacChild::RemoveLayer(NativeLayer* aLayer) {}

void NativeLayerRootRemoteMacChild::SetLayers(
    const nsTArray<RefPtr<NativeLayer>>& aLayers) {
  // We don't create a command for this, because we don't care
  // about the layers until CommitToScreen().
  nsTArray<RefPtr<NativeLayer>> layers(aLayers.Length());
  for (auto& layer : aLayers) {
    RefPtr<NativeLayerRemoteMac> layerRemoteMac =
        layer->AsNativeLayerRemoteMac();
    MOZ_ASSERT(layerRemoteMac);
    layers.AppendElement(std::move(layerRemoteMac));
  }

  if (mNativeLayers == layers) {
    // A no-op.
    return;
  }

  mNativeLayersChanged = true;
  mNativeLayers.Clear();
  mNativeLayers.AppendElements(layers);
}

void NativeLayerRootRemoteMacChild::PrepareForCommit() {
  // Intentionally ignored.
}

bool NativeLayerRootRemoteMacChild::CommitToScreen() {
  // Prepare and send all commands to the parent actor.

  // Our shared command queue has all of our CreateLayer and LayerDestroyed
  // commands. That's good, because the commands that we're adding to the
  // queue rely upon those CreateLayer commands appearing first.

  // Iterate our layers to get the LayerInfo and ChangedSurface commands
  // into our shared command queue.
  for (auto layer : mNativeLayers) {
    RefPtr<NativeLayerRemoteMac> layerRemoteMac(
        layer->AsNativeLayerRemoteMac());
    MOZ_ASSERT(layerRemoteMac);
    layerRemoteMac->FlushDirtyLayerInfoToCommandQueue();
  }

  if (mNativeLayersChanged) {
    // If mNativeLayersChanged is set, we will send a SetLayers
    // command of this array filled with the IDs of everything
    // in mNativeLayers.
    nsTArray<uint64_t> setLayerIDs;
    for (auto layer : mNativeLayers) {
      auto ID = reinterpret_cast<uint64_t>(layer.get());
      setLayerIDs.AppendElement(ID);
    }
    mCommandQueue->AppendCommand(
        mozilla::layers::CommandSetLayers(setLayerIDs));
    mNativeLayersChanged = false;
  }

  // Now flush the shared command queue to our local command array,
  // which is suitable for sending to the parent process.
  nsTArray<NativeLayerCommand> commands;
  mCommandQueue->FlushToArray(commands);

  if (!commands.IsEmpty()) {
    // Send all the queued commands, including the ones we just added.
    MOZ_ASSERT(mRemoteChild);
    mRemoteChild->SendCommitNativeLayerCommands(commands);
  }
  return true;
}

NativeLayerRootRemoteMacChild::NativeLayerRootRemoteMacChild()
    : mRemoteChild(MakeRefPtr<NativeLayerRemoteChild>()),
      mCommandQueue(MakeRefPtr<NativeLayerCommandQueue>()) {}

NativeLayerRootRemoteMacChild::~NativeLayerRootRemoteMacChild() {}

}  // namespace layers
}  // namespace mozilla
