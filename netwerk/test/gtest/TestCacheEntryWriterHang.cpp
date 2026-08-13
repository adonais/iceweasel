/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "LoadContextInfo.h"
#include "gtest/gtest.h"
#include "mozilla/OriginAttributes.h"
#include "mozilla/SpinEventLoopUntil.h"
#include "mozilla/TimeStamp.h"
#include "nsCOMPtr.h"
#include "nsICacheEntry.h"
#include "nsICacheEntryOpenCallback.h"
#include "nsICacheStorage.h"
#include "nsICacheStorageService.h"
#include "nsIOutputStream.h"
#include "nsServiceManagerUtils.h"
#include "nsThreadUtils.h"

using namespace mozilla;
using namespace mozilla::net;

namespace {

// Records what a cache open callback saw and returns a configurable
// onCacheEntryCheck result.  Everything runs on the thread asyncOpenURI was
// called on (the main thread here), so no locking is needed.
class OpenCallback final : public nsICacheEntryOpenCallback {
 public:
  NS_DECL_ISUPPORTS

  explicit OpenCallback(uint32_t aCheckResult) : mCheckResult(aCheckResult) {}

  NS_IMETHOD OnCacheEntryCheck(nsICacheEntry* aEntry,
                               uint32_t* aResult) override {
    mCheckCount++;
    *aResult = mCheckResult;
    return NS_OK;
  }

  NS_IMETHOD OnCacheEntryAvailable(nsICacheEntry* aEntry, bool aNew,
                                   nsresult aResult) override {
    mAvailableCount++;
    mEntry = aEntry;
    mNew = aNew;
    mResult = aResult;
    return NS_OK;
  }

  uint32_t mCheckResult;
  uint32_t mCheckCount = 0;
  uint32_t mAvailableCount = 0;
  bool mNew = false;
  nsresult mResult = NS_ERROR_NOT_INITIALIZED;
  nsCOMPtr<nsICacheEntry> mEntry;

 private:
  ~OpenCallback() = default;
};

NS_IMPL_ISUPPORTS(OpenCallback, nsICacheEntryOpenCallback)

// Spin the event loop until |aPred| is true or |aMaxMs| elapses, so a
// regression can't wedge the test run forever.  Returns the final predicate
// value.
static bool SpinUntilOrTimeout(const nsACString& aName,
                               std::function<bool()>&& aPred,
                               uint32_t aMaxMs = 5000) {
  TimeStamp deadline =
      TimeStamp::Now() + TimeDuration::FromMilliseconds(aMaxMs);
  SpinEventLoopUntil(aName,
                     [&]() { return aPred() || TimeStamp::Now() >= deadline; });
  return aPred();
}

}  // namespace

// Reproduces bug 2052908: an entry left perpetually "being written" by a
// suspended/stalled writer, and verifies that once the writer-lock bypass is
// enabled (as nsHttpChannel's suspend timer does), a consumer parked in the
// RECHECK_AFTER_WRITE path is released to the network instead of hanging.
TEST(CacheEntryWriterHang, BypassReleasesWaitingConsumer)
{
  nsresult rv;
  nsCOMPtr<nsICacheStorageService> service =
      do_GetService("@mozilla.org/netwerk/cache-storage-service;1", &rv);
  ASSERT_TRUE(NS_SUCCEEDED(rv));
  ASSERT_TRUE(service);

  RefPtr<LoadContextInfo> lci = GetLoadContextInfo(false, OriginAttributes());
  nsCOMPtr<nsICacheStorage> storage;
  rv = service->MemoryCacheStorage(lci, getter_AddRefs(storage));
  ASSERT_TRUE(NS_SUCCEEDED(rv));
  ASSERT_TRUE(storage);

  constexpr auto kURI = "http://example.com/writer-hang"_ns;

  // 1) Writer opens the entry, brings it to READY with an output stream that
  //    it never closes -- exactly the "stream active" state a stalled writer
  //    leaves behind.
  RefPtr<OpenCallback> writer =
      new OpenCallback(nsICacheEntryOpenCallback::ENTRY_WANTED);
  rv = storage->AsyncOpenURIString(kURI, ""_ns, nsICacheStorage::OPEN_NORMALLY,
                                   writer);
  ASSERT_TRUE(NS_SUCCEEDED(rv));

  ASSERT_TRUE(SpinUntilOrTimeout(
      "writer available"_ns, [&]() { return writer->mAvailableCount > 0; }));
  ASSERT_TRUE(writer->mNew);  // brand new entry, we are the writer
  ASSERT_TRUE(writer->mEntry);

  writer->mEntry->SetMetaDataElement("test", "1");
  writer->mEntry->MetaDataReady();  // WRITING -> READY

  nsCOMPtr<nsIOutputStream> out;
  rv = writer->mEntry->OpenOutputStream(0, -1, getter_AddRefs(out));
  ASSERT_TRUE(NS_SUCCEEDED(rv));
  ASSERT_TRUE(out);  // deliberately held open for the rest of the test

  // 2) Consumer opens the same entry and asks to recheck after the write
  //    finishes -- what a no-cache revalidating channel does.  It must park:
  //    the write never completes, so it can't be delivered.
  RefPtr<OpenCallback> consumer =
      new OpenCallback(nsICacheEntryOpenCallback::RECHECK_AFTER_WRITE_FINISHED);
  rv = storage->AsyncOpenURIString(kURI, ""_ns, nsICacheStorage::OPEN_NORMALLY,
                                   consumer);
  ASSERT_TRUE(NS_SUCCEEDED(rv));

  // Wait until the consumer has been checked (proving it reached the entry),
  // then confirm it was NOT delivered -- it is parked.
  ASSERT_TRUE(SpinUntilOrTimeout("consumer checked"_ns,
                                 [&]() { return consumer->mCheckCount > 0; }));
  EXPECT_EQ(consumer->mAvailableCount, 0u);

  // 3) Simulate nsHttpChannel's suspend timer firing on the stalled writer.
  writer->mEntry->SetBypassWriterLock(true);

  // 4) With the fix, the parked consumer is now released as "not wanted"
  //    (NS_ERROR_CACHE_KEY_NOT_FOUND) so the channel falls back to the network.
  //    Without the fix it stays parked and this times out.
  EXPECT_TRUE(SpinUntilOrTimeout(
      "consumer released"_ns, [&]() { return consumer->mAvailableCount > 0; }));
  EXPECT_EQ(consumer->mAvailableCount, 1u);
  EXPECT_EQ(consumer->mResult, NS_ERROR_CACHE_KEY_NOT_FOUND);
  EXPECT_FALSE(consumer->mEntry);  // no (incomplete) entry handed out

  // Cleanup: doom first so any still-parked consumer (e.g. if the fix is
  // absent and this test is failing) is released via the doomed path instead
  // of looping when the output stream closes and the write "completes".
  writer->mEntry->AsyncDoom(nullptr);
  NS_ProcessPendingEvents(nullptr);
  out->Close();
  NS_ProcessPendingEvents(nullptr);
}

