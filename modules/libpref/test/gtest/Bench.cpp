/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Memory and timing microbenchmark for the pref callback structures (see
// Preferences.cpp). These tests always pass; they emit their measurements in
// the PERFHERDER_DATA format (framework platform_microbench) for perfherder to
// ingest, the same way testing/gtest/mozilla/MozGTestBench.cpp does. Run with:
//   ./mach gtest 'PrefsCallbackTrieBench.*'
// The LiveTrieFootprint figures reflect the real ~2,600 static-pref
// ("mirror: always") callbacks registered at startup, which is what the
// about:memory / awsy resident-unique regression measures. The CorpusDelta
// figures isolate the per-callback memory and timing cost reproducibly.

#include <algorithm>
#include <cstdio>
#include <cstdlib>
#include <initializer_list>
#include <iterator>

#include "gtest/gtest.h"
#include "mozilla/Preferences.h"
#include "mozilla/SpinEventLoopUntil.h"
#include "mozilla/TimeStamp.h"
#include "nsCOMPtr.h"
#include "nsITimer.h"
#include "nsPrintfCString.h"
#include "nsString.h"
#include "nsTArray.h"
#include "nsThreadUtils.h"

using namespace mozilla;

namespace {

void BenchCallback(const char*, void*) {}

// Build a deterministic corpus that mimics the real static-pref distribution:
// a modest number of top-level roots, shared mid segments, and unique leaves,
// at depths 3-5. Sized to be comparable to the real "always" mirror load so the
// measured delta is representative.
void BuildCorpus(nsTArray<nsCString>& aOut) {
  static const char* kRoots[] = {
      "browser",  "network", "dom",        "layout",  "media",      "gfx",
      "security", "privacy", "javascript", "toolkit", "extensions", "apz"};
  static const char* kMid[] = {
      "cache",   "http",   "css",     "options",  "disk",
      "enabled", "config", "sandbox", "frecency", "downloadable_fonts"};
  static const char* kLeaf[] = {"enabled",   "capacity", "timeout_ms", "max",
                                "threshold", "level",    "mode",       "scale",
                                "factor",    "interval"};

  for (auto* root : kRoots) {
    for (auto* mid : kMid) {
      for (size_t i = 0; i < std::size(kLeaf); ++i) {
        // depth 3: root.mid.leaf
        aOut.AppendElement(nsPrintfCString("%s.%s.%s", root, mid, kLeaf[i]));
        // depth 4: root.mid.subN.leaf
        aOut.AppendElement(
            nsPrintfCString("%s.%s.sub%zu.%s", root, mid, i, kLeaf[i]));
        // depth 5: root.mid.subN.deep.leaf
        aOut.AppendElement(
            nsPrintfCString("%s.%s.sub%zu.deep.%s", root, mid, i, kLeaf[i]));
      }
    }
  }
}

struct PerfSubtest {
  const char* mName;
  double mValue;
};

// Emit one PERFHERDER_DATA line (framework platform_microbench) for perfherder,
// matching the format produced by testing/gtest/mozilla/MozGTestBench.cpp.
// Every metric here (bytes and us/op) is lower-is-better. Measurements are not
// emitted on debug/ASAN builds, where they are not representative.
void EmitPerfherder(
    [[maybe_unused]] const char* aSuite,
    [[maybe_unused]] std::initializer_list<PerfSubtest> aSubtests) {
#if !defined(DEBUG) && !defined(MOZ_ASAN)
  const bool shouldAlert = bool(getenv("PERFHERDER_ALERTING_ENABLED"));
  nsCString json;
  json.AppendPrintf(
      "PERFHERDER_DATA: {\"framework\": {\"name\": \"platform_microbench\"}, "
      "\"suites\": [{\"name\": \"%s\", \"subtests\": [",
      aSuite);
  bool first = true;
  for (const PerfSubtest& sub : aSubtests) {
    json.AppendPrintf(
        "%s{\"name\": \"%s\", \"value\": %.10g, \"lowerIsBetter\": true, "
        "\"shouldAlert\": %s}",
        first ? "" : ", ", sub.mName, sub.mValue,
        shouldAlert ? "true" : "false");
    first = false;
  }
  json.AppendLiteral("]}]}\n");
  printf("%s", json.get());
#endif
}

}  // namespace

TEST(PrefsCallbackTrieBench, LiveTrieFootprint)
{
  auto stats = Preferences::GetCallbackTrieStatsForTesting();
  ASSERT_GT(stats.mCallbackCount, 0u);
  EmitPerfherder("PrefsCallbackTrie-live",
                 {{"total-bytes", double(stats.mTotalBytes)},
                  {"object-bytes", double(stats.mObjectBytes)},
                  {"trie-bytes", double(stats.mTrieBytes)},
                  {"segment-bytes", double(stats.mSegmentBytes)},
                  {"node-count", double(stats.mNodeCount)},
                  {"per-callback-bytes",
                   double(stats.mTotalBytes) / stats.mCallbackCount}});
}

TEST(PrefsCallbackTrieBench, CorpusDeltaAndTiming)
{
  nsTArray<nsCString> corpus;
  BuildCorpus(corpus);
  const uint32_t corpusLength = corpus.Length();

  auto before = Preferences::GetCallbackTrieStatsForTesting();

  // Register once and capture the memory delta. Timing is measured separately
  // as best-of-N cycles below to suppress one-shot noise.
  for (auto& name : corpus) {
    Preferences::RegisterCallback(BenchCallback, name);
  }

  auto after = Preferences::GetCallbackTrieStatsForTesting();

  // Best-of-N timing. Notify flips an int value on each corpus pref to fire the
  // matching callbacks through CollectMatchingForNotify. Register/unregister
  // are measured as paired cycles (the corpus is fully registered between
  // runs).
  const int kReps = 8;
  double regBest = 1e30, notifyBest = 1e30, unregBest = 1e30;
  for (int rep = 0; rep < kReps; ++rep) {
    TimeStamp beforeNotify = TimeStamp::Now();
    for (uint32_t i = 0; i < corpusLength; ++i) {
      Preferences::SetInt(corpus[i].get(), int32_t(rep * 7 + i));
    }
    TimeStamp afterNotify = TimeStamp::Now();
    notifyBest =
        std::min(notifyBest,
                 (afterNotify - beforeNotify).ToMicroseconds() / corpusLength);

    TimeStamp beforeUnregister = TimeStamp::Now();
    for (auto& name : corpus) {
      Preferences::UnregisterCallback(BenchCallback, name);
    }
    TimeStamp afterUnregister = TimeStamp::Now();
    unregBest = std::min(
        unregBest,
        (afterUnregister - beforeUnregister).ToMicroseconds() / corpusLength);

    TimeStamp beforeRegister = TimeStamp::Now();
    for (auto& name : corpus) {
      Preferences::RegisterCallback(BenchCallback, name);
    }
    TimeStamp afterRegister = TimeStamp::Now();
    regBest =
        std::min(regBest, (afterRegister - beforeRegister).ToMicroseconds() /
                              corpusLength);
  }
  // Leave the corpus unregistered, and clear the pref values it set so they do
  // not persist in the global hashtable for the rest of the test suite.
  for (auto& name : corpus) {
    Preferences::UnregisterCallback(BenchCallback, name);
    Preferences::ClearUser(name.get());
  }

  ASSERT_EQ(corpusLength, corpus.Length());

  const size_t dBytes = after.mTotalBytes - before.mTotalBytes;
  const size_t dTrie = after.mTrieBytes - before.mTrieBytes;
  const size_t dSeg = after.mSegmentBytes - before.mSegmentBytes;

  EmitPerfherder("PrefsCallbackTrie-corpus",
                 {{"register-us", regBest},
                  {"notify-us", notifyBest},
                  {"unregister-us", unregBest},
                  {"delta-total-bytes", double(dBytes)},
                  {"delta-trie-bytes", double(dTrie)},
                  {"delta-segment-bytes", double(dSeg)},
                  {"per-callback-bytes", double(dBytes) / corpusLength}});

  // The corpus is unregistered, but pruning the now-dead trie nodes happens on
  // the deferred idle sweep. Wait for it so we leave a clean trie for the next
  // test (a repeating timer keeps the main thread busy enough for the idle
  // sweep to find idle time, same trick as PrefsBasics.WeakObserverIdleSweep).
  // We can't wait for a return to `before`: running the corpus lazily registers
  // a few process-lifetime static-pref mirrors, so the trie settles slightly
  // above the pre-test count. The dead nodes are all still present here (the
  // sweep has not run yet), so instead wait for the count to drop below this
  // just-unregistered peak, which uniquely marks the sweep as having run.
  nsCOMPtr<nsITimer> keepAlive = NS_NewTimer();
  keepAlive->InitWithNamedFuncCallback(
      [](nsITimer*, void*) {}, nullptr, 50, nsITimer::TYPE_REPEATING_SLACK,
      "PrefsCallbackTrieBench.CorpusDeltaAndTiming.keepAlive"_ns);
  const uint32_t peakNodes =
      Preferences::GetCallbackTrieStatsForTesting().mNodeCount;
  MOZ_ALWAYS_TRUE(SpinEventLoopUntil(
      "PrefsCallbackTrieBench.CorpusDeltaAndTiming.drain"_ns, [&] {
        return Preferences::GetCallbackTrieStatsForTesting().mNodeCount <
               peakNodes;
      }));
  keepAlive->Cancel();
}

// Verify that unregistering callbacks and letting the idle sweep run prunes the
// now-empty trie nodes, so the trie does not grow without bound under observer
// churn. Without pruning, Compact() removes the callbacks but leaves the nodes,
// and the node count stays elevated.
TEST(PrefsCallbackTrieBench, PruneEmptyNodesOnChurn)
{
  // A repeating timer keeps the main thread busy enough for the idle sweep
  // machinery to find idle time (same trick as
  // PrefsBasics.WeakObserverIdleSweep).
  nsCOMPtr<nsITimer> keepAlive = NS_NewTimer();
  keepAlive->InitWithNamedFuncCallback(
      [](nsITimer*, void*) {}, nullptr, 50, nsITimer::TYPE_REPEATING_SLACK,
      "PrefsCallbackTrieBench.PruneEmptyNodesOnChurn.keepAlive"_ns);

  // Drain any pending startup sweep so the baseline is stable.
  TimeStamp drainDeadline =
      TimeStamp::Now() + TimeDuration::FromMilliseconds(100);
  MOZ_ALWAYS_TRUE(SpinEventLoopUntil(
      "PrefsCallbackTrieBench.PruneEmptyNodesOnChurn.drain"_ns,
      [&] { return TimeStamp::Now() >= drainDeadline; }));
  NS_ProcessPendingEvents(nullptr);

  const uint32_t baseNodes =
      Preferences::GetCallbackTrieStatsForTesting().mNodeCount;

  // Register a corpus of deep, unique paths that create many private nodes.
  nsTArray<nsCString> corpus;
  for (int i = 0; i < 400; ++i) {
    corpus.AppendElement(
        nsPrintfCString("test.prune.fam%d.sub%d.deep.leaf%d", i % 20, i, i));
  }
  for (auto& name : corpus) {
    Preferences::RegisterCallback(BenchCallback, name);
  }
  const uint32_t grownNodes =
      Preferences::GetCallbackTrieStatsForTesting().mNodeCount;
  fprintf(stderr, "[bench] churn: base nodes=%u, grown=%u (+%u)\n", baseNodes,
          grownNodes, grownNodes - baseNodes);
  ASSERT_GT(grownNodes, baseNodes);

  // Unregister everything; this schedules the idle sweep (Compact + prune).
  for (auto& name : corpus) {
    Preferences::UnregisterCallback(BenchCallback, name);
  }

  // Spin until the sweep prunes the now-empty nodes back to the baseline.
  MOZ_ALWAYS_TRUE(SpinEventLoopUntil(
      "PrefsCallbackTrieBench.PruneEmptyNodesOnChurn"_ns, [&] {
        return Preferences::GetCallbackTrieStatsForTesting().mNodeCount <=
               baseNodes;
      }));

  const uint32_t finalNodes =
      Preferences::GetCallbackTrieStatsForTesting().mNodeCount;
  fprintf(stderr, "[bench] churn: after sweep nodes=%u (base=%u)\n", finalNodes,
          baseNodes);
  EXPECT_EQ(finalNodes, baseNodes);

  keepAlive->Cancel();
}
