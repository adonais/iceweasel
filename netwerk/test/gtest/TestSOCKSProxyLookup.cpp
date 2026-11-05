/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "gtest/gtest.h"
#include "mozilla/Components.h"
#include "mozilla/ScopeExit.h"
#include "mozilla/SpinEventLoopUntil.h"
#include "mozilla/gtest/MozAssertions.h"
#include "nsComponentManagerUtils.h"
#include "nsIAsyncOutputStream.h"
#include "nsINativeDNSResolverOverride.h"
#include "nsIProtocolProxyService.h"
#include "nsIProxyInfo.h"
#include "nsIServerSocket.h"
#include "nsISocketTransport.h"
#include "nsISocketTransportService.h"
#include "nsITimer.h"
#include "nsServiceManagerUtils.h"
#include "nsThreadUtils.h"

using namespace mozilla;

namespace {

class OutputCallback final : public nsIOutputStreamCallback {
 public:
  NS_DECL_THREADSAFE_ISUPPORTS

  NS_IMETHOD OnOutputStreamReady(nsIAsyncOutputStream* aStream) override {
    mStatus = aStream->StreamStatus();
    mFired = true;
    return NS_OK;
  }

  bool mFired = false;
  nsresult mStatus = NS_OK;

 private:
  ~OutputCallback() = default;
};

NS_IMPL_ISUPPORTS(OutputCallback, nsIOutputStreamCallback)

// Connects through a SOCKS proxy and returns the status the output stream
// reports once it becomes ready, or NS_OK if it never does.
void ConnectViaSOCKS(const nsACString& aProxyHost, int32_t aProxyPort,
                     nsresult* aStatus) {
  *aStatus = NS_OK;

  nsCOMPtr<nsIProtocolProxyService> pps = components::ProtocolProxy::Service();
  ASSERT_TRUE(pps);
  nsCOMPtr<nsIProxyInfo> proxyInfo;
  ASSERT_NS_SUCCEEDED(pps->NewProxyInfo("socks"_ns, aProxyHost, aProxyPort,
                                        ""_ns, ""_ns, 0, 0, nullptr,
                                        getter_AddRefs(proxyInfo)));

  nsCOMPtr<nsISocketTransportService> sts =
      components::SocketTransport::Service();
  ASSERT_TRUE(sts);
  nsCOMPtr<nsISocketTransport> transport;
  ASSERT_NS_SUCCEEDED(sts->CreateTransport(nsTArray<nsCString>(),
                                           "127.0.0.1"_ns, 9999, proxyInfo,
                                           nullptr, getter_AddRefs(transport)));

  nsCOMPtr<nsIOutputStream> out;
  ASSERT_NS_SUCCEEDED(transport->OpenOutputStream(nsITransport::OPEN_UNBUFFERED,
                                                  0, 0, getter_AddRefs(out)));
  nsCOMPtr<nsIAsyncOutputStream> asyncOut = do_QueryInterface(out);
  ASSERT_TRUE(asyncOut);

  RefPtr<OutputCallback> callback = new OutputCallback();
  ASSERT_NS_SUCCEEDED(
      asyncOut->AsyncWait(callback, 0, 0, GetCurrentSerialEventTarget()));

  bool timedOut = false;
  nsCOMPtr<nsITimer> timer;
  ASSERT_NS_SUCCEEDED(NS_NewTimerWithCallback(
      getter_AddRefs(timer), [&](nsITimer*) { timedOut = true; }, 10000,
      nsITimer::TYPE_ONE_SHOT, "TestSOCKSProxyLookup"_ns));
  MOZ_ALWAYS_TRUE(
      SpinEventLoopUntil("TestSOCKSProxyLookup::ConnectViaSOCKS"_ns,
                         [&]() { return callback->mFired || timedOut; }));
  timer->Cancel();

  EXPECT_TRUE(callback->mFired);
  *aStatus = callback->mStatus;

  transport->Close(NS_BINDING_ABORTED);
}

}  // namespace

// A failed SOCKS proxy lookup must be reported to the consumer, even though
// the socket was never connected and so never becomes writable.
TEST(TestSOCKSProxyLookup, LookupFailureReported)
{
  constexpr auto kProxyHost = "socks-lookup-fails.example"_ns;

  nsCOMPtr<nsINativeDNSResolverOverride> override =
      do_GetService("@mozilla.org/network/native-dns-override;1");
  ASSERT_TRUE(override);
  ASSERT_NS_SUCCEEDED(override->AddIPOverride(kProxyHost, "N/A"_ns));
  auto clearOverride =
      MakeScopeExit([&] { override->ClearHostOverride(kProxyHost); });

  nsresult status;
  ASSERT_NO_FATAL_FAILURE(ConnectViaSOCKS(kProxyHost, 1080, &status));
  EXPECT_NS_FAILED(status);
}

// A refused connect to a single-address SOCKS proxy must be reported as such.
TEST(TestSOCKSProxyLookup, ConnectRefusedReported)
{
  nsCOMPtr<nsIServerSocket> server =
      do_CreateInstance("@mozilla.org/network/server-socket;1");
  ASSERT_TRUE(server);
  ASSERT_NS_SUCCEEDED(server->Init(-1, true, -1));
  int32_t port;
  ASSERT_NS_SUCCEEDED(server->GetPort(&port));
  ASSERT_NS_SUCCEEDED(server->Close());

  nsresult status;
  ASSERT_NO_FATAL_FAILURE(ConnectViaSOCKS("127.0.0.1"_ns, port, &status));
  EXPECT_EQ(status, NS_ERROR_PROXY_CONNECTION_REFUSED);
}
