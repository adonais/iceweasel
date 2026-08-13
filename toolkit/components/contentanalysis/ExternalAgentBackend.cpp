/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "ExternalAgentBackend.h"

#include "ContentAnalysis.h"
#include "ContentAnalysisShared.h"
#include "content_analysis/sdk/analysis_client.h"

#include "GMPUtils.h"  // ToHexString
#include "mozilla/Assertions.h"
#include "mozilla/Preferences.h"
#include "mozilla/Services.h"
#include "mozilla/StaticPrefs_browser.h"
#include "mozilla/dom/Promise.h"
#include "mozilla/glean/ContentanalysisMetrics.h"
#include "nsIObserverService.h"
#include "nsString.h"
#include "nsThreadPool.h"

#include <sstream>

#ifdef XP_WIN
#  include "mozilla/WinDllServices.h"
#endif

namespace mozilla::contentanalysis {

// Defined in ContentAnalysis.cpp.
extern LazyLogModule gContentAnalysisLog;

#define LOGD(...)                                        \
  MOZ_LOG(mozilla::contentanalysis::gContentAnalysisLog, \
          mozilla::LogLevel::Debug, (__VA_ARGS__))

#define LOGE(...)                                        \
  MOZ_LOG(mozilla::contentanalysis::gContentAnalysisLog, \
          mozilla::LogLevel::Error, (__VA_ARGS__))

}  // namespace mozilla::contentanalysis

namespace {

const char* kPipePathNamePref = "browser.contentanalysis.pipe_path_name";
const char* kClientSignature = "browser.contentanalysis.client_signature";
const char* kAgentNamePref = "browser.contentanalysis.agent_name";
const char* kInterceptionPointPrefNames[] = {
    "browser.contentanalysis.interception_point.clipboard.enabled",
    "browser.contentanalysis.interception_point.download.enabled",
    "browser.contentanalysis.interception_point.drag_and_drop.enabled",
    "browser.contentanalysis.interception_point.file_upload.enabled",
    "browser.contentanalysis.interception_point.print.enabled",
};

// Allow up to this many threads to be concurrently engaged in synchronous
// communcations with the agent.  That limit is set by
// browser.contentanalysis.max_connections but is clamped to not exceed
// this value.
const unsigned long kMaxContentAnalysisAgentThreads = 256;
// Max number of threads that we keep even if they have no tasks to run.
const unsigned long kMaxIdleContentAnalysisAgentThreads = 2;
// Time (ms) we wait before declaring a thread idle.  100ms is the
// threadpool default.
const unsigned long kIdleContentAnalysisAgentTimeoutMs = 100;
// Time we wait before destroying the kMaxIdleContentAnalysisAgentThreads
// threads.  Content Analysis never does this, which is what UINT32_MAX
// means.
const unsigned long kMaxIdleContentAnalysisAgentTimeoutMs = UINT32_MAX;

// How long the threadpool will wait at shutdown for the agent to complete any
// in-progress operations before it abandons the threads (they will keep
// running).
const uint32_t kShutdownThreadpoolTimeoutMs = 2 * 1000;

}  // namespace

