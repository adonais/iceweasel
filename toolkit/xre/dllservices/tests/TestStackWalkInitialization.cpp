/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsWindowsHelpers.h"
#include "mozilla/Array.h"
#include "mozilla/Attributes.h"
#include "mozilla/StackWalkThread.h"
#include "mozilla/StackWalk_windows.h"
#include "mozilla/WindowsStackWalkInitialization.h"

#include <windows.h>

#define TEST_FAILED(format, ...)                                               \
  do {                                                                         \
    wprintf(L"TEST-FAILED | TestStackWalkInitialization | " format __VA_OPT__( \
        , ) __VA_ARGS__);                                                      \
    ::exit(1);                                                                 \
  } while (0)

#define TEST_PASS(format, ...)                                               \
  do {                                                                       \
    wprintf(L"TEST-PASS | TestStackWalkInitialization | " format __VA_OPT__( \
        , ) __VA_ARGS__);                                                    \
  } while (0)

#define MAX_TIMEOUT_MS 5000

extern "C" __declspec(dllexport) uint64_t gPseudoLock{};

MOZ_NEVER_INLINE MOZ_NAKED __declspec(dllexport) void LockThroughRegisterRsi() {
  asm volatile(
      // Found in RtlAcquireSRWLockShared
      "lock cmpxchgq %rcx, (%rsi)");
}

MOZ_NEVER_INLINE MOZ_NAKED __declspec(dllexport) void LockThroughRegisterRcx() {
  asm volatile(
      // Found in RtlReleaseSRWLockShared
      "lock cmpxchgq %r10, (%rcx)");
}

MOZ_NEVER_INLINE MOZ_NAKED __declspec(dllexport) void LockThroughRegisterR10() {
  asm volatile("lock cmpxchgq %rcx, (%r10)");
}

MOZ_NEVER_INLINE MOZ_NAKED __declspec(dllexport) void
LockThroughRipRelativeAddr() {
  asm volatile(
      // Found in an inlined call to RtlAcquireSRWLockShared in
      // RtlpxLookupFunctionTable on Windows 10
      "lock cmpxchgq %r11, gPseudoLock(%rip)");
}

void TestLockExtraction() {
  void* extractedLock{};
  CONTEXT context{};

  context.Rip = reinterpret_cast<DWORD64>(LockThroughRegisterRsi);
  context.Rsi = reinterpret_cast<DWORD64>(&gPseudoLock);
  extractedLock = mozilla::ExtractLockFromCurrentCpuContext(&context);
  context.Rsi = 0;
  if (extractedLock != &gPseudoLock) {
    TEST_FAILED(
        L"Failed to extract the lock through register RSI (expected: %p, got: "
        L"%p)\n",
        &gPseudoLock, extractedLock);
  }

  context.Rip = reinterpret_cast<DWORD64>(LockThroughRegisterRcx);
  context.Rcx = reinterpret_cast<DWORD64>(&gPseudoLock);
  extractedLock = mozilla::ExtractLockFromCurrentCpuContext(&context);
  context.Rcx = 0;
  if (extractedLock != &gPseudoLock) {
    TEST_FAILED(
        L"Failed to extract the lock through register RCX (expected: %p, got: "
        L"%p)\n",
        &gPseudoLock, extractedLock);
  }

  context.Rip = reinterpret_cast<DWORD64>(LockThroughRegisterR10);
  context.R10 = reinterpret_cast<DWORD64>(&gPseudoLock);
  extractedLock = mozilla::ExtractLockFromCurrentCpuContext(&context);
  context.R10 = 0;
  if (extractedLock != &gPseudoLock) {
    TEST_FAILED(
        L"Failed to extract the lock through register R10 (expected: %p, got: "
        L"%p)\n",
        &gPseudoLock, extractedLock);
  }

  context.Rip = reinterpret_cast<DWORD64>(LockThroughRipRelativeAddr);
  extractedLock = mozilla::ExtractLockFromCurrentCpuContext(&context);
  if (extractedLock != &gPseudoLock) {
    TEST_FAILED(
        L"Failed to extract the lock through RIP-relative address (expected: "
        L"%p, got: %p)\n",
        &gPseudoLock, extractedLock);
  }

  TEST_PASS(L"Managed to extract the lock with all test patterns\n");
}

