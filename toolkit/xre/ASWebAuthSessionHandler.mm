/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#import <AuthenticationServices/AuthenticationServices.h>

#include <libproc.h>
#include <signal.h>
#include <string.h>
#include <sys/param.h>
#include <unistd.h>

#include "ASWebAuthSessionHandler.h"
#include "nsIASWebAuthSessionRequest.h"
#include "MacAutoreleasePool.h"
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
  NS_DECL_THREADSAFE_ISUPPORTS
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

@interface ASWebAuthSessionHandler
    : NSObject <ASWebAuthenticationSessionWebBrowserSessionHandling>
@end

@implementation ASWebAuthSessionHandler

- (void)beginHandlingWebAuthenticationSessionRequest:
    (ASWebAuthenticationSessionRequest*)request {
  // AuthenticationServices calls this on one of its own threads, so everything
  // that touches Gecko state runs in the runnable below.
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
  // Called on an AuthenticationServices thread, same as the begin callback.
  MOZ_LOG(gASWebAuthLog, mozilla::LogLevel::Info,
          ("cancelWebAuthenticationSessionRequest"));

  nsAutoString uuidXPCOM;
  mozilla::CopyNSStringToXPCOMString(request.UUID.UUIDString, uuidXPCOM);
  NS_DispatchToMainThread(NS_NewRunnableFunction(
      "ASWebAuthSessionHandler::cancelHandling",
      [uuidXPCOM = nsString(uuidXPCOM)]() {
        // A request queued here never reached the browser UI, so nothing else
        // will answer it.
        nsCOMPtr<nsIASWebAuthSessionRequest> queued =
            sPendingBeginRequests.GetWeak(uuidXPCOM);
        sPendingBeginRequests.Remove(uuidXPCOM);
        if (queued) {
          queued->Cancel();
        }

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

class ASWebAuthServiceReadyObserver final : public nsIObserver {
 public:
  NS_DECL_ISUPPORTS

  NS_IMETHOD Observe(nsISupports* aSubject, const char* aTopic,
                     const char16_t* aData) override {
    if (!strcmp(aTopic, "aswebauthsession-service-shutdown")) {
      sServiceReady = false;
      // Queued requests never reached the browser UI, so the apps waiting
      // on them have to be told that nothing is handling them.
      for (const auto& request : sPendingBeginRequests.Values()) {
        request->Cancel();
      }
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

static ASWebAuthSessionHandler* sHandler = nil;
static bool sObserversRegistered = false;

void RegisterASWebAuthSessionHandler() {
  sHandler = [[ASWebAuthSessionHandler alloc] init];
  ASWebAuthenticationSessionWebBrowserSessionManager.sharedManager
      .sessionHandler = sHandler;
}

static NSString* const kBrokerRefreshedKey = @"ASWebAuthSessionBrokerRefreshed";

// SafariLaunchAgent picks the browser that handles authentication requests. It
// remembers, per bundle path, a browser whose Info.plist lacked
// ASWebAuthenticationSessionWebBrowserSupportCapabilities and keeps skipping
// that browser until the agent exits. A Firefox that gained the key through an
// update is therefore skipped until the user logs out. Terminate the agent once
// so that it reads our Info.plist again. launchd starts it again on the next
// request. This can be removed once builds without the key are no longer in
// use. See bug 2074060.
static void MaybeRefreshAuthenticationBroker() {
  mozilla::MacAutoreleasePool pool;

  NSUserDefaults* defaults = [NSUserDefaults standardUserDefaults];
  if ([defaults boolForKey:kBrokerRefreshedKey]) {
    return;
  }
  [defaults setBool:YES forKey:kBrokerRefreshedKey];

  // A request that already reached us means the agent routes to us.
  if (WasLaunchedByAuthenticationServices() || sPendingBeginRequests.Count()) {
    return;
  }

  uid_t uid = getuid();
  int bytes = proc_listpids(PROC_UID_ONLY, uid, nullptr, 0);
  if (bytes <= 0) {
    return;
  }
  nsTArray<pid_t> pids;
  pids.SetLength(bytes / sizeof(pid_t) + 32);
  bytes = proc_listpids(PROC_UID_ONLY, uid, pids.Elements(),
                        static_cast<int>(pids.Length() * sizeof(pid_t)));
  if (bytes <= 0) {
    return;
  }
  pids.TruncateLength(bytes / sizeof(pid_t));

  for (pid_t pid : pids) {
    if (pid <= 0) {
      continue;
    }
    char name[2 * MAXCOMLEN + 1] = {};
    if (proc_name(pid, name, sizeof(name)) <= 0) {
      continue;
    }
    if (!strcmp(name, "SafariLaunchAgent")) {
      int rv = kill(pid, SIGTERM);
      MOZ_LOG(gASWebAuthLog, mozilla::LogLevel::Info,
              ("Terminated SafariLaunchAgent (pid %d): %d", pid, rv));
    }
  }
}

void RegisterASWebAuthSessionObservers() {
  if (sObserversRegistered || !sHandler) {
    return;
  }

  MaybeRefreshAuthenticationBroker();

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

bool WasLaunchedByAuthenticationServices() {
  bool wasLaunched = ASWebAuthenticationSessionWebBrowserSessionManager
                         .sharedManager.wasLaunchedByAuthenticationServices;
  MOZ_LOG(gASWebAuthLog, mozilla::LogLevel::Info,
          ("wasLaunchedByAuthenticationServices: %d", wasLaunched));
  return wasLaunched;
}
