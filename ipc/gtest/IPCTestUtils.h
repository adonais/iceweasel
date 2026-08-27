/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_ipc_gtest_IPCTestUtils_h
#define mozilla_ipc_gtest_IPCTestUtils_h

#include "mozilla/ipc/ProtocolUtils.h"

#include "chrome/common/ipc_message.h"
#include "chrome/common/ipc_message_utils.h"

#include <stdio.h>

namespace mozilla::ipc {

class MockActor : public IProtocol {
 public:
  // LastMsgIndex is within the defined range of the enum (so UBSan won't
  // complain) but outside the range accepted by the ParamTraits instance
  // (just in case this is accidentally treated like a real actor somehow).
  MockActor() : IProtocol(LastMsgIndex, UnknownSide) {}
  ~MockActor() = default;

#define STUB_OUT(Decl) \
  Decl override { MOZ_CRASH("stub"); }
  STUB_OUT(void DeallocManagee(ProtocolId, IProtocol*))
  STUB_OUT(Result OnMessageReceived(const Message&))
  STUB_OUT(Result OnMessageReceived(const Message&, UniquePtr<Message>&))
  STUB_OUT(Span<const ProtocolId> ManagedProtocolIds() const)
  STUB_OUT(UntypedManagedContainer* GetManagedActors(ProtocolId))
  STUB_OUT(void ActorAlloc())
  STUB_OUT(void ActorDealloc())
#undef STUB_OUT

  void HandleFatalError(const char* aMsg) override {
    fprintf(stderr, "Continuing past IPC Error: %s\n", aMsg);
  }
};

template <typename T>
static bool SerializeAndDeserialize(T&& aIn, T* aOut) {
  IPC::Message msg(MSG_ROUTING_NONE, 0);
  {
    IPC::MessageWriter writer(msg);
    IPC::WriteParam(&writer, std::move(aIn));
  }
  MockActor actor;
  IPC::MessageReader reader(msg, &actor);
  return IPC::ReadParam(&reader, aOut);
}

}  // namespace mozilla::ipc

#endif  // mozilla_ipc_gtest_IPCTestUtils_h
