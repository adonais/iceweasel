/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "mozilla/security/lockstore/ProfileKek.h"

#include "LockstoreService.h"
#include "mozilla/Components.h"
#include "mozilla/Preferences.h"
#include "mozilla/RefPtr.h"
#include "mozilla/StaticPrefs_security.h"
#include "nsCOMPtr.h"
#include "nsComponentManagerUtils.h"
#include "nsEmbedCID.h"
#include "nsIPKCS11Token.h"
#include "nsIPromptService.h"
#include "nsISecretDecoderRing.h"
#include "nsIStringBundle.h"
#include "nsServiceManagerUtils.h"
#include "nsString.h"
#include "nsTArray.h"
#include "nsThreadUtils.h"

#ifdef XP_MACOSX
#  include "MacApplicationDelegate.h"
#endif

namespace mozilla::security::lockstore {

Maybe<PrimaryPasswordSync> ChoosePrimaryPasswordSync(
    bool aKekExists, bool aKekUnlocked, FunctionRef<bool()> aTokenHasPassword) {
  if (aKekExists) {
    // If the KEK exists and is already unlocked, another component is managing
    // it. This happens in enterprise, where the profile KEK is secured by the
    // felt secret.
    if (aKekUnlocked) {
      return Nothing();
    }
    return Some(PrimaryPasswordSync::Unlock);
  }
  // No password KEK yet: only a primary password the user has already set
  // gives us anything to adopt.
  if (aTokenHasPassword()) {
    return Some(PrimaryPasswordSync::Adopt);
  }
  return Nothing();
}

bool SyncIsSkippable(PrimaryPasswordSync aSync) {
  return aSync == PrimaryPasswordSync::Adopt;
}

// The KEK has to stay unlocked for the rest of the session. lockstore clamps
// the window to its own maximum, so ask for everything.
constexpr uint64_t kCacheForSession = UINT64_MAX;

// The lockstore helpers here reach the FFI, which is synchronous and hits
// SQLite, so callers dispatch them to a background queue.

static bool KekExists(LockstoreService* aLockstore, const nsACString& aKekRef) {
  auto exists = aLockstore->DoKekExists(aKekRef);
  return exists.isOk() && exists.unwrap();
}

// Requires the password KEK to be unlocked.
static nsresult MoveProfileDeksToLocalKey(LockstoreService* aLockstore) {
  auto created = aLockstore->DoCreateKek("local"_ns, kProfileKekId, ""_ns,
                                         /* cache_timeout_ms */ 0);
  if (created.isErr()) {
    return created.unwrapErr();
  }
  nsresult rv =
      aLockstore->DoMigrateDeks(kProfilePasswordKek, created.unwrap());
  NS_ENSURE_SUCCESS(rv, rv);
  // The migrated-from KEK now wraps nothing, but its record alone is what
  // later startups read as "the profile uses a password KEK", so drop it.
  return aLockstore->DoDeleteKek(kProfilePasswordKek);
}

// Move the profile DEKs off the password KEK once the link is
// disabled, while that KEK is still unlocked. Nothing re-unlocks it once the
// link is off, so DEKs left under it stop being readable for the rest of the
// session, which breaks every consumer of an encrypted database.
// Best-effort: this runs on a background task shutdown can outrun, and the
// migration itself can fail. Whatever is left behind stays under the password
// KEK until the link is enabled again, when the startup sync unlocks it.
static void OnLockstoreUnlockPrefChanged(const char* /* aPref */,
                                         void* /* aData */) {
  // Read the pref rather than its StaticPrefs mirror, whose own callback is
  // not ordered against this one.
  if (Preferences::GetBool("security.lockstore.unlock.enabled", false)) {
    return;
  }
  RefPtr<LockstoreService> lockstore = LockstoreService::GetSingleton();
  if (!lockstore) {
    return;
  }
  NS_DispatchBackgroundTask(
      NS_NewRunnableFunction(
          "LockstoreMigrateToLocal",
          [lockstore] {
            if (KekExists(lockstore, kProfilePasswordKek) &&
                NS_FAILED(MoveProfileDeksToLocalKey(lockstore))) {
              NS_WARNING("Failed to migrate the profile DEKs to a LocalKey");
            }
          }),
      NS_DISPATCH_EVENT_MAY_BLOCK);
}

// Synchronise the lockstore profile KEK with the primary password: unlock it,
// or adopt a primary password it does not know about yet. Returns false when
// startup cannot continue, which covers every state this cannot rule out:
// an unreachable keystore answers nothing about the profile's DEKs.
static bool SyncLockstoreWithPrimaryPassword() {
  // Without the link there is nothing to sync, and the keystore must not be
  // touched: opening it creates it in every profile, and the profile KEK may
  // belong to a component other than the primary password.
  if (!StaticPrefs::security_lockstore_unlock_enabled()) {
    return true;
  }

  // LockstoreService::Init ensures NSS itself, so a singleton means NSS is up.
  RefPtr<LockstoreService> lockstore = LockstoreService::GetSingleton();
  nsCOMPtr<nsISerialEventTarget> unlockQueue;
  if (!lockstore || NS_FAILED(NS_CreateBackgroundTaskQueue(
                        "LockstoreUnlock", getter_AddRefs(unlockQueue)))) {
    // Out of reach of the keystore, whether this profile keeps its DEKs under
    // a password KEK cannot be answered, and carrying on regardless hands the
    // session to consumers whose databases may be unreadable.
    NS_WARNING("No lockstore to sync the profile KEK with");
    return false;
  }

  bool kekExists = false;
  bool kekUnlocked = false;

  nsresult dispatchRv = NS_DispatchAndSpinEventLoopUntilComplete(
      "LockstoreUnlock"_ns, unlockQueue,
      NS_NewRunnableFunction("LockstoreUnlock", [&] {
        kekExists = KekExists(lockstore, kProfilePasswordKek);
        bool unlocked = false;
        kekUnlocked = kekExists &&
                      NS_SUCCEEDED(lockstore->IsKekUnlocked(kProfilePasswordKek,
                                                            &unlocked)) &&
                      unlocked;
      }));
  if (NS_WARN_IF(NS_FAILED(dispatchRv))) {
    // As above: an unanswered probe is no better than an unreachable keystore.
    return false;
  }

  Maybe<PrimaryPasswordSync> sync =
      ChoosePrimaryPasswordSync(kekExists, kekUnlocked, [] {
        nsCOMPtr<nsIPKCS11Token> token(
            do_CreateInstance("@mozilla.org/security/internalkeytoken;1"));
        bool hasPassword = false;
        return token && NS_SUCCEEDED(token->GetHasPassword(&hasPassword)) &&
               hasPassword;
      });
  if (sync.isNothing()) {
    return true;
  }

  const bool syncIsSkippable = SyncIsSkippable(*sync);

  // Every sync from here on asks the user for the primary password.
  nsCOMPtr<nsIPromptService> ps(do_GetService(NS_PROMPTSERVICE_CONTRACTID));
  if (!ps) {
    // A locked KEK left behind holds every DEK under it hostage for the
    // session; only adoption, which no DEK depends on yet, can wait.
    NS_WARNING("No prompt service to ask for the primary password with");
    return syncIsSkippable;
  }

  nsCOMPtr<nsISecretDecoderRing> sdr(
      do_GetService("@mozilla.org/security/sdr;1"));
  if (!sdr) {
    // Adopting a password nothing has checked would key the KEK to a password
    // the token may never accept, so the sync cannot go ahead here; only
    // adoption can be left to another startup.
    NS_WARNING("No secret decoder ring to check the primary password with");
    return syncIsSkippable;
  }

  // The wording NSS itself prompts the primary password with, so the dialog
  // reads the same whichever sync brought us here.
  nsCOMPtr<nsIStringBundleService> sbs =
      mozilla::components::StringBundle::Service();
  nsCOMPtr<nsIStringBundle> pipnssBundle;
  nsAutoString promptText;
  if (!sbs ||
      NS_FAILED(sbs->CreateBundle("chrome://pipnss/locale/pipnss.properties",
                                  getter_AddRefs(pipnssBundle))) ||
      NS_FAILED(pipnssBundle->GetStringFromName("CertPasswordPromptDefault",
                                                promptText))) {
    NS_WARNING("Failed to load the primary password prompt string");
    return syncIsSkippable;
  }

#ifdef XP_MACOSX
  // This runs before XRE_mainRun initializes the Cocoa app for the first
  // window. Calling InitializeMacApp more than once does nothing.
  InitializeMacApp();
#endif

  while (true) {
    char16_t* rawPassword = nullptr;
    bool ok = false;
    ps->PromptPassword(nullptr, nullptr, promptText.get(), &rawPassword, &ok);
    nsString password;
    password.Adopt(rawPassword);
    if (!ok) {
      return syncIsSkippable;
    }
    NS_ConvertUTF16toUTF8 secret(password);

    // The token is the ground truth for the password, so check it before
    // lockstore: a typo must not be reported as a lockstore failure.
    bool loggedIn = false;
    if (NS_FAILED(sdr->Login(secret, &loggedIn))) {
      NS_WARNING("Failed to log into the internal token at startup");
      return syncIsSkippable;
    }
    if (!loggedIn) {
      continue;
    }

    nsresult rv = NS_ERROR_FAILURE;
    dispatchRv = NS_DispatchAndSpinEventLoopUntilComplete(
        "LockstoreUnlock"_ns, unlockQueue,
        NS_NewRunnableFunction("LockstoreUnlock", [&] {
          if (*sync == PrimaryPasswordSync::Adopt) {
            rv = NS_OK;
            auto created = lockstore->DoCreateKek("password"_ns, kProfileKekId,
                                                  secret, kCacheForSession);
            if (created.isErr()) {
              rv = created.unwrapErr();
            } else if (KekExists(lockstore, kProfileLocalKek)) {
              // Every DEK created before the primary password is migrated. The
              // LocalKey unlocks without a secret, so a DEK left under it stays
              // readable without the primary password.
              rv = lockstore->DoMigrateDeks(kProfileLocalKek,
                                            kProfilePasswordKek);
              if (NS_SUCCEEDED(rv)) {
                rv = lockstore->DoDeleteKek(kProfileLocalKek);
              } else {
                // A password KEK wrapping nothing protects nothing; drop it so
                // the next startup retries the adoption.
                (void)lockstore->DoDeleteKek(kProfilePasswordKek);
              }
            }
            return;
          }

          rv = lockstore->DoUnlockKek(kProfilePasswordKek, secret,
                                      kCacheForSession);
        }));
    if (NS_WARN_IF(NS_FAILED(dispatchRv))) {
      return syncIsSkippable;
    }
    if (NS_SUCCEEDED(rv)) {
      return true;
    }
    NS_WARNING("Failed to sync the lockstore KEK with the primary password");
    return syncIsSkippable;
  }
}

bool SyncProfileKekAtStartup() {
  MOZ_ASSERT(NS_IsMainThread());
  const bool canContinue = SyncLockstoreWithPrimaryPassword();
  Preferences::RegisterCallback(&OnLockstoreUnlockPrefChanged,
                                "security.lockstore.unlock.enabled"_ns);
  return canContinue;
}

}  // namespace mozilla::security::lockstore
