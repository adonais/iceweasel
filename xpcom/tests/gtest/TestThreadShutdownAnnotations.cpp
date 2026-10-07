/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "gtest/gtest.h"
#include "nsString.h"
#include "nsTArray.h"
#include "nsThread.h"

#ifdef NS_THREAD_SHUTDOWN_ANNOTATIONS_ENABLED

#  include "mozilla/Monitor.h"
#  include "mozilla/SpinEventLoopUntil.h"
#  include "nsIThreadShutdown.h"
#  include "nsThreadUtils.h"

using Phase = nsThread::ShutdownAnnotationPhase;
using HandshakeInfo = nsThread::ShutdownHandshakeInfo;

namespace {

size_t Count(const nsACString& aHaystack, const char* aNeedle) {
  size_t count = 0;
  int32_t start = 0;
  while (true) {
    int32_t idx = aHaystack.Find(nsDependentCString(aNeedle), start);
    if (idx < 0) break;
    ++count;
    start = idx + 1;
  }
  return count;
}

HandshakeInfo MakeEntry(const char* aClosingName, uint32_t aJoiningTid,
                        const char* aJoiningName, Phase aPhase,
                        uint32_t aClosingTid = 0) {
  HandshakeInfo h;
  h.mClosingName.Assign(aClosingName);
  h.mJoiningTid = aJoiningTid;
  h.mJoiningName.Assign(aJoiningName);
  h.mPhase = aPhase;
  h.mClosingTid = aClosingTid;
  h.mPhaseSinceEpochSec = 1000;
  return h;
}

}  // namespace

// The following tests only verify the JSON output format of
// BuildShutdownAnnotationJson.

TEST(ThreadShutdownAnnotationsTest, JsonFormatEmptyInput)
{
  nsTArray<HandshakeInfo> empty;
  EXPECT_EQ(nsThread::BuildShutdownAnnotationJson(empty), "[\n]"_ns);
}

TEST(ThreadShutdownAnnotationsTest, JsonFormatContended)
{
  nsCString json = nsThread::BuildContendedAnnotationJson();
  SCOPED_TRACE(json.get());
  EXPECT_EQ(1u, Count(json, "\"error\": \"contended\""));
}

TEST(ThreadShutdownAnnotationsTest, JsonFormatSingleEntry)
{
  nsTArray<HandshakeInfo> entries;
  entries.AppendElement(MakeEntry("ClosingThread", 1111, "JoiningThread",
                                  Phase::Joining, /* closingTid */ 0));
  nsCString json = nsThread::BuildShutdownAnnotationJson(entries);
  SCOPED_TRACE(json.get());

  EXPECT_EQ(1u, Count(json, "\"joining_tid\": 1111"));
  EXPECT_EQ(1u, Count(json, "\"closing_tid\": 0"));
  EXPECT_EQ(1u, Count(json, "\"closing_name\": \"ClosingThread\""));
  EXPECT_EQ(1u, Count(json, "\"joining_name\": \"JoiningThread\""));
  EXPECT_EQ(1u, Count(json, "\"phase\": \"Joining\""));
  EXPECT_EQ(1u, Count(json, "\"phase_since\":"));
}

TEST(ThreadShutdownAnnotationsTest, JsonFormatPhaseNames)
{
  {
    nsTArray<HandshakeInfo> entries;
    entries.AppendElement(
        MakeEntry("Closer", 1, "Joiner", Phase::Recv, /* closingTid */ 7));
    nsCString json = nsThread::BuildShutdownAnnotationJson(entries);
    EXPECT_EQ(1u, Count(json, "\"phase\": \"Recv\""));
    EXPECT_EQ(1u, Count(json, "\"closing_tid\": 7"));
    EXPECT_EQ(0u, Count(json, "\"phase\": \"Joining\""));
  }
  {
    nsTArray<HandshakeInfo> entries;
    entries.AppendElement(MakeEntry("Closer", 1, "Joiner", Phase::Ack));
    nsCString json = nsThread::BuildShutdownAnnotationJson(entries);
    EXPECT_EQ(1u, Count(json, "\"phase\": \"Ack\""));
  }
}

