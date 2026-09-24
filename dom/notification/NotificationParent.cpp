/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "NotificationParent.h"

#include "NotificationHandler.h"
#include "NotificationUtils.h"
#include "mozilla/AlertNotification.h"
#include "mozilla/StaticPrefs_dom.h"
#include "mozilla/dom/ServiceWorkerManager.h"
#include "mozilla/glean/DomNotificationMetrics.h"
#include "mozilla/glean/bindings/Event.h"
#include "mozilla/ipc/Endpoint.h"
#include "nsComponentManagerUtils.h"
#include "nsIAlertsService.h"
#include "nsIServiceWorkerManager.h"
#include "nsISiteCategory.h"
#include "nsIURIClassifier.h"
#include "nsNetCID.h"
#include "nsThreadUtils.h"

namespace mozilla::dom::notification {

NS_IMPL_ISUPPORTS0(NotificationParent)

class NotificationObserver final : public nsIAlertCallbacks {
 public:
  NS_DECL_ISUPPORTS

  NotificationObserver(const nsAString& aScope, nsIPrincipal* aPrincipal,
                       IPCNotification aNotification,
                       NotificationParent& aParent)
      : mScope(aScope),
        mPrincipal(aPrincipal),
        mNotification(std::move(aNotification)),
        mActor(&aParent) {
    if (nsCOMPtr<nsISiteCategory> siteCategory =
            do_GetService("@mozilla.org/site-category;1")) {
      nsCString category;
      if (NS_SUCCEEDED(siteCategory->GetCategory(mPrincipal, category))) {
        mCategory = Some(category);
      }
    }
  }

  NS_IMETHODIMP OnAlertDisable() override {
    glean::web_notification::clicked.Record(
        Some(glean::web_notification::ClickedExtra{.action = Some("disable"_ns),
                                                   .siteCategory = mCategory}));
    return RemovePermission(mPrincipal);
  }

  NS_IMETHODIMP OnAlertSettings() override {
    glean::web_notification::clicked.Record(
        Some(glean::web_notification::ClickedExtra{
            .action = Some("settings"_ns), .siteCategory = mCategory}));
    return OpenSettings(mPrincipal);
  }

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
    mShown = true;
    glean::web_notification::shown.Record(
        Some(glean::web_notification::ShownExtra{.siteCategory = mCategory}));

    if (RunActor([](auto* actor) { actor->OnAlertShow(); }) ||
        mScope.IsEmpty()) {
      return NS_OK;
    }

    (void)NS_WARN_IF(NS_FAILED(
        AdjustPushQuota(mPrincipal, NotificationStatusChange::Shown)));
    nsresult rv = PersistNotification(mPrincipal, mNotification, mScope);
    if (NS_FAILED(rv)) {
      NS_WARNING("Could not persist Notification");
    }
    return NS_OK;
  }

  NS_IMETHODIMP OnAlertClick(nsIAlertAction* aAction) override {
    mClicked = true;
    glean::web_notification::clicked.Record(
        Some(glean::web_notification::ClickedExtra{
            .action = Some(aAction ? "action-button"_ns : "body"_ns),
            .siteCategory = mCategory}));

    nsCOMPtr<nsIURI> navigate;
    if (StaticPrefs::dom_webnotifications_navigate_enabled()) {
      if (aAction) {
        aAction->GetNavigate(getter_AddRefs(navigate));
      } else {
        navigate = mNotification.options().navigate();
      }
    }

    // If navigation URL is set, we will navigate in RespondOnClick.
    if (!navigate) {
      if (RunActor([](auto* actor) { actor->FireClickEvent(); })) {
        return NS_OK;
      } else if (mScope.IsEmpty()) {
        // No actor there, we need to open up a window ourselves
        return OpenWindowFor(mPrincipal);
      }
    }

    nsAutoString actionName;
    if (aAction) {
      MOZ_TRY(aAction->GetAction(actionName));
    }
    return RespondOnClick(mPrincipal, mScope, mNotification, actionName);
  }

  NS_IMETHODIMP OnAlertDismissedFromForeground() override {
    glean::web_notification::ignored.Record(
        Some(glean::web_notification::IgnoredExtra{.siteCategory = mCategory}));
    return NS_OK;
  }

  NS_IMETHODIMP OnAlertClosed() override {
    if (mShown && !mClicked) {
      glean::web_notification::dismissed.Record(Some(
          glean::web_notification::DismissedExtra{.siteCategory = mCategory}));
    }
    if (RunActor([](auto* actor) { actor->OnAlertFinished(true); }) ||
        mScope.IsEmpty()) {
      return NS_OK;
    }
    return OnAlertFinishedCommon();
  }

