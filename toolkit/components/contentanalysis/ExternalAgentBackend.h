/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
#ifndef mozilla_externalagentbackend_h
#define mozilla_externalagentbackend_h

#include "ContentAnalysisBackend.h"
#include "MainThreadUtils.h"
#include "mozilla/DataMutex.h"
#include "mozilla/RefPtr.h"
#include "mozilla/Result.h"
#include "mozilla/StaticString.h"
#include "mozilla/UniquePtr.h"
#include "mozilla/glean/ContentanalysisMetrics.h"
#include "nsCOMPtr.h"
#include "nsError.h"
#include "nsIThreadPool.h"
#include "nsTHashMap.h"
#include "nsThreadUtils.h"

#include <memory>

namespace content_analysis::sdk {
class Client;
class ContentAnalysisRequest;
class ContentAnalysisResponse;
}  // namespace content_analysis::sdk

namespace mozilla::contentanalysis {

// Backend that talks to an out-of-process DLP agent via the content_analysis
// SDK. Owns the SDK client connection, the background thread pool used for
// agent IO, and the retry-on-disconnect logic.
class ExternalAgentBackend final : public ContentAnalysisBackend {
 public:
  ExternalAgentBackend();

  ExternalAgentBackend(const ExternalAgentBackend&) = delete;
  ExternalAgentBackend& operator=(const ExternalAgentBackend&) = delete;

  nsresult EnsureReady() override;
  nsresult Analyze(nsCOMPtr<nsIContentAnalysisRequest> aRequest,
                   bool aAutoAcknowledge) override;
  nsresult Acknowledge(
      nsCOMPtr<nsIContentAnalysisAcknowledgement> aAcknowledgement,
      const nsACString& aRequestToken) override;
  void CancelUserAction(const nsACString& aUserActionId) override;
  RefPtr<DiagnosticInfoPromise> GetDiagnosticInfo() override;
  void Shutdown() override;
  nsresult ForceReinitializeForTest() override;

  bool IsCreatingClientForTest() const override;

  void OnMaxConnectionsPrefChanged() override;
  bool IsResponsePendingForRequest(const nsACString& aRequestToken) override;

 protected:
  ~ExternalAgentBackend() override;

  // Adds the print data / file path / text content to the base class's
  // conversion: ExternalAgentBackend is the only backend that needs these
  // inline in the protobuf it sends.
  nsresult ConvertRequestToProtobuf(
      nsIContentAnalysisRequest* aRequest,
      content_analysis::sdk::ContentAnalysisRequest* aOut) override;

 private:
  // Only call this through CreateClientIfNecessary(), as it provides
  // synchronization to avoid doing this multiple times at once.
  nsresult CreateContentAnalysisClient(nsCString&& aPipePathName,
                                       nsString&& aClientSignatureSetting,
                                       bool aIsPerUser);

  // Thread pool that all agent communications happen on.  Content Analysis
  // occasionally uses other (random) background threads for other purposes.
  nsCOMPtr<nsIThreadPool> mThreadPool;

  // Helper function to retry calling the client in case either the client
  // does not exist, or calling the client fails (indicating that the DLP agent
  // has terminated and possibly restarted)
  //
  // aClientCallFunc - gets called on a background thread after we have a
  // client. Returns a Result<T, nsresult>. An Err(nsresult) indicates
  // that the client call failed and we should try to reconnect. A successful
  // response indicates success (or at least that we should not try to
  // reconnect), and that value will be Resolve()d into the returned MozPromise.
  template <typename T, typename U>
  RefPtr<MozPromise<T, nsresult, true>> CallClientWithRetry(
      StaticString aMethodName, U&& aClientCallFunc);
  void RecordConnectionSettingsTelemetry(const nsString& aClientSignature);

  nsresult CreateClientIfNecessary(bool aForceCreate = false);

  // Actually send the request to the client and handle the response (or
  // error). Note that the response may be for a different request!
  Result<std::nullptr_t, nsresult> DoAnalyzeRequest(
      nsCString&& aUserActionId,
      content_analysis::sdk::ContentAnalysisRequest&& aRequest,
      bool aAutoAcknowledge,
      const std::shared_ptr<content_analysis::sdk::Client>& aClient,
      bool aTestOnlyIgnoreCanceled = false,
      std::shared_ptr<void> aPrintDataHandle = nullptr);

  void HandleResponseFromAgent(
      content_analysis::sdk::ContentAnalysisResponse&& aResponse);

  // Per-in-flight-request state, looked up by request_token when the agent
  // sends a response (the SDK round-trip is asynchronous and responses can
  // arrive in any order).
  struct BasicRequestInfo final {
    nsCString mUserActionId;
    glean::TimerId mTimerId;
    nsCString mAnalysisTypeStr;
    bool mAutoAcknowledge;
    // For print requests on Windows, keeps the file-mapping section holding the
    // PDF bytes alive while the agent processes this request. The agent
    // duplicates the handle out of our process while servicing the request, and
    // responses can arrive out of order, so the handle must stay open until
    // this request's response arrives -- i.e. until this entry is removed.
    // Empty for requests that do not carry a print-data handle.
    std::shared_ptr<void> mPrintDataHandle;
  };
  DataMutex<nsTHashMap<nsCString, UniquePtr<BasicRequestInfo>>>
      mRequestTokenToBasicRequestInfoMap;

  // Safe to call from any thread; goes through the XPCOM service lookup.
  static bool IsContentAnalysisShutDown();

  using ClientPromise =
      MozPromise<std::shared_ptr<content_analysis::sdk::Client>, nsresult,
                 false>;
  // Must only be resolved/rejected or Then()'d on the main thread.
  //
  // Note that if this promise is resolved, the resolve value will
  // be a non-null content_analysis::sdk::Client. However, if the
  // DLP agent process has terminated, it is possible that trying to
  // call into this client will return an error. Therefore, any
  // method that wants to call into the client should go through
  // CallClientWithRetry() to make it easy to try reconnecting
  // to the client.
  RefPtr<ClientPromise::Private> mClientPromise
      MOZ_GUARDED_BY(sMainThreadCapability);

  bool mCreatingClient MOZ_GUARDED_BY(sMainThreadCapability) = false;
  bool mHaveResolvedClientPromise MOZ_GUARDED_BY(sMainThreadCapability) = false;
  int64_t mRequestCount MOZ_GUARDED_BY(sMainThreadCapability) = 0;
};

}  // namespace mozilla::contentanalysis

#endif  // mozilla_externalagentbackend_h
