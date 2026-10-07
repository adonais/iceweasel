/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "gtest/gtest.h"
#include "nsCOMPtr.h"
#include "nsIInputStream.h"
#include "nsIStreamListener.h"
#include "nsISyncStreamListener.h"
#include "nsNetUtil.h"
#include "nsStreamUtils.h"
#include "nsStringStream.h"
#include "nsThreadUtils.h"

// Minimal nsIRequest stub for driving the listener.
class FakeRequest final : public nsIRequest {
 public:
  NS_DECL_ISUPPORTS

  FakeRequest() = default;

  NS_IMETHOD GetName(nsACString& aName) override {
    aName.AssignLiteral("FakeRequest");
    return NS_OK;
  }
  NS_IMETHOD IsPending(bool* aResult) override {
    *aResult = false;
    return NS_OK;
  }
  NS_IMETHOD GetStatus(nsresult* aStatus) override {
    *aStatus = NS_OK;
    return NS_OK;
  }
  NS_IMETHOD SetCanceledReason(const nsACString& aReason) override {
    return NS_ERROR_NOT_IMPLEMENTED;
  }
  NS_IMETHOD GetCanceledReason(nsACString& aReason) override {
    return NS_ERROR_NOT_IMPLEMENTED;
  }
  NS_IMETHOD CancelWithReason(nsresult aStatus,
                              const nsACString& aReason) override {
    return NS_ERROR_NOT_IMPLEMENTED;
  }
  NS_IMETHOD Cancel(nsresult aStatus) override {
    return NS_ERROR_NOT_IMPLEMENTED;
  }
  NS_IMETHOD Suspend() override { return NS_ERROR_NOT_IMPLEMENTED; }
  NS_IMETHOD Resume() override { return NS_ERROR_NOT_IMPLEMENTED; }
  NS_IMETHOD GetLoadGroup(nsILoadGroup** aLoadGroup) override {
    *aLoadGroup = nullptr;
    return NS_OK;
  }
  NS_IMETHOD SetLoadGroup(nsILoadGroup* aLoadGroup) override { return NS_OK; }
  NS_IMETHOD GetLoadFlags(nsLoadFlags* aLoadFlags) override {
    *aLoadFlags = 0;
    return NS_OK;
  }
  NS_IMETHOD SetLoadFlags(nsLoadFlags aLoadFlags) override { return NS_OK; }
  NS_IMETHOD GetTRRMode(nsIRequest::TRRMode* aTRRMode) override {
    return NS_ERROR_NOT_IMPLEMENTED;
  }
  NS_IMETHOD SetTRRMode(nsIRequest::TRRMode aTRRMode) override {
    return NS_ERROR_NOT_IMPLEMENTED;
  }

 private:
  ~FakeRequest() = default;
};

NS_IMPL_ISUPPORTS(FakeRequest, nsIRequest)

// Feed |aData| through the listener's OnDataAvailable and dispatch the
// resulting event before returning, so the pipe is populated synchronously
// from the test's point of view.
static void FeedData(nsIStreamListener* aListener, nsIRequest* aRequest,
                     const nsACString& aData) {
  nsCOMPtr<nsIInputStream> dataStream;
  NS_NewCStringInputStream(getter_AddRefs(dataStream), aData);
  nsresult rv =
      aListener->OnDataAvailable(aRequest, dataStream, 0, aData.Length());
  ASSERT_EQ(NS_OK, rv);
}

TEST(TestSyncStreamListener, Create)
{
  nsCOMPtr<nsIStreamListener> listener;
  nsCOMPtr<nsIInputStream> stream;
  nsresult rv = NS_NewSyncStreamListener(getter_AddRefs(listener),
                                         getter_AddRefs(stream));
  ASSERT_EQ(NS_OK, rv);
  ASSERT_TRUE(listener);
  ASSERT_TRUE(stream);
}