  NS_IMETHODIMP OnAlertFinished() override {
    if (mShown && !mClicked) {
      glean::web_notification::dismissed.Record(Some(
          glean::web_notification::DismissedExtra{.siteCategory = mCategory}));
    }
    if (RunActor([](auto* actor) { actor->OnAlertFinished(false); }) ||
        mScope.IsEmpty()) {
      return NS_OK;
    }
    return OnAlertFinishedCommon();
  }

  nsresult OnAlertFinishedCommon() {
    RefPtr<ServiceWorkerManager> swm = ServiceWorkerManager::GetInstance();
    if (!swm) {
      return NS_ERROR_FAILURE;
    }

    nsAutoCString originSuffix;
    MOZ_TRY(mPrincipal->GetOriginSuffix(originSuffix));

    (void)NS_WARN_IF(NS_FAILED(
        AdjustPushQuota(mPrincipal, NotificationStatusChange::Closed)));
    (void)NS_WARN_IF(
        NS_FAILED(UnpersistNotification(mPrincipal, mNotification.id())));
    (void)swm->SendNotificationCloseEvent(originSuffix, mScope, mNotification);

    return NS_OK;
  }

 private:
  virtual ~NotificationObserver() = default;

  // May want to replace with SWR ID, see bug 1881812
  nsString mScope;
  nsCOMPtr<nsIPrincipal> mPrincipal;
  IPCNotification mNotification;
  WeakPtr<NotificationParent> mActor;

  Maybe<nsCString> mCategory;
  bool mShown = false;
  bool mClicked = false;
};

NS_IMPL_ISUPPORTS(NotificationObserver, nsIAlertCallbacks)

using SafeBrowsingPromise = MozPromise<bool, nsresult, false>;

class SafeBrowsingClassificationCallback final
    : public nsIURIClassifierCallback {
 public:
  NS_DECL_ISUPPORTS

  SafeBrowsingClassificationCallback() = default;

  already_AddRefed<SafeBrowsingPromise> Promise() {
    return mPromiseHolder.Ensure(__func__);
  }

  NS_IMETHOD OnClassifyComplete(nsresult aErrorCode, const nsACString& aList,
                                const nsACString& aProvider,
                                const nsACString& aFullHash) override {
    if (NS_FAILED(aErrorCode)) {
      mPromiseHolder.Reject(aErrorCode, __func__);
    } else {
      mPromiseHolder.Resolve(true, __func__);
    }
    return NS_OK;
  }

 private:
  ~SafeBrowsingClassificationCallback() {
    mPromiseHolder.RejectIfExists(NS_ERROR_ABORT, __func__);
  }

  MozPromiseHolder<SafeBrowsingPromise> mPromiseHolder;
};

