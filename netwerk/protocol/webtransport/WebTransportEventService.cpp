/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "WebTransportEventService.h"
#include "nsThreadUtils.h"
#include "nsIObserverService.h"
#include "mozilla/StaticPtr.h"
#include "mozilla/Services.h"
#include "nsISupportsPrimitives.h"

namespace mozilla {
namespace net {

namespace {

StaticRefPtr<WebTransportEventService> gWebTransportEventService;

}  // anonymous namespace

/* static */
already_AddRefed<WebTransportEventService>
WebTransportEventService::GetOrCreate() {
  MOZ_ASSERT(NS_IsMainThread());

  if (!gWebTransportEventService) {
    gWebTransportEventService = new WebTransportEventService();
  }

  RefPtr<WebTransportEventService> service = gWebTransportEventService.get();
  return service.forget();
}

NS_INTERFACE_MAP_BEGIN(WebTransportEventService)
  NS_INTERFACE_MAP_ENTRY_AMBIGUOUS(nsISupports, nsIWebTransportEventService)
  NS_INTERFACE_MAP_ENTRY(nsIObserver)
  NS_INTERFACE_MAP_ENTRY(nsIWebTransportEventService)
NS_INTERFACE_MAP_END

NS_IMPL_ADDREF(WebTransportEventService)
NS_IMPL_RELEASE(WebTransportEventService)

WebTransportEventService::WebTransportEventService() : mCountListeners(0) {
  MOZ_ASSERT(NS_IsMainThread());

  nsCOMPtr<nsIObserverService> obs = mozilla::services::GetObserverService();
  if (obs) {
    obs->AddObserver(this, "xpcom-shutdown", false);
    obs->AddObserver(this, "inner-window-destroyed", false);
  }
}

WebTransportEventService::~WebTransportEventService() {
  MOZ_ASSERT(NS_IsMainThread());
}

NS_IMETHODIMP
WebTransportEventService::AddListener(uint64_t aInnerWindowID,
                                      nsIWebTransportEventListener* aListener) {
  MOZ_ASSERT(NS_IsMainThread());

  if (!aListener) {
    return NS_ERROR_INVALID_ARG;
  }

  ++mCountListeners;

  WindowListener* listener = mWindows.GetOrInsertNew(aInnerWindowID);

  listener->mListeners.AppendElement(aListener);

  return NS_OK;
}

NS_IMETHODIMP
WebTransportEventService::RemoveListener(
    uint64_t aInnerWindowID, nsIWebTransportEventListener* aListener) {
  MOZ_ASSERT(NS_IsMainThread());

  if (!aListener) {
    return NS_ERROR_INVALID_ARG;
  }

  WindowListener* listener = mWindows.Get(aInnerWindowID);
  if (!listener) {
    return NS_ERROR_FAILURE;
  }

  if (!listener->mListeners.RemoveElement(aListener)) {
    return NS_ERROR_FAILURE;
  }

  // The last listener for this window.
  if (listener->mListeners.IsEmpty()) {
    mWindows.Remove(aInnerWindowID);
  }

  MOZ_ASSERT(mCountListeners);
  --mCountListeners;

  return NS_OK;
}

NS_IMETHODIMP
WebTransportEventService::HasListenerFor(uint64_t aInnerWindowID,
                                         bool* aResult) {
  MOZ_ASSERT(NS_IsMainThread());

  *aResult = mWindows.Get(aInnerWindowID);

  return NS_OK;
}

NS_IMETHODIMP
WebTransportEventService::Observe(nsISupports* aSubject, const char* aTopic,
                                  const char16_t* aData) {
  MOZ_ASSERT(NS_IsMainThread());

  if (!strcmp(aTopic, "xpcom-shutdown")) {
    Shutdown();
    return NS_OK;
  }

  if (!strcmp(aTopic, "inner-window-destroyed") && HasListeners()) {
    nsCOMPtr<nsISupportsPRUint64> wrapper = do_QueryInterface(aSubject);
    NS_ENSURE_TRUE(wrapper, NS_ERROR_FAILURE);

    uint64_t innerWindowID;
    nsresult rv = wrapper->GetData(&innerWindowID);
    NS_ENSURE_SUCCESS(rv, rv);

    WindowListener* listener = mWindows.Get(innerWindowID);
    if (!listener) {
      return NS_OK;
    }

    MOZ_ASSERT(mCountListeners >= listener->mListeners.Length());
    mCountListeners -= listener->mListeners.Length();
    mWindows.Remove(innerWindowID);
    return NS_OK;
  }
  return NS_ERROR_FAILURE;
}

bool WebTransportEventService::HasListeners() const {
  return !!mCountListeners;
}

void WebTransportEventService::Shutdown() {
  MOZ_ASSERT(NS_IsMainThread());
  if (gWebTransportEventService) {
    nsCOMPtr<nsIObserverService> obs = mozilla::services::GetObserverService();
    if (obs) {
      obs->RemoveObserver(gWebTransportEventService, "xpcom-shutdown");
      obs->RemoveObserver(gWebTransportEventService, "inner-window-destroyed");
    }

    mWindows.Clear();
    gWebTransportEventService = nullptr;
  }
}

}  // namespace net
}  // namespace mozilla
