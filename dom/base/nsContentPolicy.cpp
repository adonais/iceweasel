/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Implementation of the "@mozilla.org/layout/content-policy;1" contract.
 */

#include "nsContentPolicy.h"

#include "mozilla/Components.h"
#include "mozilla/Logging.h"
#include "mozilla/Try.h"
#include "mozilla/dom/PolicyContainer.h"
#include "mozilla/dom/nsCSPService.h"
#include "mozilla/dom/nsMixedContentBlocker.h"
#include "nsCOMArray.h"
#include "nsContentPolicyUtils.h"
#include "nsContentUtils.h"
#include "nsIBrowserChild.h"
#include "nsIContent.h"
#include "nsIContentSecurityPolicy.h"
#include "nsIImageLoadingContent.h"
#include "nsISupports.h"
#include "nsIURI.h"
#include "nsXPCOM.h"

class nsIDOMWindow;

using mozilla::LogLevel;

NS_IMPL_ISUPPORTS(nsContentPolicy, nsIContentPolicy)

static mozilla::LazyLogModule gConPolLog("nsContentPolicy");

nsContentPolicy::nsContentPolicy() : mPolicies(NS_CONTENTPOLICY_CATEGORY) {}

nsresult nsContentPolicy::Init() {
  nsresult rv;
  mCSPService = mozilla::components::CSPService::Service(&rv);
  MOZ_TRY(rv);
  mMixedContentBlocker = mozilla::components::MixedContentBlocker::Service(&rv);
  return rv;
}

nsContentPolicy::~nsContentPolicy() = default;

#ifdef DEBUG
#  define WARN_IF_URI_UNINITIALIZED(uri, name)            \
    PR_BEGIN_MACRO                                        \
    if ((uri)) {                                          \
      nsAutoCString spec;                                 \
      (uri)->GetAsciiSpec(spec);                          \
      if (spec.IsEmpty()) {                               \
        NS_WARNING(name " is uninitialized, fix caller"); \
      }                                                   \
    }                                                     \
    PR_END_MACRO

#else  // ! defined(DEBUG)

#  define WARN_IF_URI_UNINITIALIZED(uri, name)

#endif  // defined(DEBUG)

inline nsresult nsContentPolicy::CheckPolicy(CPMethod policyMethod,
                                             nsIURI* contentLocation,
                                             nsILoadInfo* loadInfo,
                                             int16_t* decision) {
  nsCOMPtr<nsISupports> requestingContext = loadInfo->GetLoadingContext();
  // sanity-check passed-through parameters
  MOZ_ASSERT(decision, "Null out pointer");
  WARN_IF_URI_UNINITIALIZED(contentLocation, "Request URI");

#ifdef DEBUG
  {
    nsCOMPtr<nsINode> node(do_QueryInterface(requestingContext));
    nsCOMPtr<nsIDOMWindow> window(do_QueryInterface(requestingContext));
    nsCOMPtr<nsIBrowserChild> browserChild(
        do_QueryInterface(requestingContext));
    NS_ASSERTION(!requestingContext || node || window || browserChild,
                 "Context should be a DOM node, DOM window or a browserChild!");
  }
#endif

  nsCOMPtr<mozilla::dom::Document> doc;
  if (nsCOMPtr<nsIContent> node = do_QueryInterface(requestingContext)) {
    doc = node->OwnerDoc();
  } else {
    doc = do_QueryInterface(requestingContext);
  }

  if (doc) {
    if (nsCOMPtr<nsIContentSecurityPolicy> csp =
            PolicyContainer::GetCSP(doc->GetPolicyContainer())) {
      csp->EnsureEventTarget(mozilla::GetMainThreadSerialEventTarget());
    }
  }

  /*
   * mPolicies is enumerated in unspecified (hashtable) order and the first
   * rejection stops the enumeration, which would suppress the reporting side
   * effects of CSP and the mixed content blocker. Consult those two up front,
   * in a defined order.
   */
  auto rejects = [&](nsIContentPolicy* policy) {
    // Check the appropriate policy.
    nsresult rv = (policy->*policyMethod)(contentLocation, loadInfo, decision);
    return NS_SUCCEEDED(rv) && NS_CP_REJECTED(*decision);
  };

  if (rejects(mCSPService) || rejects(mMixedContentBlocker)) {
    return NS_OK;
  }

  const nsCOMArray<nsIContentPolicy>& entries = mPolicies.GetCachedEntries();
  for (int32_t i = 0; i < entries.Count(); ++i) {
    if (rejects(entries[i])) {
      return NS_OK;
    }
  }

  // Everyone returned failure, or no policies: sanitize result
  *decision = nsIContentPolicy::ACCEPT;
  return NS_OK;
}

// uses the parameters from ShouldXYZ to produce and log a message
// logType must be a literal string constant
#define LOG_CHECK(logType)                                                     \
  PR_BEGIN_MACRO                                                               \
  /* skip all this nonsense if the call failed or logging is disabled */       \
  if (NS_SUCCEEDED(rv) && MOZ_LOG_TEST(gConPolLog, LogLevel::Debug)) {         \
    const char* resultName;                                                    \
    if (decision) {                                                            \
      resultName = NS_CP_ResponseName(*decision);                              \
    } else {                                                                   \
      resultName = "(null ptr)";                                               \
    }                                                                          \
    MOZ_LOG(                                                                   \
        gConPolLog, LogLevel::Debug,                                           \
        ("Content Policy: " logType ": <%s> result=%s",                        \
         contentLocation ? contentLocation->GetSpecOrDefault().get() : "None", \
         resultName));                                                         \
  }                                                                            \
  PR_END_MACRO

NS_IMETHODIMP
nsContentPolicy::ShouldLoad(nsIURI* contentLocation, nsILoadInfo* loadInfo,
                            int16_t* decision) {
  // ShouldProcess does not need a content location, but we do
  MOZ_ASSERT(contentLocation, "Must provide request location");
  nsresult rv = CheckPolicy(&nsIContentPolicy::ShouldLoad, contentLocation,
                            loadInfo, decision);
  LOG_CHECK("ShouldLoad");

  return rv;
}

NS_IMETHODIMP
nsContentPolicy::ShouldProcess(nsIURI* contentLocation, nsILoadInfo* loadInfo,
                               int16_t* decision) {
  nsresult rv = CheckPolicy(&nsIContentPolicy::ShouldProcess, contentLocation,
                            loadInfo, decision);
  LOG_CHECK("ShouldProcess");

  return rv;
}
