/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "ClientManagerOpParent.h"

#include "ClientManagerService.h"
#include "ClientValidation.h"
#include "mozilla/dom/ContentParent.h"
#include "mozilla/dom/PClientManagerParent.h"
#include "mozilla/dom/RemoteType.h"
#include "mozilla/ipc/BackgroundParent.h"

namespace mozilla::dom {

using mozilla::ipc::BackgroundParent;
using mozilla::ipc::IPCResult;

template <typename Method, typename... Args>
void ClientManagerOpParent::DoServiceOp(
    Method aMethod, ThreadsafeContentParentHandle* aContentParentHandle,
    Args&&... aArgs) {
  // Note, we need perfect forarding of the template type in order
  // to allow already_AddRefed<> to be passed as an arg.
  RefPtr<ClientOpPromise> p =
      (mService->*aMethod)(aContentParentHandle, std::forward<Args>(aArgs)...);

  // Capturing `this` is safe here because we disconnect the promise in
  // ActorDestroy() which ensures neither lambda is called if the actor
  // is destroyed before the source operation completes.
  p->Then(
       GetCurrentSerialEventTarget(), __func__,
       [this](const mozilla::dom::ClientOpResult& aResult) {
         mPromiseRequestHolder.Complete();
         (void)PClientManagerOpParent::Send__delete__(this, aResult);
       },
       [this](const CopyableErrorResult& aRv) {
         mPromiseRequestHolder.Complete();
         (void)PClientManagerOpParent::Send__delete__(this, aRv);
       })
      ->Track(mPromiseRequestHolder);
}

void ClientManagerOpParent::ActorDestroy(ActorDestroyReason aReason) {
  mPromiseRequestHolder.DisconnectIfExists();
}

ClientManagerOpParent::ClientManagerOpParent(ClientManagerService* aService)
    : mService(aService) {
  MOZ_DIAGNOSTIC_ASSERT(mService);
}

IPCResult ClientManagerOpParent::Init(
    const ClientOpConstructorArgs& aArgs,
    ThreadsafeContentParentHandle* aContentParentHandle) {
  if (!IsValidClientOpConstructorArgs(
          aArgs, aContentParentHandle ? aContentParentHandle->GetRemoteType()
                                      : NOT_REMOTE_TYPE)) {
    return IPC_FAIL(this, "Invalid ClientOpConstructorArgs!");
  }

  switch (aArgs.type()) {
    case ClientOpConstructorArgs::TClientNavigateArgs: {
      DoServiceOp(&ClientManagerService::Navigate, aContentParentHandle,
                  aArgs.get_ClientNavigateArgs());
      break;
    }
    case ClientOpConstructorArgs::TClientMatchAllArgs: {
      DoServiceOp(&ClientManagerService::MatchAll, aContentParentHandle,
                  aArgs.get_ClientMatchAllArgs());
      break;
    }
    case ClientOpConstructorArgs::TClientClaimArgs: {
      DoServiceOp(&ClientManagerService::Claim, aContentParentHandle,
                  aArgs.get_ClientClaimArgs());
      break;
    }
    case ClientOpConstructorArgs::TClientGetInfoAndStateArgs: {
      DoServiceOp(&ClientManagerService::GetInfoAndState, aContentParentHandle,
                  aArgs.get_ClientGetInfoAndStateArgs());
      break;
    }
    case ClientOpConstructorArgs::TClientOpenWindowArgs: {
      DoServiceOp(&ClientManagerService::OpenWindow, aContentParentHandle,
                  aArgs.get_ClientOpenWindowArgs());
      break;
    }
    default: {
      MOZ_ASSERT_UNREACHABLE("Unknown Client operation!");
      break;
    }
  }

  return IPC_OK();
}

}  // namespace mozilla::dom