TEST(TestSyncStreamListener, QI)
{
  nsCOMPtr<nsIStreamListener> listener;
  nsCOMPtr<nsIInputStream> stream;
  nsresult rv = NS_NewSyncStreamListener(getter_AddRefs(listener),
                                         getter_AddRefs(stream));
  ASSERT_EQ(NS_OK, rv);

  nsCOMPtr<nsISyncStreamListener> syncListener =
      do_QueryInterface(listener, &rv);
  ASSERT_EQ(NS_OK, rv);
  ASSERT_TRUE(syncListener);

  // nsIStreamListener inherits nsIRequestObserver, so a static cast suffices.
  nsCOMPtr<nsIRequestObserver> observer = listener;
  ASSERT_TRUE(observer);
}

TEST(TestSyncStreamListener, GetInputStream)
{
  nsCOMPtr<nsIStreamListener> listener;
  nsCOMPtr<nsIInputStream> stream;
  nsresult rv = NS_NewSyncStreamListener(getter_AddRefs(listener),
                                         getter_AddRefs(stream));
  ASSERT_EQ(NS_OK, rv);

  nsCOMPtr<nsISyncStreamListener> syncListener = do_QueryInterface(listener);
  ASSERT_TRUE(syncListener);

  nsCOMPtr<nsIInputStream> inputStream;
  rv = syncListener->GetInputStream(getter_AddRefs(inputStream));
  ASSERT_EQ(NS_OK, rv);
  ASSERT_TRUE(inputStream);
}

TEST(TestSyncStreamListener, IsNonBlocking)
{
  nsCOMPtr<nsIStreamListener> listener;
  nsCOMPtr<nsIInputStream> stream;
  nsresult rv = NS_NewSyncStreamListener(getter_AddRefs(listener),
                                         getter_AddRefs(stream));
  ASSERT_EQ(NS_OK, rv);

  bool nonBlocking = true;
  rv = stream->IsNonBlocking(&nonBlocking);
  ASSERT_EQ(NS_OK, rv);
  ASSERT_FALSE(nonBlocking);
}

TEST(TestSyncStreamListener, OnStartRequestSucceeds)
{
  nsCOMPtr<nsIStreamListener> listener;
  nsCOMPtr<nsIInputStream> stream;
  nsresult rv = NS_NewSyncStreamListener(getter_AddRefs(listener),
                                         getter_AddRefs(stream));
  ASSERT_EQ(NS_OK, rv);

  RefPtr<FakeRequest> request = new FakeRequest();
  rv = listener->OnStartRequest(request);
  ASSERT_EQ(NS_OK, rv);
}

// Deliver a single chunk and read it back.
TEST(TestSyncStreamListener, SingleChunk)
{
  nsCOMPtr<nsIStreamListener> listener;
  nsCOMPtr<nsIInputStream> stream;
  nsresult rv = NS_NewSyncStreamListener(getter_AddRefs(listener),
                                         getter_AddRefs(stream));
  ASSERT_EQ(NS_OK, rv);

  RefPtr<FakeRequest> request = new FakeRequest();
  rv = listener->OnStartRequest(request);
  ASSERT_EQ(NS_OK, rv);

  nsAutoCString data("hello");
  FeedData(listener, request, data);

  rv = listener->OnStopRequest(request, NS_OK);
  ASSERT_EQ(NS_OK, rv);

  nsAutoCString result;
  rv = NS_ReadInputStreamToString(stream, result, -1);
  ASSERT_EQ(NS_OK, rv);
  ASSERT_TRUE(result.Equals(data));
}

// Deliver multiple chunks and verify they are concatenated.
TEST(TestSyncStreamListener, MultipleChunks)
{
  nsCOMPtr<nsIStreamListener> listener;
  nsCOMPtr<nsIInputStream> stream;
  nsresult rv = NS_NewSyncStreamListener(getter_AddRefs(listener),
                                         getter_AddRefs(stream));
  ASSERT_EQ(NS_OK, rv);

  RefPtr<FakeRequest> request = new FakeRequest();
  rv = listener->OnStartRequest(request);
  ASSERT_EQ(NS_OK, rv);

  FeedData(listener, request, "aaa"_ns);
  FeedData(listener, request, "bbb"_ns);
  FeedData(listener, request, "ccc"_ns);

  rv = listener->OnStopRequest(request, NS_OK);
  ASSERT_EQ(NS_OK, rv);

  nsAutoCString result;
  rv = NS_ReadInputStreamToString(stream, result, -1);
  ASSERT_EQ(NS_OK, rv);
  ASSERT_TRUE(result.EqualsLiteral("aaabbbccc"));
}

