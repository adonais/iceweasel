/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "MFProtectedPathReadinessMonitor.h"
#include "gtest/gtest.h"
#include "mozilla/SpinEventLoopUntil.h"
#include "nsString.h"
#include "nsThreadUtils.h"

using mozilla::GetMainThreadSerialEventTarget;
using mozilla::MFProtectedPathReadinessMonitor;
using Condition = MFProtectedPathReadinessMonitor::Condition;
using Reaction = MFProtectedPathReadinessMonitor::Reaction;

namespace {
void MarkPreActivationReady(MFProtectedPathReadinessMonitor& aMonitor);
// Dispatches a sentinel to the main thread and spins the loop until it runs;
// because the monitor dispatches its settled callback to the same serial
// target, this guarantees a queued callback has run, so a test can assert one
// did NOT fire.
void DrainMainThread();
// The two protected-activation errors the monitor reacts to, and one unrelated
// error. Used as raw values so the test does not depend on the mferror.h
// macros.
constexpr HRESULT kTopoUnsupported = static_cast<HRESULT>(0xC00D5214);
constexpr HRESULT kSampleProtection = static_cast<HRESULT>(0xC00D7176);
constexpr HRESULT kUnrelatedError = static_cast<HRESULT>(0x80004005);  // E_FAIL
}  // namespace

TEST(MFProtectedPathReadinessMonitor, ReadyToActivateRequiresAllPreConditions)
{
  MFProtectedPathReadinessMonitor monitor;
  EXPECT_FALSE(monitor.IsReadyToActivate());

  monitor.MarkReady(Condition::HwDrmAdapter);
  monitor.MarkReady(Condition::ContentProtectionManager);
  EXPECT_FALSE(monitor.IsReadyToActivate());  // HDCP still pending

  monitor.MarkReady(Condition::Hdcp);
  EXPECT_TRUE(monitor.IsReadyToActivate());
}

// The activation gate only covers the conditions needed to BUILD the protected
// topology (adapter, content protection manager, HDCP). The per-stream
// decryptor (input trust authority) is established later, at the first
// clear->encrypted sample transition, so it is intentionally excluded from the
// gate: activation must proceed even though the decryptor is not yet available.
// This test documents that not every tracked condition gates activation.
TEST(MFProtectedPathReadinessMonitor, DecryptorIsNotRequiredToActivate)
{
  MFProtectedPathReadinessMonitor monitor;
  MarkPreActivationReady(monitor);
  EXPECT_TRUE(monitor.IsReadyToActivate());
  // Decryptor is still pending, yet activation is allowed.
  EXPECT_FALSE(monitor.IsReady(Condition::Decryptor));
}

TEST(MFProtectedPathReadinessMonitor, FailedConditionDoesNotOpenGate)
{
  MFProtectedPathReadinessMonitor monitor;
  monitor.MarkReady(Condition::HwDrmAdapter);
  monitor.MarkReady(Condition::ContentProtectionManager);
  monitor.MarkFailed(Condition::Hdcp, kUnrelatedError);
  EXPECT_FALSE(monitor.IsReadyToActivate());
}

TEST(MFProtectedPathReadinessMonitor, ResetEngineConditionsReopensGate)
{
  MFProtectedPathReadinessMonitor monitor;
  MarkPreActivationReady(monitor);
  ASSERT_TRUE(monitor.IsReadyToActivate());

  monitor.ResetEngineConditions();
  EXPECT_FALSE(monitor.IsReadyToActivate());
  // CDM-side conditions persist; only the engine-side ones were cleared.
  EXPECT_TRUE(monitor.IsReady(Condition::Hdcp));
  EXPECT_FALSE(monitor.IsReady(Condition::HwDrmAdapter));

  monitor.MarkReady(Condition::HwDrmAdapter);
  monitor.MarkReady(Condition::ContentProtectionManager);
  EXPECT_TRUE(monitor.IsReadyToActivate());
}

TEST(MFProtectedPathReadinessMonitor, RecoversWithinBudgetThenTerminal)
{
  MFProtectedPathReadinessMonitor monitor;
  EXPECT_EQ(monitor.OnActivationError(kTopoUnsupported, 2), Reaction::Recover);
  EXPECT_EQ(monitor.OnActivationError(kTopoUnsupported, 2), Reaction::Recover);
  EXPECT_EQ(monitor.OnActivationError(kTopoUnsupported, 2), Reaction::Terminal);
}

TEST(MFProtectedPathReadinessMonitor, BothActivationErrorsShareTheBudget)
{
  MFProtectedPathReadinessMonitor monitor;
  EXPECT_EQ(monitor.OnActivationError(kTopoUnsupported, 2), Reaction::Recover);
  EXPECT_EQ(monitor.OnActivationError(kSampleProtection, 2), Reaction::Recover);
  EXPECT_EQ(monitor.OnActivationError(kTopoUnsupported, 2), Reaction::Terminal);
}

