/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#import <AuthenticationServices/AuthenticationServices.h>

#include "ASWebAuthSessionHandler.h"
#include "nsIASWebAuthSessionRequest.h"
#include "MacStringHelpers.h"
#include "mozilla/Logging.h"
#include "mozilla/RefPtr.h"
#include "mozilla/Services.h"
#include "nsCOMPtr.h"
#include "nsHashKeys.h"
#include "nsIObserver.h"
#include "nsIObserverService.h"
#include "nsInterfaceHashtable.h"
#include "nsString.h"
#include "nsTArray.h"
#include "nsThreadUtils.h"

static mozilla::LazyLogModule gASWebAuthLog("ASWebAuthSession");

// JS may not be ready when macOS delivers an auth request during cold launch.
// Queue begin requests, keyed by uuid, until ASWebAuthSessionService signals
// it's ready.
static bool sServiceReady = false;
constinit static nsInterfaceHashtable<nsStringHashKey,
                                      nsIASWebAuthSessionRequest>
    sPendingBeginRequests;

static void CancelRequestObject(id requestObject) {
  NSError* cancelError =
      [NSError errorWithDomain:ASWebAuthenticationSessionErrorDomain
                          code:ASWebAuthenticationSessionErrorCodeCanceledLogin
                      userInfo:nil];
  [requestObject cancelWithError:cancelError];
}

// Wrap the macOS request so the JS service can use it directly.
// The wrapped object is the real request in production or a mock in tests.
class ASWebAuthSessionRequestWrapper final : public nsIASWebAuthSessionRequest {
 public:
  NS_DECL_ISUPPORTS
  NS_DECL_NSIASWEBAUTHSESSIONREQUEST

  ASWebAuthSessionRequestWrapper(id aRequestObject, NSString* aUuid,
                                 NSString* aURL, NSString* aCallbackScheme,
                                 bool aHasCallback, bool aEphemeral,
                                 NSDictionary* aHeaders)
      : mRequestObject([aRequestObject retain]),
        mUuid([aUuid copy]),
        mURL([aURL copy]),
        mCallbackScheme([aCallbackScheme copy]),
        mHeaders([aHeaders copy]),
        mHasCallback(aHasCallback),
        mEphemeral(aEphemeral) {}

 private:
  ~ASWebAuthSessionRequestWrapper() {
    [mRequestObject release];
    [mUuid release];
    [mURL release];
    [mCallbackScheme release];
    [mHeaders release];
  }

  id mRequestObject;
  NSString* mUuid;
  NSString* mURL;
  NSString* mCallbackScheme;
  NSDictionary* mHeaders;
  bool mHasCallback;
  bool mEphemeral;
};

NS_IMPL_ISUPPORTS(ASWebAuthSessionRequestWrapper, nsIASWebAuthSessionRequest)

NS_IMETHODIMP
ASWebAuthSessionRequestWrapper::GetUuid(nsAString& aUuid) {
  mozilla::CopyNSStringToXPCOMString(mUuid, aUuid);
  return NS_OK;
}

NS_IMETHODIMP
ASWebAuthSessionRequestWrapper::GetUrl(nsAString& aURL) {
  mozilla::CopyNSStringToXPCOMString(mURL, aURL);
  return NS_OK;
}

NS_IMETHODIMP
ASWebAuthSessionRequestWrapper::GetCallbackScheme(nsAString& aScheme) {
  mozilla::CopyNSStringToXPCOMString(mCallbackScheme ?: @"", aScheme);
  return NS_OK;
}

NS_IMETHODIMP
ASWebAuthSessionRequestWrapper::GetHasCallback(bool* aResult) {
  *aResult = mHasCallback;
  return NS_OK;
}

NS_IMETHODIMP
ASWebAuthSessionRequestWrapper::GetUseEphemeralSession(bool* aResult) {
  *aResult = mEphemeral;
  return NS_OK;
}

