/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef TOOLKIT_COMPONENTS_GEOLOCATIONS_GEOLOCATIONSERVICE_H_
#define TOOLKIT_COMPONENTS_GEOLOCATIONS_GEOLOCATIONSERVICE_H_

#include "mozilla/WeakPtr.h"
#include "nsCOMPtr.h"
#include "nsIGeolocationProvider.h"
#include "nsIGeolocationService.h"
#include "nsIObserver.h"

class nsIDOMGeoPosition;
class nsITimer;
namespace mozilla::dom {
class BrowsingContext;
class Geolocation;
}  // namespace mozilla::dom

struct CachedPositionAndAccuracy {
  nsCOMPtr<nsIDOMGeoPosition> position;
  bool isHighAccuracy;
};

namespace mozilla {

/**
 * Singleton that manages the geolocation provider
 */
class GeolocationService final : public nsIGeolocationService,
                                 public nsIGeolocationUpdate,
                                 public nsIObserver {
 public:
  static already_AddRefed<GeolocationService> GetGeolocationService(
      mozilla::dom::BrowsingContext* browsingContext = nullptr);
  static mozilla::StaticRefPtr<GeolocationService> sService;

  NS_DECL_THREADSAFE_ISUPPORTS
  NS_DECL_NSIGEOLOCATIONUPDATE
  NS_DECL_NSIOBSERVER

  GeolocationService() = default;

  nsresult Init();

  // Management of the Geolocation objects
  void AddLocator(mozilla::dom::Geolocation* aLocator);
  void RemoveLocator(mozilla::dom::Geolocation* aLocator);

  // Move locators from service override to the original service.
  void MoveLocators(GeolocationService* aService);

  void SetCachedPosition(nsIDOMGeoPosition* aPosition);
  CachedPositionAndAccuracy GetCachedPosition();

  // Find and startup a geolocation device (gps, nmea, etc.)
  MOZ_CAN_RUN_SCRIPT nsresult StartDevice();

  // Stop the started geolocation device (gps, nmea, etc.)
  NS_IMETHOD StopDevice() override;

  // create, or reinitialize the callback timer
  void SetDisconnectTimer();

  // Update the accuracy and notify the provider if changed
  void UpdateAccuracy(bool aForceHigh = false);
  bool HighAccuracyRequested();

 private:
  ~GeolocationService();

  // Disconnect timer.  When this timer expires, it clears all pending callbacks
  // and closes down the provider, unless we are watching a point, and in that
  // case, we disable the disconnect timer.
  nsCOMPtr<nsITimer> mDisconnectTimer;

  // The object providing geo location information to us.
  nsCOMPtr<nsIGeolocationProvider> mProvider;

  // mGeolocators are not owned here.  Their constructor
  // adds them to this list, and their destructor removes
  // them from this list.
  nsTArray<mozilla::WeakPtr<mozilla::dom::Geolocation>> mGeolocators;

  // This is the last geo position that we have seen.
  CachedPositionAndAccuracy mLastPosition;

  // Current state of requests for higher accuracy
  bool mHigherAccuracy = false;

  // Whether the geolocation device is starting.
  // Nothing() if not being started, or a boolean reflecting the requested
  // accuracy.
  mozilla::Maybe<bool> mStarting;
};

}  // namespace mozilla

#endif  // TOOLKIT_COMPONENTS_GEOLOCATIONS_GEOLOCATIONSERVICE_H_