TEST(MFProtectedPathReadinessMonitor, UnrelatedErrorIsTerminalAndKeepsBudget)
{
  MFProtectedPathReadinessMonitor monitor;
  EXPECT_EQ(monitor.OnActivationError(kUnrelatedError, 2), Reaction::Terminal);
  // The budget was not consumed by the unrelated error.
  EXPECT_EQ(monitor.OnActivationError(kTopoUnsupported, 2), Reaction::Recover);
  EXPECT_EQ(monitor.OnActivationError(kTopoUnsupported, 2), Reaction::Recover);
  EXPECT_EQ(monitor.OnActivationError(kTopoUnsupported, 2), Reaction::Terminal);
}

TEST(MFProtectedPathReadinessMonitor, ResetRecoveryBudgetRestores)
{
  MFProtectedPathReadinessMonitor monitor;
  EXPECT_EQ(monitor.OnActivationError(kTopoUnsupported, 1), Reaction::Recover);
  EXPECT_EQ(monitor.OnActivationError(kTopoUnsupported, 1), Reaction::Terminal);
  monitor.ResetRecoveryBudget();
  EXPECT_EQ(monitor.OnActivationError(kTopoUnsupported, 1), Reaction::Recover);
}

TEST(MFProtectedPathReadinessMonitor, ZeroBudgetIsImmediatelyTerminal)
{
  MFProtectedPathReadinessMonitor monitor;
  EXPECT_EQ(monitor.OnActivationError(kTopoUnsupported, 0), Reaction::Terminal);
}

TEST(MFProtectedPathReadinessMonitor, AllSettledRequiresEveryConditionResolved)
{
  MFProtectedPathReadinessMonitor monitor;
  EXPECT_FALSE(monitor.AllActivationConditionsSettled());
  monitor.MarkReady(Condition::HwDrmAdapter);
  monitor.MarkReady(Condition::ContentProtectionManager);
  EXPECT_FALSE(monitor.AllActivationConditionsSettled());  // HDCP still pending
  monitor.MarkReady(Condition::Hdcp);
  EXPECT_TRUE(monitor.AllActivationConditionsSettled());
}

TEST(MFProtectedPathReadinessMonitor, FailedConditionIsSettledButNotReady)
{
  MFProtectedPathReadinessMonitor monitor;
  monitor.MarkReady(Condition::ContentProtectionManager);
  monitor.MarkReady(Condition::Hdcp);
  monitor.MarkFailed(Condition::HwDrmAdapter, kUnrelatedError);
  // A failed condition lets the gate proceed (settled) but is not "ready".
  EXPECT_TRUE(monitor.AllActivationConditionsSettled());
  EXPECT_FALSE(monitor.IsReadyToActivate());
}

TEST(MFProtectedPathReadinessMonitor, MarkAllReadyRefreshesEveryCondition)
{
  MFProtectedPathReadinessMonitor monitor;
  monitor.MarkFailed(Condition::Hdcp, kUnrelatedError);
  ASSERT_FALSE(monitor.IsReadyToActivate());

  // A produced frame refreshes every condition to ready, including a previously
  // failed one and the decryptor (which the gate never marks).
  monitor.MarkAllReady();
  EXPECT_TRUE(monitor.IsReadyToActivate());
  EXPECT_TRUE(monitor.IsReady(Condition::Hdcp));
  EXPECT_TRUE(monitor.IsReady(Condition::Decryptor));
}

// RunWhenActivationSettled is the gate's release mechanism: it holds the
// protected topology build and dispatches the continuation once the conditions
// settle. These tests drive it with the main-thread serial event target and
// spin the loop to observe the dispatched callback.

TEST(MFProtectedPathReadinessMonitor, SettledCallbackRunsWhenAlreadySettled)
{
  MFProtectedPathReadinessMonitor monitor;
  MarkPreActivationReady(monitor);
  bool fired = false;
  monitor.RunWhenActivationSettled([&fired] { fired = true; },
                                   GetMainThreadSerialEventTarget());
  // Even when already settled, the callback is dispatched, not run inline.
  EXPECT_FALSE(fired);
  MOZ_ALWAYS_TRUE(mozilla::SpinEventLoopUntil(
      "TestMFProtectedPathReadinessMonitor"_ns, [&fired] { return fired; }));
  EXPECT_TRUE(fired);
}

TEST(MFProtectedPathReadinessMonitor,
     SettledCallbackRunsWhenLastConditionSettles)
{
  MFProtectedPathReadinessMonitor monitor;
  bool fired = false;
  monitor.RunWhenActivationSettled([&fired] { fired = true; },
                                   GetMainThreadSerialEventTarget());
  monitor.MarkReady(Condition::HwDrmAdapter);
  monitor.MarkReady(Condition::ContentProtectionManager);
  DrainMainThread();
  EXPECT_FALSE(fired);  // still pending on HDCP
  monitor.MarkReady(Condition::Hdcp);
  MOZ_ALWAYS_TRUE(mozilla::SpinEventLoopUntil(
      "TestMFProtectedPathReadinessMonitor"_ns, [&fired] { return fired; }));
  EXPECT_TRUE(fired);
}