void TestLockCollectionAndValidation(
    mozilla::Array<void*, 2>& aStackWalkLocks) {
  if (!mozilla::CollectStackWalkLocks(aStackWalkLocks)) {
    TEST_FAILED(L"Failed to collect stack walk locks\n");
  }

  if (!mozilla::ValidateStackWalkLocks(aStackWalkLocks)) {
    TEST_FAILED(L"Failed to validate stack walk locks\n");
  }

  TEST_PASS(L"Collected and validated locks successfully\n");
}

void CountStackFrame(uint32_t, void*, void*, void* aClosure) {
  ++*reinterpret_cast<uint32_t*>(aClosure);
}

uint32_t WalkOwnStack() {
  uint32_t frames = 0;
  MozStackWalkThread(CountStackFrame, 0, &frames, nullptr, nullptr);
  return frames;
}

// The ntdll internal locks of strategy (1), collected by wmain.
static SRWLOCK* gStackWalkLocks[2];

// Makes strategy (1) consider stack walking unsafe, as a counterpart to
// AutoSuppressStackWalking which makes strategy (2) consider it unsafe.
struct MOZ_RAII AutoHoldStackWalkLocks {
  AutoHoldStackWalkLocks() {
    if (!::TryAcquireSRWLockExclusive(gStackWalkLocks[0])) {
      TEST_FAILED(L"Failed to acquire lock 0\n");
    }
    if (!::TryAcquireSRWLockExclusive(gStackWalkLocks[1])) {
      ::ReleaseSRWLockExclusive(gStackWalkLocks[0]);
      TEST_FAILED(L"Failed to acquire lock 1\n");
    }
  }

  ~AutoHoldStackWalkLocks() {
    ::ReleaseSRWLockExclusive(gStackWalkLocks[1]);
    ::ReleaseSRWLockExclusive(gStackWalkLocks[0]);
  }
};

// Shared state for the worker threads driven by RunWorkerWhileBlocked. Each
// worker signals mEvents[0] when it is ready, waits for mEvents[1] which the
// main thread signals once stack walking is blocked, does its work, then
// signals mEvents[2].
struct WorkerState {
  nsAutoHandle* mEvents;
  uint32_t mBaselineFrames;
  uint32_t mFrames;
};

// Runs aWorkerStartRoutine on a worker thread while Blocker blocks stack
// walking from the main thread, and returns whether the worker completed its
// work instead of getting stuck. We must not report a failure while Blocker is
// alive, as printing or exiting while holding the stack walk locks would
// deadlock.
template <typename Blocker>
bool RunWorkerWhileBlocked(LPTHREAD_START_ROUTINE aWorkerStartRoutine,
                           WorkerState& aState) {
  nsAutoHandle events[3]{};
  for (int i = 0; i < 3; ++i) {
    nsAutoHandle event(::CreateEventW(nullptr, /* bManualReset */ TRUE,
                                      /* bInitialState */ FALSE, nullptr));
    if (!event) {
      TEST_FAILED(L"Failed to create event %d\n", i);
    }
    events[i].swap(event);
  }
  aState.mEvents = events;

  nsAutoHandle workerThread(
      ::CreateThread(nullptr, 0, aWorkerStartRoutine, &aState, 0, nullptr));
  if (!workerThread) {
    TEST_FAILED(L"Failed to create worker thread\n");
  }

  auto& ready = events[0];
  auto& go = events[1];
  auto& done = events[2];

  if (::WaitForSingleObject(ready, MAX_TIMEOUT_MS) != WAIT_OBJECT_0) {
    TEST_FAILED(L"Worker thread did not become ready\n");
  }

  bool workerStarted;
  bool workerCompleted;
  {
    Blocker blocker;

    workerStarted = ::SetEvent(go);
    workerCompleted =
        workerStarted &&
        ::WaitForSingleObject(done, MAX_TIMEOUT_MS) == WAIT_OBJECT_0;
  }

  if (!workerStarted) {
    TEST_FAILED(L"Failed to signal the worker thread\n");
  }

  // aState and our events die with this frame, so do not let the worker
  // outlive them. This also checks that a stuck worker did get unstuck once
  // stack walking was unblocked.
  if (::WaitForSingleObject(workerThread, MAX_TIMEOUT_MS) != WAIT_OBJECT_0) {
    TEST_FAILED(L"Worker thread did not exit after being unblocked\n");
  }

  return workerCompleted;
}

