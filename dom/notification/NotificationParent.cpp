/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "NotificationParent.h"

#include "NotificationHandler.h"
#include "NotificationUtils.h"
#include "mozilla/StaticPrefs_dom.h"
#include "mozilla/dom/ServiceWorkerManager.h"
#include "mozilla/ipc/Endpoint.h"
#include "nsIAlertsService.h"
#include "nsIServiceWorkerManager.h"
#include "nsThreadUtils.h"

namespace mozilla::dom::notification {

NS_IMPL_ISUPPORTS0(NotificationParent)

class NotificationCallbacks final : public NotificationCallbacksCommon {
 public:
  NS_INLINE_DECL_REFCOUNTING_INHERITED(NotificationCallbacks,
                                       NotificationCallbacksCommon)

  NotificationCallbacks(const nsAString& aScope, nsIPrincipal* aPrincipal,
                        IPCNotification aNotification,
                        NotificationParent& aParent)
      : NotificationCallbacksCommon(aScope, aPrincipal,
                                    std::move(aNotification)),
        mActor(&aParent) {}

  /**
   * @returns True if the actor ran and no further action is needed, false
   * otherwise.
   */
  template <typename T>
  bool RunActor(T aFunc) {
    RefPtr<NotificationParent> actor(mActor);
    if (actor && actor->CanSend()) {
      aFunc(actor.get());
      return mScope.IsEmpty();
    }
    return false;
  }

  NS_IMETHODIMP OnAlertShow() override {
    MOZ_TRY(NotificationCallbacksCommon::OnAlertShow());
    if (RunActor([](auto* actor) { actor->OnAlertShow(); }) ||
        mScope.IsEmpty()) {
      return NS_OK;
    }
    PersistNotification();
    return NS_OK;
  }

  NS_IMETHODIMP OnAlertClick(nsIAlertAction* aAction) override {
    MOZ_TRY(NotificationCallbacksCommon::OnAlertClick(aAction));
    nsCOMPtr<nsIURI> navigate;
    if (StaticPrefs::dom_webnotifications_navigate_enabled()) {
      if (aAction) {
        aAction->GetNavigate(getter_AddRefs(navigate));
      } else {
        navigate = mNotification.options().navigate();
      }
    }

    // If navigation URL is set, don't fire event at SW.
    if (!navigate) {
      if (RunActor([](auto* actor) { actor->FireClickEvent(); })) {
        return NS_OK;
      } else if (mScope.IsEmpty()) {
        // No actor there, we need to open up a window ourselves
        return OpenWindowFor(mPrincipal);
      }
    }

    return RespondOnClick(aAction);
  }

  NS_IMETHODIMP OnAlertClosed() override {
    MOZ_TRY(NotificationCallbacksCommon::OnAlertClosed());
    if (RunActor([](auto* actor) { actor->OnAlertFinished(true); }) ||
        mScope.IsEmpty()) {
      return NS_OK;
    }
    return OnAlertFinishedCommon();
  }

  NS_IMETHODIMP OnAlertFinished() override {
    MOZ_TRY(NotificationCallbacksCommon::OnAlertFinished());
    if (RunActor([](auto* actor) { actor->OnAlertFinished(false); }) ||
        mScope.IsEmpty()) {
      return NS_OK;
    }
    return OnAlertFinishedCommon();
  }

 private:
  virtual ~NotificationCallbacks() = default;

  nsresult OnAlertFinishedCommon() {
    RefPtr<ServiceWorkerManager> swm = ServiceWorkerManager::GetInstance();
    if (!swm) {
      return NS_ERROR_FAILURE;
    }

    UnpersistNotification();
    nsAutoCString originSuffix;
    MOZ_TRY(mPrincipal->GetOriginSuffix(originSuffix));
    (void)swm->SendNotificationCloseEvent(originSuffix, mScope, mNotification);

    return NS_OK;
  }

