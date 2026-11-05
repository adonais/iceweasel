/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// HttpLog.h should generally be included first
#include "nsHttpNTLMAuth.h"

#include "HttpLog.h"
#include "nsCOMPtr.h"
#include "nsIAuthModule.h"
#include "nsServiceManagerUtils.h"
#include "plbase64.h"
#include "prnetdb.h"

//-----------------------------------------------------------------------------

#include "nsIHttpAuthenticableChannel.h"
#include "nsIPrefBranch.h"
#include "nsIURI.h"
#ifdef XP_WIN
#  include "nsIChannel.h"
#  include "nsITransportSecurityInfo.h"
#  include "nsIX509Cert.h"
#endif
#include "mozilla/Base64.h"
#include "mozilla/CheckedInt.h"
#include "mozilla/ClearOnShutdown.h"
#include "mozilla/Maybe.h"
#include "mozilla/Mutex.h"
#include "mozilla/StaticPrefs_browser.h"
#include "mozilla/Tokenizer.h"
#include "mozilla/net/DNS.h"
#include "mozilla/net/HttpAuthUtils.h"
#include "nsCRT.h"
#include "nsICancelable.h"
#include "nsIChannel.h"
#include "nsIHttpAuthenticatorCallback.h"
#include "nsNetUtil.h"
#include "nsProxyRelease.h"
#include "nsQueryObject.h"
#include "nsThreadUtils.h"
#include "nsUnicharUtils.h"

namespace mozilla {
namespace net {

static const char kAllowProxies[] = "network.automatic-ntlm-auth.allow-proxies";
static const char kAllowNonFqdn[] =
    "network.automatic-ntlm-auth.allow-non-fqdn";
static const char kTrustedURIs[] = "network.automatic-ntlm-auth.trusted-uris";
static const char kForceGeneric[] = "network.auth.force-generic-ntlm";
static const char kSSOinPBmode[] = "network.auth.private-browsing-sso";

StaticRefPtr<nsHttpNTLMAuth> nsHttpNTLMAuth::gSingleton;

static bool IsNonFqdn(nsIURI* uri) {
  nsAutoCString host;
  if (NS_FAILED(uri->GetAsciiHost(host))) {
    return false;
  }

  // return true if host does not contain a dot and is not an ip address
  return !host.IsEmpty() && !host.Contains('.') && !HostIsIPLiteral(host);
}

// Check to see if we should use our generic (internal) NTLM auth module.
static bool ForceGenericNTLM() {
  nsCOMPtr<nsIPrefBranch> prefs = do_GetService(NS_PREFSERVICE_CONTRACTID);
  if (!prefs) return false;
  bool flag = false;

  if (NS_FAILED(prefs->GetBoolPref(kForceGeneric, &flag))) flag = false;

  LOG(("Force use of generic ntlm auth module: %d\n", flag));
  return flag;
}

// Check to see if we should use default credentials for this host or proxy.
static bool CanUseDefaultCredentials(nsIHttpAuthenticableChannel* channel,
                                     bool isProxyAuth) {
  nsCOMPtr<nsIPrefBranch> prefs = do_GetService(NS_PREFSERVICE_CONTRACTID);
  if (!prefs) {
    return false;
  }

  // Proxy should go all the time, it's not considered a privacy leak
  // to send default credentials to a proxy.
  if (isProxyAuth) {
    bool val;
    if (NS_FAILED(prefs->GetBoolPref(kAllowProxies, &val))) val = false;
    LOG(("Default credentials allowed for proxy: %d\n", val));
    return val;
  }

  // Prevent using default credentials for authentication when we are in the
  // private browsing mode (but not in "never remember history" mode) and when
  // not explicitely allowed.  Otherwise, it would cause a privacy data leak.
  nsCOMPtr<nsIChannel> bareChannel = do_QueryInterface(channel);
  MOZ_ASSERT(bareChannel);

  if (NS_UsePrivateBrowsing(bareChannel)) {
    bool ssoInPb;
    if (NS_SUCCEEDED(prefs->GetBoolPref(kSSOinPBmode, &ssoInPb)) && ssoInPb) {
      return true;
    }

    if (!StaticPrefs::browser_privatebrowsing_autostart()) {
      return false;
    }
  }

  nsCOMPtr<nsIURI> uri;
  (void)channel->GetURI(getter_AddRefs(uri));

  bool allowNonFqdn;
  if (NS_FAILED(prefs->GetBoolPref(kAllowNonFqdn, &allowNonFqdn))) {
    allowNonFqdn = false;
  }
  if (allowNonFqdn && uri && IsNonFqdn(uri)) {
    LOG(("Host is non-fqdn, default credentials are allowed\n"));
    return true;
  }

  bool isTrustedHost = (uri && auth::URIMatchesPrefPattern(uri, kTrustedURIs));
  LOG(("Default credentials allowed for host: %d\n", isTrustedHost));
  return isTrustedHost;
}

// Dummy class for session state object.  This class doesn't hold any data.
// Instead we use its existence as a flag.  See ChallengeReceived.
class nsNTLMSessionState final : public nsISupports {
  ~nsNTLMSessionState() = default;

