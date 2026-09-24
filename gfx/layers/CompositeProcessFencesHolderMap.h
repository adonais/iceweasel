/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef MOZILLA_GFX_CompositeProcessFencesHolderMap_H
#define MOZILLA_GFX_CompositeProcessFencesHolderMap_H

#include <vector>

#include "mozilla/Monitor.h"
#include "mozilla/StaticPtr.h"
#include "mozilla/gfx/FileHandleWrapper.h"
#include "mozilla/layers/LayersTypes.h"

namespace mozilla {
namespace layers {

class Fence;

/**
 * A class to manage Fence that is shared in Composite process.
 */
class CompositeProcessFencesHolderMap {
 public:
  static void Init();
  static void Shutdown();
  static CompositeProcessFencesHolderMap* Get() { return sInstance; }

  CompositeProcessFencesHolderMap() = default;
  ~CompositeProcessFencesHolderMap() = default;

  void Register(const CompositeProcessFencesHolderId aHolderId);
  void RegisterReference(const CompositeProcessFencesHolderId aHolderId);
  void Unregister(const CompositeProcessFencesHolderId aHolderId);

  void SetWriteFence(const CompositeProcessFencesHolderId aHolderId,
                     RefPtr<Fence> aWriteFence);
  void SetReadFence(const CompositeProcessFencesHolderId aHolderId,
                    RefPtr<Fence> aReadFence);

  RefPtr<Fence> GetWriteFence(const CompositeProcessFencesHolderId aHolderId);

  std::vector<RefPtr<Fence>> TakeAllFencesAndForget(
      const CompositeProcessFencesHolderId aHolderId);

 private:
  struct FencesHolder {
    FencesHolder() = default;

    RefPtr<Fence> mWriteFence;
    std::vector<RefPtr<Fence>> mReadFences;
    uint32_t mOwners = 1;
  };

  mutable Monitor mMonitor{"CompositeProcessFencesHolderMap::mMonitor"};

  std::unordered_map<CompositeProcessFencesHolderId, UniquePtr<FencesHolder>,
                     CompositeProcessFencesHolderId::HashFn>
      mFencesHolderById MOZ_GUARDED_BY(mMonitor);

  static StaticAutoPtr<CompositeProcessFencesHolderMap> sInstance;
};

}  // namespace layers
}  // namespace mozilla

#endif /* MOZILLA_GFX_CompositeProcessFencesHolderMap_H */
