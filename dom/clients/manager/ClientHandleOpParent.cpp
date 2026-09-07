/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "ClientHandleOpParent.h"

#include "ClientHandleParent.h"
#include "ClientSourceParent.h"
#include "mozilla/dom/ipc/StructuredCloneData.h"
#include "mozilla/dom/PClientManagerParent.h"
#include "mozilla/ipc/BackgroundParent.h"

namespace mozilla::dom {

using mozilla::ipc::BackgroundParent;
using mozilla::ipc::IPCResult;

ClientSourceParent* ClientHandleOpParent::GetSource() const {
  auto handle = static_cast<ClientHandleParent*>(Manager());
  return handle->GetSource();
}

void ClientHandleOpParent::ActorDestroy(ActorDestroyReason aReason) {
  mPromiseRequestHolder.DisconnectIfExists();
  mSourcePromiseRequestHolder.DisconnectIfExists();
}

IPCResult ClientHandleOpParent::Init(ClientOpConstructorArgs&& aArgs) {
  auto handle = static_cast<ClientHandleParent*>(Manager());

  auto* backgroundActor = handle->Manager()->Manager();

  // ClientControlledArgs and ClientEvictBFCacheArgs are only ever issued by the
  // parent-process ServiceWorkerManager (via ClientHandle::Control and
  // ClientHandle::EvictFromBFCache). A content process must never send them:
  // forging a ClientControlledArgs installs attacker-chosen controller state on
  // a client living in another process, which ClientManagerService::Navigate
  // then trusts as its sole authorization.
  if ((aArgs.type() == ClientOpConstructorArgs::TClientControlledArgs ||
       aArgs.type() == ClientOpConstructorArgs::TClientEvictBFCacheArgs) &&
      BackgroundParent::IsOtherProcessActor(backgroundActor)) {
    return IPC_FAIL(this, "Parent-only ClientOp received from content!");
  }

  handle->EnsureSource()
      ->Then(
          GetCurrentSerialEventTarget(), __func__,
          [this, handle, args = std::move(aArgs)](bool) mutable {
            mSourcePromiseRequestHolder.Complete();

            auto source = handle->GetSource();
            if (!source) {
              CopyableErrorResult rv;
              rv.ThrowAbortError("Client has been destroyed");
              Unused << PClientHandleOpParent::Send__delete__(this, rv);
              return;
            }
            RefPtr<ClientOpPromise> p;

            // ClientPostMessageArgs can contain PBlob actors.  This means we
            // can't just forward the args from one PBackground manager to
            // another.  Instead, unpack the structured clone data and repack
            // it into a new set of arguments.
            if (args.type() ==
                ClientOpConstructorArgs::TClientPostMessageArgs) {
              const ClientPostMessageArgs& orig =
                  args.get_ClientPostMessageArgs();

              ClientPostMessageArgs rebuild;
              rebuild.serviceWorker() = orig.serviceWorker();

              ipc::StructuredCloneData data;
              data.BorrowFromClonedMessageData(orig.clonedData());
              if (!data.BuildClonedMessageData(rebuild.clonedData())) {
                CopyableErrorResult rv;
                rv.ThrowAbortError("Aborting client operation");
                Unused << PClientHandleOpParent::Send__delete__(this, rv);
                return;
              }

              p = source->StartOp(std::move(rebuild));
            }

            // Other argument types can just be forwarded straight through.
            else {
              p = source->StartOp(std::move(args));
            }

            // Capturing 'this' is safe here because we disconnect the promise
            // in ActorDestroy() which ensures neither lambda is called if the
            // actor is destroyed before the source operation completes.
            p->Then(
                 GetCurrentSerialEventTarget(), __func__,
                 [this](const ClientOpResult& aResult) {
                   mPromiseRequestHolder.Complete();
                   Unused << PClientHandleOpParent::Send__delete__(this,
                                                                   aResult);
                 },
                 [this](const CopyableErrorResult& aRv) {
                   mPromiseRequestHolder.Complete();
                   Unused << PClientHandleOpParent::Send__delete__(this, aRv);
                 })
                ->Track(mPromiseRequestHolder);
          },
          [=](const CopyableErrorResult& failure) {
            mSourcePromiseRequestHolder.Complete();
            Unused << PClientHandleOpParent::Send__delete__(this, failure);
            return;
          })
      ->Track(mSourcePromiseRequestHolder);

  return IPC_OK();
}

}  // namespace mozilla::dom