 public:
  NS_DECL_THREADSAFE_ISUPPORTS
};
NS_IMPL_ISUPPORTS0(nsNTLMSessionState)

#define NS_NTLMCONTINUATIONSTATE_IID \
  {0xb2db7a3e, 0x7608, 0x4e9b, {0xba, 0x0b, 0xd0, 0x1a, 0x2f, 0x4f, 0x97, 0x22}}

// Per-channel continuation state. The authenticator is a process-wide
// singleton, so anything decided in ChallengeReceived for one channel must be
// kept here rather than on nsHttpNTLMAuth.
class nsNTLMContinuationState final : public nsISupports {
  ~nsNTLMContinuationState() = default;

 public:
  NS_INLINE_DECL_STATIC_IID(NS_NTLMCONTINUATIONSTATE_IID)
  NS_DECL_THREADSAFE_ISUPPORTS

  nsNTLMContinuationState(already_AddRefed<nsIAuthModule> aModule,
                          bool aUseNative, bool aAllowDefaultCredentials)
      : mModule(aModule),
        mUseNative(aUseNative),
        mAllowDefaultCredentials(aAllowDefaultCredentials) {}

  const nsCOMPtr<nsIAuthModule> mModule;
  // Whether mModule is the native NTLM implementation or the internal one.
  const bool mUseNative;
  // Whether the prefs let this host use the logged-in user's identity.
  // Decided on the main thread, since GenerateCredentials may run off it.
  const bool mAllowDefaultCredentials;
};
NS_IMPL_ISUPPORTS(nsNTLMContinuationState, nsNTLMContinuationState)

//-----------------------------------------------------------------------------

already_AddRefed<nsIHttpAuthenticator> nsHttpNTLMAuth::GetOrCreate() {
  nsCOMPtr<nsIHttpAuthenticator> authenticator;
  if (gSingleton) {
    authenticator = gSingleton;
  } else {
    gSingleton = new nsHttpNTLMAuth();
    ClearOnShutdown(&gSingleton);
    authenticator = gSingleton;
  }

  return authenticator.forget();
}

NS_IMPL_ISUPPORTS(nsHttpNTLMAuth, nsIHttpAuthenticator)

NS_IMETHODIMP
nsHttpNTLMAuth::ChallengeReceived(nsIHttpAuthenticableChannel* channel,
                                  const nsACString& challenge, bool isProxyAuth,
                                  nsISupports** sessionState,
                                  nsISupports** continuationState,
                                  bool* identityInvalid) {
  LOG(("nsHttpNTLMAuth::ChallengeReceived [ss=%p cs=%p]\n", *sessionState,
       *continuationState));

  // NOTE: we don't define any session state, but we do use the pointer.

  *identityInvalid = false;

  // Start a new auth sequence if the challenge is exactly "NTLM".
  // If native NTLM auth apis are available and enabled through prefs,
  // try to use them.
  if (challenge.Equals("NTLM"_ns, nsCaseInsensitiveCStringComparator)) {
    nsCOMPtr<nsIAuthModule> module;

    // Use the native NTLM if available
    bool useNative = true;
    bool allowDefaultCredentials = false;

#ifdef MOZ_AUTH_EXTENSION
    // Check to see if we should default to our generic NTLM auth module
    // through UseGenericNTLM. (We use native auth by default if the
    // system provides it.) If *sessionState is non-null, we failed to
    // instantiate a native NTLM module the last time, so skip trying again.
    bool forceGeneric = ForceGenericNTLM();
    if (!forceGeneric && !*sessionState) {
      allowDefaultCredentials = CanUseDefaultCredentials(channel, isProxyAuth);
      // Check for approved default credentials hosts and proxies. If
      // *continuationState is non-null, the last authentication attempt
      // failed so skip default credential use.
      if (!*continuationState && allowDefaultCredentials) {
        // Try logging in with the user's default credentials. If
        // successful, |identityInvalid| is false, which will trigger
        // a default credentials attempt once we return.
        module = nsIAuthModule::CreateInstance("sys-ntlm");
      }
#  ifdef XP_WIN
      else {
        // Try to use native NTLM and prompt the user for their domain,
        // username, and password. (only supported by windows nsAuthSSPI
        // module.) Note, for servers that use LMv1 a weak hash of the user's
        // password will be sent. We rely on windows internal apis to decide
        // whether we should support this older, less secure version of the
        // protocol.
        module = nsIAuthModule::CreateInstance("sys-ntlm");
        *identityInvalid = true;
      }
#  endif  // XP_WIN
      if (!module) LOG(("Native sys-ntlm auth module not found.\n"));
    }

#  ifdef XP_WIN
    // On windows, never fall back unless the user has specifically requested
    // so.
    if (!forceGeneric && !module) return NS_ERROR_UNEXPECTED;
#  endif

    // If no native support was available. Fall back on our internal NTLM
    // implementation.
    if (!module) {
      if (!*sessionState) {
        // Remember the fact that we cannot use the "sys-ntlm" module,
        // so we don't ever bother trying again for this auth domain.
        RefPtr<nsNTLMSessionState> state = new nsNTLMSessionState();
        state.forget(sessionState);
      }

      // Use our internal NTLM implementation. Note, this is less secure,
      // see bug 520607 for details.
      LOG(("Trying to fall back on internal ntlm auth.\n"));
      module = nsIAuthModule::CreateInstance("ntlm");

      useNative = false;

      // Prompt user for domain, username, and password.
      *identityInvalid = true;
    }
#endif

    // If this fails, then it means that we cannot do NTLM auth.
    if (!module) {
      LOG(("No ntlm auth modules available.\n"));
      return NS_ERROR_UNEXPECTED;
    }

    // A non-null continuation state implies that we failed to authenticate.
    // Blow away the old authentication state, and use the new one.
    RefPtr<nsNTLMContinuationState> state = new nsNTLMContinuationState(
        module.forget(), useNative, allowDefaultCredentials);
    state.forget(continuationState);
  }
  return NS_OK;
}

namespace {

// Cancel() may run on the main thread at any point, including while the
// background thread is still filling in the result, so all of the state below
// is guarded by mMutex. The callback is always invoked with the lock dropped,
// and only ever once, since whoever takes mCallback out of the member wins.
class NTLMGetNextTokenCompleteEvent final : public nsIRunnable,
                                            public nsICancelable {
 public:
  NS_DECL_THREADSAFE_ISUPPORTS

  explicit NTLMGetNextTokenCompleteEvent(
      nsIHttpAuthenticatorCallback* aCallback)
      : mMutex("NTLMGetNextTokenCompleteEvent.mMutex"), mCallback(aCallback) {}

  nsresult DispatchSuccess(const nsACString& aCreds, uint32_t aFlags,
                           already_AddRefed<nsISupports> aSessionState,
                           already_AddRefed<nsISupports> aContinuationState) {
    MOZ_ASSERT(!NS_IsMainThread());
    {
      MutexAutoLock lock(mMutex);
      mCreds = aCreds;
      mFlags = aFlags;
      mResult = NS_OK;
      mSessionState = aSessionState;
      mContinuationState = aContinuationState;
    }
    return NS_DispatchToMainThread(this, NS_DISPATCH_NORMAL);
  }

  nsresult DispatchError(already_AddRefed<nsISupports> aSessionState,
                         already_AddRefed<nsISupports> aContinuationState) {
    MOZ_ASSERT(!NS_IsMainThread());
    {
      MutexAutoLock lock(mMutex);
      mResult = NS_ERROR_FAILURE;
      mSessionState = aSessionState;
      mContinuationState = aContinuationState;
    }
    return NS_DispatchToMainThread(this, NS_DISPATCH_NORMAL);
  }

  NS_IMETHODIMP Run() override {
    MOZ_ASSERT(NS_IsMainThread());

    nsCOMPtr<nsIHttpAuthenticatorCallback> callback;
    nsCString creds;
    uint32_t flags;
    nsresult result;
    nsCOMPtr<nsISupports> sessionState;
    nsCOMPtr<nsISupports> continuationState;
    {
      MutexAutoLock lock(mMutex);
      if (mCancelled) {
        return NS_OK;
      }
      callback = std::move(mCallback);
      creds = mCreds;
      flags = mFlags;
      result = mResult;
      sessionState = std::move(mSessionState);
      continuationState = std::move(mContinuationState);
    }

    if (callback) {
      callback->OnCredsGenerated(creds, flags, result, sessionState,
                                 continuationState);
    }
    return NS_OK;
  }

  NS_IMETHODIMP Cancel(nsresult aReason) override {
    MOZ_ASSERT(NS_IsMainThread());

    nsCOMPtr<nsIHttpAuthenticatorCallback> callback;
    nsCString creds;
    uint32_t flags;
    {
      MutexAutoLock lock(mMutex);
      mCancelled = true;
      callback = std::move(mCallback);
      creds = mCreds;
      flags = mFlags;
    }

    if (callback) {
      callback->OnCredsGenerated(creds, flags, aReason, nullptr, nullptr);
    }
    return NS_OK;
  }

 private:
  virtual ~NTLMGetNextTokenCompleteEvent() = default;

  Mutex mMutex;
  nsCOMPtr<nsIHttpAuthenticatorCallback> mCallback MOZ_GUARDED_BY(mMutex);
  nsCString mCreds MOZ_GUARDED_BY(mMutex);
  uint32_t mFlags MOZ_GUARDED_BY(mMutex) = 0;
  nsresult mResult MOZ_GUARDED_BY(mMutex) = NS_OK;
  bool mCancelled MOZ_GUARDED_BY(mMutex) = false;
  nsCOMPtr<nsISupports> mSessionState MOZ_GUARDED_BY(mMutex);
  nsCOMPtr<nsISupports> mContinuationState MOZ_GUARDED_BY(mMutex);
};

inline nsISupports* ToSupports(NTLMGetNextTokenCompleteEvent* aEvent) {
  return static_cast<nsIRunnable*>(aEvent);
}

NS_IMPL_ISUPPORTS(NTLMGetNextTokenCompleteEvent, nsIRunnable, nsICancelable)

class NTLMGetNextTokenRunnable final : public mozilla::Runnable {
  ~NTLMGetNextTokenRunnable() override = default;

