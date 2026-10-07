/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef DOM_NOTIFICATION_NOTIFICATIONUTILS_H_
#define DOM_NOTIFICATION_NOTIFICATIONUTILS_H_

#include <cstdint>

#include "mozilla/dom/DOMTypes.h"
#include "nsCOMPtr.h"
#include "nsIAlertsService.h"
#include "nsINotificationStorage.h"
#include "nsStringFwd.h"

enum class nsresult : uint32_t;
class nsIAlertCallbacks;
class nsIAlertNotification;
class nsIPrincipal;
class nsINotificationStorage;
namespace mozilla::dom {
enum class NotificationPermission : uint8_t;
class Document;
}  // namespace mozilla::dom

namespace mozilla::dom::notification {

// The spec defines maxActions to depend on system limitation, but that can be
// used for fingerprinting.
// See also https://github.com/whatwg/notifications/issues/110.
static constexpr uint8_t kMaxActions = 2;

/**
 * Retrieves raw notification permission directly from PermissionManager.
 */
NotificationPermission GetRawNotificationPermission(nsIPrincipal* aPrincipal);

enum class PermissionCheckPurpose : uint8_t {
  PermissionRequest,
  PermissionAttribute,
  NotificationShow,
  LoadImageForShow,
};

/**
 * Returns true if the current principal must be given notification
 * permission, regardless of the permission status. This one should be dominant
 * compared to FobbiddenFor below.
 */
bool IsNotificationAllowedFor(nsIPrincipal* aPrincipal);

/**
 * Returns true if the current principal must not be given notification
 * permission, regardless of the permission status.
 *
 * @param aRequestorDoc The Document object from the page requesting permission.
 *                      Pass only when this is for requestNotification().
 */
bool IsNotificationForbiddenFor(nsIPrincipal* aPrincipal,
                                nsIPrincipal* aEffectiveStoragePrincipal,
                                bool isSecureContext,
                                PermissionCheckPurpose aPurpose,
                                Document* aRequestorDoc = nullptr);

/**
 * Retrieves notification permission based on the context.
 */
NotificationPermission GetNotificationPermission(
    nsIPrincipal* aPrincipal, nsIPrincipal* aEffectiveStoragePrincipal,
    bool isSecureContext, PermissionCheckPurpose aPurpose);

using NotificationPermissionPromise = MozPromise<Ok, nsresult, false>;
// Check notification permission and check aPrincipal against Safe Browsing
// list (removes notification permission if it is on it).
// Resolves if notifications are allowed, rejects otherwise.
RefPtr<NotificationPermissionPromise> EnsureValidNotificationPermission(
    nsIPrincipal* aPrincipal, nsIPrincipal* aEffectiveStoragePrincipal,
    bool aIsSecureContext);

nsCOMPtr<nsINotificationStorage> GetNotificationStorage(bool isPrivate);

using NotificationsPromise =
    MozPromise<CopyableTArray<IPCNotification>, nsresult, false>;

already_AddRefed<NotificationsPromise> GetStoredNotificationsForScope(
    nsIPrincipal* aPrincipal, const nsACString& aScope, const nsAString& aTag);

nsresult GetOrigin(nsIPrincipal* aPrincipal, nsString& aOrigin);

nsresult PersistNotification(nsIPrincipal* aPrincipal,
                             const IPCNotification& aNotification,
                             const nsString& aScope);
nsresult UnpersistNotification(nsIPrincipal* aPrincipal, const nsString& aId);
Result<nsCOMPtr<nsIAlertNotification>, nsresult> CreateAlertForNotification(
    const IPCNotificationOptions& aOptions, nsIPrincipal& aPrincipal,
    Maybe<IPCImage>&& aIcon);

// Common nsIAlertCallbacks handling between DWP and non-DWP notifications.
class NotificationCallbacksCommon : public nsIAlertCallbacks {
 public:
  NS_DECL_ISUPPORTS
  NS_DECL_NSIALERTCALLBACKS

  NotificationCallbacksCommon(const nsAString& aScope, nsIPrincipal* aPrincipal,
                              IPCNotification aNotification);

 protected:
  virtual ~NotificationCallbacksCommon() = 0;

  void PersistNotification();
  void UnpersistNotification();
  nsresult RespondOnClick(nsIAlertAction* aAction);
  void RecordAlertShowTelemetry();
  // May want to replace with SWR ID, see bug 1881812
  nsString mScope;
  nsCOMPtr<nsIPrincipal> mPrincipal;
  IPCNotification mNotification;

  Maybe<nsCString> mCategory;
  bool mShown = false;
  bool mClicked = false;
};

enum class CloseMode {
  CloseMethod,
  // Either on global teardown or freeze
  InactiveGlobal,
};
void UnregisterNotification(nsIPrincipal* aPrincipal, const nsString& aId);

// Show an alert and clean up any previously stored notifications that
// aren't currently known to the notification backend.
//
// The cleanup happens when this is globally the first call, or always if
// dom.webnotifications.testing.force_storage_cleanup.enabled is set.
nsresult ShowAlertWithCleanup(nsIAlertNotification* aAlert,
                              nsIAlertCallbacks* aAlertCallbacks);

nsresult RemovePermission(nsIPrincipal* aPrincipal);
nsresult OpenSettings(nsIPrincipal* aPrincipal);

enum class NotificationStatusChange { Shown, Closed };
nsresult AdjustPushQuota(nsIPrincipal* aPrincipal,
                         NotificationStatusChange aChange);

class NotificationActionStorageEntry
    : public nsINotificationActionStorageEntry {
 public:
  NS_DECL_ISUPPORTS
  NS_DECL_NSINOTIFICATIONACTIONSTORAGEENTRY
  explicit NotificationActionStorageEntry(
      const IPCNotificationAction& aIPCAction)
      : mIPCAction(aIPCAction) {}

  static Result<IPCNotificationAction, nsresult> ToIPC(
      nsINotificationActionStorageEntry& aEntry);

 private:
  virtual ~NotificationActionStorageEntry() = default;

  IPCNotificationAction mIPCAction;
};

class NotificationStorageEntry : public nsINotificationStorageEntry {
 public:
  NS_DECL_ISUPPORTS
  NS_DECL_NSINOTIFICATIONSTORAGEENTRY
  explicit NotificationStorageEntry(const IPCNotification& aIPCNotification)
      : mIPCNotification(aIPCNotification) {}

  static Result<IPCNotification, nsresult> ToIPC(
      nsINotificationStorageEntry& aEntry);

 private:
  virtual ~NotificationStorageEntry() = default;

  IPCNotification mIPCNotification;
};

}  // namespace mozilla::dom::notification

#endif  // DOM_NOTIFICATION_NOTIFICATIONUTILS_H_
