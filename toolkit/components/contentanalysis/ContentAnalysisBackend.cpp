/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "ContentAnalysisBackend.h"

#include "ContentAnalysis.h"
#include "content_analysis/sdk/analysis_client.h"

#include "mozilla/Assertions.h"
#include "mozilla/CheckedInt.h"
#include "mozilla/StaticPrefs_browser.h"
#include "mozilla/UniquePtr.h"
#include "mozilla/dom/CanonicalBrowsingContext.h"
#include "mozilla/dom/DataTransfer.h"
#include "mozilla/dom/WindowGlobalParent.h"
#include "nsCOMPtr.h"
#include "nsITransferable.h"
#include "nsString.h"

#ifdef XP_WIN
#  define SECURITY_WIN32 1
#  include <security.h>
#endif

namespace mozilla::contentanalysis {

static nsresult ConvertToProtobuf(
    nsIClientDownloadResource* aIn,
    content_analysis::sdk::ClientDownloadRequest_Resource* aOut) {
  nsString url;
  nsresult rv = aIn->GetUrl(url);
  NS_ENSURE_SUCCESS(rv, rv);
  aOut->set_url(NS_ConvertUTF16toUTF8(url).get());

  uint32_t resourceType;
  rv = aIn->GetType(&resourceType);
  NS_ENSURE_SUCCESS(rv, rv);
  aOut->set_type(
      static_cast<content_analysis::sdk::ClientDownloadRequest_ResourceType>(
          resourceType));

  return NS_OK;
}

#if defined(DEBUG)
static bool IsRequestReadyForAgent(nsIContentAnalysisRequest* aRequest) {
  NS_ENSURE_TRUE(aRequest, false);

  // The windowGlobal is allowed to be null at this point in gtests (only).
  // The URL must be set in that case.  We check that below.
  RefPtr<dom::WindowGlobalParent> windowGlobal;
  NS_ENSURE_SUCCESS(
      aRequest->GetWindowGlobalParent(getter_AddRefs(windowGlobal)), false);

  // Any DataTransfer should have been expanded into individual requests.
  nsCOMPtr<dom::DataTransfer> dataTransfer;
  NS_ENSURE_SUCCESS(aRequest->GetDataTransfer(getter_AddRefs(dataTransfer)),
                    false);
  NS_ENSURE_TRUE(!dataTransfer, false);

  // Any nsITransferable should have been expanded into individual requests.
  nsCOMPtr<nsITransferable> transferable;
  NS_ENSURE_SUCCESS(aRequest->GetTransferable(getter_AddRefs(transferable)),
                    false);
  NS_ENSURE_TRUE(!transferable, false);

  nsCString userActionId;
  NS_ENSURE_SUCCESS(aRequest->GetUserActionId(userActionId), false);
  NS_ENSURE_TRUE(!userActionId.IsEmpty(), false);

  int64_t userActionRequestsCount;
  NS_ENSURE_SUCCESS(
      aRequest->GetUserActionRequestsCount(&userActionRequestsCount), false);
  NS_ENSURE_TRUE(userActionRequestsCount, false);

  nsCOMPtr<nsIURI> url;
  NS_ENSURE_SUCCESS(aRequest->GetUrl(getter_AddRefs(url)), false);
  if (!url) {
    // If no URL is given then we use the one for the window.
    NS_ENSURE_TRUE(windowGlobal, false);
    url = ContentAnalysis::GetURIForBrowsingContext(
        windowGlobal->Canonical()->GetBrowsingContext());
    NS_ENSURE_TRUE(url, false);
  }

  return true;
}
#endif  // defined(DEBUG)

nsresult ContentAnalysisBackend::ConvertRequestToProtobuf(
    nsIContentAnalysisRequest* aIn,
    content_analysis::sdk::ContentAnalysisRequest* aOut) {
  MOZ_ASSERT(IsRequestReadyForAgent(aIn));

  nsIContentAnalysisRequest::AnalysisType analysisType;
  nsresult rv = aIn->GetAnalysisType(&analysisType);
  NS_ENSURE_SUCCESS(rv, rv);
  auto connector =
      static_cast<content_analysis::sdk::AnalysisConnector>(analysisType);
  aOut->set_analysis_connector(connector);

  nsIContentAnalysisRequest::Reason reason;
  rv = aIn->GetReason(&reason);
  NS_ENSURE_SUCCESS(rv, rv);
  auto sdkReason =
      static_cast<content_analysis::sdk::ContentAnalysisRequest::Reason>(
          reason);
  aOut->set_reason(sdkReason);

  nsCString requestToken;
  rv = aIn->GetRequestToken(requestToken);
  NS_ENSURE_SUCCESS(rv, rv);
  aOut->set_request_token(requestToken.get(), requestToken.Length());
  nsCString userActionId;
  rv = aIn->GetUserActionId(userActionId);
  NS_ENSURE_SUCCESS(rv, rv);
  aOut->set_user_action_id(userActionId.get(), userActionId.Length());
  int64_t userActionRequestsCount;
  rv = aIn->GetUserActionRequestsCount(&userActionRequestsCount);
  NS_ENSURE_SUCCESS(rv, rv);
  aOut->set_user_action_requests_count(userActionRequestsCount);

  int32_t timeout = StaticPrefs::browser_contentanalysis_agent_timeout();
  // Non-positive timeout values indicate testing, and the test agent does not
  // care about this value.
  timeout = std::max(timeout, 1);
  uint32_t timeoutMultiplier;
  rv = aIn->GetTimeoutMultiplier(&timeoutMultiplier);
  NS_ENSURE_SUCCESS(rv, rv);
  timeoutMultiplier = std::max(timeoutMultiplier, static_cast<uint32_t>(1));
  auto checkedTimeout = CheckedInt64(time(nullptr)) +
                        timeout * userActionRequestsCount * timeoutMultiplier;
  if (!checkedTimeout.isValid()) {
    return NS_ERROR_FAILURE;
  }
  aOut->set_expires_at(checkedTimeout.value());

  const std::string tag = "dlp";  // TODO:
  *aOut->add_tags() = tag;

  auto* requestData = aOut->mutable_request_data();

  RefPtr<dom::WindowGlobalParent> windowGlobal;
  rv = aIn->GetWindowGlobalParent(getter_AddRefs(windowGlobal));
  NS_ENSURE_SUCCESS(rv, rv);
  nsCOMPtr<nsIURI> url;
  rv = aIn->GetUrl(getter_AddRefs(url));
  NS_ENSURE_SUCCESS(rv, rv);
  if (!url) {
    // We already checked that this exists.
    MOZ_ASSERT(windowGlobal);
    // If no URL is given then we use the one for the window.
    url = ContentAnalysis::GetURIForBrowsingContext(
        windowGlobal->Canonical()->GetBrowsingContext());
    // We also already checked for this.
    MOZ_ASSERT(url);
  }
  nsCString urlString;
  rv = url->GetSpec(urlString);
  NS_ENSURE_SUCCESS(rv, rv);
  if (!urlString.IsEmpty()) {
    requestData->set_url(urlString.get());
  }

  if (windowGlobal) {
    nsString title;
    windowGlobal->GetDocumentTitle(title);
    requestData->set_tab_title(NS_ConvertUTF16toUTF8(title).get());
  }

  nsString email;
  rv = aIn->GetEmail(email);
  NS_ENSURE_SUCCESS(rv, rv);
  if (!email.IsEmpty()) {
    requestData->set_email(NS_ConvertUTF16toUTF8(email).get());
  }

  nsCString sha256Digest;
  rv = aIn->GetSha256Digest(sha256Digest);
  NS_ENSURE_SUCCESS(rv, rv);
  if (!sha256Digest.IsEmpty()) {
    requestData->set_digest(sha256Digest.get());
  }

#ifdef XP_WIN
  ULONG userLen = 0;
  GetUserNameExW(NameSamCompatible, nullptr, &userLen);
  if (GetLastError() == ERROR_MORE_DATA && userLen > 0) {
    auto user = mozilla::MakeUnique<wchar_t[]>(userLen);
    if (GetUserNameExW(NameSamCompatible, user.get(), &userLen)) {
      auto* clientMetadata = aOut->mutable_client_metadata();
      auto* browser = clientMetadata->mutable_browser();
      browser->set_machine_user(NS_ConvertUTF16toUTF8(user.get()).get());
    }
  }
#endif

  nsTArray<RefPtr<nsIClientDownloadResource>> resources;
  rv = aIn->GetResources(resources);
  NS_ENSURE_SUCCESS(rv, rv);
  if (!resources.IsEmpty()) {
    auto* pbClientDownloadRequest = requestData->mutable_csd();
    for (auto& nsResource : resources) {
      rv = ConvertToProtobuf(nsResource.get(),
                             pbClientDownloadRequest->add_resources());
      NS_ENSURE_SUCCESS(rv, rv);
    }
  }

  if (analysisType == nsIContentAnalysisRequest::AnalysisType::eBulkDataEntry ||
      analysisType == nsIContentAnalysisRequest::AnalysisType::eDataCopied) {
    nsString textContent;
    rv = aIn->GetTextContent(textContent);
    NS_ENSURE_SUCCESS(rv, rv);
    if (!textContent.IsEmpty()) {
      aOut->set_text_content(NS_ConvertUTF16toUTF8(textContent).get());
    }
  }

  return NS_OK;
}

/* static */
already_AddRefed<ContentAnalysisResponse>
ContentAnalysisBackend::ConvertResponseFromProtobuf(
    content_analysis::sdk::ContentAnalysisResponse&& aResponse,
    const nsCString& aUserActionId) {
  ContentAnalysisResponse::Action action =
      ContentAnalysisResponse::Action::eUnspecified;
  for (const auto& result : aResponse.results()) {
    if (!result.has_status() ||
        result.status() !=
            content_analysis::sdk::ContentAnalysisResponse::Result::SUCCESS) {
      return nullptr;
    }
    // The action values increase with severity, so the max is the most severe.
    for (const auto& rule : result.triggered_rules()) {
      action = static_cast<ContentAnalysisResponse::Action>(std::max(
          static_cast<uint32_t>(action), static_cast<uint32_t>(rule.action())));
    }
  }

  // If no rules blocked then we should allow.
  if (action == ContentAnalysisResponse::Action::eUnspecified) {
    action = ContentAnalysisResponse::Action::eAllow;
  }

  const auto& requestToken = aResponse.request_token();
  nsCString requestTokenStr;
  requestTokenStr.Assign(requestToken.data(), requestToken.size());

  return MakeRefPtr<ContentAnalysisResponse>(action, requestTokenStr,
                                             aUserActionId)
      .forget();
}

}  // namespace mozilla::contentanalysis
