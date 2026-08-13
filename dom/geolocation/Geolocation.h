/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_dom_Geolocation_h
#define mozilla_dom_Geolocation_h

// Microsoft's API Name hackery sucks
#undef CreateEvent

#include "GeolocationCoordinates.h"
#include "GeolocationPosition.h"
#include "GeolocationSystem.h"
#include "mozilla/Attributes.h"
#include "mozilla/WeakPtr.h"
#include "mozilla/dom/BindingDeclarations.h"
#include "mozilla/dom/CallbackObject.h"
#include "mozilla/dom/GeolocationBinding.h"
#include "nsCOMPtr.h"
#include "nsCycleCollectionParticipant.h"
#include "nsIDOMGeoPosition.h"
#include "nsIDOMGeoPositionCallback.h"
#include "nsIDOMGeoPositionErrorCallback.h"
#include "nsIGeolocationProvider.h"
#include "nsIObserver.h"
#include "nsITimer.h"
#include "nsIWeakReferenceUtils.h"
#include "nsTArray.h"
#include "nsWrapperCache.h"

class nsGeolocationRequest;
namespace mozilla {
class GeolocationService;
}
namespace mozilla::dom {
class Geolocation;
using GeoPositionCallback =
    CallbackObjectHolder<PositionCallback, nsIDOMGeoPositionCallback>;
using GeoPositionErrorCallback =
    CallbackObjectHolder<PositionErrorCallback, nsIDOMGeoPositionErrorCallback>;
namespace geolocation {
enum class LocationOSPermission;
}
}  // namespace mozilla::dom

namespace mozilla::dom {

/**
 * Can return a geolocation info
 */
class Geolocation final : public nsIGeolocationUpdate,
                          public nsWrapperCache,
                          public SupportsWeakPtr {
  friend class ::mozilla::GeolocationService;

 public:
  NS_DECL_CYCLE_COLLECTING_ISUPPORTS_FINAL
  NS_DECL_CYCLE_COLLECTION_WRAPPERCACHE_CLASS(Geolocation)

  NS_DECL_NSIGEOLOCATIONUPDATE

  Geolocation();

  nsresult Init(nsPIDOMWindowInner* aContentDom = nullptr);

  nsPIDOMWindowInner* GetParentObject() const;
  virtual JSObject* WrapObject(JSContext* aCtx,
                               JS::Handle<JSObject*> aGivenProto) override;

  MOZ_CAN_RUN_SCRIPT
  int32_t WatchPosition(PositionCallback& aCallback,
                        PositionErrorCallback* aErrorCallback,
                        const PositionOptions& aOptions, CallerType aCallerType,
                        ErrorResult& aRv);

  MOZ_CAN_RUN_SCRIPT
  void GetCurrentPosition(PositionCallback& aCallback,
                          PositionErrorCallback* aErrorCallback,
                          const PositionOptions& aOptions,
                          CallerType aCallerType, ErrorResult& aRv);
  void ClearWatch(int32_t aWatchId);

  // A WatchPosition for C++ use. Returns 0 if we failed to actually watch.
  MOZ_CAN_RUN_SCRIPT
  int32_t WatchPosition(nsIDOMGeoPositionCallback* aCallback,
                        nsIDOMGeoPositionErrorCallback* aErrorCallback,
                        UniquePtr<PositionOptions>&& aOptions);

  // Returns true if any of the callbacks are repeating
  bool HasActiveCallbacks();

  // Register an allowed request
  void NotifyAllowedRequest(nsGeolocationRequest* aRequest);

  // Remove request from all callbacks arrays
  void RemoveRequest(nsGeolocationRequest* request);

  // Check if there is already ClearWatch called for current
  // request & clear if yes
  bool ClearPendingRequest(nsGeolocationRequest* aRequest);

  // Shutting down.
  void Shutdown();

  // Getter for the browsing context that this Geolocation was loaded for
  mozilla::dom::BrowsingContext* GetBrowsingContext() {
    return mBrowsingContext;
  }

  // Getter for the principal that this Geolocation was loaded from
  nsIPrincipal* GetPrincipal() { return mPrincipal; }

  // Getter for the window that this Geolocation is owned by
  nsIWeakReference* GetOwner() { return mOwner; }

  // Check to see if the window still exists
  bool WindowOwnerStillExists();

  // Check to see if any active request requires high accuracy
  bool HighAccuracyRequested();

  // Get the singleton non-window Geolocation instance.  This never returns
  // null.
  static already_AddRefed<Geolocation> NonWindowSingleton();

  static geolocation::SystemGeolocationPermissionBehavior
  GetLocationOSPermission();

  static MOZ_CAN_RUN_SCRIPT void ReallowWithSystemPermissionOrCancel(
      BrowsingContext* aBrowsingContext,
      geolocation::ParentRequestResolver&& aResolver);

 private:
  ~Geolocation();

  MOZ_CAN_RUN_SCRIPT
  nsresult GetCurrentPosition(GeoPositionCallback aCallback,
                              GeoPositionErrorCallback aErrorCallback,
                              UniquePtr<PositionOptions>&& aOptions,
                              CallerType aCallerType);

  MOZ_CAN_RUN_SCRIPT
  int32_t WatchPosition(GeoPositionCallback aCallback,
                        GeoPositionErrorCallback aErrorCallback,
                        UniquePtr<PositionOptions>&& aOptions,
                        CallerType aCallerType, ErrorResult& aRv);

  static bool RegisterRequestWithPrompt(nsGeolocationRequest* request);

  // Check if clearWatch is already called
  bool IsAlreadyCleared(nsGeolocationRequest* aRequest);

  // Returns whether the Geolocation object should block requests
  // within a context that is not secure.
  bool ShouldBlockInsecureRequests() const;

  // Checks if the request is in a content window that is fully active, or the
  // request is coming from a chrome window.
  bool IsFullyActiveOrChrome();

  // Initates the asynchronous process of filling the request.
  static void RequestIfPermitted(nsGeolocationRequest* request);

  // Allow updating service for shutdown deregistering
  void SetService(GeolocationService* aService);

  // Two callback arrays.  The first |mPendingCallbacks| holds objects for only
  // one callback and then they are released/removed from the array.  The second
  // |mWatchingCallbacks| holds objects until the object is explicitly removed
  // or there is a page change. All requests held by either array are active,
  // that is, they have been allowed and expect to be fulfilled.

  nsTArray<RefPtr<nsGeolocationRequest>> mPendingCallbacks;
  nsTArray<RefPtr<nsGeolocationRequest>> mWatchingCallbacks;

  // window that this was created for.  Weak reference.
  nsWeakPtr mOwner;

  // where the content was loaded from
  nsCOMPtr<nsIPrincipal> mPrincipal;
  RefPtr<mozilla::dom::BrowsingContext> mBrowsingContext;

  // the protocols we want to measure
  enum class ProtocolType : uint8_t { OTHER, HTTP, HTTPS };

  // the protocol used to load the content
  ProtocolType mProtocolType;

  // owning back pointer.
  RefPtr<GeolocationService> mService;
  // owning back pointer for service override.
  RefPtr<GeolocationService> mServiceOverride;

  // Watch ID
  uint32_t mLastWatchId;

  // Pending requests are used when the service is not ready
  nsTArray<RefPtr<nsGeolocationRequest>> mPendingRequests;

  // Array containing already cleared watch IDs
  nsTArray<int32_t> mClearedWatchIDs;

  // Our cached non-window singleton.
  static mozilla::StaticRefPtr<Geolocation> sNonWindowSingleton;
};

}  // namespace mozilla::dom

#endif /* mozilla_dom_Geolocation_h */