// After OnStopRequest the stream should report EOF (read 0 bytes).
TEST(TestSyncStreamListener, ReadAfterStop)
{
  nsCOMPtr<nsIStreamListener> listener;
  nsCOMPtr<nsIInputStream> stream;
  nsresult rv = NS_NewSyncStreamListener(getter_AddRefs(listener),
                                         getter_AddRefs(stream));
  ASSERT_EQ(NS_OK, rv);

  RefPtr<FakeRequest> request = new FakeRequest();
  listener->OnStartRequest(request);
  listener->OnStopRequest(request, NS_OK);

  char buf[16];
  uint32_t read = 0;
  rv = stream->Read(buf, sizeof(buf), &read);
  ASSERT_EQ(NS_OK, rv);
  ASSERT_EQ((uint32_t)0, read);
}

// Close() on the stream should make subsequent reads return 0.
TEST(TestSyncStreamListener, Close)
{
  nsCOMPtr<nsIStreamListener> listener;
  nsCOMPtr<nsIInputStream> stream;
  nsresult rv = NS_NewSyncStreamListener(getter_AddRefs(listener),
                                         getter_AddRefs(stream));
  ASSERT_EQ(NS_OK, rv);

  RefPtr<FakeRequest> request = new FakeRequest();
  listener->OnStartRequest(request);

  FeedData(listener, request, "data"_ns);

  rv = stream->Close();
  ASSERT_EQ(NS_OK, rv);

  char buf[16];
  uint32_t read = 0;
  rv = stream->Read(buf, sizeof(buf), &read);
  ASSERT_EQ(NS_OK, rv);
  ASSERT_EQ((uint32_t)0, read);
}

// OnStopRequest with a failure status should propagate through Available().
TEST(TestSyncStreamListener, OnStopWithError)
{
  nsCOMPtr<nsIStreamListener> listener;
  nsCOMPtr<nsIInputStream> stream;
  nsresult rv = NS_NewSyncStreamListener(getter_AddRefs(listener),
                                         getter_AddRefs(stream));
  ASSERT_EQ(NS_OK, rv);

  RefPtr<FakeRequest> request = new FakeRequest();
  listener->OnStartRequest(request);
  listener->OnStopRequest(request, NS_ERROR_FAILURE);

  uint64_t avail = 0;
  rv = stream->Available(&avail);
  ASSERT_EQ(NS_ERROR_FAILURE, rv);
}

// Read a single chunk using ReadSegments.
TEST(TestSyncStreamListener, ReadSegments)
{
  nsCOMPtr<nsIStreamListener> listener;
  nsCOMPtr<nsIInputStream> stream;
  nsresult rv = NS_NewSyncStreamListener(getter_AddRefs(listener),
                                         getter_AddRefs(stream));
  ASSERT_EQ(NS_OK, rv);

  RefPtr<FakeRequest> request = new FakeRequest();
  listener->OnStartRequest(request);

  nsAutoCString expected("segments test");
  FeedData(listener, request, expected);
  listener->OnStopRequest(request, NS_OK);

  char buf[64];
  uint32_t read = 0;
  rv = stream->ReadSegments(NS_CopySegmentToBuffer, buf, sizeof(buf), &read);
  ASSERT_EQ(NS_OK, rv);
  ASSERT_EQ(expected.Length(), read);
  ASSERT_TRUE(nsCString(buf, read).Equals(expected));
}

