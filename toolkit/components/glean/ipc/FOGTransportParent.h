/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
#ifndef mozilla_glean_PFOGTransportParent_h_
#define mozilla_glean_PFOGTransportParent_h_

#include "mozilla/glean/PFOGTransportParent.h"
#include "mozilla/ipc/ProtocolUtils.h"

namespace mozilla::glean {

class FOGTransportParent : public mozilla::glean::PFOGTransportParent {
 public:
  NS_INLINE_DECL_THREADSAFE_REFCOUNTING(FOGTransportParent, override);
  mozilla::ipc::IPCResult RecvFOGData(ByteBuf&& aBuf);
  static already_AddRefed<nsISerialEventTarget> GetQueue();

 private:
  ~FOGTransportParent() = default;
};

}  // namespace mozilla::glean

#endif  // mozilla_glean_PFOGTransportParent_h
