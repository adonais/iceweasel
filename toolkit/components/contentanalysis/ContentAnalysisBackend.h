/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
#ifndef mozilla_contentanalysisbackend_h
#define mozilla_contentanalysisbackend_h

#include "mozilla/MozPromise.h"
#include "mozilla/RefPtr.h"
#include "nsIContentAnalysis.h"
#include "nsISupportsImpl.h"
#include "nsStringFwd.h"

namespace content_analysis::sdk {
class ContentAnalysisRequest;
class ContentAnalysisResponse;
}  // namespace content_analysis::sdk

namespace mozilla::contentanalysis {

class ContentAnalysisDiagnosticInfo;
class ContentAnalysisResponse;

// Abstract interface representing a content-analysis verdict engine.
//
// ContentAnalysis owns one ContentAnalysisBackend and delegates per-request
// analysis, acknowledgement, cancellation, and diagnostics to it.
class ContentAnalysisBackend {
 public:
  NS_INLINE_DECL_THREADSAFE_REFCOUNTING(ContentAnalysisBackend)

  ContentAnalysisBackend() = default;
  ContentAnalysisBackend(const ContentAnalysisBackend&) = delete;
  ContentAnalysisBackend& operator=(const ContentAnalysisBackend&) = delete;

  using DiagnosticInfoPromise =
      MozPromise<RefPtr<ContentAnalysisDiagnosticInfo>, nsresult, true>;

  // Kick off backend initialization if necessary (e.g. connect to an agent,
  // fetch and load a module). Returns synchronously when backend is ready to
  // receive requests, even if backend may continue further initialization
  // asynchronously. Concurrent calls are safe.
  virtual nsresult EnsureReady() = 0;

  // Analyze a single request and produce a verdict. The returned promise
  // resolves on the main thread with a populated ContentAnalysisResponse, or
  // rejects with an nsresult on error.
  virtual nsresult Analyze(nsCOMPtr<nsIContentAnalysisRequest> aRequest,
                           bool aAutoAcknowledge) = 0;

  // Acknowledge a previously issued response. Backends with no out-of-process
  // counterparty may treat this as a no-op.
  virtual nsresult Acknowledge(
      nsCOMPtr<nsIContentAnalysisAcknowledgement> aAcknowledgement,
      const nsACString& aRequestToken) = 0;

  // Cancel a user action, which may cause in-flight requests with the same user
  // action ID to be canceled as well.
  virtual void CancelUserAction(const nsACString& aUserActionId) = 0;

  // Surface diagnostics for nsIContentAnalysis::getDiagnosticInfo. May resolve
  // with info indicating successful or failure status; rejects with the
  // nsresult in the case status cannot be determined.
  virtual RefPtr<DiagnosticInfoPromise> GetDiagnosticInfo() = 0;

  // Release backend resources. Called during xpcom-shutdown-threads.
  virtual void Shutdown() = 0;

  // Test hook backing nsIContentAnalysis::forceRecreateClientForTest. Default
  // no-op for backends without persistent connection state.
  virtual nsresult ForceReinitializeForTest() { return NS_OK; }

  // Test hook backing nsIContentAnalysis::GetCreatingClientForTest. Returns
  // true if the backend is currently in the middle of an async client/module
  // creation step. Default false for backends without persistent connection
  // state.
  virtual bool IsCreatingClientForTest() const { return false; }

  // Called by ContentAnalysis when browser.contentanalysis.max_connections
  // changes. Default no-op for backends that don't use a connection pool.
  virtual void OnMaxConnectionsPrefChanged() {}

  // True if an in-flight dispatch is tracking aRequestToken to await a
  // response. The default returns false for backends whose Analyze is
  // synchronous from the framework's perspective (response is delivered before
  // any caller could ask this question). Backends that asynchronously correlate
  // responses by request_token override this.
  virtual bool IsResponsePendingForRequest(const nsACString& aRequestToken) {
    return false;
  }

 protected:
  virtual ~ContentAnalysisBackend() = default;

  // Build most of an SDK protobuf request from the framework request,
  // covering everything except print data, file path, and text content.
  // Backends that need to ship that content in the protobuf (currently just
  // ExternalAgentBackend) override this, call the base implementation, and
  // add it afterwards.
  virtual nsresult ConvertRequestToProtobuf(
      nsIContentAnalysisRequest* aRequest,
      content_analysis::sdk::ContentAnalysisRequest* aOut);

  // Build a framework ContentAnalysisResponse from an SDK protobuf. Returns
  // nullptr if the SDK response could not be interpreted (e.g. a result has a
  // non-SUCCESS status).
  static already_AddRefed<ContentAnalysisResponse> ConvertResponseFromProtobuf(
      content_analysis::sdk::ContentAnalysisResponse&& aResponse,
      const nsCString& aUserActionId);
};

// Create the backend appropriate for the current platform. The concrete type
// is chosen at compile time; see ContentAnalysisBackendFactory.cpp.
already_AddRefed<ContentAnalysisBackend> CreateBackend();

}  // namespace mozilla::contentanalysis

#endif  // mozilla_contentanalysisbackend_h