// StreamStatus should return OK initially and the error after OnStopRequest
// with failure.
TEST(TestSyncStreamListener, StreamStatus)
{
  nsCOMPtr<nsIStreamListener> listener;
  nsCOMPtr<nsIInputStream> stream;
  nsresult rv = NS_NewSyncStreamListener(getter_AddRefs(listener),
                                         getter_AddRefs(stream));
  ASSERT_EQ(NS_OK, rv);

  rv = stream->StreamStatus();
  ASSERT_EQ(NS_OK, rv);

  RefPtr<FakeRequest> request = new FakeRequest();
  listener->OnStartRequest(request);
  listener->OnStopRequest(request, NS_ERROR_ABORT);

  rv = stream->StreamStatus();
  ASSERT_EQ(NS_ERROR_ABORT, rv);
}

// Empty data delivery still results in an empty read after stop.
TEST(TestSyncStreamListener, EmptyStream)
{
  nsCOMPtr<nsIStreamListener> listener;
  nsCOMPtr<nsIInputStream> stream;
  nsresult rv = NS_NewSyncStreamListener(getter_AddRefs(listener),
                                         getter_AddRefs(stream));
  ASSERT_EQ(NS_OK, rv);

  RefPtr<FakeRequest> request = new FakeRequest();
  listener->OnStartRequest(request);
  listener->OnStopRequest(request, NS_OK);

  nsAutoCString result;
  rv = NS_ReadInputStreamToString(stream, result, -1);
  ASSERT_EQ(NS_OK, rv);
  ASSERT_TRUE(result.IsEmpty());
}

// Available() on an empty pipe (before OnStopRequest) spins the event loop.
// Dispatch a runnable that calls OnDataAvailable to unblock it.
TEST(TestSyncStreamListener, AvailableSpinsUntilData)
{
  nsCOMPtr<nsIStreamListener> listener;
  nsCOMPtr<nsIInputStream> stream;
  nsresult rv = NS_NewSyncStreamListener(getter_AddRefs(listener),
                                         getter_AddRefs(stream));
  ASSERT_EQ(NS_OK, rv);

  RefPtr<FakeRequest> request = new FakeRequest();
  listener->OnStartRequest(request);

  nsAutoCString payload("spun"_ns);

  // Dispatch a runnable that will feed data while Available() is spinning.
  nsCOMPtr<nsIStreamListener> listenerCopy = listener;
  RefPtr<FakeRequest> requestCopy = request;
  NS_DispatchToMainThread(NS_NewRunnableFunction(
      "TestSyncStreamListener::AvailableSpinsUntilData",
      [listenerCopy, requestCopy, payload]() {
        nsCOMPtr<nsIInputStream> dataStream;
        NS_NewCStringInputStream(getter_AddRefs(dataStream), payload);
        listenerCopy->OnDataAvailable(requestCopy, dataStream, 0,
                                      payload.Length());
      }));

  // This will block inside SpinEventLoopUntil until the runnable above fires.
  uint64_t avail = 0;
  rv = stream->Available(&avail);
  ASSERT_EQ(NS_OK, rv);
  ASSERT_EQ((uint64_t)payload.Length(), avail);

  // Now finish up and verify the data.
  listener->OnStopRequest(request, NS_OK);

  char buf[16];
  uint32_t read = 0;
  rv = stream->Read(buf, sizeof(buf), &read);
  ASSERT_EQ(NS_OK, rv);
  ASSERT_EQ(payload.Length(), read);
  ASSERT_TRUE(nsCString(buf, read).Equals(payload));
}

