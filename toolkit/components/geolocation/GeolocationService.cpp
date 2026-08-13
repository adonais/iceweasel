/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "GeolocationService.h"

#include "mozilla/Services.h"
#include "mozilla/StaticPrefs_geo.h"
#include "mozilla/glean/DomGeolocationMetrics.h"
#include "nsComponentManagerUtils.h"
#include "nsServiceManagerUtils.h"

#ifdef MOZ_WIDGET_ANDROID
#  include "AndroidLocationProvider.h"
#endif

#ifdef MOZ_ENABLE_DBUS
#  include "GeoclueLocationProvider.h"
#  include "PortalLocationProvider.h"
#  include "mozilla/WidgetUtilsGtk.h"
#endif

#ifdef MOZ_WIDGET_COCOA
#  include "CoreLocationLocationProvider.h"
#endif

#ifdef XP_WIN
#  include "WindowsLocationProvider.h"
#endif

// XXX(krosylight): We should stop directly involving child process and
// Geolocation API here. See also bug 2037074.
#include "mozilla/dom/ContentChild.h"
#include "mozilla/dom/Geolocation.h"
#include "mozilla/dom/GeolocationPositionErrorBinding.h"

using namespace mozilla;
using namespace mozilla::dom;

mozilla::LazyLogModule gGeolocationLog("Geolocation");

////////////////////////////////////////////////////
// GeolocationService
////////////////////////////////////////////////////
NS_INTERFACE_MAP_BEGIN(GeolocationService)
  NS_INTERFACE_MAP_ENTRY_AMBIGUOUS(nsISupports, nsIGeolocationUpdate)
  NS_INTERFACE_MAP_ENTRY(nsIGeolocationService)
  NS_INTERFACE_MAP_ENTRY(nsIGeolocationUpdate)
  NS_INTERFACE_MAP_ENTRY(nsIObserver)
NS_INTERFACE_MAP_END

NS_IMPL_ADDREF(GeolocationService)
NS_IMPL_RELEASE(GeolocationService)

nsresult GeolocationService::Init() {
  if (!StaticPrefs::geo_enabled()) {
    return NS_ERROR_FAILURE;
  }

  if (XRE_IsContentProcess()) {
    return NS_OK;
  }

  // geolocation service can be enabled -> now register observer
  nsCOMPtr<nsIObserverService> obs = services::GetObserverService();
  if (!obs) {
    return NS_ERROR_FAILURE;
  }

  obs->AddObserver(this, "xpcom-shutdown", false);

#ifdef MOZ_WIDGET_ANDROID
  mProvider = new AndroidLocationProvider();
#endif

#ifdef MOZ_WIDGET_GTK
#  ifdef MOZ_ENABLE_DBUS
  if (!mProvider && widget::ShouldUsePortal(widget::PortalKind::Location)) {
    mProvider = new PortalLocationProvider();
    MOZ_LOG(gGeolocationLog, LogLevel::Debug,
            ("Selected PortalLocationProvider"));
    glean::geolocation::linux_provider
        .EnumGet(glean::geolocation::LinuxProviderLabel::ePortal)
        .Set(true);
  }

  if (!mProvider && StaticPrefs::geo_provider_use_geoclue()) {
    nsCOMPtr<nsIGeolocationProvider> gcProvider = new GeoclueLocationProvider();
    MOZ_LOG(gGeolocationLog, LogLevel::Debug,
            ("Checking GeoclueLocationProvider"));
    // The Startup() method will only succeed if Geoclue is available on D-Bus
    if (NS_SUCCEEDED(gcProvider->Startup())) {
      gcProvider->Shutdown();
      mProvider = std::move(gcProvider);
      MOZ_LOG(gGeolocationLog, LogLevel::Debug,
              ("Selected GeoclueLocationProvider"));
      glean::geolocation::linux_provider
          .EnumGet(glean::geolocation::LinuxProviderLabel::eGeoclue)
          .Set(true);
    }
  }
#  endif
#endif

#ifdef MOZ_WIDGET_COCOA
  if (Preferences::GetBool("geo.provider.use_corelocation", true)) {
    mProvider = new CoreLocationLocationProvider();
  }
#endif

#ifdef XP_WIN
  if (Preferences::GetBool("geo.provider.ms-windows-location", false)) {
    mProvider = new WindowsLocationProvider();
  }
#endif

  if (Preferences::GetBool("geo.provider.use_mls", false)) {
    mProvider = do_CreateInstance("@mozilla.org/geolocation/mls-provider;1");
  }

  // Override platform-specific providers with the default (network)
  // provider while testing. Our tests are currently not meant to exercise
  // the provider, and some tests rely on the network provider being used.
  // "geo.provider.testing" is always set for all plain and browser chrome
  // mochitests, and also for xpcshell tests.
  if (!mProvider || Preferences::GetBool("geo.provider.testing", false)) {
    nsCOMPtr<nsIGeolocationProvider> geoTestProvider =
        do_GetService(NS_GEOLOCATION_PROVIDER_CONTRACTID);

    if (geoTestProvider) {
      mProvider = std::move(geoTestProvider);
    }
  }

  return NS_OK;
}

