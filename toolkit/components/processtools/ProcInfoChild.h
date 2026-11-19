/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_ProcInfoChild_h
#define mozilla_ProcInfoChild_h

#include "mozilla/PProcInfoChild.h"

namespace mozilla {

// Child process side of PProcInfo. Lives on a background task queue so that
// it can respond even if the main thread is busy.
class ProcInfoChild final : public PProcInfoChild {
 public:
  NS_INLINE_DECL_THREADSAFE_REFCOUNTING(ProcInfoChild, override)

  // Must be called on the main thread. Binds a new actor to aEndpoint on a
  // background task queue. The created actor will be kept alive by IPC.
  static void Create(ipc::Endpoint<PProcInfoChild>&& aEndpoint);

  ipc::IPCResult RecvGetProcInfo(GetProcInfoResolver&& aResolver);

 private:
  ProcInfoChild() = default;
  ~ProcInfoChild() = default;
};

}  // namespace mozilla

#endif
