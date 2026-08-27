/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsIAlertsService.h"

#include "nsIObserverService.h"
#include "nsIPrincipal.h"
#include "xpcpublic.h"
#include "mozilla/AppShutdown.h"
#include "mozilla/ClearOnShutdown.h"
#include "mozilla/Services.h"
#include "mozilla/StaticPrefs_alerts.h"
#include "mozilla/StaticPrefs_browser.h"
#include "nsServiceManagerUtils.h"
#include "nsXULAlerts.h"

#include "nsAlertsService.h"

#include "nsToolkitCompsCID.h"
#include "nsComponentManagerUtils.h"

#ifdef MOZ_PLACES
#  include "nsIFaviconService.h"
#endif  // MOZ_PLACES

#ifdef XP_WIN
#  include <windows.h>
#  include <shellapi.h>
#endif

using namespace mozilla;

namespace {

// Topics fired for every shown/closed web content alert. The subject is the
// nsIAlertNotification the alert was shown with.
constexpr char kWebNotificationShownTopic[] = "web-notification-shown";
constexpr char kWebNotificationClosedTopic[] = "web-notification-closed";

// Decorates the caller's alert callbacks with reporting to the parent process
// observer service, so chrome features can observe web notifications uniformly
// without the Notification API having to know about them. Every callback is
// forwarded to the wrapped callbacks untouched.
class AlertCaptureCallbacks final : public nsIAlertCallbacks {
 public:
  NS_DECL_ISUPPORTS

  AlertCaptureCallbacks(nsIAlertNotification* aAlert,
                        nsIAlertCallbacks* aCallbacks)
      : mAlert(aAlert), mCallbacks(aCallbacks) {}

  NS_IMETHOD OnAlertShow() override {
    mShown = true;
    Notify(kWebNotificationShownTopic);
    return mCallbacks ? mCallbacks->OnAlertShow() : NS_OK;
  }

  NS_IMETHOD OnAlertClick(nsIAlertAction* aAction) override {
    return mCallbacks ? mCallbacks->OnAlertClick(aAction) : NS_OK;
  }

  NS_IMETHOD OnAlertDismissedFromForeground() override {
    return mCallbacks ? mCallbacks->OnAlertDismissedFromForeground() : NS_OK;
  }

  NS_IMETHOD OnAlertClosed() override {
    ReportClosed();
    return mCallbacks ? mCallbacks->OnAlertClosed() : NS_OK;
  }

  NS_IMETHOD OnAlertFinished() override {
    ReportClosed();
    return mCallbacks ? mCallbacks->OnAlertFinished() : NS_OK;
  }

  NS_IMETHOD OnAlertSettings() override {
    return mCallbacks ? mCallbacks->OnAlertSettings() : NS_OK;
  }

  NS_IMETHOD OnAlertDisable() override {
    return mCallbacks ? mCallbacks->OnAlertDisable() : NS_OK;
  }

 private:
  ~AlertCaptureCallbacks() = default;

  void Notify(const char* aTopic) {
    if (nsCOMPtr<nsIObserverService> obs = services::GetObserverService()) {
      obs->NotifyObservers(mAlert, aTopic, nullptr);
    }
  }

  // Reported once, on whichever of OnAlertClosed (an explicit close) or
  // OnAlertFinished (the lifecycle ending on its own, such as a timeout)
  // arrives first; an explicit close delivers both. An alert that was never
  // shown reports nothing, because no consumer was told it existed.
  void ReportClosed() {
    if (!mShown || mClosedReported) {
      return;
    }
    mClosedReported = true;
    Notify(kWebNotificationClosedTopic);
  }

  nsCOMPtr<nsIAlertNotification> mAlert;
  nsCOMPtr<nsIAlertCallbacks> mCallbacks;
  bool mShown = false;
  bool mClosedReported = false;
};

NS_IMPL_ISUPPORTS(AlertCaptureCallbacks, nsIAlertCallbacks)

// Only web content alerts are reported, and never private browsing ones.
bool ShouldCaptureAlert(nsIAlertNotification* aAlert) {
  if (!StaticPrefs::browser_alerts_capture_enabled()) {
    return false;
  }

  bool actionable = false;
  if (NS_FAILED(aAlert->GetActionable(&actionable)) || !actionable) {
    return false;
  }

  bool inPrivateBrowsing = false;
  if (NS_FAILED(aAlert->GetInPrivateBrowsing(&inPrivateBrowsing)) ||
      inPrivateBrowsing) {
    return false;
  }

  nsCOMPtr<nsIPrincipal> principal;
  if (NS_FAILED(aAlert->GetPrincipal(getter_AddRefs(principal))) ||
      !principal) {
    return false;
  }
  return !principal->GetIsInPrivateBrowsing();
}

}  // namespace

NS_IMPL_ISUPPORTS(nsAlertsService, nsIAlertsService, nsIAlertsDoNotDisturb,
                  nsIObserver)

nsAlertsService::nsAlertsService() : mBackend(nullptr) {
  mBackend = do_GetService(NS_SYSTEMALERTSERVICE_CONTRACTID);
}