GeolocationService::~GeolocationService() = default;

NS_IMETHODIMP
GeolocationService::Observe(nsISupports* aSubject, const char* aTopic,
                            const char16_t* aData) {
  if (!strcmp("xpcom-shutdown", aTopic)) {
    nsCOMPtr<nsIObserverService> obs = services::GetObserverService();
    if (obs) {
      obs->RemoveObserver(this, "xpcom-shutdown");
    }

    for (uint32_t i = 0; i < mGeolocators.Length(); i++) {
      mGeolocators[i]->Shutdown();
    }
    StopDevice();

    return NS_OK;
  }

  if (!strcmp("timer-callback", aTopic)) {
    // decide if we can close down the service.
    for (uint32_t i = 0; i < mGeolocators.Length(); i++)
      if (mGeolocators[i]->HasActiveCallbacks()) {
        SetDisconnectTimer();
        return NS_OK;
      }

    // okay to close up.
    StopDevice();
    Update(nullptr);
    return NS_OK;
  }

  return NS_ERROR_FAILURE;
}

NS_IMETHODIMP
GeolocationService::Update(nsIDOMGeoPosition* aSomewhere) {
  if (aSomewhere) {
    mStarting.reset();
    SetCachedPosition(aSomewhere);
  }

  for (uint32_t i = 0; i < mGeolocators.Length(); i++) {
    mGeolocators[i]->Update(aSomewhere);
  }

  return NS_OK;
}

NS_IMETHODIMP
GeolocationService::NotifyError(uint16_t aErrorCode) {
  MOZ_LOG(gGeolocationLog, LogLevel::Debug,
          ("GeolocationService::NotifyError with error code: %u", aErrorCode));
  // nsTArray doesn't have a constructors that takes a different-type TArray.
  nsTArray<RefPtr<Geolocation>> geolocators;
  geolocators.AppendElements(mGeolocators);
  for (uint32_t i = 0; i < geolocators.Length(); i++) {
    // MOZ_KnownLive because the stack array above keeps it alive.
    MOZ_KnownLive(geolocators[i])->NotifyError(aErrorCode);
  }
  return NS_OK;
}

void GeolocationService::SetCachedPosition(nsIDOMGeoPosition* aPosition) {
  mLastPosition.position = aPosition;
  mLastPosition.isHighAccuracy = mHigherAccuracy;
}

CachedPositionAndAccuracy GeolocationService::GetCachedPosition() {
  return mLastPosition;
}

