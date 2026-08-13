/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "mozilla/glean/FOGTransportChild.h"
#include "mozilla/glean/PFOGTransportChild.h"
#include "mozilla/ipc/Endpoint.h"
#include "MainThreadUtils.h"
#include "mozilla/FOGIPC.h"

namespace mozilla::glean {

StaticRefPtr<FOGTransportChild> FOGTransportChild::sSingleton;

/* static */ FOGTransportChild* FOGTransportChild::GetSingleton() {
  MOZ_ASSERT(XRE_IsContentProcess());
  return sSingleton;
}

/* static */ void FOGTransportChild::Create(
    mozilla::ipc::Endpoint<PFOGTransportChild> childEndpoint) {
  AssertIsOnMainThread();
  MOZ_ASSERT(XRE_IsContentProcess());

  sSingleton = new FOGTransportChild();
  childEndpoint.Bind(sSingleton);
}

mozilla::ipc::IPCResult FOGTransportChild::RecvFlushFOGData(
    FlushFOGDataResolver&& aResolver) {
  glean::FlushFOGData(std::move(aResolver));
  return IPC_OK();
}

}  // namespace mozilla::glean
