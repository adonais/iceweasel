/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Regression test for Bug 2031968: deadlock when DNS completion callbacks are
// invoked while nsHostResolver's mDBLock write lock is held.

#include "GetAddrInfo.h"
#include "gtest/gtest.h"
#include "mozilla/CondVar.h"
#include "mozilla/Maybe.h"
#include "mozilla/Mutex.h"
#include "mozilla/Variant.h"
#include "mozilla/gtest/MozAssertions.h"
#include "mozilla/net/DNSByTypeRecord.h"
#include "mozilla/net/DNSPacket.h"
#include "nsHostRecord.h"
#include "nsHostResolver.h"
#include "nsINativeDNSResolverOverride.h"
#include "nsServiceManagerUtils.h"
#include "prthread.h"

using namespace mozilla;
using namespace mozilla::net;

namespace {

// A callback that, on its first invocation, immediately calls ResolveHost
// again on the same resolver.
class ReentrantCallback final : public nsResolveHostCallback {
 public:
  NS_DECL_ISUPPORTS

  ReentrantCallback(nsHostResolver* aResolver, bool aShouldReenter,
                    Mutex& aMutex, CondVar& aCondVar, bool& aCompleted)
      : mResolver(aResolver),
        mShouldReenter(aShouldReenter),
        mMutex(aMutex),
        mCondVar(aCondVar),
        mCompleted(aCompleted) {}

  void OnResolveHostComplete(nsHostResolver* aResolver, nsHostRecord* aRecord,
                             nsresult aStatus) override {
    if (mShouldReenter) {
      RefPtr<ReentrantCallback> inner = new ReentrantCallback(
          mResolver, /* aShouldReenter */ false, mMutex, mCondVar, mCompleted);
      mResolver->ResolveHost(
          "localhost"_ns, ""_ns, -1, nsIDNSService::RESOLVE_TYPE_DEFAULT,
          OriginAttributes(), nsIDNSService::RESOLVE_DEFAULT_FLAGS,
          PR_AF_UNSPEC, inner);
    }
    MutexAutoLock lock(mMutex);
    mCompleted = true;
    mCondVar.Notify();
  }

  bool EqualsAsyncListener(nsIDNSListener* aListener) override { return false; }

  size_t SizeOfIncludingThis(
      mozilla::MallocSizeOf aMallocSizeOf) const override {
    return aMallocSizeOf(this);
  }

 private:
  ~ReentrantCallback() = default;

  RefPtr<nsHostResolver> mResolver;
  const bool mShouldReenter;
  Mutex& mMutex;
  CondVar& mCondVar;
  bool& mCompleted;
};

NS_IMPL_ISUPPORTS0(ReentrantCallback)

struct WorkerArgs {
  RefPtr<nsHostResolver> resolver;
  Mutex* mutex;
  CondVar* condVar;
  bool* completed;
};

static void WorkerThread(void* aArg) {
  WorkerArgs* args = static_cast<WorkerArgs*>(aArg);
  RefPtr<ReentrantCallback> callback =
      new ReentrantCallback(args->resolver, /* aShouldReenter */ true,
                            *args->mutex, *args->condVar, *args->completed);
  args->resolver->ResolveHost(
      "localhost"_ns, ""_ns, -1, nsIDNSService::RESOLVE_TYPE_DEFAULT,
      OriginAttributes(), nsIDNSService::RESOLVE_DEFAULT_FLAGS, PR_AF_UNSPEC,
      callback);
}

}  // namespace

// Verify that a DNS completion callback can safely call back into ResolveHost.
TEST(TestDNS, ResolveHostCallbackCanReenterResolveHost)
{
  RefPtr<nsHostResolver> resolver;
  nsresult rv = nsHostResolver::Create(getter_AddRefs(resolver));
  ASSERT_NS_SUCCEEDED(rv);

  Mutex mutex MOZ_UNANNOTATED("TestDNS.mutex");
  CondVar condVar(mutex, "TestDNS.condVar");
  bool completed = false;

  WorkerArgs args{resolver, &mutex, &condVar, &completed};

  // Run on a worker thread so the main thread can apply a timeout.
  PRThread* thread =
      PR_CreateThread(PR_USER_THREAD, WorkerThread, &args, PR_PRIORITY_NORMAL,
                      PR_GLOBAL_THREAD, PR_JOINABLE_THREAD, 0);
  ASSERT_TRUE(thread);

  bool wasCompleted;
  {
    MutexAutoLock lock(mutex);
    // Wait up to 10 seconds for completion; a timeout indicates deadlock.
    condVar.Wait(TimeDuration::FromSeconds(10));
    wasCompleted = completed;
    EXPECT_TRUE(wasCompleted)
        << "Deadlock detected (Bug 2031968): OnResolveHostComplete was invoked "
           "while mDBLock write was held; the callback could not re-enter "
           "ResolveHost.";
  }

  // If deadlocked, the thread is abandoned rather than blocking forever.
  if (wasCompleted) {
    PR_JoinThread(thread);
    resolver->Shutdown();
  }
}