nsresult nsAlertsService::Init() {
  if (nsCOMPtr<nsIObserverService> obsServ =
          mozilla::services::GetObserverService()) {
    (void)NS_WARN_IF(
        NS_FAILED(obsServ->AddObserver(this, "last-pb-context-exited", false)));
  }

  // The shutdown callback holds a strong reference and thus makes sure this
  // runs at shutdown.
  //
  // Note that the purpose of this shutdown cleanup is to make the leak checker
  // happy, and an early exit(0) without calling it should not break anything.
  // (See also bug 1606879)
  RunOnShutdown([self = RefPtr{this}]() { self->Teardown(); });

  return NS_OK;
}

nsAlertsService::~nsAlertsService() = default;

bool nsAlertsService::ShouldShowAlert() {
  bool result = true;

#ifdef XP_WIN
  if (!xpc::IsInAutomation()) {
    QUERY_USER_NOTIFICATION_STATE qstate;
    if (SUCCEEDED(SHQueryUserNotificationState(&qstate))) {
      if (qstate != QUNS_ACCEPTS_NOTIFICATIONS) {
        result = false;
      }
    }
  }
#endif

  nsCOMPtr<nsIAlertsDoNotDisturb> alertsDND(GetDNDBackend());
  if (alertsDND) {
    bool suppressForScreenSharing = false;
    nsresult rv =
        alertsDND->GetSuppressForScreenSharing(&suppressForScreenSharing);
    if (NS_SUCCEEDED(rv)) {
      result &= !suppressForScreenSharing;
    }
  }

  return result;
}

class AlertObserverToCallbacks : public nsIAlertCallbacks {
 public:
  NS_DECL_ISUPPORTS

  AlertObserverToCallbacks(nsIObserver* aObserver, const nsAString& aCookie)
      : mObserver(aObserver), mCookie(aCookie) {
    MOZ_ASSERT(aObserver);
  }

  NS_IMETHOD OnAlertShow() override {
    return mObserver->Observe(nullptr, "alertshow", mCookie.get());
  }

  NS_IMETHOD OnAlertClick(nsIAlertAction* aAction) override {
    return mObserver->Observe(aAction, "alertclickcallback", mCookie.get());
  }

  NS_IMETHOD OnAlertDismissedFromForeground() override { return NS_OK; }

  NS_IMETHOD OnAlertClosed() override {
    return mObserver->Observe(nullptr, "alertfinished", u"close");
  }

  NS_IMETHOD OnAlertFinished() override {
    return mObserver->Observe(nullptr, "alertfinished", mCookie.get());
  }

  NS_IMETHOD OnAlertSettings() override {
    return mObserver->Observe(nullptr, "alertsettingscallback", mCookie.get());
  }

  NS_IMETHOD OnAlertDisable() override {
    return mObserver->Observe(nullptr, "alertdisablecallback", mCookie.get());
  }

 private:
  virtual ~AlertObserverToCallbacks() = default;

  nsCOMPtr<nsIObserver> mObserver;
  nsString mCookie;
};

NS_IMPL_ISUPPORTS(AlertObserverToCallbacks, nsIAlertCallbacks)

NS_IMETHODIMP nsAlertsService::ShowAlert(nsIAlertNotification* aAlert,
                                         nsIObserver* aAlertListener) {
  NS_ENSURE_ARG(aAlert);

  nsAutoString cookie;
  nsresult rv = aAlert->GetCookie(cookie);
  NS_ENSURE_SUCCESS(rv, rv);

  RefPtr<nsIAlertCallbacks> callbacks;
  if (aAlertListener) {
    callbacks = new AlertObserverToCallbacks(aAlertListener, cookie);
  }
  return ShowAlertWithCallbacks(aAlert, callbacks);
}

NS_IMETHODIMP nsAlertsService::ShowAlertWithCallbacks(
    nsIAlertNotification* aAlert, nsIAlertCallbacks* aAlertCallbacks) {
  NS_ENSURE_ARG(aAlert);

  if (AppShutdown::IsInOrBeyond(ShutdownPhase::AppShutdownConfirmed)) {
    // Bailing out without calling alertfinished, because we do not want to
    // propagate an error to observers during shutdown.
    return NS_OK;
  }

  nsCOMPtr<nsIAlertCallbacks> effectiveCallbacks(aAlertCallbacks);
  if (ShouldCaptureAlert(aAlert)) {
    effectiveCallbacks = new AlertCaptureCallbacks(aAlert, aAlertCallbacks);
  }

  // Check if there is an optional service that handles system-level
  // notifications
  if (StaticPrefs::alerts_useSystemBackend()) {
    if (!mBackend) {
      return NS_ERROR_NOT_AVAILABLE;
    }
    return mBackend->ShowAlertWithCallbacks(aAlert, effectiveCallbacks);
  }

  if (!ShouldShowAlert()) {
    // Do not display the alert. Instead call alertfinished and get out.
    if (effectiveCallbacks) {
      effectiveCallbacks->OnAlertFinished();
    }
    return NS_OK;
  }

  // Use XUL notifications as a fallback if above methods have failed.
  nsCOMPtr<nsIAlertsService> xulBackend(nsXULAlerts::GetInstance());
  NS_ENSURE_TRUE(xulBackend, NS_ERROR_FAILURE);
  return xulBackend->ShowAlertWithCallbacks(aAlert, effectiveCallbacks);
}

