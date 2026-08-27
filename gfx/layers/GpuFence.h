/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef MOZILLA_GFX_GpuFence_H
#define MOZILLA_GFX_GpuFence_H

#include "mozilla/TimeStamp.h"
#include "nsISupportsImpl.h"

namespace mozilla {
namespace gl {
class GLContext;
}

namespace layers {

class GpuFence {
 public:
  NS_INLINE_DECL_THREADSAFE_REFCOUNTING(GpuFence);

  virtual bool HasCompleted() = 0;
  virtual bool ClientWait(TimeDuration aTimeout) = 0;
  // Inserts a server-side wait in the specified context, falling back to a
  // client wait with the specified timeout if not supported or on failure.
  virtual bool ServerWait(gl::GLContext* aGL, TimeDuration aTimeout) = 0;

 protected:
  GpuFence() = default;
  virtual ~GpuFence() = default;
};

}  // namespace layers
}  // namespace mozilla

#endif /* MOZILLA_GFX_GpuFence_H */