// Available() blocks and is unblocked by OnStopRequest (no data delivered).
TEST(TestSyncStreamListener, AvailableSpinsUntilStop)
{
  nsCOMPtr<nsIStreamListener> listener;
  nsCOMPtr<nsIInputStream> stream;
  nsresult rv = NS_NewSyncStreamListener(getter_AddRefs(listener),
                                         getter_AddRefs(stream));
  ASSERT_EQ(NS_OK, rv);

  RefPtr<FakeRequest> request = new FakeRequest();
  listener->OnStartRequest(request);

  // Dispatch OnStopRequest to unblock the spin.
  nsCOMPtr<nsIStreamListener> listenerCopy = listener;
  RefPtr<FakeRequest> requestCopy = request;
  NS_DispatchToMainThread(
      NS_NewRunnableFunction("TestSyncStreamListener::AvailableSpinsUntilStop",
                             [listenerCopy, requestCopy]() {
                               listenerCopy->OnStopRequest(requestCopy, NS_OK);
                             }));

  // Blocks until OnStopRequest fires via the event loop.
  uint64_t avail = 0;
  rv = stream->Available(&avail);
  ASSERT_EQ(NS_OK, rv);
  ASSERT_EQ((uint64_t)0, avail);

  // Stream should be at EOF now.
  char buf[16];
  uint32_t read = 0;
  rv = stream->Read(buf, sizeof(buf), &read);
  ASSERT_EQ(NS_OK, rv);
  ASSERT_EQ((uint32_t)0, read);
}

// Verify the kungFuDeathGrip in WaitForData() keeps the object alive when
// all external references are dropped during the nested event loop.
// Without the kungFuDeathGrip the object would be destroyed while still
// executing WaitForData().
TEST(TestSyncStreamListener, AvailableSurvivesRefDrop)
{
  nsCOMPtr<nsIStreamListener> listener;
  nsCOMPtr<nsIInputStream> stream;
  nsresult rv = NS_NewSyncStreamListener(getter_AddRefs(listener),
                                         getter_AddRefs(stream));
  ASSERT_EQ(NS_OK, rv);

  RefPtr<FakeRequest> request = new FakeRequest();
  listener->OnStartRequest(request);

  // QI to get the listener interface back from stream so the runnable can
  // call OnStopRequest without holding a separate ref across the spin.
  nsCOMPtr<nsIStreamListener> listenerFromStream = do_QueryInterface(stream);

  // Drop the original listener ref; only |stream| (and the temporary
  // |listenerFromStream| we hand to the runnable) keep the object alive.
  listener = nullptr;

  NS_DispatchToMainThread(NS_NewRunnableFunction(
      "TestSyncStreamListener::AvailableSurvivesRefDrop",
      [listenerFromStream = std::move(listenerFromStream), request,
       &stream]() mutable {
        // Call OnStopRequest to set mKeepWaiting=false, unblocking the spin.
        listenerFromStream->OnStopRequest(request, NS_OK);
        // Drop all external refs while still inside the nested event loop.
        listenerFromStream = nullptr;
        stream = nullptr;
      }));

  // Available() sees an empty pipe with !mDone, enters WaitForData() which
  // calls SpinEventLoopUntil.  The runnable fires during the spin:
  // OnStopRequest unblocks it, then all external refs are dropped.
  // The kungFuDeathGrip inside WaitForData() keeps the object alive so
  // Available() can return safely.
  uint64_t avail = 0;
  rv = stream->Available(&avail);
  (void)rv;
  // stream was set to nullptr by the runnable; just verify we got here
  // without crashing.
}

// Larger data round-trip.
TEST(TestSyncStreamListener, LargeData)
{
  nsCOMPtr<nsIStreamListener> listener;
  nsCOMPtr<nsIInputStream> stream;
  nsresult rv = NS_NewSyncStreamListener(getter_AddRefs(listener),
                                         getter_AddRefs(stream));
  ASSERT_EQ(NS_OK, rv);

  RefPtr<FakeRequest> request = new FakeRequest();
  listener->OnStartRequest(request);

  const uint32_t kSize = 100000;
  nsAutoCString big;
  big.SetLength(kSize);
  for (uint32_t i = 0; i < kSize; ++i) {
    big.BeginWriting()[i] = 'A' + (i % 26);
  }

  FeedData(listener, request, big);
  listener->OnStopRequest(request, NS_OK);

  nsAutoCString result;
  rv = NS_ReadInputStreamToString(stream, result, -1);
  ASSERT_EQ(NS_OK, rv);
  ASSERT_EQ(big.Length(), result.Length());
  ASSERT_TRUE(result.Equals(big));
}