NS_IMETHODIMP nsAlertsService::CloseAlert(const nsAString& aAlertName,
                                          bool aContextClosed) {
  if (!StaticPrefs::alerts_useSystemBackend()) {
    nsCOMPtr<nsIAlertsService> xulBackend(nsXULAlerts::GetInstance());
    NS_ENSURE_TRUE(xulBackend, NS_ERROR_FAILURE);
    return xulBackend->CloseAlert(aAlertName, aContextClosed);
  }
  if (!mBackend) {
    return NS_ERROR_NOT_AVAILABLE;
  }

  return mBackend->CloseAlert(aAlertName, aContextClosed);
}

NS_IMETHODIMP nsAlertsService::GetHistory(nsTArray<nsString>& aResult) {
  if (!mBackend) {
    return NS_OK;
  }

  return mBackend->GetHistory(aResult);
}

// nsIAlertsDoNotDisturb
NS_IMETHODIMP nsAlertsService::GetManualDoNotDisturb(bool* aRetVal) {
#ifdef MOZ_WIDGET_ANDROID
  return NS_ERROR_NOT_IMPLEMENTED;
#else
  nsCOMPtr<nsIAlertsDoNotDisturb> alertsDND(GetDNDBackend());
  NS_ENSURE_TRUE(alertsDND, NS_ERROR_NOT_IMPLEMENTED);
  return alertsDND->GetManualDoNotDisturb(aRetVal);
#endif
}

NS_IMETHODIMP nsAlertsService::SetManualDoNotDisturb(bool aDoNotDisturb) {
#ifdef MOZ_WIDGET_ANDROID
  return NS_ERROR_NOT_IMPLEMENTED;
#else
  nsCOMPtr<nsIAlertsDoNotDisturb> alertsDND(GetDNDBackend());
  NS_ENSURE_TRUE(alertsDND, NS_ERROR_NOT_IMPLEMENTED);

  return alertsDND->SetManualDoNotDisturb(aDoNotDisturb);
#endif
}

NS_IMETHODIMP nsAlertsService::GetSuppressForScreenSharing(bool* aRetVal) {
#ifdef MOZ_WIDGET_ANDROID
  return NS_ERROR_NOT_IMPLEMENTED;
#else
  nsCOMPtr<nsIAlertsDoNotDisturb> alertsDND(GetDNDBackend());
  NS_ENSURE_TRUE(alertsDND, NS_ERROR_NOT_IMPLEMENTED);
  return alertsDND->GetSuppressForScreenSharing(aRetVal);
#endif
}

NS_IMETHODIMP nsAlertsService::SetSuppressForScreenSharing(bool aSuppress) {
#ifdef MOZ_WIDGET_ANDROID
  return NS_ERROR_NOT_IMPLEMENTED;
#else
  nsCOMPtr<nsIAlertsDoNotDisturb> alertsDND(GetDNDBackend());
  NS_ENSURE_TRUE(alertsDND, NS_ERROR_NOT_IMPLEMENTED);
  return alertsDND->SetSuppressForScreenSharing(aSuppress);
#endif
}

already_AddRefed<nsIAlertsDoNotDisturb> nsAlertsService::GetDNDBackend() {
  nsCOMPtr<nsIAlertsService> backend;
  // Try the system notification service.
  if (StaticPrefs::alerts_useSystemBackend()) {
    backend = mBackend;
  }
  if (!backend) {
    backend = nsXULAlerts::GetInstance();
  }

  nsCOMPtr<nsIAlertsDoNotDisturb> alertsDND(do_QueryInterface(backend));
  return alertsDND.forget();
}

NS_IMETHODIMP nsAlertsService::Observe(nsISupports* aSubject,
                                       const char* aTopic,
                                       const char16_t* aData) {
  nsDependentCString topic(aTopic);
  if (topic == "last-pb-context-exited"_ns) {
    return PbmTeardown();
  }
  return NS_OK;
}

NS_IMETHODIMP nsAlertsService::Teardown() {
  nsCOMPtr<nsIAlertsService> backend;
  // Try the system notification service.
  if (StaticPrefs::alerts_useSystemBackend()) {
    backend = mBackend;
  }
  if (!backend) {
    // We do not try nsXULAlerts here as it already uses ClearOnShutdown.
    return NS_OK;
  }
  return backend->Teardown();
}

NS_IMETHODIMP nsAlertsService::PbmTeardown() {
  nsCOMPtr<nsIAlertsService> backend;
  // Try the system notification service.
  if (StaticPrefs::alerts_useSystemBackend()) {
    backend = mBackend;
  }
  if (!backend) {
    backend = nsXULAlerts::GetInstance();
  }
  return backend->PbmTeardown();
}

NS_IMETHODIMP nsAlertsService::IsFullscreen(bool* aRetVal) {
  *aRetVal = false;
  if (mBackend) {
    return mBackend->IsFullscreen(aRetVal);
  }
  return NS_OK;
}
