/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
#ifndef mozilla_glean_PFOGTransportChild_h_
#define mozilla_glean_PFOGTransportChild_h_

#include "mozilla/glean/PFOGTransportChild.h"
#include "mozilla/ipc/ProtocolUtils.h"
#include "mozilla/StaticPtr.h"

namespace mozilla::glean {

class FOGTransportChild final : public mozilla::glean::PFOGTransportChild {
 public:
  NS_INLINE_DECL_REFCOUNTING(FOGTransportChild, override)

  /**
   * Get the singleton FOGTransportChild instance for the current process.
   * Returns null if the FOG transport actor either hasn't been created yet, or
   * is disabled.
   */
  static FOGTransportChild* GetSingleton();

  /**
   * Create the FOGTransportActor for the current process, binding it
   * to the parent process over the given endpoint.
   */
  static void Create(Endpoint<PFOGTransportChild> aEndpoint);

  void ActorDestroy(ActorDestroyReason aReason) final {
    // There's only one singleton, so remove our reference to it.
    sSingleton = nullptr;
  }

  mozilla::ipc::IPCResult RecvFlushFOGData(FlushFOGDataResolver&& aResolver);

 private:
  friend PFOGTransportChild;
  FOGTransportChild() { MOZ_ASSERT(XRE_IsContentProcess()); }
  ~FOGTransportChild() = default;
  static StaticRefPtr<FOGTransportChild> sSingleton;
};

}  // namespace mozilla::glean

#endif  // mozilla_glean_PFOGTransportChild_h_