namespace {

void AppendU16(nsCString& aBuf, uint16_t aVal) {
  aBuf += static_cast<char>((aVal >> 8) & 0xff);
  aBuf += static_cast<char>(aVal & 0xff);
}

void AppendHTTPSHeader(nsCString& aBuf) {
  AppendU16(aBuf, 0);       // id
  AppendU16(aBuf, 0x8000);  // flags (QR set)
  AppendU16(aBuf, 0);       // qdcount
  AppendU16(aBuf, 1);       // ancount
  AppendU16(aBuf, 0);       // nscount
  AppendU16(aBuf, 0);       // arcount
}

void AppendHTTPSAnswerHeader(nsCString& aBuf, const nsACString& aName) {
  MOZ_ALWAYS_SUCCEEDS(DNSPacket::EncodeHost(aBuf, aName));
  AppendU16(aBuf, 65);  // TYPE HTTPS
  AppendU16(aBuf, 1);   // CLASS IN
  AppendU16(aBuf, 0);   // TTL high
  AppendU16(aBuf, 55);  // TTL low
}

// A single HTTPS AliasMode (SvcPriority 0) answer for |aOrigin| whose
// TargetName is |aTarget|.
nsCString BuildHTTPSAliasPacket(const nsACString& aOrigin,
                                const nsACString& aTarget) {
  nsCString buf;
  AppendHTTPSHeader(buf);
  AppendHTTPSAnswerHeader(buf, aOrigin);
  nsCString rdata;
  AppendU16(rdata, 0);  // SvcPriority 0 => AliasMode
  MOZ_ALWAYS_SUCCEEDS(DNSPacket::EncodeHost(rdata, aTarget));
  AppendU16(buf, rdata.Length());  // RDLENGTH
  buf.Append(rdata);
  return buf;
}

// A single HTTPS ServiceMode (SvcPriority 1) answer for |aOrigin|.
nsCString BuildHTTPSServicePacket(const nsACString& aOrigin) {
  nsCString buf;
  AppendHTTPSHeader(buf);
  AppendHTTPSAnswerHeader(buf, aOrigin);
  nsCString rdata;
  AppendU16(rdata, 1);             // SvcPriority 1 => ServiceMode
  rdata += '\0';                   // TargetName "." (owner name)
  AppendU16(buf, rdata.Length());  // RDLENGTH
  buf.Append(rdata);
  return buf;
}

void AddHTTPSOverride(nsINativeDNSResolverOverride* aOverride,
                      const nsACString& aHost, const nsCString& aPacket) {
  aOverride->AddHTTPSRecordOverride(
      aHost, reinterpret_cast<const uint8_t*>(aPacket.BeginReading()),
      aPacket.Length());
}

}  // namespace

// An HTTPS AliasMode record whose TargetName differs from the owner name only
// by case is a self-reference and must not be followed. The decoder lowercases
// the TargetName, so detecting this requires a case-insensitive comparison
// (RFC 4343). Regression test for D312868 review feedback on bug 1869075.
TEST(TestDNS, HTTPSAliasSelfReferenceIsCaseInsensitive)
{
  nsCOMPtr<nsINativeDNSResolverOverride> override =
      do_GetService("@mozilla.org/network/native-dns-override;1");
  ASSERT_TRUE(override);

  constexpr auto kMixed = "Ci-Self.example"_ns;
  constexpr auto kLower = "ci-self.example"_ns;

  // The mixed-case origin aliases to itself; the decoder returns the lowercased
  // TargetName, so the alias equals the owner name only case-insensitively.
  AddHTTPSOverride(override, kMixed, BuildHTTPSAliasPacket(kMixed, kMixed));

  // A valid ServiceMode record cached under the lowercased name. If the
  // self-reference were not detected (case-sensitive compare), following the
  // alias would resolve to this record and wrongly report success.
  AddHTTPSOverride(override, kLower, BuildHTTPSServicePacket(kLower));

  TypeRecordResultType result = AsVariant(Nothing());
  uint32_t ttl = 0;
  nsresult rv = ResolveHTTPSRecord(kMixed, nsIDNSService::RESOLVE_DEFAULT_FLAGS,
                                   result, ttl);

  EXPECT_TRUE(NS_FAILED(rv))
      << "a case-only self-referencing HTTPS alias must not be followed";
  EXPECT_TRUE(result.is<TypeRecordEmpty>())
      << "no record should be surfaced for a self-referencing alias";

  override->ClearOverrides();
}
