/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef MOZILLA_GFX_GpuFenceMTLSharedEvent_H
#define MOZILLA_GFX_GpuFenceMTLSharedEvent_H

#include "mozilla/layers/GpuFence.h"

namespace mozilla {

namespace layers {

class GpuFenceMTLSharedEvent : public GpuFence {
 public:
  // Adopts a reference to the supplied shared event. The caller must not
  // release it after calling this.
  static RefPtr<GpuFenceMTLSharedEvent> Create(void* aSharedEvent,
                                               const uint64_t aFenceValue);

  bool HasCompleted() override;
  bool ClientWait(TimeDuration aTimeout) override;
  bool ServerWait(gl::GLContext* aGL, TimeDuration aTimeout) override;

 protected:
  GpuFenceMTLSharedEvent(void* aSharedEvent, const uint64_t aFenceValue);
  virtual ~GpuFenceMTLSharedEvent();

  void* const mSharedEvent;
  const uint64_t mFenceValue;
};

}  // namespace layers
}  // namespace mozilla

#endif /* MOZILLA_GFX_GpuFenceMTLSharedEvent_H */
