/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef nsXULAlerts_h_
#define nsXULAlerts_h_

#include "nsCycleCollectionParticipant.h"
#include "nsHashKeys.h"
#include "nsInterfaceHashtable.h"

#include "mozIDOMWindow.h"
#include "nsIAlertsService.h"
#include "nsIObserver.h"

struct PendingAlert {
  void Init(nsIAlertNotification* aAlert, nsIAlertCallbacks* aCallbacks) {
    mAlert = aAlert;
    mCallbacks = aCallbacks;
  }
  nsCOMPtr<nsIAlertNotification> mAlert;
  nsCOMPtr<nsIAlertCallbacks> mCallbacks;
};

class nsXULAlerts : public nsIAlertsService, public nsIAlertsDoNotDisturb {
  friend class nsXULAlertCallbacks;

 public:
  NS_DECL_NSIALERTSDONOTDISTURB
  NS_DECL_NSIALERTSSERVICE
  NS_DECL_ISUPPORTS

  nsXULAlerts() = default;

  static already_AddRefed<nsXULAlerts> GetInstance();

 protected:
  virtual ~nsXULAlerts() = default;
  void PersistentAlertFinished();
  nsresult ShowAlertImpl(nsIAlertNotification* aAlert,
                         nsIAlertCallbacks* aAlertListener);

  nsInterfaceHashtable<nsStringHashKey, mozIDOMWindowProxy> mNamedWindows;
  uint32_t mPersistentAlertCount = 0;
  nsTArray<PendingAlert> mPendingPersistentAlerts;
  bool mDoNotDisturb = false;

 private:
  bool mSuppressForScreenSharing = false;
};

/**
 * This class wraps observers for alerts and watches
 * for the "alertfinished" event in order to release
 * the reference on the nsIDOMWindow of the XUL alert.
 */
class nsXULAlertCallbacks : public nsIAlertCallbacks {
 public:
  NS_DECL_CYCLE_COLLECTING_ISUPPORTS
  NS_DECL_NSIALERTCALLBACKS
  NS_DECL_CYCLE_COLLECTION_CLASS(nsXULAlertCallbacks)

  nsXULAlertCallbacks(nsXULAlerts* aXULAlerts, const nsAString& aAlertName,
                      nsIAlertCallbacks* aCallbacks, bool aIsPersistent)
      : mXULAlerts(aXULAlerts),
        mAlertName(aAlertName),
        mCallbacks(aCallbacks),
        mIsPersistent(aIsPersistent) {}

  void SetAlertWindow(mozIDOMWindowProxy* aWindow) { mAlertWindow = aWindow; }

 protected:
  virtual ~nsXULAlertCallbacks() = default;

  RefPtr<nsXULAlerts> mXULAlerts;
  nsString mAlertName;
  nsCOMPtr<mozIDOMWindowProxy> mAlertWindow;
  nsCOMPtr<nsIAlertCallbacks> mCallbacks;
  bool mIsPersistent;
};

#endif /* nsXULAlerts_h_ */
