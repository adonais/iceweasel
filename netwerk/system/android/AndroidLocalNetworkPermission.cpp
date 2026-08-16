/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "AndroidLocalNetworkPermission.h"

#include "mozilla/Atomics.h"
#include "mozilla/Services.h"
#include "mozilla/jni/Utils.h"
#include "nsIObserver.h"
#include "nsIObserverService.h"
#include "nsString.h"
#include "nsThreadUtils.h"

namespace mozilla::net {

namespace {

// Build.VERSION_CODES.CINNAMON_BUN, the first release with local network
// protection and therefore the ACCESS_LOCAL_NETWORK permission.
static constexpr int kAndroidCinnamonBun = 37;

// Resolved once: the OS version can't change under us.
bool IsAtLeastCinnamonBun() {
  static const bool sIsAtLeastCinnamonBun = [] {
    // GetAPIVersion() answers 0 until JNI is up, which would latch as "older
    // than CinnamonBun" and stop us ever asking for the permission.
    MOZ_ASSERT(jni::IsAvailable());
    return jni::GetAPIVersion() >= kAndroidCinnamonBun;
  }();
  return sIsAtLeastCinnamonBun;
}

// True once the front end has told us the permission is held.
static Atomic<bool> sHasLocalNetworkPermission{false};

// True once we have asked the front end during this foreground cycle, whether
// or not the answer has arrived yet. Without this, every connection made while
// the prompt is still on screen -- or made after the user declined -- would
// dispatch another runnable and fire another notification, which a page pulling
// in many local network subresources does a lot of. Deliberately not cleared
// when the answer arrives, only on "application-foreground": a denial should
// stop us asking until the user has had a chance to change their mind.
static Atomic<bool> sLocalNetworkPermissionRequested{false};

// Watches for the front end's answer, and for the app being foregrounded.
class LocalNetworkPermissionObserver final : public nsIObserver {
 public:
  NS_DECL_ISUPPORTS

  NS_IMETHOD Observe(nsISupports*, const char* aTopic,
                     const char16_t* aData) override {
    MOZ_ASSERT(NS_IsMainThread());
    if (!strcmp(aTopic, ANDROID_LOCAL_NETWORK_PERMISSION_RESULT_TOPIC)) {
      sHasLocalNetworkPermission =
          aData && nsDependentString(aData).EqualsLiteral("granted");
    } else if (!strcmp(aTopic, "application-foreground")) {
      // The permission may have been granted or revoked in Android settings
      // while we were backgrounded, so re-establish it on the next local
      // network connection.
      sHasLocalNetworkPermission = false;
      sLocalNetworkPermissionRequested = false;
    }
    return NS_OK;
  }

 private:
  ~LocalNetworkPermissionObserver() = default;
};

NS_IMPL_ISUPPORTS(LocalNetworkPermissionObserver, nsIObserver)

// Registered the first time we ask, rather than at startup: the answer can only
// arrive in response to a request, and the foreground topic only matters once
// we have an answer to invalidate.
void EnsureObserverRegistered() {
  MOZ_ASSERT(NS_IsMainThread());
  static bool sRegistered = false;
  if (sRegistered) {
    return;
  }
  nsCOMPtr<nsIObserverService> obs = mozilla::services::GetObserverService();
  if (!obs) {
    return;
  }
  RefPtr<LocalNetworkPermissionObserver> observer =
      new LocalNetworkPermissionObserver();
  obs->AddObserver(observer, ANDROID_LOCAL_NETWORK_PERMISSION_RESULT_TOPIC,
                   false);
  obs->AddObserver(observer, "application-foreground", false);
  sRegistered = true;
}

void NotifyPermissionRequest() {
  MOZ_ASSERT(NS_IsMainThread());
  EnsureObserverRegistered();

  nsCOMPtr<nsIObserverService> obs = mozilla::services::GetObserverService();
  if (!obs) {
    return;
  }
  obs->NotifyObservers(nullptr, ANDROID_REQUEST_LOCAL_NETWORK_PERMISSION_TOPIC,
                       nullptr);
}

}  // namespace

void RequestAndroidLocalNetworkPermission() {
  // Nothing to ask for before the permission existed.
  if (!IsAtLeastCinnamonBun()) {
    return;
  }

  if (sHasLocalNetworkPermission) {
    return;
  }

  // Claim the request, so that concurrent callers on the socket thread and any
  // later connection made before the answer arrives don't ask again.
  if (sLocalNetworkPermissionRequested.exchange(true)) {
    return;
  }

  // Callers run on the socket thread, while the front end observing this lives
  // on the main thread.
  if (!NS_IsMainThread()) {
    NS_DispatchToMainThread(NS_NewRunnableFunction(
        "net::NotifyPermissionRequest", [] { NotifyPermissionRequest(); }));
    return;
  }

  NotifyPermissionRequest();
}

}  // namespace mozilla::net
