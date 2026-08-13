/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "mozilla/glean/FOGTransportParent.h"
#include "mozilla/FOGIPC.h"
#include "mozilla/StaticBackgroundTaskQueue.h"

namespace mozilla::glean {

already_AddRefed<nsISerialEventTarget> FOGTransportParent::GetQueue() {
  static StaticBackgroundTaskQueue sQueue("FOGTransportTaskQueue");
  return sQueue.Get();
}

mozilla::ipc::IPCResult FOGTransportParent::RecvFOGData(ByteBuf&& aBuf) {
  glean::FOGData(std::move(aBuf));
  return IPC_OK();
}

}  // namespace mozilla::glean