NS_IMPL_ISUPPORTS(SafeBrowsingClassificationCallback, nsIURIClassifierCallback)

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

  // Step 4.1: If the result of getting the notifications permission state is
  // not "granted", then queue a task to fire an event named error on this, and
  // abort these steps.
  NotificationPermission permission = GetNotificationPermission(
      mArgs.mPrincipal, mArgs.mEffectiveStoragePrincipal,
      mArgs.mIsSecureContext, PermissionCheckPurpose::NotificationShow);
  if (permission != NotificationPermission::Granted) {
    CopyableErrorResult rv;
    rv.ThrowTypeError("Permission to show Notification denied.");
    mResolver.take().value()(rv);
    mDangling = true;
    return IPC_OK();
  }

  auto showNotification = [self = RefPtr(this)](Maybe<IPCImage>&& aIcon) {
    // Step 4.2: Run the fetch steps for notification. (Already happened in the
    // child)
    //
    // Step 4.3: Run the show steps for notification.
    nsresult rv = self->Show(std::move(aIcon));
    // It's possible that we synchronously received a notification while in
    // Show, so mResolver may now be empty.
    if (NS_FAILED(rv) && self->mResolver) {
      self->mResolver.take().value()(CopyableErrorResult(rv));
    }
    // If not failed, the resolver will be called asynchronously by
    // NotificationObserver.
  };

  // Check Safe Browsing blocklist if the feature is enabled (bug 1986300).
  if (StaticPrefs::dom_webnotifications_block_if_on_safebrowsing()) {
    nsresult rv = NS_OK;
    nsCOMPtr<nsIURIClassifier> uriClassifier =
        do_GetService(NS_URICLASSIFIERSERVICE_CONTRACTID, &rv);

    if (NS_FAILED(rv) || !uriClassifier) {
      NS_WARNING("URI classifier unavailable for notification check");
    } else {
      RefPtr<SafeBrowsingClassificationCallback> callback =
          new SafeBrowsingClassificationCallback();
      RefPtr<SafeBrowsingPromise> promise = callback->Promise();

      bool willClassify = false;
      rv = uriClassifier->Classify(mArgs.mPrincipal, callback, &willClassify);

      if (NS_SUCCEEDED(rv) && willClassify) {
        mShowPending = true;
        promise->Then(
            GetMainThreadSerialEventTarget(), __func__,
            [self = RefPtr(this), showNotification,
             icon = std::move(aIcon)](bool) mutable {
              self->mShowPending = false;

              // Always show first to register with the alert system, even if
              // close was requested while pending. This ensures platforms like
              // Android can properly trigger onCloseNotification callbacks.
              showNotification(std::move(icon));

              // Handle close() called while SafeBrowsing check was in progress.
              if (self->mClosePending) {
                self->mClosePending = false;
                self->Unregister();
                self->Close();
              }
            },
            [self = RefPtr(this)](nsresult) {
              // SafeBrowsing classification determined the notification is
              // unsafe, reject the show request and revoke permission.
              self->mShowPending = false;
              self->mClosePending = false;

              RemovePermission(self->mArgs.mPrincipal);

              CopyableErrorResult rv;
              rv.ThrowTypeError("Permission to show Notification denied.");
              self->mResolver.take().value()(rv);

              self->mDangling = true;
            });

        return IPC_OK();
      }
    }
  }

  showNotification(std::move(aIcon));
  return IPC_OK();
}

nsresult NotificationParent::Show(Maybe<IPCImage>&& aIcon) {
  // Step 4.3 the show steps, which are almost all about processing `tag` and
  // then displaying the notification. Both are handled by
  // nsIAlertsService::ShowAlert. The below is all about constructing the
  // observer (for show and close events) right and ultimately call the alerts
  // service function.

  // In the case of IPC, the parent process uses the cookie to map to
  // nsIObserver. Thus the cookie must be unique to differentiate observers.
  // XXX(krosylight): This is about ContentChild::mAlertObserver which is not
  // useful when called by the parent process. This should be removed when we
  // make nsIAlertsService parent process only.
  nsString obsoleteCookie = u"notification:"_ns;

  const IPCNotificationOptions& options = mArgs.mNotification.options();

  bool requireInteraction = options.requireInteraction();
  if (!StaticPrefs::dom_webnotifications_requireinteraction_enabled()) {
    requireInteraction = false;
  }

  nsCOMPtr<nsIAlertNotification> alert =
      do_CreateInstance(ALERT_NOTIFICATION_CONTRACTID);
  if (!alert) {
    return NS_ERROR_NOT_AVAILABLE;
  }

  nsCOMPtr<nsIPrincipal> principal = mArgs.mPrincipal;
  nsAutoCString iconUrl;
  if (RefPtr<nsIURI> iconUri = options.icon()) {
    iconUri->GetSpec(iconUrl);
  }
  MOZ_TRY(alert->Init(options.tag(), NS_ConvertUTF8toUTF16(iconUrl),
                      options.title(), options.body(), true, obsoleteCookie,
                      NS_ConvertASCIItoUTF16(GetEnumString(options.dir())),
                      options.lang(), options.dataSerialized(), principal,
                      principal->GetIsInPrivateBrowsing(), requireInteraction,
                      options.silent(), options.vibrate()));

  if (aIcon) {
    if (nsCOMPtr<imgIContainer> image =
            nsContentUtils::IPCImageToImage(*aIcon)) {
      alert->SetImage(image);
    }
  }

  if (StaticPrefs::dom_webnotifications_actions_enabled()) {
    nsTArray<RefPtr<nsIAlertAction>> actions;
    MOZ_ASSERT(options.actions().Length() <= kMaxActions);
    for (const auto& action : options.actions()) {
      actions.AppendElement(
          new AlertAction(action.name(), action.title(), action.navigate()));
    }
    alert->SetActions(actions);
  }

  MOZ_TRY(alert->GetId(mId));

  RefPtr<NotificationObserver> observer = new NotificationObserver(
      mArgs.mScope, principal, IPCNotification(mId, options), *this);
  MOZ_TRY(ShowAlertWithCleanup(alert, observer));

  return NS_OK;
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