namespace mozilla::contentanalysis {

// Only ExternalAgentBackend needs the print data / file path inline in the
// protobuf request: it has no other channel to ship this content to the
// agent process. The WASM backend instead passes file/print content bytes
// directly to the runner alongside the (shared) request, so it doesn't
// override this, and, unlike the external agent, isn't limited to Windows for
// print requests.
nsresult ExternalAgentBackend::ConvertRequestToProtobuf(
    nsIContentAnalysisRequest* aRequest,
    content_analysis::sdk::ContentAnalysisRequest* aOut) {
  nsresult rv =
      ContentAnalysisBackend::ConvertRequestToProtobuf(aRequest, aOut);
  NS_ENSURE_SUCCESS(rv, rv);

  nsIContentAnalysisRequest::AnalysisType analysisType;
  rv = aRequest->GetAnalysisType(&analysisType);
  NS_ENSURE_SUCCESS(rv, rv);

  auto* requestData = aOut->mutable_request_data();

  if (analysisType == nsIContentAnalysisRequest::AnalysisType::ePrint) {
#if XP_WIN
    nsTArray<uint8_t> printData;
    MOZ_TRY(aRequest->GetPrintData(printData));
    // Copy the PDF bytes into a file-mapping section so the agent can map them
    // into its own process. The agent duplicates this handle out of our process
    // while servicing the request, so the caller must keep the handle open
    // until this request's response arrives (see
    // ExternalAgentBackend::Analyze).
    LARGE_INTEGER dataContentLength;
    dataContentLength.QuadPart = static_cast<LONGLONG>(printData.Length());
    HANDLE printDataHandle = ::CreateFileMappingW(
        INVALID_HANDLE_VALUE, nullptr, PAGE_READWRITE,
        dataContentLength.HighPart, dataContentLength.LowPart, nullptr);
    if (!printDataHandle) {
      return NS_ERROR_OUT_OF_MEMORY;
    }
    {
      mozilla::nt::AutoMappedView view(printDataHandle, FILE_MAP_ALL_ACCESS);
      memcpy(view.as<uint8_t>(), printData.Elements(), printData.Length());
    }
    aOut->mutable_print_data()->set_handle(
        static_cast<uint64_t>(reinterpret_cast<uintptr_t>(printDataHandle)));
    aOut->mutable_print_data()->set_size(printData.Length());

    nsString printerName;
    MOZ_TRY(aRequest->GetPrinterName(printerName));
    requestData->mutable_print_metadata()->set_printer_name(
        NS_ConvertUTF16toUTF8(printerName).get());
    return NS_OK;
#else
    return NS_ERROR_NOT_IMPLEMENTED;
#endif
  }

  nsString filePath;
  rv = aRequest->GetFilePath(filePath);
  NS_ENSURE_SUCCESS(rv, rv);
  if (!filePath.IsEmpty()) {
    std::string filePathStr = NS_ConvertUTF16toUTF8(filePath).get();
    aOut->set_file_path(filePathStr);
    auto filename = filePathStr.substr(filePathStr.find_last_of("/\\") + 1);
    if (!filename.empty()) {
      requestData->set_filename(filename);
    }
  }
  return NS_OK;
}

namespace {
// We don't want this overload to be called for string parameters, so
// use std::enable_if
template <typename T>
typename std::enable_if_t<!std::is_same_v<std::string, std::decay_t<T>>, void>
LogWithMaxLength(std::stringstream& ss, T value, size_t maxLength) {
  ss << value;
}

// 0 indicates no max length
template <typename T>
typename std::enable_if_t<std::is_same_v<std::string, std::decay_t<T>>, void>
LogWithMaxLength(std::stringstream& ss, T value, size_t maxLength) {
  if (!maxLength || value.length() < maxLength) {
    ss << value;
  } else {
    ss << value.substr(0, maxLength) << " (truncated)";
  }
}
}  // namespace

static void LogRequest(
    const content_analysis::sdk::ContentAnalysisRequest* aPbRequest) {
  // We cannot use Protocol Buffer's DebugString() because we optimize for
  // lite runtime.
  if (!static_cast<LogModule*>(gContentAnalysisLog)
           ->ShouldLog(LogLevel::Debug)) {
    return;
  }

  std::stringstream ss;
  ss << "ContentAnalysisRequest:"
     << "\n";

#define ADD_FIELD_WITH_VALFUNC(PBUF, NAME, FUNC, VALFUNC) \
  ss << "  " << (NAME) << ": ";                           \
  if ((PBUF)->has_##FUNC()) {                             \
    LogWithMaxLength(ss, VALFUNC(), 500);                 \
    ss << "\n";                                           \
  } else                                                  \
    ss << "<none>"                                        \
       << "\n";

#define ADD_FIELD(PBUF, NAME, FUNC) \
  ADD_FIELD_WITH_VALFUNC(PBUF, NAME, FUNC, (PBUF)->FUNC)

#define ADD_EXISTS(PBUF, NAME, FUNC) \
  ss << "  " << (NAME) << ": "       \
     << ((PBUF)->has_##FUNC() ? "<exists>" : "<none>") << "\n";

#define ADD_NONEMPTY(PBUF, NAME, FUNC)                                      \
  ss << "  " << (NAME) << ": "                                              \
     << (((PBUF)->has_##FUNC() && (!(PBUF)->FUNC().empty())) ? "<nonempty>" \
                                                             : "<none>")    \
     << "\n";

  ADD_FIELD(aPbRequest, "Expires", expires_at);
  ADD_FIELD(aPbRequest, "Analysis Type", analysis_connector);
  ADD_FIELD(aPbRequest, "Request Token", request_token);
  ADD_FIELD(aPbRequest, "User Action ID", user_action_id);
  ADD_FIELD(aPbRequest, "User Action Requests Count",
            user_action_requests_count);
  ADD_FIELD(aPbRequest, "File Path", file_path);
  ADD_NONEMPTY(aPbRequest, "Text Content", text_content);
  // TODO: Tags
  ADD_EXISTS(aPbRequest, "Request Data Struct", request_data);
  const auto* requestData =
      aPbRequest->has_request_data() ? &aPbRequest->request_data() : nullptr;
  if (requestData) {
    ADD_FIELD(requestData, "  Url", url);
    ADD_FIELD(requestData, "  Email", email);
    auto hexDigestFunc = [&requestData]() {
      return ToHexString(
          reinterpret_cast<const uint8_t*>(requestData->digest().c_str()),
          requestData->digest().length());
    };
    ADD_FIELD_WITH_VALFUNC(requestData, "  SHA-256 Digest", digest,
                           hexDigestFunc);
    ADD_FIELD(requestData, "  Filename", filename);
    ADD_EXISTS(requestData, "  Client Download Request struct", csd);
    const auto* csd = requestData->has_csd() ? &requestData->csd() : nullptr;
    if (csd) {
      uint32_t i = 0;
      for (const auto& resource : csd->resources()) {
        ss << "      Resource " << i << ":"
           << "\n";
        ADD_FIELD(&resource, "      Url", url);
        ADD_FIELD(&resource, "      Type", type);
        ++i;
      }
    }
  }
  ADD_EXISTS(aPbRequest, "Client Metadata Struct", client_metadata);
  const auto* clientMetadata = aPbRequest->has_client_metadata()
                                   ? &aPbRequest->client_metadata()
                                   : nullptr;
  if (clientMetadata) {
    ADD_EXISTS(clientMetadata, "  Browser Struct", browser);
    const auto* browser =
        clientMetadata->has_browser() ? &clientMetadata->browser() : nullptr;
    if (browser) {
      ADD_FIELD(browser, "    Machine User", machine_user);
    }
  }

#undef ADD_EXISTS
#undef ADD_FIELD

  LOGD("%s", ss.str().c_str());
}

static void LogResponse(
    content_analysis::sdk::ContentAnalysisResponse* aPbResponse) {
  if (!static_cast<LogModule*>(gContentAnalysisLog)
           ->ShouldLog(LogLevel::Debug)) {
    return;
  }

  std::stringstream ss;
  ss << "ContentAnalysisResponse:"
     << "\n";

#define ADD_FIELD(PBUF, NAME, FUNC) \
  ss << "  " << (NAME) << ": ";     \
  if ((PBUF)->has_##FUNC())         \
    ss << (PBUF)->FUNC() << "\n";   \
  else                              \
    ss << "<none>"                  \
       << "\n";

  ADD_FIELD(aPbResponse, "Request Token", request_token);
  uint32_t i = 0;
  for (const auto& result : aPbResponse->results()) {
    ss << "  Result " << i << ":"
       << "\n";
    ADD_FIELD(&result, "    Status", status);
    uint32_t j = 0;
    for (const auto& rule : result.triggered_rules()) {
      ss << "    Rule " << j << ":"
         << "\n";
      ADD_FIELD(&rule, "    action", action);
      ++j;
    }
    ++i;
  }

#undef ADD_FIELD

  LOGD("%s", ss.str().c_str());
}

static nsresult ConvertToProtobuf(
    nsIContentAnalysisAcknowledgement* aIn, const nsACString& aRequestToken,
    content_analysis::sdk::ContentAnalysisAcknowledgement* aOut) {
  aOut->set_request_token(aRequestToken.Data(), aRequestToken.Length());

  nsIContentAnalysisAcknowledgement::Result result;
  nsresult rv = aIn->GetResult(&result);
  NS_ENSURE_SUCCESS(rv, rv);
  aOut->set_status(
      static_cast<content_analysis::sdk::ContentAnalysisAcknowledgement_Status>(
          result));

  nsIContentAnalysisAcknowledgement::FinalAction finalAction;
  rv = aIn->GetFinalAction(&finalAction);
  NS_ENSURE_SUCCESS(rv, rv);
  aOut->set_final_action(
      static_cast<
          content_analysis::sdk::ContentAnalysisAcknowledgement_FinalAction>(
          finalAction));

  return NS_OK;
}

static void LogAcknowledgement(
    content_analysis::sdk::ContentAnalysisAcknowledgement* aPbAck) {
  if (!static_cast<LogModule*>(gContentAnalysisLog)
           ->ShouldLog(LogLevel::Debug)) {
    return;
  }

  std::stringstream ss;
  ss << "ContentAnalysisAcknowledgement:"
     << "\n";

#define ADD_FIELD(PBUF, NAME, FUNC) \
  ss << "  " << (NAME) << ": ";     \
  if ((PBUF)->has_##FUNC())         \
    ss << (PBUF)->FUNC() << "\n";   \
  else                              \
    ss << "<none>"                  \
       << "\n";

  ADD_FIELD(aPbAck, "Request Token", request_token);
  ADD_FIELD(aPbAck, "Status", status);
  ADD_FIELD(aPbAck, "Final Action", final_action);

#undef ADD_FIELD

  LOGD("%s", ss.str().c_str());
}

nsresult ExternalAgentBackend::CreateContentAnalysisClient(
    nsCString&& aPipePathName, nsString&& aClientSignatureSetting,
    bool aIsPerUser) {
  MOZ_ASSERT(!NS_IsMainThread());

  std::shared_ptr<content_analysis::sdk::Client> client;
  bool isShutDown = IsContentAnalysisShutDown();
  if (!isShutDown) {
    client.reset(
        content_analysis::sdk::Client::Create({aPipePathName.get(), aIsPerUser})
            .release());
    LOGD("Content analysis is %s", client ? "connected" : "not available");
  } else {
    LOGD("ContentAnalysis::IsShutDown is true");
  }

#ifdef XP_WIN
  if (client && !aClientSignatureSetting.IsEmpty()) {
    std::string agentPath = client->GetAgentInfo().binary_path;
    nsString agentWidePath = NS_ConvertUTF8toUTF16(agentPath);
    UniquePtr<wchar_t[]> orgName =
        mozilla::DllServices::Get()->GetBinaryOrgName(agentWidePath.get());
    bool signatureMatches = false;
    if (orgName) {
      auto dependentOrgName = nsDependentString(orgName.get());
      LOGD("Content analysis client signed with organization name \"%S\"",
           dependentOrgName.getW());
      signatureMatches = aClientSignatureSetting.Equals(dependentOrgName);
    } else {
      LOGD("Content analysis client has no signature");
    }
    if (!signatureMatches) {
      LOGE(
          "Got mismatched content analysis client signature! All content "
          "analysis operations will fail.");
      nsresult rv = NS_ERROR_INVALID_SIGNATURE;
      glean::content_analysis::connection_failure
          .Get(nsCString{SafeGetStaticErrorName(rv)})
          .Add();
      NS_DispatchToMainThread(
          NS_NewRunnableFunction(__func__, [self = RefPtr{this}, rv]() {
            AssertIsOnMainThread();
            self->mClientPromise->Reject(rv, __func__);
            self->mCreatingClient = false;
          }));
      return NS_OK;
    }
  }
#endif  // XP_WIN
  NS_DispatchToMainThread(NS_NewRunnableFunction(
      __func__,
      [self = RefPtr{this}, isShutDown, client = std::move(client)]() {
        AssertIsOnMainThread();
        // Note that if mClientPromise has been resolved or rejected,
        // calling Resolve() or Reject() is a no-op.
        if (client) {
          self->mHaveResolvedClientPromise = true;
          self->mClientPromise->Resolve(client, __func__);
        } else {
          nsresult promiseResult = isShutDown ? NS_ERROR_ILLEGAL_DURING_SHUTDOWN
                                              : NS_ERROR_CONNECTION_REFUSED;
          glean::content_analysis::connection_failure
              .Get(nsCString{SafeGetStaticErrorName(promiseResult)})
              .Add();
          self->mClientPromise->Reject(promiseResult, __func__);
        }
        self->mCreatingClient = false;
      }));

  return NS_OK;
}

ExternalAgentBackend::ExternalAgentBackend()
    : mRequestTokenToBasicRequestInfoMap(
          "ExternalAgentBackend::mRequestTokenToBasicRequestInfoMap") {
  mClientPromise = MakeRefPtr<ClientPromise::Private>(
      "ExternalAgentBackend::ExternalAgentBackend");

  mThreadPool = MakeRefPtr<nsThreadPool>();
  MOZ_ALWAYS_SUCCEEDS(
      mThreadPool->SetName(nsAutoCString("ContentAnalysisAgentIO")));

  unsigned long threadLimit =
      std::min(static_cast<unsigned long>(
                   StaticPrefs::browser_contentanalysis_max_connections()),
               kMaxContentAnalysisAgentThreads);
  MOZ_ALWAYS_SUCCEEDS(mThreadPool->SetThreadLimit(threadLimit));

  MOZ_ALWAYS_SUCCEEDS(
      mThreadPool->SetIdleThreadLimit(kMaxIdleContentAnalysisAgentThreads));
  MOZ_ALWAYS_SUCCEEDS(mThreadPool->SetIdleThreadGraceTimeout(
      kIdleContentAnalysisAgentTimeoutMs));
  MOZ_ALWAYS_SUCCEEDS(mThreadPool->SetIdleThreadMaximumTimeout(
      kMaxIdleContentAnalysisAgentTimeoutMs));
}

void ExternalAgentBackend::OnMaxConnectionsPrefChanged() {
  AssertIsOnMainThread();
  if (!mThreadPool) {
    return;
  }
  unsigned long threadLimit =
      std::min(static_cast<unsigned long>(
                   StaticPrefs::browser_contentanalysis_max_connections()),
               kMaxContentAnalysisAgentThreads);
  MOZ_ALWAYS_SUCCEEDS(mThreadPool->SetThreadLimit(threadLimit));
}

ExternalAgentBackend::~ExternalAgentBackend() {
  // Shutdown() should have been called via ContentAnalysis::Close().
  MOZ_ASSERT(!mThreadPool);
}

void ExternalAgentBackend::Shutdown() {
  AssertIsOnMainThread();

  // Reject the promise to avoid assertions when it gets destroyed
  // No-op if the promise has already been resolved or rejected
  mClientPromise->Reject(NS_ERROR_ILLEGAL_DURING_SHUTDOWN, __func__);

  // In case the promise _was_ resolved before, create a new one and reject
  // that.
  mClientPromise =
      MakeRefPtr<ClientPromise::Private>("ExternalAgentBackend:Shutdown");
  mClientPromise->Reject(NS_ERROR_ILLEGAL_DURING_SHUTDOWN, __func__);

  if (mThreadPool) {
    mThreadPool->ShutdownWithTimeout(kShutdownThreadpoolTimeoutMs);
    mThreadPool = nullptr;
  }
}

/* static */ bool ExternalAgentBackend::IsContentAnalysisShutDown() {
  RefPtr<ContentAnalysis> ca = ContentAnalysis::GetContentAnalysisFromService();
  return !ca || ca->IsShutDown();
}

nsresult ExternalAgentBackend::ForceReinitializeForTest() {
  AssertIsOnMainThread();
  return CreateClientIfNecessary(/* aForceCreate */ true);
}

bool ExternalAgentBackend::IsCreatingClientForTest() const {
  AssertIsOnMainThread();
  return mCreatingClient;
}

nsresult ExternalAgentBackend::CreateClientIfNecessary(
    bool aForceCreate /* = false */) {
  AssertIsOnMainThread();

  if (IsContentAnalysisShutDown()) {
    return NS_OK;
  }

  nsCString pipePathName;
  nsresult rv = Preferences::GetCString(kPipePathNamePref, pipePathName);
  if (NS_WARN_IF(NS_FAILED(rv))) {
    mClientPromise->Reject(rv, __func__);
    return rv;
  }
  if (mHaveResolvedClientPromise && !aForceCreate) {
    return NS_OK;
  }
  // mCreatingClient is only accessed on the main thread
  if (mCreatingClient) {
    return NS_OK;
  }
  mCreatingClient = true;
  mHaveResolvedClientPromise = false;
  // Reject the promise to avoid assertions when it gets destroyed
  // No-op if the promise has already been resolved or rejected
  mClientPromise->Reject(NS_ERROR_FAILURE, __func__);
  mClientPromise = MakeRefPtr<ClientPromise::Private>(
      "ExternalAgentBackend:CreateClientIfNecessary");

  bool isPerUser = StaticPrefs::browser_contentanalysis_is_per_user();
  nsString clientSignature;
  // It's OK if this fails, we will default to the empty string.
  Preferences::GetString(kClientSignature, clientSignature);
  RecordConnectionSettingsTelemetry(clientSignature);
  LOGD("Dispatching background task to create Content Analysis client");
  glean::content_analysis::connection_attempt.Add();
  if (aForceCreate) {
    // indicates this is a retry attempt
    glean::content_analysis::connection_attempt_retry.Add();
  }
  rv = NS_DispatchBackgroundTask(NS_NewCancelableRunnableFunction(
      "ExternalAgentBackend::CreateContentAnalysisClient",
      [owner = RefPtr{this}, pipePathName = std::move(pipePathName),
       clientSignature = std::move(clientSignature), isPerUser]() mutable {
        owner->CreateContentAnalysisClient(
            std::move(pipePathName), std::move(clientSignature), isPerUser);
      }));
  if (NS_WARN_IF(NS_FAILED(rv))) {
    glean::content_analysis::connection_failure
        .Get(nsCString{SafeGetStaticErrorName(rv)})
        .Add();
    mClientPromise->Reject(rv, __func__);
    return rv;
  }
  return NS_OK;
}

void ExternalAgentBackend::RecordConnectionSettingsTelemetry(
    const nsString& aClientSignature) {
  AssertIsOnMainThread();
  {
    nsCString agentName;
    Preferences::GetCString(kAgentNamePref, agentName);
    glean::content_analysis::agent_name.Set(agentName);
  }
  AutoTArray<nsCString, 1> interceptionPointsOff;
  for (const char* interceptionPointPrefName : kInterceptionPointPrefNames) {
    bool interceptionPointPrefValue = false;
    Preferences::GetBool(interceptionPointPrefName,
                         &interceptionPointPrefValue);
    if (!interceptionPointPrefValue) {
      interceptionPointsOff.AppendElement(interceptionPointPrefName);
    }
  }
  if (!interceptionPointsOff.IsEmpty()) {
    glean::content_analysis::interception_points_turned_off.Set(
        interceptionPointsOff);
  }
  glean::content_analysis::show_blocked_result.Set(
      StaticPrefs::browser_contentanalysis_show_blocked_result());
  glean::content_analysis::default_result.Set(
      StaticPrefs::browser_contentanalysis_default_result());
  glean::content_analysis::timeout_result.Set(
      StaticPrefs::browser_contentanalysis_timeout_result());
  if (!aClientSignature.IsEmpty()) {
    glean::content_analysis::client_signature.Set(
        NS_ConvertUTF16toUTF8(aClientSignature));
  }
  glean::content_analysis::bypass_for_same_tab_operations.Set(
      StaticPrefs::browser_contentanalysis_bypass_for_same_tab_operations());
  {
    nsCString allowUrlRegexList;
    Preferences::GetCString(kAllowUrlPref, allowUrlRegexList);
    // Unfortunately because of the way enterprise policies set and lock prefs,
    // we can't check if the value is different than the default in
    // StaticPrefList.yaml, and instead we have to duplicate that value here. At
    // least we have a test around this so we can update this value if the
    // default changes.
    const char* defaultAllowUrlRegexList = "^about:(?!blank|srcdoc).*";
    glean::content_analysis::allow_url_regex_list_set.Set(
        !allowUrlRegexList.Equals(defaultAllowUrlRegexList));
  }
  {
    nsCString denyUrlRegexList;
    Preferences::GetCString(kDenyUrlPref, denyUrlRegexList);
    glean::content_analysis::deny_url_regex_list_set.Set(
        !denyUrlRegexList.IsEmpty());
  }
}

nsresult ExternalAgentBackend::EnsureReady() {
  AssertIsOnMainThread();
  return CreateClientIfNecessary();
}

void ExternalAgentBackend::CancelUserAction(const nsACString& aUserActionId) {
  CallClientWithRetry<std::nullptr_t>(
      __func__,
      [userActionId = nsCString(aUserActionId)](
          std::shared_ptr<content_analysis::sdk::Client> client) mutable
          -> Result<std::nullptr_t, nsresult> {
        MOZ_ASSERT(!NS_IsMainThread());
        auto owner = ContentAnalysis::GetContentAnalysisFromService();
        if (!owner) {
          // May be shutting down
          return nullptr;
        }
        content_analysis::sdk::ContentAnalysisCancelRequests cancelRequest;
        cancelRequest.set_user_action_id(userActionId.get(),
                                         userActionId.Length());
        int err = client->CancelRequests(cancelRequest);
        if (err != 0) {
          LOGE(
              "SendCancelToAgent got error %d for "
              "user_action_id: %s",
              err, userActionId.get());
          return Err(NS_ERROR_FAILURE);
        }
        LOGD(
            "SendCancelToAgent successfully sent CancelRequests to "
            "agent for user_action_id: %s",
            userActionId.get());
        return nullptr;
      })
      ->Then(
          GetCurrentSerialEventTarget(), __func__, []() { /* nothing to do */ },
          [](nsresult rv) {
            LOGE("SendCancelToAgent failed to get the client with error %s",
                 SafeGetStaticErrorName(rv));
          });
}

template <typename T, typename U>
RefPtr<MozPromise<T, nsresult, true>> ExternalAgentBackend::CallClientWithRetry(
    StaticString aMethodName, U&& aClientCallFunc) {
  AssertIsOnMainThread();
  auto promise =
      MakeRefPtr<typename MozPromise<T, nsresult, true>::Private>(aMethodName);

  // Make a copy of aClientCallFunc so the retry path can re-invoke it.
  auto reconnectAndRetry = [clientCallFunc = aClientCallFunc, aMethodName,
                            promise, self = RefPtr{this}](nsresult rv) mutable {
    AssertIsOnMainThread();
    LOGD("Failed to get client - trying to reconnect: %s",
         SafeGetStaticErrorName(rv));
    rv = self->CreateClientIfNecessary(/* aForceCreate */ true);
    if (NS_FAILED(rv)) {
      LOGD("Failed to reconnect to client: %s", SafeGetStaticErrorName(rv));
      self->mClientPromise->Reject(rv, aMethodName);
      promise->Reject(rv, aMethodName);
      return;
    }
    self->mClientPromise->Then(
        GetCurrentSerialEventTarget(), aMethodName,
        [aMethodName, promise, self,
         clientCallFunc = std::move(clientCallFunc)](
            std::shared_ptr<content_analysis::sdk::Client> client) mutable {
          nsresult rv =
              self->mThreadPool->Dispatch(NS_NewCancelableRunnableFunction(
                  aMethodName, [aMethodName, promise,
                                clientCallFunc = std::move(clientCallFunc),
                                client = std::move(client)]() mutable {
                    auto result = clientCallFunc(client);
                    if (result.isOk()) {
                      promise->Resolve(result.unwrap(), aMethodName);
                    } else {
                      promise->Reject(result.unwrapErr(), aMethodName);
                    }
                  }));
          if (NS_FAILED(rv)) {
            LOGE(
                "Failed to launch background task in second call for %s, "
                "error=%s",
                aMethodName.get(), SafeGetStaticErrorName(rv));
            promise->Reject(rv, aMethodName);
          }
        },
        [aMethodName, promise](nsresult rv) {
          LOGE("Failed to get client again for %s, error=%s", aMethodName.get(),
               SafeGetStaticErrorName(rv));
          promise->Reject(rv, aMethodName);
        });
  };

  mClientPromise->Then(
      GetCurrentSerialEventTarget(), aMethodName,
      [aMethodName, promise, self = RefPtr{this},
       clientCallFunc = std::forward<U>(aClientCallFunc), reconnectAndRetry](
          std::shared_ptr<content_analysis::sdk::Client> client) mutable {
        nsresult rv =
            self->mThreadPool->Dispatch(NS_NewCancelableRunnableFunction(
                aMethodName, [aMethodName, promise,
                              clientCallFunc = std::move(clientCallFunc),
                              reconnectAndRetry = std::move(reconnectAndRetry),
                              client = std::move(client)]() mutable {
                  auto result = clientCallFunc(client);
                  if (result.isOk()) {
                    promise->Resolve(result.unwrap(), aMethodName);
                    return;
                  }
                  nsresult rv = result.unwrapErr();
                  NS_DispatchToMainThread(NS_NewCancelableRunnableFunction(
                      "reconnect to Content Analysis client",
                      [rv, reconnectAndRetry =
                               std::move(reconnectAndRetry)]() mutable {
                        reconnectAndRetry(rv);
                      }));
                }));
        if (NS_FAILED(rv)) {
          LOGE(
              "Failed to launch background task in first call for %s, "
              "error=%s",
              aMethodName.get(), SafeGetStaticErrorName(rv));
          promise->Reject(rv, aMethodName);
        }
      },
      [reconnectAndRetry](nsresult rv) mutable { reconnectAndRetry(rv); });
  return promise.forget();
}

nsresult ExternalAgentBackend::Analyze(
    nsCOMPtr<nsIContentAnalysisRequest> aRequest, bool aAutoAcknowledge) {
  AssertIsOnMainThread();
  ++mRequestCount;

  nsCString requestToken;
  MOZ_ALWAYS_SUCCEEDS(aRequest->GetRequestToken(requestToken));
  nsCString userActionId;
  MOZ_ALWAYS_SUCCEEDS(aRequest->GetUserActionId(userActionId));

  // We will need to submit the request to the agent.
  content_analysis::sdk::ContentAnalysisRequest pbRequest;
  nsresult rv = ConvertRequestToProtobuf(aRequest, &pbRequest);
  NS_ENSURE_SUCCESS(rv, rv);

  // For print requests on Windows, ConvertRequestToProtobuf stored the
  // PDF bytes in a file-mapping section whose handle now lives in pbRequest.
  // The agent duplicates that handle out of our process while servicing the
  // request, and responses can arrive out of order, so the handle must stay
  // open until this request's response arrives -- not merely until Send()
  // returns. We hand it to DoAnalyzeRequest, which stores it in the per-request
  // map entry that is only removed once the matching response is handled. The
  // callable below also keeps a reference so the handle survives reconnect
  // retries, where that map entry is briefly removed and re-inserted. Empty on
  // platforms that do not transport print data via a handle.
  std::shared_ptr<void> printDataHandleGuard;
#ifdef XP_WIN
  if (pbRequest.has_print_data() && pbRequest.print_data().handle()) {
    printDataHandleGuard = std::shared_ptr<void>(
        reinterpret_cast<HANDLE>(
            static_cast<uintptr_t>(pbRequest.print_data().handle())),
        [](void* aHandle) { ::CloseHandle(aHandle); });
  }
#endif

  LOGD("Issuing ContentAnalysisRequest for token %s", requestToken.get());
  LogRequest(&pbRequest);
  nsCOMPtr<nsIObserverService> obsServ =
      mozilla::services::GetObserverService();
  // Avoid serializing the string here if no one is observing this message
  if (obsServ && obsServ->HasObservers("dlp-request-sent-raw")) {
    std::string requestString = pbRequest.SerializeAsString();
    nsTArray<char16_t> requestArray;
    requestArray.SetLength(requestString.size() + 1);
    for (size_t i = 0; i < requestString.size(); ++i) {
      // Since NotifyObservers() expects a null-terminated string,
      // make sure none of these values are 0.
      requestArray[i] = requestString[i] + 0xFF00;
    }
    requestArray[requestString.size()] = 0;
    if (auto ca = ContentAnalysis::GetContentAnalysisFromService()) {
      obsServ->NotifyObservers(static_cast<nsIContentAnalysis*>(ca.get()),
                               "dlp-request-sent-raw", requestArray.Elements());
    }
  }

  bool ignoreCanceled;
  MOZ_ALWAYS_SUCCEEDS(aRequest->GetTestOnlyIgnoreCanceledAndAlwaysSubmitToAgent(
      &ignoreCanceled));

  {
    nsDependentCString analysisTypeStr(
        content_analysis::sdk::AnalysisConnector_Name(
            pbRequest.analysis_connector())
            .c_str());
    glean::content_analysis::request_sent_by_analysis_type.Get(analysisTypeStr)
        .Add();
  }
  {
    nsDependentCString reasonStr(
        content_analysis::sdk::ContentAnalysisRequest_Reason_Name(
            pbRequest.reason())
            .c_str());
    glean::content_analysis::request_sent_by_reason.Get(reasonStr).Add();
  }

  CallClientWithRetry<std::nullptr_t>(
      __func__,
      [self = RefPtr{this}, userActionId = userActionId,
       pbRequest = std::move(pbRequest), aAutoAcknowledge, ignoreCanceled,
       printDataHandleGuard](
          std::shared_ptr<content_analysis::sdk::Client> client) mutable {
        MOZ_ASSERT(!NS_IsMainThread());
        return self->DoAnalyzeRequest(
            std::move(userActionId), std::move(pbRequest), aAutoAcknowledge,
            client, ignoreCanceled, printDataHandleGuard);
      })
      ->Then(
          GetMainThreadSerialEventTarget(), __func__, []() { /* do nothing */ },
          [userActionId = std::move(userActionId),
           requestToken = std::move(requestToken)](nsresult rv) mutable {
            LOGE(
                "Analyze failed to get client a second time for "
                "requestToken=%s, userActionId=%s",
                requestToken.get(), userActionId.get());
            RefPtr<ContentAnalysis> owner =
                ContentAnalysis::GetContentAnalysisFromService();
            if (!owner) {
              // May be shutting down
              return;
            }
            owner->CancelWithError(std::move(userActionId), rv);
          });

  return NS_OK;
}

Result<std::nullptr_t, nsresult> ExternalAgentBackend::DoAnalyzeRequest(
    nsCString&& aUserActionId,
    content_analysis::sdk::ContentAnalysisRequest&& aRequest,
    bool aAutoAcknowledge,
    const std::shared_ptr<content_analysis::sdk::Client>& aClient,
    bool aTestOnlyIgnoreCanceled, std::shared_ptr<void> aPrintDataHandle) {
  MOZ_ASSERT(!NS_IsMainThread());
  RefPtr<ContentAnalysis> owner =
      ContentAnalysis::GetContentAnalysisFromService();
  if (!owner) {
    // May be shutting down
    // Don't return an error because we don't want to retry
    return nullptr;
  }

  if (aRequest.has_file_path() && !aRequest.file_path().empty() &&
      (!aRequest.request_data().has_digest() ||
       aRequest.request_data().digest().empty())) {
    // Calculate the digest
    nsCString digest;
    nsCString fileCPath(aRequest.file_path().data(),
                        aRequest.file_path().length());
    nsString filePath = NS_ConvertUTF8toUTF16(fileCPath);
    nsresult rv = ContentAnalysisRequest::GetFileDigest(filePath, digest);
    if (NS_FAILED(rv)) {
      owner->CancelWithError(std::move(aUserActionId), rv);
      // Don't return an error because we don't want to retry
      return nullptr;
    }
    if (!digest.IsEmpty()) {
      aRequest.mutable_request_data()->set_digest(digest.get());
    }
  }

  bool actionWasCanceled =
      !aTestOnlyIgnoreCanceled && owner->WasUserActionCanceled(aUserActionId);
  if (actionWasCanceled) {
    LOGD(
        "DoAnalyzeRequest | userAction: %s | requestToken: %s | was already "
        "canceled",
        aUserActionId.get(), aRequest.request_token().c_str());
    return Err(NS_ERROR_WONT_HANDLE_CONTENT);
  }

  // Run request, then dispatch back to main thread to resolve
  // aCallback
  content_analysis::sdk::ContentAnalysisResponse pbResponse;
  nsDependentCString analysisConnectorName(
      content_analysis::sdk::AnalysisConnector_Name(
          aRequest.analysis_connector())
          .c_str());
  auto timerId = glean::content_analysis::response_duration_by_analysis_type
                     .Get(analysisConnectorName)
                     .Start();
  {
    // Insert this into the map before calling Send() because another thread
    // calling Send() may get a response before our Send() call finishes.
    // The print-data handle (if any) is owned by this entry so it stays alive
    // until this request's response arrives, even though responses may come
    // back out of order.
    auto map = mRequestTokenToBasicRequestInfoMap.Lock();
    map->InsertOrUpdate(
        nsCString(aRequest.request_token()),
        MakeUnique<ExternalAgentBackend::BasicRequestInfo>(
            ExternalAgentBackend::BasicRequestInfo{
                aUserActionId, timerId, std::move(analysisConnectorName),
                aAutoAcknowledge, std::move(aPrintDataHandle)}));
  }

  LOGD(
      "DoAnalyzeRequest | userAction: %s | requestToken: %s | sending request "
      "to agent",
      aUserActionId.get(), aRequest.request_token().c_str());
  int err = aClient->Send(aRequest, &pbResponse);
  if (err != 0) {
    LOGE("DoAnalyzeRequest got err=%d for request_token=%s, user_action_id=%s",
         err, aRequest.request_token().c_str(), aUserActionId.get());
    Maybe<UniquePtr<ExternalAgentBackend::BasicRequestInfo>> entry;
    {
      auto map = mRequestTokenToBasicRequestInfoMap.Lock();
      entry = map->Extract(nsCString(aRequest.request_token()));
    }
    if (entry.isSome()) {
      glean::content_analysis::response_duration_by_analysis_type
          .Get((*entry)->mAnalysisTypeStr)
          .Cancel(std::move((*entry)->mTimerId));
    }

    return Err(NS_ERROR_FAILURE);
  }
  HandleResponseFromAgent(std::move(pbResponse));
  return nullptr;
}

void ExternalAgentBackend::HandleResponseFromAgent(
    content_analysis::sdk::ContentAnalysisResponse&& aResponse) {
  MOZ_ASSERT(!NS_IsMainThread());
  NS_DispatchToMainThread(NS_NewRunnableFunction(
      __func__,
      [self = RefPtr{this}, aResponse = std::move(aResponse)]() mutable {
        LOGD("HandleResponseFromAgent on main thread");
        LogResponse(&aResponse);
        RefPtr<ContentAnalysis> owner =
            ContentAnalysis::GetContentAnalysisFromService();
        if (!owner) {
          // May be shutting down
          return;
        }

        nsCOMPtr<nsIObserverService> obsServ =
            mozilla::services::GetObserverService();
        // This message is only used for testing purposes, so avoid
        // serializing the string here if no one is observing this message.
        // This message is only really useful if we're in a timeout
        // situation, otherwise dlp-response is fine.
        if (obsServ && obsServ->HasObservers("dlp-response-received-raw")) {
          std::string responseString = aResponse.SerializeAsString();
          nsTArray<char16_t> responseArray;
          responseArray.SetLength(responseString.size() + 1);
          for (size_t i = 0; i < responseString.size(); ++i) {
            // Since NotifyObservers() expects a null-terminated string,
            // make sure none of these values are 0.
            responseArray[i] = responseString[i] + 0xFF00;
          }
          responseArray[responseString.size()] = 0;
          obsServ->NotifyObservers(static_cast<nsIContentAnalysis*>(owner),
                                   "dlp-response-received-raw",
                                   responseArray.Elements());
        }

        Maybe<UniquePtr<ExternalAgentBackend::BasicRequestInfo>>
            maybeBasicRequestInfo;
        {
          auto map = self->mRequestTokenToBasicRequestInfoMap.Lock();
          maybeBasicRequestInfo =
              map->Extract(nsCString(aResponse.request_token()));
        }
        if (maybeBasicRequestInfo.isNothing()) {
          LOGE(
              "HandleResponseFromAgent could not find userActionId for "
              "request token %s",
              aResponse.request_token().c_str());
          // We have no hope of doing anything useful, so just early return.
          return;
        }
        glean::content_analysis::response_duration_by_analysis_type
            .Get((*maybeBasicRequestInfo)->mAnalysisTypeStr)
            .StopAndAccumulate(std::move((*maybeBasicRequestInfo)->mTimerId));
        nsCString userActionId = (*maybeBasicRequestInfo)->mUserActionId;

        RefPtr<ContentAnalysisResponse> response =
            ConvertResponseFromProtobuf(std::move(aResponse), userActionId);
        if (!response) {
          LOGE("Content analysis got invalid response!");
          return;
        }

        owner->HandleResponseFromAgent(
            response, (*maybeBasicRequestInfo)->mAutoAcknowledge);
      }));
}

bool ExternalAgentBackend::IsResponsePendingForRequest(
    const nsACString& aRequestToken) {
  auto map = mRequestTokenToBasicRequestInfoMap.Lock();
  return map->Contains(aRequestToken);
}

nsresult ExternalAgentBackend::Acknowledge(
    nsCOMPtr<nsIContentAnalysisAcknowledgement> aAcknowledgement,
    const nsACString& aRequestToken) {
  AssertIsOnMainThread();

  content_analysis::sdk::ContentAnalysisAcknowledgement pbAck;
  nsresult rv = ConvertToProtobuf(aAcknowledgement, aRequestToken, &pbAck);
  NS_ENSURE_SUCCESS(rv, rv);

  LOGD("Issuing ContentAnalysisAcknowledgement");
  LogAcknowledgement(&pbAck);

  nsCOMPtr<nsIObserverService> obsServ =
      mozilla::services::GetObserverService();
  // Do an early check here to avoid an extra dispatch to the main
  // thread if no one is observing the message
  bool rawMessageHasObserver = false;
  if (obsServ) {
    rawMessageHasObserver =
        obsServ->HasObservers("dlp-acknowledgement-sent-raw");
  }

  // The content analysis connection is synchronous so run in the background.
  LOGD("RunAcknowledgeTask dispatching acknowledge task");
  CallClientWithRetry<std::nullptr_t>(
      __func__,
      [pbAck = std::move(pbAck), rawMessageHasObserver](
          std::shared_ptr<content_analysis::sdk::Client> client) mutable
          -> Result<std::nullptr_t, nsresult> {
        MOZ_ASSERT(!NS_IsMainThread());
        RefPtr<ContentAnalysis> owner =
            ContentAnalysis::GetContentAnalysisFromService();
        if (!owner) {
          // May be shutting down
          return nullptr;
        }

        int err = client->Acknowledge(pbAck);
        LOGD(
            "RunAcknowledgeTask sent transaction acknowledgement, "
            "err=%d",
            err);
        // Wait until the acknowledgement is sent before sending
        // the dlp-acknowledgement-sent-raw notification to make tests
        // more reliable.
        if (rawMessageHasObserver) {
          NS_DispatchToMainThread(NS_NewRunnableFunction(
              __func__, [owner, pbAck = std::move(pbAck)]() {
                nsCOMPtr<nsIObserverService> obsServ =
                    mozilla::services::GetObserverService();
                if (!obsServ) {
                  // Shutting down.  We don't have a connection to the agent
                  // anymore so sending acknowledgement would fail anyway.
                  return;
                }
                std::string acknowledgementString = pbAck.SerializeAsString();
                nsTArray<char16_t> acknowledgementArray;
                acknowledgementArray.SetLength(acknowledgementString.size() +
                                               1);
                for (size_t i = 0; i < acknowledgementString.size(); ++i) {
                  // Since NotifyObservers() expects a null-terminated string,
                  // make sure none of these values are 0.
                  acknowledgementArray[i] = acknowledgementString[i] + 0xFF00;
                }
                acknowledgementArray[acknowledgementString.size()] = 0;
                obsServ->NotifyObservers(
                    static_cast<nsIContentAnalysis*>(owner.get()),
                    "dlp-acknowledgement-sent-raw",
                    acknowledgementArray.Elements());
              }));
        }
        if (err != 0) {
          return Err(NS_ERROR_FAILURE);
        }
        return nullptr;
      })
      ->Then(
          GetMainThreadSerialEventTarget(), __func__, []() { /* do nothing */ },
          [](nsresult rv) {
            LOGE("RunAcknowledgeTask failed to get the client");
          });
  return NS_OK;
}

RefPtr<ContentAnalysisBackend::DiagnosticInfoPromise>
ExternalAgentBackend::GetDiagnosticInfo() {
  AssertIsOnMainThread();
  auto diagnosticInfoPromise =
      MakeRefPtr<DiagnosticInfoPromise::Private>(__func__);

  CallClientWithRetry<std::nullptr_t>(
      __func__,
      [self = RefPtr{this}, diagnosticInfoPromise](
          std::shared_ptr<content_analysis::sdk::Client> client) mutable
          -> Result<std::nullptr_t, nsresult> {
        MOZ_ASSERT(!NS_IsMainThread());
        // I don't think this will be slow, but do it on the background thread
        // just to be safe
        std::string agentPath = client->GetAgentInfo().binary_path;
        // Need to switch back to main thread to create the
        // ContentAnalysisDiagnosticInfo and resolve the promise
        NS_DispatchToMainThread(NS_NewRunnableFunction(
            __func__,
            [self, diagnosticInfoPromise = std::move(diagnosticInfoPromise),
             agentPath = std::move(agentPath)]() {
              AssertIsOnMainThread();
              if (IsContentAnalysisShutDown()) {
                // may be quitting
                diagnosticInfoPromise->Reject(NS_ERROR_ILLEGAL_DURING_SHUTDOWN,
                                              __func__);
                return;
              }
              nsString agentWidePath = NS_ConvertUTF8toUTF16(agentPath);
              // Note that if we made it here, we have successfully connected to
              // the agent.
              auto info = MakeRefPtr<ContentAnalysisDiagnosticInfo>(
                  /* mConnectedToAgent */ true, std::move(agentWidePath), false,
                  self->mRequestCount);
              diagnosticInfoPromise->Resolve(info, __func__);
            }));
        return nullptr;
      })
      ->Then(
          GetMainThreadSerialEventTarget(), __func__, []() {},
          [self = RefPtr{this}, diagnosticInfoPromise](nsresult rv) {
            AssertIsOnMainThread();
            auto info = MakeRefPtr<ContentAnalysisDiagnosticInfo>(
                false, EmptyString(), rv == NS_ERROR_INVALID_SIGNATURE,
                self->mRequestCount);
            diagnosticInfoPromise->Resolve(info, __func__);
          });

  return diagnosticInfoPromise.forget();
}

#undef LOGD
#undef LOGE
}  // namespace mozilla::contentanalysis