NS_IMETHODIMP
ASWebAuthSessionRequestWrapper::GetAdditionalHeaderNames(
    nsTArray<nsString>& aNames) {
  aNames.Clear();
  for (NSString* name in mHeaders) {
    nsAutoString xpcomName;
    mozilla::CopyNSStringToXPCOMString(name, xpcomName);
    aNames.AppendElement(xpcomName);
  }
  return NS_OK;
}

NS_IMETHODIMP
ASWebAuthSessionRequestWrapper::GetAdditionalHeader(const nsAString& aName,
                                                    nsAString& aValue) {
  NSString* name = mozilla::XPCOMStringToNSString(aName);
  NSString* value = mHeaders[name];
  mozilla::CopyNSStringToXPCOMString(value ?: @"", aValue);
  return NS_OK;
}

NS_IMETHODIMP
ASWebAuthSessionRequestWrapper::MatchesCallbackURL(const nsAString& aURL,
                                                   bool* aResult) {
  *aResult = false;
  if (@available(macOS 14.4, *)) {
    if ([mRequestObject
            isKindOfClass:ASWebAuthenticationSessionRequest.class]) {
      ASWebAuthenticationSessionRequest* request = mRequestObject;
      NSString* urlString = mozilla::XPCOMStringToNSString(aURL);
      NSURL* url = [NSURL URLWithString:urlString];
      if (url && request.callback && [request.callback matchesURL:url]) {
        *aResult = true;
      }
    }
  }
  return NS_OK;
}

NS_IMETHODIMP
ASWebAuthSessionRequestWrapper::Complete(const nsAString& aCallbackURL) {
  NSString* urlString = mozilla::XPCOMStringToNSString(aCallbackURL);
  NSURL* callbackURL = [NSURL URLWithString:urlString];
  if (!callbackURL) {
    MOZ_LOG(gASWebAuthLog, mozilla::LogLevel::Error,
            ("complete: invalid callback URL"));
    CancelRequestObject(mRequestObject);
    return NS_OK;
  }

  [mRequestObject completeWithCallbackURL:callbackURL];
  return NS_OK;
}

NS_IMETHODIMP
ASWebAuthSessionRequestWrapper::Cancel() {
  CancelRequestObject(mRequestObject);
  return NS_OK;
}

API_AVAILABLE(macos(12.0))
@interface ASWebAuthSessionHandler
    : NSObject <ASWebAuthenticationSessionWebBrowserSessionHandling>
@end

@implementation ASWebAuthSessionHandler

- (void)beginHandlingWebAuthenticationSessionRequest:
    (ASWebAuthenticationSessionRequest*)request {
  MOZ_ASSERT(NS_IsMainThread());
  MOZ_LOG(gASWebAuthLog, mozilla::LogLevel::Info,
          ("beginHandlingWebAuthenticationSessionRequest"));

  NSString* urlString = request.URL.absoluteString;
  if (!request.UUID || !urlString) {
    MOZ_LOG(gASWebAuthLog, mozilla::LogLevel::Error,
            ("beginHandlingRequest: invalid request"));
    CancelRequestObject(request);
    return;
  }

  NSDictionary* additionalHeaderFields = nil;
  BOOL hasCallback = NO;
  if (@available(macOS 14.4, *)) {
    additionalHeaderFields = request.additionalHeaderFields;
    hasCallback = request.callback != nil;
  }

  RefPtr<nsIASWebAuthSessionRequest> wrapped =
      mozilla::MakeRefPtr<ASWebAuthSessionRequestWrapper>(
          request, request.UUID.UUIDString, urlString,
          request.callbackURLScheme, hasCallback,
          request.shouldUseEphemeralSession, additionalHeaderFields);

  nsAutoString uuidXPCOM;
  mozilla::CopyNSStringToXPCOMString(request.UUID.UUIDString, uuidXPCOM);

  NS_DispatchToMainThread(NS_NewRunnableFunction(
      "ASWebAuthSessionHandler::beginHandling",
      [wrapped = std::move(wrapped), uuidXPCOM = nsString(uuidXPCOM)]() {
        if (sServiceReady) {
          nsCOMPtr<nsIObserverService> obsServ =
              mozilla::services::GetObserverService();
          if (obsServ) {
            obsServ->NotifyObservers(wrapped, "aswebauthsession-request-begin",
                                     nullptr);
          }
        } else {
          // ASWebAuthServiceReadyObserver replays queued requests once the
          // service signals it's ready.
          sPendingBeginRequests.InsertOrUpdate(uuidXPCOM, wrapped);
        }
      }));
}

