/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "GeckoProcessManager.h"

#include "mozilla/Services.h"
#include "nsISupportsImpl.h"

namespace mozilla {

/* static */ void GeckoProcessManager::Init() {
  BaseNatives::Init();
  ConnectionManager::Init();
}

// static
void GeckoProcessManager::GetEditableParent(jni::Object::Param aEditableChild,
                                            int32_t aContentId,
                                            int64_t aTabId) {
  nsCOMPtr<nsIWidget> widget = GetWidget(aContentId, aTabId);
  if (RefPtr<nsWindow> window = nsWindow::From(widget)) {
    java::GeckoProcessManager::SetEditableChildParent(
        aEditableChild, window->GetEditableParent());
    return;
  }

  NS_WARNING("GeckoProcessManager::GetEditableParent FAILED");
}

NS_IMPL_ISUPPORTS(GeckoProcessManager::ConnectionManager, nsIObserver)

NS_IMETHODIMP GeckoProcessManager::ConnectionManager::Observe(
    nsISupports* aSubject, const char* aTopic, const char16_t* aData) {
  java::GeckoProcessManager::ConnectionManager::LocalRef connMgr(mJavaConnMgr);
  if (!connMgr) {
    return NS_OK;
  }

  if (!strcmp("application-foreground", aTopic)) {
    connMgr->OnForeground();
    return NS_OK;
  }

  if (!strcmp("application-background", aTopic)) {
    connMgr->OnBackground();
    return NS_OK;
  }

  return NS_OK;
}

/* static */ void GeckoProcessManager::ConnectionManager::AttachTo(
    java::GeckoProcessManager::ConnectionManager::Param aInstance) {
  RefPtr<ConnectionManager> native(new ConnectionManager());
  BaseNatives::AttachNative(aInstance, native);

  native->mJavaConnMgr = aInstance;

  nsCOMPtr<nsIObserverService> obsServ(services::GetObserverService());
  obsServ->AddObserver(native, "application-background", false);
  obsServ->AddObserver(native, "application-foreground", false);
}

}  // namespace mozilla