  WeakPtr<NotificationParent> mActor;
};

nsresult NotificationParent::OnAlertShow() {
  if (!mResolver) {
#ifdef ANDROID
    // XXX: This can happen as alertshow happens asynchronously on Android as
    // we go through GeckoView.
    //
    // For example, if two same-tagged notifications are requested at the same
    // time, the first one will be canceled but can still fire alertshow,
    // while the second one will also fire one, and the handler for the second
    // one would get both.
    //
    // We may want to reintroduce UUID for such asynchronous case, but for now
    // it's very edge case and can be ignored.
    return NS_OK;
#else
    MOZ_ASSERT_UNREACHABLE("Are we getting double show events?");
    return NS_ERROR_FAILURE;
#endif
  }
  mResolver.take().value()(CopyableErrorResult());
  return NS_OK;
}

nsresult NotificationParent::OnAlertFinished(bool aIsClosed) {
  if (mResolver) {
    if (aIsClosed) {
      // Closing without ever being shown, but intentionally by the backend
      mResolver.take().value()(CopyableErrorResult());
    } else {
      // alertshow happens first before alertfinished, and it should have
      // nullified mResolver. If not it means it failed to show and is bailing
      // out.
      // NOTE(krosylight): The spec does not define what to do when a
      // permission-granted notification fails to open, we throw TypeError
      // here as that's the error for when permission is denied.
      CopyableErrorResult rv;
      rv.ThrowTypeError(
          "Failed to show notification, potentially because the browser did "
          "not have the corresponding OS-level permission."_ns);
      mResolver.take().value()(rv);
    }
  }

  // Unpersisted already and being unregistered already by nsIAlertsService
  mDangling = true;
  Close();

  return NS_OK;
}

nsresult NotificationParent::FireClickEvent() {
  if (!mArgs.mScope.IsEmpty()) {
    return NS_OK;
  }
  if (SendNotifyClick()) {
    return NS_OK;
  }
  return NS_ERROR_FAILURE;
}

// Step 4 of
// https://notifications.spec.whatwg.org/#dom-notification-notification
mozilla::ipc::IPCResult NotificationParent::RecvShow(Maybe<IPCImage>&& aIcon,
                                                     ShowResolver&& aResolver) {
  MOZ_ASSERT(mId.IsEmpty(), "ID should not be given for a new notification");

  mResolver.emplace(std::move(aResolver));
  mShowPending = true;

  // Step 4.1: If the result of getting the notifications permission state is
  // not "granted", then queue a task to fire an event named error on this, and
  // abort these steps.
  RefPtr permissionPromise = EnsureValidNotificationPermission(
      mArgs.mPrincipal, mArgs.mEffectiveStoragePrincipal,
      mArgs.mIsSecureContext);
  permissionPromise->Then(
      GetMainThreadSerialEventTarget(), __func__,
      [self = RefPtr(this), icon = std::move(aIcon)](Ok) mutable {
        self->mShowPending = false;
        // Always show first to register with the alert system, even if
        // close was requested while pending. This ensures platforms like
        // Android can properly trigger onCloseNotification callbacks.

        // Step 4.2: Run the fetch steps for notification. (Already happened in
        // the child)
        //
        // Step 4.3: Run the show steps for notification.
        nsresult rv = self->Show(std::move(icon));
        // It's possible that we synchronously received a notification while in
        // Show, so mResolver may now be empty.
        if (NS_FAILED(rv) && self->mResolver) {
          self->mResolver.take().value()(CopyableErrorResult(rv));
        }
        // If not failed, the resolver will be called asynchronously by
        // NotificationCallbacks.

        // Handle close() called while SafeBrowsing check was in progress.
        if (self->mClosePending) {
          self->mClosePending = false;
          self->Unregister();
          self->Close();
        }
      },
      [self = RefPtr(this)](nsresult) {
        // Don't have permission or SafeBrowsing classification determined the
        // notification is unsafe, reject the show request.
        self->mShowPending = false;
        self->mClosePending = false;

        CopyableErrorResult rv;
        rv.ThrowTypeError("Permission to show Notification denied.");
        self->mResolver.take().value()(rv);

        self->mDangling = true;
      });
  return IPC_OK();
}

nsresult NotificationParent::Show(Maybe<IPCImage>&& aIcon) {
  auto result = CreateAlertForNotification(mArgs.mNotification.options(),
                                           *mArgs.mPrincipal, std::move(aIcon));

  if (result.isErr()) {
    return result.unwrapErr();
  }

  nsCOMPtr<nsIAlertNotification> alert = result.unwrap();
  MOZ_TRY(alert->GetId(mId));
  RefPtr<NotificationCallbacks> callbacks = new NotificationCallbacks(
      mArgs.mScope, mArgs.mPrincipal,
      IPCNotification(mId, mArgs.mNotification.options()), *this);
  return ShowAlertWithCleanup(alert, callbacks);
}

mozilla::ipc::IPCResult NotificationParent::RecvClose() {
  // If SafeBrowsing check is in progress, defer the close until it completes.
  // We need to call Show() first to register with the alert system before
  // Unregister() can properly trigger close callbacks (e.g.,
  // onCloseNotification on Android).
  if (mShowPending) {
    mClosePending = true;
    return IPC_OK();
  }

  Unregister();
  Close();
  return IPC_OK();
}

void NotificationParent::Unregister() {
  if (mDangling) {
    // We had no permission, so nothing to clean up.
    return;
  }

  mDangling = true;
  UnregisterNotification(mArgs.mPrincipal, mId);
}

nsresult NotificationParent::CreateOnMainThread(
    NotificationParentArgs&& mArgs,
    Endpoint<PNotificationParent>&& aParentEndpoint,
    PBackgroundParent::CreateNotificationParentResolver&& aResolver) {
  if (mArgs.mNotification.options().actions().Length() > kMaxActions) {
    return NS_ERROR_INVALID_ARG;
  }

  nsCOMPtr<nsIThread> thread = NS_GetCurrentThread();

  NS_DispatchToMainThread(NS_NewRunnableFunction(
      "NotificationParent::BindToMainThread",
      [args = std::move(mArgs), endpoint = std::move(aParentEndpoint),
       resolver = std::move(aResolver), thread]() mutable {
        RefPtr<NotificationParent> actor =
            new NotificationParent(std::move(args));
        bool result = endpoint.Bind(actor);
        thread->Dispatch(NS_NewRunnableFunction(
            "NotificationParent::BindToMainThreadResult",
            [result, resolver = std::move(resolver)]() { resolver(result); }));
      }));

  return NS_OK;
}

}  // namespace mozilla::dom::notification