nsresult GeolocationService::StartDevice() {
  if (!StaticPrefs::geo_enabled()) {
    return NS_ERROR_NOT_AVAILABLE;
  }

  // We do not want to keep the geolocation devices online
  // indefinitely.
  // Close them down after a reasonable period of inactivity.
  SetDisconnectTimer();

  if (XRE_IsContentProcess()) {
    bool highAccuracyRequested = HighAccuracyRequested();
    if (mStarting.isSome() && *mStarting == highAccuracyRequested) {
      // Already being started
      return NS_OK;
    }
    mStarting = Some(highAccuracyRequested);
    ContentChild* cpc = ContentChild::GetSingleton();
    if (!cpc->SendAddGeolocationListener(highAccuracyRequested)) {
      return NS_ERROR_NOT_AVAILABLE;
    }
    return NS_OK;
  }

  // Start them up!
  nsCOMPtr<nsIObserverService> obs = services::GetObserverService();
  if (!obs) {
    return NS_ERROR_FAILURE;
  }

  if (!mProvider) {
    return NS_ERROR_FAILURE;
  }

  nsresult rv;

  if (NS_FAILED(rv = mProvider->Startup()) ||
      NS_FAILED(rv = mProvider->Watch(this))) {
    NotifyError(GeolocationPositionError_Binding::POSITION_UNAVAILABLE);
    return rv;
  }

  obs->NotifyObservers(mProvider, "geolocation-device-events", u"starting");

  return NS_OK;
}

void GeolocationService::SetDisconnectTimer() {
  if (!mDisconnectTimer) {
    mDisconnectTimer = NS_NewTimer();
  } else {
    mDisconnectTimer->Cancel();
  }

  mDisconnectTimer->Init(this, StaticPrefs::geo_timeout(),
                         nsITimer::TYPE_ONE_SHOT);
}

bool GeolocationService::HighAccuracyRequested() {
  for (uint32_t i = 0; i < mGeolocators.Length(); i++) {
    if (mGeolocators[i]->HighAccuracyRequested()) {
      return true;
    }
  }

  return false;
}

void GeolocationService::UpdateAccuracy(bool aForceHigh) {
  bool highRequired = aForceHigh || HighAccuracyRequested();

  if (XRE_IsContentProcess()) {
    ContentChild* cpc = ContentChild::GetSingleton();
    if (cpc->IsAlive()) {
      cpc->SendSetGeolocationHigherAccuracy(highRequired);
    }

    return;
  }

  mProvider->SetHighAccuracy(!mHigherAccuracy && highRequired);
  mHigherAccuracy = highRequired;
}

NS_IMETHODIMP GeolocationService::StopDevice() {
  if (mDisconnectTimer) {
    mDisconnectTimer->Cancel();
    mDisconnectTimer = nullptr;
  }

  if (XRE_IsContentProcess()) {
    mStarting.reset();
    ContentChild* cpc = ContentChild::GetSingleton();
    cpc->SendRemoveGeolocationListener();

    return NS_OK;  // bail early
  }

  nsCOMPtr<nsIObserverService> obs = services::GetObserverService();
  if (!obs) {
    return NS_OK;
  }

  if (!mProvider) {
    return NS_OK;
  }

  mHigherAccuracy = false;

  mProvider->Shutdown();
  obs->NotifyObservers(mProvider, "geolocation-device-events", u"shutdown");

  return NS_OK;
}

StaticRefPtr<GeolocationService> GeolocationService::sService;

already_AddRefed<GeolocationService> GeolocationService::GetGeolocationService(
    mozilla::dom::BrowsingContext* aBrowsingContext) {
  RefPtr<GeolocationService> result;
  if (aBrowsingContext) {
    result = aBrowsingContext->GetGeolocationServiceOverride();

    if (result) {
      return result.forget();
    }
  }
  if (GeolocationService::sService) {
    result = GeolocationService::sService;

    return result.forget();
  }

  result = new GeolocationService();
  if (NS_FAILED(result->Init())) {
    return nullptr;
  }

  ClearOnShutdown(&GeolocationService::sService);
  GeolocationService::sService = result;
  return result.forget();
}

void GeolocationService::AddLocator(Geolocation* aLocator) {
  mGeolocators.AppendElement(aLocator);
}

void GeolocationService::RemoveLocator(Geolocation* aLocator) {
  mGeolocators.RemoveElement(aLocator);
}

void GeolocationService::MoveLocators(GeolocationService* aService) {
  for (Geolocation* loc : mGeolocators) {
    aService->AddLocator(loc);
    loc->SetService(aService);
  }

  mGeolocators.Clear();
}