// Verifies the invariant the writer-side structural fix relies on: when a
// stalled cache writer is torn down, dooming the "being written" entry (what
// nsHttpChannel::CloseCacheEntry does for a cancelled write-only entry, once
// CancelInternal stops deferring teardown for a suspended channel -- bug
// 2052908) releases any consumer parked in the RECHECK_AFTER_WRITE path with
// NS_ERROR_CACHE_KEY_NOT_FOUND, so it falls back to the network.  This does not
// depend on the writer-lock bypass.
TEST(CacheEntryWriterHang, DoomReleasesWaitingConsumer)
{
  nsresult rv;
  nsCOMPtr<nsICacheStorageService> service =
      do_GetService("@mozilla.org/netwerk/cache-storage-service;1", &rv);
  ASSERT_TRUE(NS_SUCCEEDED(rv));
  ASSERT_TRUE(service);

  RefPtr<LoadContextInfo> lci = GetLoadContextInfo(false, OriginAttributes());
  nsCOMPtr<nsICacheStorage> storage;
  rv = service->MemoryCacheStorage(lci, getter_AddRefs(storage));
  ASSERT_TRUE(NS_SUCCEEDED(rv));
  ASSERT_TRUE(storage);

  constexpr auto kURI = "http://example.com/writer-doom"_ns;

  // Writer brings the entry to READY with an output stream it never closes.
  RefPtr<OpenCallback> writer =
      new OpenCallback(nsICacheEntryOpenCallback::ENTRY_WANTED);
  rv = storage->AsyncOpenURIString(kURI, ""_ns, nsICacheStorage::OPEN_NORMALLY,
                                   writer);
  ASSERT_TRUE(NS_SUCCEEDED(rv));
  ASSERT_TRUE(SpinUntilOrTimeout(
      "writer available"_ns, [&]() { return writer->mAvailableCount > 0; }));
  ASSERT_TRUE(writer->mNew);
  ASSERT_TRUE(writer->mEntry);

  writer->mEntry->SetMetaDataElement("test", "1");
  writer->mEntry->MetaDataReady();
  nsCOMPtr<nsIOutputStream> out;
  rv = writer->mEntry->OpenOutputStream(0, -1, getter_AddRefs(out));
  ASSERT_TRUE(NS_SUCCEEDED(rv));
  ASSERT_TRUE(out);

  // Consumer parks waiting for the write to finish.
  RefPtr<OpenCallback> consumer =
      new OpenCallback(nsICacheEntryOpenCallback::RECHECK_AFTER_WRITE_FINISHED);
  rv = storage->AsyncOpenURIString(kURI, ""_ns, nsICacheStorage::OPEN_NORMALLY,
                                   consumer);
  ASSERT_TRUE(NS_SUCCEEDED(rv));
  ASSERT_TRUE(SpinUntilOrTimeout("consumer checked"_ns,
                                 [&]() { return consumer->mCheckCount > 0; }));
  EXPECT_EQ(consumer->mAvailableCount, 0u);

  // Doom the entry, as the writer's cancel teardown does.  The parked consumer
  // must be released as "not found" so it goes to the network.
  writer->mEntry->AsyncDoom(nullptr);

  EXPECT_TRUE(SpinUntilOrTimeout(
      "consumer released"_ns, [&]() { return consumer->mAvailableCount > 0; }));
  EXPECT_EQ(consumer->mAvailableCount, 1u);
  EXPECT_EQ(consumer->mResult, NS_ERROR_CACHE_KEY_NOT_FOUND);
  EXPECT_FALSE(consumer->mEntry);

  out->Close();
  NS_ProcessPendingEvents(nullptr);
}
