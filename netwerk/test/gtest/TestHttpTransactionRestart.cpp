/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Restart() must not replay a streaming request body: the pipe behind it is
// not seekable, so the rewind in Restart() silently does nothing.

#include "HttpTrafficAnalyzer.h"
#include "gtest/gtest.h"
#include "mozilla/net/ClassOfService.h"
#include "nsHttpConnectionInfo.h"
#include "nsHttpRequestHead.h"
#include "nsHttpTransaction.h"
#include "nsIHttpProtocolHandler.h"
#include "nsIPipe.h"
#include "nsISeekableStream.h"
#include "nsITellableStream.h"
#include "nsIThread.h"
#include "nsNetCID.h"
#include "nsReadableUtils.h"
#include "nsServiceManagerUtils.h"
#include "nsSocketTransportService2.h"
#include "nsThreadUtils.h"

namespace mozilla::net {
namespace {

// Must run on the main thread.
static void EnsureHttpHandler() {
  nsCOMPtr<nsIHttpProtocolHandler> http =
      do_GetService("@mozilla.org/network/protocol;1?name=http");
  ASSERT_TRUE(http);
}

// Restart() asserts it runs on the socket thread.
static void RunOnSocketThread(std::function<void()>&& aFn) {
  nsCOMPtr<nsIEventTarget> sts = gSocketTransportService;
  ASSERT_TRUE(sts);
  NS_DispatchAndSpinEventLoopUntilComplete(
      "TestHttpTransactionRestart"_ns, sts,
      NS_NewRunnableFunction("TestHttpTransactionRestart", std::move(aFn)));
}

// Stands in for the FetchStreamReader pipe: non-seekable. aWriter is the
// producing end, so a test can decide what the body contains and when it ends.
static already_AddRefed<nsIInputStream> MakeStreamingBody(
    nsIAsyncOutputStream** aWriter) {
  nsCOMPtr<nsIAsyncInputStream> reader;
  nsCOMPtr<nsIAsyncOutputStream> writer;
  NS_NewPipe2(getter_AddRefs(reader), getter_AddRefs(writer), true, true, 4096,
              4);
  writer.forget(aWriter);
  nsCOMPtr<nsIInputStream> in = reader;
  return in.forget();
}

// Reads until the stream ends or would block, so that a body which never
// arrives cannot be mistaken for one that did.
static nsCString ReadAll(nsIInputStream* aStream) {
  nsCString out;
  char buf[512];
  uint32_t read = 0;
  while (NS_SUCCEEDED(aStream->Read(buf, sizeof(buf), &read)) && read > 0) {
    out.Append(buf, read);
  }
  return out;
}

static already_AddRefed<nsHttpTransaction> MakeTransaction(
    nsHttpConnectionInfo* aCi, nsHttpRequestHead* aReqHead,
    nsIInputStream* aBody, bool aIsStreaming) {
  aReqHead->SetMethod("POST"_ns);
  aReqHead->SetVersion(HttpVersion::v2_0);
  aReqHead->SetRequestURI("/"_ns);

  nsCOMPtr<nsIInputStream> body = aBody;

  RefPtr<nsHttpTransaction> trans = new nsHttpTransaction();
  // Init() consults this when deciding whether a zero length means "no body".
  trans->SetRequestBodyIsStreaming(aIsStreaming);
  nsresult rv = trans->Init(
      /*caps*/ 0, aCi, aReqHead, body,
      /*reqContentLength*/ 0, /*target*/ gSocketTransportService,
      /*callbacks*/ nullptr,
      /*eventsink*/ nullptr, /*browserId*/ 0, HttpTrafficCategory::eInvalid,
      /*requestContext*/ nullptr, ClassOfService(), /*initialRwin*/ 0,
      /*responseTimeoutEnabled*/ false, /*channelId*/ 0,
      /*transactionObserver*/ nullptr, nsILoadInfo::IPAddressSpace::Unknown,
      LNAPerms{});
  MOZ_RELEASE_ASSERT(NS_SUCCEEDED(rv));
  return trans.forget();
}

}  // namespace

// A zero content length must not be read as "no body" for a streaming upload:
// the body has to end up in the request stream, and the guard in Restart() has
// to still permit a restart that has not sent anything yet.
TEST(HttpTransactionRestart, StreamingBodyIsNotDroppedByInit)
{
  EnsureHttpHandler();
  RunOnSocketThread([]() {
    RefPtr<nsHttpConnectionInfo> ci =
        new nsHttpConnectionInfo("127.0.0.1"_ns, 443, ""_ns, ""_ns, nullptr,
                                 OriginAttributes(), /*endToEndSSL*/ true);
    // Held by weak reference; must outlive the transaction.
    nsHttpRequestHead reqHead;
    nsCOMPtr<nsIAsyncOutputStream> writer;
    nsCOMPtr<nsIInputStream> body = MakeStreamingBody(getter_AddRefs(writer));
    RefPtr<nsHttpTransaction> trans =
        MakeTransaction(ci, &reqHead, body, /*aIsStreaming*/ true);

    ASSERT_TRUE(trans->RequestStream());
    EXPECT_TRUE(trans->RequestBodyIsStreaming());

    // Nothing has been read, so a restart must still be allowed. Reading the
    // position is how Restart() decides that, so a request stream that cannot
    // report one would refuse every restart.
    nsCOMPtr<nsITellableStream> tellable =
        do_QueryInterface(trans->RequestStream());
    ASSERT_TRUE(tellable);
    int64_t position = -1;
    ASSERT_EQ(tellable->Tell(&position), NS_OK);
    EXPECT_EQ(position, 0);

    // Not seekable, which is why Restart() cannot replay it once started.
    nsCOMPtr<nsISeekableStream> seekable =
        do_QueryInterface(trans->RequestStream());
    EXPECT_FALSE(seekable);

    uint32_t written = 0;
    ASSERT_EQ(writer->Write("abc", 3, &written), NS_OK);
    ASSERT_EQ(written, 3u);
    writer->Close();

    // The body must follow the headers rather than have been dropped.
    nsCString request = ReadAll(trans->RequestStream());
    EXPECT_TRUE(StringEndsWith(request, "abc"_ns)) << request.get();
  });
}

// The same Init() with a zero length and no streaming flag drops the body, so
// the assertion above is about the flag and not about Init() always keeping it.
TEST(HttpTransactionRestart, NonStreamingBodyWithZeroLengthIsDropped)
{
  EnsureHttpHandler();
  RunOnSocketThread([]() {
    RefPtr<nsHttpConnectionInfo> ci =
        new nsHttpConnectionInfo("127.0.0.1"_ns, 443, ""_ns, ""_ns, nullptr,
                                 OriginAttributes(), /*endToEndSSL*/ true);
    nsHttpRequestHead reqHead;
    nsCOMPtr<nsIAsyncOutputStream> writer;
    // Held here so that the pipe survives Init() discarding the body.
    nsCOMPtr<nsIInputStream> body = MakeStreamingBody(getter_AddRefs(writer));
    RefPtr<nsHttpTransaction> trans =
        MakeTransaction(ci, &reqHead, body, /*aIsStreaming*/ false);

    ASSERT_TRUE(trans->RequestStream());
    EXPECT_FALSE(trans->RequestBodyIsStreaming());

    uint32_t written = 0;
    ASSERT_EQ(writer->Write("abc", 3, &written), NS_OK);
    ASSERT_EQ(written, 3u);
    writer->Close();

    nsCString request = ReadAll(trans->RequestStream());
    EXPECT_FALSE(StringEndsWith(request, "abc"_ns)) << request.get();
  });
}

// Restart() itself cannot be called for the permitted case, because that path
// continues into InitiateTransaction() and opens a socket; the test above
// covers it by checking the position the guard reads.
TEST(HttpTransactionRestart, RestartRefusesStartedStreamingRequestBody)
{
  EnsureHttpHandler();
  RunOnSocketThread([]() {
    RefPtr<nsHttpConnectionInfo> ci =
        new nsHttpConnectionInfo("127.0.0.1"_ns, 443, ""_ns, ""_ns, nullptr,
                                 OriginAttributes(), /*endToEndSSL*/ true);
    nsHttpRequestHead reqHead;
    nsCOMPtr<nsIAsyncOutputStream> writer;
    nsCOMPtr<nsIInputStream> body = MakeStreamingBody(getter_AddRefs(writer));
    RefPtr<nsHttpTransaction> trans =
        MakeTransaction(ci, &reqHead, body, /*aIsStreaming*/ true);

    // Stand in for the request starting to go out; the headers read
    // synchronously from the front of the multiplexed stream.
    char buf[8];
    uint32_t read = 0;
    ASSERT_EQ(trans->RequestStream()->Read(buf, sizeof(buf), &read), NS_OK);
    ASSERT_GT(read, 0u);

    nsCOMPtr<nsITellableStream> tellable =
        do_QueryInterface(trans->RequestStream());
    ASSERT_TRUE(tellable);
    int64_t position = 0;
    ASSERT_EQ(tellable->Tell(&position), NS_OK);
    ASSERT_NE(position, 0);

    // Must refuse rather than re-send from the middle of the request.
    EXPECT_EQ(trans->Restart(), NS_ERROR_NET_RESET);

    // Must hold on every attempt, not just the first.
    EXPECT_EQ(trans->Restart(), NS_ERROR_NET_RESET);
  });
}

}  // namespace mozilla::net