 public:
  NTLMGetNextTokenRunnable(
      nsMainThreadPtrHandle<nsIHttpAuthenticableChannel>& aAuthChannel,
      const nsACString& aChallenge, bool aIsProxyAuth, const nsAString& aDomain,
      const nsAString& aUsername, const nsAString& aPassword,
      nsISupports* aSessionState, nsISupports* aContinuationState,
      nsMainThreadPtrHandle<NTLMGetNextTokenCompleteEvent>& aCompleteEvent)
      : mozilla::Runnable("NTLMGetNextTokenRunnable"),
        mAuthChannel(aAuthChannel),
        mChallenge(aChallenge),
        mIsProxyAuth(aIsProxyAuth),
        mDomain(aDomain),
        mUsername(aUsername),
        mPassword(aPassword),
        mSessionState(aSessionState),
        mContinuationState(aContinuationState),
        mCompleteEvent(aCompleteEvent) {}

  NS_IMETHODIMP Run() override {
    MOZ_ASSERT(!NS_IsMainThread());

    nsCString creds;
    uint32_t flags;

    nsCOMPtr<nsIHttpAuthenticator> authenticator = new nsHttpNTLMAuth();

    nsISupports* sessionState = mSessionState;
    nsISupports* continuationState = mContinuationState;
    nsresult rv = authenticator->GenerateCredentials(
        mAuthChannel, mChallenge, mIsProxyAuth, mDomain, mUsername, mPassword,
        &sessionState, &continuationState, &flags, creds);

    if (mSessionState != sessionState) {
      mSessionState = sessionState;
    }
    if (mContinuationState != continuationState) {
      mContinuationState = continuationState;
    }

    if (NS_FAILED(rv)) {
      return mCompleteEvent->DispatchError(mSessionState.forget(),
                                           mContinuationState.forget());
    }

    return mCompleteEvent->DispatchSuccess(creds, flags, mSessionState.forget(),
                                           mContinuationState.forget());
  }

