/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "CompositeProcessFencesHolderMap.h"

#include "mozilla/layers/Fence.h"
#include "nsXULAppAPI.h"

#if defined(XP_WIN)
#  include "mozilla/layers/FenceD3D11.h"
#endif

namespace mozilla {

namespace layers {

StaticAutoPtr<CompositeProcessFencesHolderMap>
    CompositeProcessFencesHolderMap::sInstance;

/* static */
void CompositeProcessFencesHolderMap::Init() {
  MOZ_ASSERT(XRE_IsGPUProcess() || XRE_IsParentProcess());
  sInstance = new CompositeProcessFencesHolderMap();
}

/* static */
void CompositeProcessFencesHolderMap::Shutdown() {
  MOZ_ASSERT(XRE_IsGPUProcess() || XRE_IsParentProcess());
  sInstance = nullptr;
}

void CompositeProcessFencesHolderMap::Register(
    const CompositeProcessFencesHolderId aHolderId) {
  MOZ_ASSERT(aHolderId.IsValid());

  MonitorAutoLock lock(mMonitor);

  DebugOnly<bool> inserted =
      mFencesHolderById.emplace(aHolderId, MakeUnique<FencesHolder>()).second;
  MOZ_ASSERT(inserted, "Map already contained FencesHolder for id!");
}

void CompositeProcessFencesHolderMap::RegisterReference(
    const CompositeProcessFencesHolderId aHolderId) {
  if (!aHolderId.IsValid()) {
    return;
  }

  MonitorAutoLock lock(mMonitor);

  auto it = mFencesHolderById.find(aHolderId);
  if (it == mFencesHolderById.end()) {
    MOZ_ASSERT_UNREACHABLE("Map missing FencesHolder for id!");
    return;
  }

  MOZ_ASSERT(it->second->mOwners > 0);
  ++it->second->mOwners;
}

void CompositeProcessFencesHolderMap::Unregister(
    const CompositeProcessFencesHolderId aHolderId) {
  if (!aHolderId.IsValid()) {
    return;
  }

  MonitorAutoLock lock(mMonitor);

  auto it = mFencesHolderById.find(aHolderId);
  if (it == mFencesHolderById.end()) {
    MOZ_ASSERT_UNREACHABLE("Map missing FencesHolder for id!");
    return;
  }

  MOZ_ASSERT(it->second->mOwners > 0);
  if (--it->second->mOwners == 0) {
    mFencesHolderById.erase(it);
  }
}

void CompositeProcessFencesHolderMap::SetWriteFence(
    const CompositeProcessFencesHolderId aHolderId, RefPtr<Fence> aWriteFence) {
  MOZ_ASSERT(aWriteFence);

  if (!aWriteFence) {
    return;
  }

  MonitorAutoLock lock(mMonitor);

  MOZ_ASSERT(aHolderId.IsValid());
  auto it = mFencesHolderById.find(aHolderId);
  if (it == mFencesHolderById.end()) {
    MOZ_ASSERT_UNREACHABLE("unexpected to be called");
    return;
  }

#if defined(XP_WIN)
  RefPtr<Fence> fence = aWriteFence->AsFenceD3D11()->CloneFromHandle();
  if (!fence) {
    MOZ_ASSERT_UNREACHABLE("unexpected to be called");
    return;
  }
#else
  RefPtr<Fence> fence = aWriteFence;
#endif

  MOZ_ASSERT(!it->second->mWriteFence);
  MOZ_ASSERT(it->second->mReadFences.empty());

  it->second->mWriteFence = fence;
}

void CompositeProcessFencesHolderMap::SetReadFence(
    const CompositeProcessFencesHolderId aHolderId, RefPtr<Fence> aReadFence) {
  MOZ_ASSERT(aReadFence);

  if (!aReadFence) {
    return;
  }

  MonitorAutoLock lock(mMonitor);

  MOZ_ASSERT(aHolderId.IsValid());
  auto it = mFencesHolderById.find(aHolderId);
  if (it == mFencesHolderById.end()) {
    MOZ_ASSERT_UNREACHABLE("unexpected to be called");
    return;
  }

#if defined(XP_WIN)
  RefPtr<Fence> fence = aReadFence->AsFenceD3D11()->CloneFromHandle();
  if (!fence) {
    MOZ_ASSERT_UNREACHABLE("unexpected to be called");
    return;
  }
#else
  RefPtr<Fence> fence = aReadFence;
#endif

  it->second->mReadFences.push_back(fence);
}

RefPtr<Fence> CompositeProcessFencesHolderMap::GetWriteFence(
    const CompositeProcessFencesHolderId aHolderId) {
  MonitorAutoLock lock(mMonitor);
  RefPtr<Fence> writeFence;
  MOZ_ASSERT(aHolderId.IsValid());

  auto it = mFencesHolderById.find(aHolderId);
  MOZ_ASSERT(it != mFencesHolderById.end());
  if (it != mFencesHolderById.end()) {
    writeFence = it->second->mWriteFence;
  }
  return writeFence;
}

std::vector<RefPtr<Fence>>
CompositeProcessFencesHolderMap::TakeAllFencesAndForget(
    const CompositeProcessFencesHolderId aHolderId) {
  std::vector<RefPtr<Fence>> fences;

  MonitorAutoLock lock(mMonitor);

  auto it = mFencesHolderById.find(aHolderId);
  MOZ_ASSERT(it != mFencesHolderById.end());
  if (it == mFencesHolderById.end()) {
    MOZ_ASSERT_UNREACHABLE("unexpected to be called");
    return fences;
  }

  auto& holder = it->second;

  if (holder->mWriteFence) {
    fences.emplace_back(std::move(holder->mWriteFence));
  }

  MOZ_ASSERT(!holder->mWriteFence);

  fences.reserve(fences.size() + holder->mReadFences.size());

  for (auto& fence : holder->mReadFences) {
    fences.emplace_back(std::move(fence));
  }

  holder->mReadFences.clear();

  return fences;
}

}  // namespace layers
}  // namespace mozilla