- (void)cancelWebAuthenticationSessionRequest:
    (ASWebAuthenticationSessionRequest*)request {
  MOZ_ASSERT(NS_IsMainThread());
  MOZ_LOG(gASWebAuthLog, mozilla::LogLevel::Info,
          ("cancelWebAuthenticationSessionRequest"));

  nsAutoString uuidXPCOM;
  mozilla::CopyNSStringToXPCOMString(request.UUID.UUIDString, uuidXPCOM);
  NS_DispatchToMainThread(NS_NewRunnableFunction(
      "ASWebAuthSessionHandler::cancelHandling",
      [uuidXPCOM = nsString(uuidXPCOM)]() {
        sPendingBeginRequests.Remove(uuidXPCOM);

        nsCOMPtr<nsIObserverService> obsServ =
            mozilla::services::GetObserverService();
        if (obsServ) {
          obsServ->NotifyObservers(nullptr, "aswebauthsession-request-cancel",
                                   uuidXPCOM.get());
        }
      }));
}

@end

namespace {

class API_AVAILABLE(macos(12.0)) ASWebAuthServiceReadyObserver final
    : public nsIObserver {
 public:
  NS_DECL_ISUPPORTS

  NS_IMETHOD Observe(nsISupports* aSubject, const char* aTopic,
                     const char16_t* aData) override {
    if (!strcmp(aTopic, "aswebauthsession-service-shutdown")) {
      sServiceReady = false;
      sPendingBeginRequests.Clear();
      return NS_OK;
    }

    if (!strcmp(aTopic, "aswebauthsession-service-ready")) {
      sServiceReady = true;

      if (sPendingBeginRequests.Count()) {
        nsTArray<nsCOMPtr<nsIASWebAuthSessionRequest>> pending(
            sPendingBeginRequests.Count());
        for (const auto& request : sPendingBeginRequests.Values()) {
          pending.AppendElement(request);
        }
        sPendingBeginRequests.Clear();

        nsCOMPtr<nsIObserverService> obsServ =
            mozilla::services::GetObserverService();
        if (obsServ) {
          for (const auto& request : pending) {
            obsServ->NotifyObservers(request, "aswebauthsession-request-begin",
                                     nullptr);
          }
        }
      }
    }

    return NS_OK;
  }

 private:
  ~ASWebAuthServiceReadyObserver() = default;
};

NS_IMPL_ISUPPORTS(ASWebAuthServiceReadyObserver, nsIObserver)

}  // namespace

static ASWebAuthSessionHandler* sHandler API_AVAILABLE(macos(12.0)) = nil;
static bool sObserversRegistered = false;

static void RegisterObservers() API_AVAILABLE(macos(12.0)) {
  if (sObserversRegistered || !sHandler) {
    return;
  }

  nsCOMPtr<nsIObserverService> obsServ =
      mozilla::services::GetObserverService();
  if (!obsServ) {
    return;
  }
  RefPtr<ASWebAuthServiceReadyObserver> readyObs =
      mozilla::MakeRefPtr<ASWebAuthServiceReadyObserver>();
  obsServ->AddObserver(readyObs, "aswebauthsession-service-ready", false);
  obsServ->AddObserver(readyObs, "aswebauthsession-service-shutdown", false);

  sObserversRegistered = true;
  obsServ->NotifyObservers(nullptr, "aswebauthsession-native-ready", nullptr);
}

void RegisterASWebAuthSessionHandler() {
  if (@available(macOS 12.0, *)) {
    sHandler = [[ASWebAuthSessionHandler alloc] init];
    ASWebAuthenticationSessionWebBrowserSessionManager.sharedManager
        .sessionHandler = sHandler;
  }
}

void RegisterASWebAuthSessionObservers() {
  if (@available(macOS 12.0, *)) {
    RegisterObservers();
  }
}
