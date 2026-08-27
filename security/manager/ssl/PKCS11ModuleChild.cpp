/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#if !defined(NIGHTLY_BUILD) || defined(MOZ_NO_SMART_CARDS)
#  error This file should only be used under NIGHTLY_BUILD and when MOZ_NO_SMART_CARDS is not defined.
#endif  // !NIGHTLY_BUILD || MOZ_NO_SMART_CARDS

#include "mozilla/psm/PKCS11ModuleChild.h"

#include "NSSCertDBTrustDomain.h"
#include "PKCS11ModuleDB.h"
#include "PKCS11Token.h"
#include "ScopedNSSTypes.h"
#include "mozilla/ipc/Endpoint.h"
#include "nsDebugImpl.h"

namespace mozilla::psm {

char* RemotePKCS11PasswordPrompt(PK11SlotInfo* slot, PRBool _retry, void* ctx) {
  MOZ_ASSERT(ctx);
  if (!ctx) {
    return nullptr;
  }
  PKCS11ModuleChild* pkcs11ModuleChild(static_cast<PKCS11ModuleChild*>(ctx));
  if (PK11_ProtectedAuthenticationPath(slot)) {
    return pkcs11ModuleChild->InitiateProtectedAuth(slot);
  }
  return pkcs11ModuleChild->PromptForPassword(slot);
}

nsresult ConfigureNSSInPKCS11UtilityProcess(const nsACString& profilePath) {
  if (InitializeNSS(profilePath, NSSDBConfig::ReadWrite,
                    PKCS11DBConfig::LoadModules) != SECSuccess) {
    return NS_ERROR_FAILURE;
  }

  PK11_SetPasswordFunc(RemotePKCS11PasswordPrompt);

  return NS_OK;
}

nsresult PKCS11ModuleChild::Start(Endpoint<PPKCS11ModuleChild>&& aEndpoint,
                                  nsCString&& aProfilePath) {
  MOZ_ASSERT(NS_IsMainThread());
  MOZ_ASSERT(!mTaskQueue);
  MOZ_ASSERT(!mAuthTaskQueue);

  nsDebugImpl::SetMultiprocessMode("PKCS11ModuleChild");

  nsresult rv = NS_CreateBackgroundTaskQueue("PKCS11ModuleChild::IPC",
                                             getter_AddRefs(mTaskQueue));
  if (NS_FAILED(rv)) {
    return rv;
  }

  rv = NS_CreateBackgroundTaskQueue("PKCS11ModuleChild::Auth",
                                    getter_AddRefs(mAuthTaskQueue));
  if (NS_FAILED(rv)) {
    return rv;
  }

  rv = mTaskQueue->Dispatch(NS_NewRunnableFunction(
      "PKCS11ModuleChild::StartBind",
      [self = RefPtr{this}, endpoint = std::move(aEndpoint),
       profilePath = std::move(aProfilePath)]() mutable {
        if (profilePath.IsEmpty()) {
          NS_WARNING(
              "no profile path for utility process: loading PKCS#11 modules "
              "will fail");
        } else {
          if (NS_FAILED(ConfigureNSSInPKCS11UtilityProcess(profilePath))) {
            NS_WARNING(
                "could not load NSS in utility process: loading PKCS#11 "
                "modules will fail");
          }
        }
        MOZ_ALWAYS_TRUE(endpoint.Bind(self));
      }));
  return rv;
}

ipc::IPCResult PKCS11ModuleChild::RecvAddModule(nsCString&& aModuleName,
                                                nsCString&& aLibraryPath,
                                                uint32_t aMechanismFlags,
                                                uint32_t aCipherFlags,
                                                AddModuleResolver&& aResolver) {
  aResolver(PKCS11ModuleDB::DoAddModule(aModuleName, aLibraryPath,
                                        aMechanismFlags, aCipherFlags));
  return IPC_OK();
}

ipc::IPCResult PKCS11ModuleChild::RecvDeleteModule(
    nsCString&& aModuleName, DeleteModuleResolver&& aResolver) {
  aResolver(PKCS11ModuleDB::DoDeleteModule(aModuleName));
  return IPC_OK();
}

ipc::IPCResult PKCS11ModuleChild::RecvListModules(
    ListModulesResolver&& aResolver) {
  nsTArray<ModuleInfo> modules;
  nsresult rv = PKCS11ModuleDB::DoListModules(modules);
  using Type = std::tuple<const nsresult&, nsTArray<ModuleInfo>&&>;
  aResolver(Type(rv, std::move(modules)));
  return IPC_OK();
}

template <typename Operation>
nsresult DoWithToken(SECMODModuleID aModuleID, CK_SLOT_ID aSlotID,
                     TokenInfo& aTokenInfo, Operation&& operation) {
  UniquePK11SlotInfo slot(SECMOD_LookupSlot(aModuleID, aSlotID));
  if (!slot) {
    return NS_ERROR_FAILURE;
  }
  nsresult rv = operation(slot.get());
  if (NS_FAILED(rv)) {
    return rv;
  }
  RefPtr<PKCS11Token> token(MakeAndAddRef<PKCS11Token>(slot.get()));
  return token->GetTokenInfo(aTokenInfo);
}

ipc::IPCResult PKCS11ModuleChild::RecvResetToken(
    SECMODModuleID aModuleID, CK_SLOT_ID aSlotID,
    ResetTokenResolver&& aResolver) {
  TokenInfo tokenInfo;
  nsresult rv =
      DoWithToken(aModuleID, aSlotID, tokenInfo, [](PK11SlotInfo* slot) {
        SECStatus rv = PK11_ResetToken(slot, nullptr);
        if (rv != SECSuccess) {
          return MapSECStatus(rv);
        }
        return NS_OK;
      });
  using Type = std::tuple<const nsresult&, TokenInfo&&>;
  aResolver(Type(rv, std::move(tokenInfo)));
  return IPC_OK();
}

ipc::IPCResult PKCS11ModuleChild::RecvLoginToken(
    SECMODModuleID aModuleID, CK_SLOT_ID aSlotID,
    LoginTokenResolver&& aResolver) {
  mAuthTaskQueue->Dispatch(NS_NewRunnableFunction(
      __func__, [self = RefPtr{this}, moduleID(aModuleID), slotID(aSlotID),
                 resolver(std::move(aResolver))] {
        TokenInfo tokenInfo;
        nsresult rv = DoWithToken(
            moduleID, slotID, tokenInfo, [self](PK11SlotInfo* slot) {
              SECStatus rv = PK11_Authenticate(slot, true, self.get());
              if (rv != SECSuccess) {
                return MapSECStatus(rv);
              }
              return NS_OK;
            });
        self->mTaskQueue->Dispatch(NS_NewRunnableFunction(
            __func__, [rv, tokenInfo(std::move(tokenInfo)),
                       resolver(std::move(resolver))] {
              resolver(std::make_pair(rv, std::move(tokenInfo)));
            }));
      }));
  return IPC_OK();
}

ipc::IPCResult PKCS11ModuleChild::RecvLogoutToken(
    SECMODModuleID aModuleID, CK_SLOT_ID aSlotID,
    LogoutTokenResolver&& aResolver) {
  TokenInfo tokenInfo;
  nsresult rv =
      DoWithToken(aModuleID, aSlotID, tokenInfo, [](PK11SlotInfo* slot) {
        // PK11_Logout() can fail if the user wasn't logged in beforehand. We
        // want this method to succeed even in this case, so we ignore the
        // return value.
        (void)PK11_Logout(slot);
        return NS_OK;
      });
  using Type = std::tuple<const nsresult&, TokenInfo&&>;
  aResolver(Type(rv, std::move(tokenInfo)));
  return IPC_OK();
}

nsresult DoChangeTokenPassword(SECMODModuleID aModuleID, CK_SLOT_ID aSlotID,
                               const nsCString& aOldPassword,
                               const nsCString& aNewPassword,
                               TokenInfo& aTokenInfo) {
  UniquePK11SlotInfo slot(SECMOD_LookupSlot(aModuleID, aSlotID));
  if (!slot) {
    return NS_ERROR_FAILURE;
  }
  nsresult rv = DoChangePassword(slot, aOldPassword, aNewPassword);
  if (NS_FAILED(rv)) {
    return rv;
  }
  RefPtr<PKCS11Token> token(MakeAndAddRef<PKCS11Token>(slot.get()));
  return token->GetTokenInfo(aTokenInfo);
}

ipc::IPCResult PKCS11ModuleChild::RecvChangeTokenPassword(
    SECMODModuleID aModuleID, CK_SLOT_ID aSlotID, const nsCString& aOldPassword,
    const nsCString& aNewPassword, ChangeTokenPasswordResolver&& aResolver) {
  TokenInfo tokenInfo;
  nsresult rv = DoChangeTokenPassword(aModuleID, aSlotID, aOldPassword,
                                      aNewPassword, tokenInfo);
  using Type = std::tuple<const nsresult&, TokenInfo&&>;
  aResolver(Type(rv, std::move(tokenInfo)));
  return IPC_OK();
}

char* PKCS11ModuleChild::PromptForPassword(PK11SlotInfo* slot) {
  MonitorAutoLock authPromptMonitorLock(mAuthPromptMonitor);
  mMaybePasswordForPrompt.reset();
  mMaybeProtectedAuthPrompt.reset();

  MOZ_ASSERT(mAuthTaskQueue->IsOnCurrentThread());
  if (!mAuthTaskQueue->IsOnCurrentThread()) {
    return nullptr;
  }

  nsCString tokenName(PK11_GetTokenName(slot));
  mTaskQueue->Dispatch(NS_NewRunnableFunction(
      __func__, [self = RefPtr{this}, tokenName(std::move(tokenName))] {
        self->SendPromptPassword(tokenName)->Then(
            GetCurrentSerialEventTarget(), __func__,
            [self](const PPKCS11ModuleChild::PromptPasswordPromise::
                       ResolveOrRejectValue& value) {
              MonitorAutoLock authPromptMonitorLock(self->mAuthPromptMonitor);
              if (value.IsResolve()) {
                self->mMaybePasswordForPrompt.emplace(
                    std::move(value.ResolveValue()));
              } else {
                self->mMaybePasswordForPrompt.emplace(
                    std::make_tuple(NS_ERROR_FAILURE, ""_ns));
              }
              authPromptMonitorLock.Notify();
            });
      }));

  while (mMaybePasswordForPrompt.isNothing()) {
    authPromptMonitorLock.Wait();
  }
  auto passwordPromptResult(mMaybePasswordForPrompt.take());
  MOZ_ASSERT(passwordPromptResult.isSome());
  if (passwordPromptResult.isNothing()) {
    return nullptr;
  }
  if (NS_FAILED(std::get<0>(*passwordPromptResult))) {
    return nullptr;
  }
  return ToNewCString(std::get<1>(*passwordPromptResult));
}

char* PKCS11ModuleChild::InitiateProtectedAuth(PK11SlotInfo* slot) {
  static uint64_t id = 0;

  MonitorAutoLock authPromptMonitorLock(mAuthPromptMonitor);
  mMaybePasswordForPrompt.reset();
  id++;
  mMaybeProtectedAuthPrompt.emplace(
      std::make_pair(ProtectedAuthState::InProgress, id));

  MOZ_ASSERT(mAuthTaskQueue->IsOnCurrentThread());
  if (!mAuthTaskQueue->IsOnCurrentThread()) {
    return nullptr;
  }

  // Dispatch a background task to call C_Login. The call will block until the
  // protected authentication (e.g. card reader PIN entry) succeeds or fails.
  nsresult rv = NS_DispatchBackgroundTask(
      NS_NewRunnableFunction(
          __func__,
          [self = RefPtr{this},
           slot = UniquePK11SlotInfo(PK11_ReferenceSlot(slot)), id = id]() {
            SECStatus rv = PK11_CheckUserPassword(slot.get(), nullptr);
            ProtectedAuthState newState = ProtectedAuthState::Cancelled;
            switch (rv) {
              case SECSuccess:
                newState = ProtectedAuthState::Succeeded;
                break;
              case SECWouldBlock:
                newState = ProtectedAuthState::DoRetry;
                break;
              default:
                break;
            }
            // Notify the thread waiting on this authentication that it has
            // completed.
            MonitorAutoLock authPromptMonitorLock(self->mAuthPromptMonitor);
            if (self->mMaybeProtectedAuthPrompt.isSome() &&
                std::get<1>(*self->mMaybeProtectedAuthPrompt) == id) {
              self->mMaybeProtectedAuthPrompt =
                  Some(std::make_pair(newState, id));
              authPromptMonitorLock.Notify();
            }
          }),
      NS_DISPATCH_EVENT_MAY_BLOCK);
  if (NS_FAILED(rv)) {
    return nullptr;
  }

  // Meanwhile, tell the parent process to show an indication that a protected
  // auth attempt is in progress.
  nsCString tokenName(PK11_GetTokenName(slot));
  mTaskQueue->Dispatch(NS_NewRunnableFunction(
      __func__,
      [self = RefPtr{this}, tokenName(std::move(tokenName)), id = id] {
        self->SendShowProtectedAuthPrompt(tokenName, id);
      }));

  // Wait for either the background call to C_Login to complete or the parent
  // to tell this thread to stop waiting (indicating a cancel). In the latter
  // case, the background call to C_Login will continue to block until
  // presumably the token times out the operation.
  while (mMaybeProtectedAuthPrompt.isSome() &&
         std::get<0>(*mMaybeProtectedAuthPrompt) ==
             ProtectedAuthState::InProgress) {
    authPromptMonitorLock.Wait();
  }

  // Tell the parent process to discard any remaining protected auth indicators
  // now that this attempt has finished.
  mTaskQueue->Dispatch(
      NS_NewRunnableFunction(__func__, [self = RefPtr{this}, id = id] {
        self->SendDismissProtectedAuthPrompt(id);
      }));

  auto protectedAuthPrompt(mMaybeProtectedAuthPrompt.take());
  MOZ_ASSERT(protectedAuthPrompt.isSome() &&
             std::get<1>(*protectedAuthPrompt) == id);
  if (protectedAuthPrompt.isNothing() ||
      std::get<1>(*protectedAuthPrompt) != id) {
    return nullptr;
  }
  switch (std::get<0>(*protectedAuthPrompt)) {
    case ProtectedAuthState::Succeeded:
      return strdup(PK11_PW_AUTHENTICATED);
    case ProtectedAuthState::DoRetry:
      return strdup(PK11_PW_RETRY);
    default:
      return nullptr;
  }
}

ipc::IPCResult PKCS11ModuleChild::RecvCancelProtectedAuth(uint64_t id) {
  MonitorAutoLock authPromptMonitorLock(mAuthPromptMonitor);
  // If the current in-progress protected auth prompt matches the ID, indicate
  // that it should be cancelled.
  if (mMaybeProtectedAuthPrompt.isSome() &&
      std::get<1>(*mMaybeProtectedAuthPrompt) == id) {
    mMaybeProtectedAuthPrompt =
        Some(std::make_pair(ProtectedAuthState::Cancelled, id));
    authPromptMonitorLock.Notify();
  }
  return IPC_OK();
}

}  // namespace mozilla::psm