DWORD WINAPI LookupThreadProc(LPVOID aParam) {
  auto state = reinterpret_cast<WorkerState*>(aParam);
  auto& ready = state->mEvents[0];
  auto& go = state->mEvents[1];
  auto& done = state->mEvents[2];

  ::SetEvent(ready);

  if (::WaitForSingleObject(go, MAX_TIMEOUT_MS) == WAIT_OBJECT_0) {
    // Do a lookup. We are supposed to get stuck until the locks are released.
    DWORD64 imageBase;
    ::RtlLookupFunctionEntry(reinterpret_cast<DWORD64>(LookupThreadProc),
                             &imageBase, nullptr);

    ::SetEvent(done);
  }

  return 0;
}

// This test checks that the locks in gStackWalkLocks cause
// RtlLookupFunctionEntry to get stuck if they are held exclusively, i.e. there
// is a good chance that these are indeed the locks we are looking for.
void TestLocksPreventLookup() {
  WorkerState state{};
  if (RunWorkerWhileBlocked<AutoHoldStackWalkLocks>(LookupThreadProc, state)) {
    TEST_FAILED(
        L"Lookup thread was not stuck during lookup while we acquired the "
        L"locks exclusively\n");
  }

  TEST_PASS(L"Locks prevented lookup while acquired exclusively\n");
}

DWORD WINAPI WalkThreadProc(LPVOID aParam) {
  auto state = reinterpret_cast<WorkerState*>(aParam);
  auto& ready = state->mEvents[0];
  auto& go = state->mEvents[1];
  auto& done = state->mEvents[2];

  state->mBaselineFrames = WalkOwnStack();

  ::SetEvent(ready);

  if (::WaitForSingleObject(go, MAX_TIMEOUT_MS) == WAIT_OBJECT_0) {
    state->mFrames = WalkOwnStack();
    ::SetEvent(done);
  }

  return 0;
}

// Checks the outcome of a WalkThreadProc worker that ran while stack walking
// was blocked. Its baseline walk must have collected frames, proving that
// nothing but our blocker was making stack walking unsafe.
void CheckWorkerCouldNotWalk(const WorkerState& aState, bool aWalkCompleted) {
  if (!aState.mBaselineFrames) {
    TEST_FAILED(L"Baseline stack walk captured no frames\n");
  }
  if (!aWalkCompleted) {
    TEST_FAILED(L"Stack walk did not complete while it was blocked\n");
  }
  if (aState.mFrames) {
    TEST_FAILED(L"Stack walk captured frames while it was blocked\n");
  }
}

// Strategy (2) must stop us even when strategy (1) finds both locks free. The
// suppression is active on the main thread while the walk happens on the
// worker thread, as suppressions are global and not per-thread.
void TestSuppressionPreventsWalking() {
  WorkerState state{};
  bool walkCompleted =
      RunWorkerWhileBlocked<AutoSuppressStackWalking>(WalkThreadProc, state);

  CheckWorkerCouldNotWalk(state, walkCompleted);

  TEST_PASS(
      L"Suppression prevented walking on another thread while both locks "
      L"were free\n");
}

// Strategy (1) must stop us even when no suppression from strategy (2) is
// currently active.
void TestLocksPreventWalking() {
  WorkerState state{};
  bool walkCompleted =
      RunWorkerWhileBlocked<AutoHoldStackWalkLocks>(WalkThreadProc, state);

  CheckWorkerCouldNotWalk(state, walkCompleted);

  TEST_PASS(L"Held locks prevented walking without suppressions\n");
}

int wmain(int argc, wchar_t* argv[]) {
  TestLockExtraction();

  mozilla::Array<void*, 2> stackWalkLocks;
  TestLockCollectionAndValidation(stackWalkLocks);

  InitializeStackWalkLocks(stackWalkLocks);
  gStackWalkLocks[0] = reinterpret_cast<SRWLOCK*>(stackWalkLocks[0]);
  gStackWalkLocks[1] = reinterpret_cast<SRWLOCK*>(stackWalkLocks[1]);

  TestLocksPreventLookup();
  TestSuppressionPreventsWalking();
  TestLocksPreventWalking();

  return 0;
}