TEST(ThreadShutdownAnnotationsTest, JsonFormatMultipleEntries)
{
  nsTArray<HandshakeInfo> entries;
  entries.AppendElement(MakeEntry("CloserA", 1, "Joiner", Phase::Joining));
  entries.AppendElement(
      MakeEntry("CloserB", 1, "Joiner", Phase::Recv, /* closingTid */ 200));
  entries.AppendElement(MakeEntry("CloserC", 2, "OtherJoiner", Phase::Ack));

  nsCString json = nsThread::BuildShutdownAnnotationJson(entries);
  EXPECT_EQ(1u, Count(json, "\"closing_name\": \"CloserA\""));
  EXPECT_EQ(1u, Count(json, "\"closing_name\": \"CloserB\""));
  EXPECT_EQ(1u, Count(json, "\"closing_name\": \"CloserC\""));
  EXPECT_EQ(1u, Count(json, "\"phase\": \"Joining\""));
  EXPECT_EQ(1u, Count(json, "\"phase\": \"Recv\""));
  EXPECT_EQ(1u, Count(json, "\"phase\": \"Ack\""));
  EXPECT_EQ(2u, Count(json, "\"joining_tid\": 1"));
  EXPECT_EQ(1u, Count(json, "\"joining_tid\": 2"));
  EXPECT_EQ(1u, Count(json, "\"closing_tid\": 200"));
}

// Integration test: spin up several threads but only block one during shutdown.
// CollectShutdownHandshakes() must return exactly that one thread in Joining,
// and idle threads must not appear.
TEST(ThreadShutdownAnnotationsTest, CollectionSeesOnlyShuttingThreads)
{
  nsCOMPtr<nsIThread> idle1, idle2, closing;
  NS_NewNamedThread("IdleThread1", getter_AddRefs(idle1));
  NS_NewNamedThread("IdleThread2", getter_AddRefs(idle2));
  NS_NewNamedThread("ClosingThread", getter_AddRefs(closing));

  mozilla::Monitor mon("TestShutdownAnnotations");
  bool running = false;
  bool unblock = false;

  closing->Dispatch(NS_NewRunnableFunction("Blocker", [&]() {
    mozilla::MonitorAutoLock lock(mon);
    running = true;
    mon.NotifyAll();
    while (!unblock) {
      mon.Wait();
    }
  }));

  {
    mozilla::MonitorAutoLock lock(mon);
    while (!running) {
      mon.Wait();
    }
  }

  // Shut down one idle thread completely before collecting; it must not appear.
  idle1->Shutdown();

  // BeginShutdown() sets the Joining phase before dispatching the shutdown
  // event; the thread is blocked so it cannot advance to Recv yet.
  nsCOMPtr<nsIThreadShutdown> ctx;
  ASSERT_TRUE(NS_SUCCEEDED(closing->BeginShutdown(getter_AddRefs(ctx))));

  // Other XPCOM threads may coincidentally be shutting down, so search by
  // name rather than asserting on the total count.
  mozilla::Maybe<nsTArray<nsThread::ShutdownHandshakeInfo>> entries =
      nsThread::CollectShutdownHandshakes();
  ASSERT_TRUE(entries.isSome());
  const nsThread::ShutdownHandshakeInfo* found = nullptr;
  for (const auto& e : *entries) {
    if (e.mClosingName.Equals("ClosingThread"_ns)) {
      found = &e;
      break;
    }
  }

  ASSERT_NE(found, nullptr);
  EXPECT_EQ(found->mPhase, Phase::Joining);
  EXPECT_NE(0u, found->mClosingTid);

  {
    mozilla::MonitorAutoLock lock(mon);
    unblock = true;
    mon.NotifyAll();
  }
  mozilla::SpinEventLoopUntil<
      mozilla::ProcessFailureBehavior::IgnoreAndContinue>(
      "TestShutdownAnnotations"_ns, [&]() { return ctx->GetCompleted(); });

  idle2->Shutdown();
}

#endif  // NS_THREAD_SHUTDOWN_ANNOTATIONS_ENABLED