TEST(MFProtectedPathReadinessMonitor, SettledCallbackReleasedByFailedCondition)
{
  MFProtectedPathReadinessMonitor monitor;
  monitor.MarkReady(Condition::HwDrmAdapter);
  monitor.MarkReady(Condition::ContentProtectionManager);
  bool fired = false;
  monitor.RunWhenActivationSettled([&fired] { fired = true; },
                                   GetMainThreadSerialEventTarget());
  // A failed (not ready) condition still settles activation and releases it.
  monitor.MarkFailed(Condition::Hdcp, kUnrelatedError);
  MOZ_ALWAYS_TRUE(mozilla::SpinEventLoopUntil(
      "TestMFProtectedPathReadinessMonitor"_ns, [&fired] { return fired; }));
  EXPECT_TRUE(fired);
}

TEST(MFProtectedPathReadinessMonitor, LaterSettledCallbackReplacesEarlier)
{
  MFProtectedPathReadinessMonitor monitor;
  bool firstFired = false;
  bool secondFired = false;
  monitor.RunWhenActivationSettled([&firstFired] { firstFired = true; },
                                   GetMainThreadSerialEventTarget());
  // A second registration replaces the first; the first must never fire (this
  // is load-bearing across an engine recreate, where the old engine's
  // continuation must not run).
  monitor.RunWhenActivationSettled([&secondFired] { secondFired = true; },
                                   GetMainThreadSerialEventTarget());
  MarkPreActivationReady(monitor);
  MOZ_ALWAYS_TRUE(
      mozilla::SpinEventLoopUntil("TestMFProtectedPathReadinessMonitor"_ns,
                                  [&secondFired] { return secondFired; }));
  EXPECT_TRUE(secondFired);
  EXPECT_FALSE(firstFired);
}

TEST(MFProtectedPathReadinessMonitor, SettledCallbackFiresExactlyOnce)
{
  MFProtectedPathReadinessMonitor monitor;
  MarkPreActivationReady(monitor);
  int fireCount = 0;
  monitor.RunWhenActivationSettled([&fireCount] { ++fireCount; },
                                   GetMainThreadSerialEventTarget());
  MOZ_ALWAYS_TRUE(
      mozilla::SpinEventLoopUntil("TestMFProtectedPathReadinessMonitor"_ns,
                                  [&fireCount] { return fireCount > 0; }));
  // A consumed callback must not re-fire on further condition updates.
  monitor.MarkAllReady();
  DrainMainThread();
  EXPECT_EQ(fireCount, 1);
}

TEST(MFProtectedPathReadinessMonitor, DescribeReadinessSummarizesEveryCondition)
{
  MFProtectedPathReadinessMonitor monitor;
  monitor.MarkReady(Condition::HwDrmAdapter);
  monitor.MarkFailed(Condition::Hdcp, kUnrelatedError);
  nsCString summary = monitor.DescribeReadiness();
  EXPECT_NE(summary.Find("HwDrmAdapter=Ready"), kNotFound);
  EXPECT_NE(summary.Find("ContentProtectionManager=Pending"), kNotFound);
  EXPECT_NE(summary.Find("Hdcp=Failed(0x80004005)"), kNotFound);
  EXPECT_NE(summary.Find("Decryptor=Pending"), kNotFound);
}

TEST(MFProtectedPathReadinessMonitor, RecoveriesUsedTracksBudget)
{
  MFProtectedPathReadinessMonitor monitor;
  EXPECT_EQ(monitor.RecoveriesUsed(), 0u);
  monitor.OnActivationError(kUnrelatedError, 2);
  EXPECT_EQ(monitor.RecoveriesUsed(), 0u);  // unrelated error keeps the budget
  monitor.OnActivationError(kTopoUnsupported, 2);
  EXPECT_EQ(monitor.RecoveriesUsed(), 1u);
  monitor.OnActivationError(kTopoUnsupported, 2);
  EXPECT_EQ(monitor.RecoveriesUsed(), 2u);
  monitor.ResetRecoveryBudget();
  EXPECT_EQ(monitor.RecoveriesUsed(), 0u);
}

// Following are helper functions.
namespace {
void MarkPreActivationReady(MFProtectedPathReadinessMonitor& aMonitor) {
  aMonitor.MarkReady(Condition::HwDrmAdapter);
  aMonitor.MarkReady(Condition::ContentProtectionManager);
  aMonitor.MarkReady(Condition::Hdcp);
}

void DrainMainThread() {
  bool drained = false;
  MOZ_ALWAYS_TRUE(NS_SUCCEEDED(NS_DispatchToMainThread(NS_NewRunnableFunction(
      "DrainMainThread", [&drained] { drained = true; }))));
  MOZ_ALWAYS_TRUE(
      mozilla::SpinEventLoopUntil("TestMFProtectedPathReadinessMonitor"_ns,
                                  [&drained] { return drained; }));
}
}  // namespace