 private:
  nsMainThreadPtrHandle<nsIHttpAuthenticableChannel> mAuthChannel;
  nsCString mChallenge;
  bool mIsProxyAuth;
  nsString mDomain;
  nsString mUsername;
  nsString mPassword;
  nsCOMPtr<nsISupports> mSessionState;
  nsCOMPtr<nsISupports> mContinuationState;
  nsMainThreadPtrHandle<NTLMGetNextTokenCompleteEvent> mCompleteEvent;
};

}  // anonymous namespace

NS_IMETHODIMP
nsHttpNTLMAuth::GenerateCredentialsAsync(
    nsIHttpAuthenticableChannel* authChannel,
    nsIHttpAuthenticatorCallback* aCallback, const nsACString& challenge,
    bool isProxyAuth, const nsAString& domain, const nsAString& username,
    const nsAString& password, nsISupports* sessionState,
    nsISupports* continuationState, nsICancelable** aCancellable) {
  NS_ENSURE_ARG(aCallback);
  NS_ENSURE_ARG_POINTER(aCancellable);

  nsMainThreadPtrHandle<nsIHttpAuthenticableChannel> handle(
      new nsMainThreadPtrHolder<nsIHttpAuthenticableChannel>(
          "nsIHttpAuthenticableChannel", authChannel, false));
  nsMainThreadPtrHandle<NTLMGetNextTokenCompleteEvent> cancelEvent(
      new nsMainThreadPtrHolder<NTLMGetNextTokenCompleteEvent>(
          "NTLMGetNextTokenRunnable::mCompleteEvent",
          new NTLMGetNextTokenCompleteEvent(aCallback), false));

  nsCOMPtr<nsIRunnable> runnable = new NTLMGetNextTokenRunnable(
      handle, challenge, isProxyAuth, domain, username, password, sessionState,
      continuationState, cancelEvent);

  nsresult rv = NS_DispatchBackgroundTask(
      runnable, nsIEventTarget::DISPATCH_EVENT_MAY_BLOCK);
  NS_ENSURE_SUCCESS(rv, rv);

  RefPtr<NTLMGetNextTokenCompleteEvent> cancelable(cancelEvent.get());
  cancelable.forget(aCancellable);
  return NS_OK;
}

NS_IMETHODIMP
nsHttpNTLMAuth::GenerateCredentials(
    nsIHttpAuthenticableChannel* authChannel, const nsACString& aChallenge,
    bool isProxyAuth, const nsAString& domain, const nsAString& user,
    const nsAString& pass, nsISupports** sessionState,
    nsISupports** continuationState, uint32_t* aFlags, nsACString& creds)

{
  LOG(("nsHttpNTLMAuth::GenerateCredentials\n"));

  creds.Truncate();
  *aFlags = 0;

  // if user or password is empty, ChallengeReceived returned
  // identityInvalid = false, that means we are using default user
  // credentials; see  nsAuthSSPI::Init method for explanation of this
  // condition
  if (user.IsEmpty() || pass.IsEmpty()) *aFlags = USING_INTERNAL_IDENTITY;

  nsresult rv;
  RefPtr<nsNTLMContinuationState> state = do_QueryObject(*continuationState);
  if (!state || !state->mModule) {
    return NS_ERROR_UNEXPECTED;
  }
  nsCOMPtr<nsIAuthModule> module = state->mModule;
  const bool useNative = state->mUseNative;
  const bool allowDefaultCredentials = state->mAllowDefaultCredentials;

  void *inBuf, *outBuf;
  uint32_t inBufLen, outBufLen;
  Maybe<nsTArray<uint8_t>> certArray;

  // initial challenge
  if (aChallenge.Equals("NTLM"_ns, nsCaseInsensitiveCStringComparator)) {
    // An empty user or password makes nsAuthSSPI::Init authenticate as the
    // logged-in user, which only CanUseDefaultCredentials() hosts may do.
    if (useNative && (user.IsEmpty() || pass.IsEmpty()) &&
        !allowDefaultCredentials) {
      LOG(("Not using default credentials for an untrusted host\n"));
      return NS_ERROR_ABORT;
    }

    // NTLM service name format is 'HTTP@host' for both http and https
    nsCOMPtr<nsIURI> uri;
    rv = authChannel->GetURI(getter_AddRefs(uri));
    if (NS_FAILED(rv)) return rv;
    nsAutoCString serviceName, host;
    rv = uri->GetAsciiHost(host);
    if (NS_FAILED(rv)) return rv;
    serviceName.AppendLiteral("HTTP@");
    serviceName.Append(host);
    // initialize auth module
    uint32_t reqFlags = nsIAuthModule::REQ_DEFAULT;
    if (isProxyAuth) reqFlags |= nsIAuthModule::REQ_PROXY_AUTH;

    rv = module->Init(serviceName, reqFlags, domain, user, pass);
    if (NS_FAILED(rv)) return rv;

    inBufLen = 0;
    inBuf = nullptr;
// This update enables updated Windows machines (Win7 or patched previous
// versions) and Linux machines running Samba (updated for Channel
// Binding), to perform Channel Binding when authenticating using NTLMv2
// and an outer secure channel.
//
// Currently only implemented for Windows, linux support will be landing in
// a separate patch, update this #ifdef accordingly then.
// Extended protection update is just for Linux and Windows machines.
#if defined(XP_WIN) /* || defined (LINUX) */
    // We should retrieve the server certificate and compute the CBT,
    // but only when we are using the native NTLM implementation and
    // not the internal one.
    // It is a valid case not having the security info object.  This
    // occures when we connect an https site through an ntlm proxy.
    // After the ssl tunnel has been created, we get here the second
    // time and now generate the CBT from now valid security info.
    nsCOMPtr<nsIChannel> channel = do_QueryInterface(authChannel, &rv);
    if (NS_FAILED(rv)) return rv;

    nsCOMPtr<nsITransportSecurityInfo> securityInfo;
    rv = channel->GetSecurityInfo(getter_AddRefs(securityInfo));
    if (NS_FAILED(rv)) return rv;

    if (useNative && securityInfo) {
      nsCOMPtr<nsIX509Cert> cert;
      rv = securityInfo->GetServerCert(getter_AddRefs(cert));
      if (NS_FAILED(rv)) return rv;

      if (cert) {
        certArray.emplace();
        rv = cert->GetRawDER(*certArray);
        if (NS_FAILED(rv)) {
          return rv;
        }

        // If there is a server certificate, we pass it along the
        // first time we call GetNextToken().
        inBufLen = certArray->Length();
        inBuf = certArray->Elements();
      }
    }
#endif
  } else {
    // decode challenge; skip past "NTLM " to the start of the base64
    // encoded data.
    if (aChallenge.Length() < 6) {
      return NS_ERROR_UNEXPECTED;  // bogus challenge
    }

    // strip off any padding (see bug 230351)
    nsDependentCSubstring challenge(aChallenge, 5);
    uint32_t len = challenge.Length();
    while (len > 0 && challenge[len - 1] == '=') {
      len--;
    }

    // decode into the input secbuffer
    rv = Base64Decode(challenge.BeginReading(), len, (char**)&inBuf, &inBufLen);
    if (NS_FAILED(rv)) {
      return rv;
    }
  }

  rv = module->GetNextToken(inBuf, inBufLen, &outBuf, &outBufLen);
  if (NS_SUCCEEDED(rv)) {
    // base64 encode data in output buffer and prepend "NTLM "
    CheckedUint32 credsLen = ((CheckedUint32(outBufLen) + 2) / 3) * 4;
    credsLen += 5;  // "NTLM "
    credsLen += 1;  // null terminate

    if (!credsLen.isValid()) {
      rv = NS_ERROR_FAILURE;
    } else {
      nsAutoCString encoded;
      (void)Base64Encode(nsDependentCSubstring((char*)outBuf, outBufLen),
                         encoded);
      creds = nsPrintfCString("NTLM %s", encoded.get());
    }

    // OK, we are done with |outBuf|
    free(outBuf);
  }

  // inBuf needs to be freed if it's not pointing into certArray
  if (inBuf && !certArray) {
    free(inBuf);
  }

  return rv;
}

NS_IMETHODIMP
nsHttpNTLMAuth::GetAuthFlags(uint32_t* flags) {
  *flags = CONNECTION_BASED | IDENTITY_INCLUDES_DOMAIN | IDENTITY_ENCRYPTED;
  return NS_OK;
}

}  // namespace net
}  // namespace mozilla
