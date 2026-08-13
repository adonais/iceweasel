/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "MFProtectedPathReadinessMonitor.h"

#include "MFMediaEngineUtils.h"
#include "mozilla/EMEUtils.h"
#include "mozilla/EnumeratedRange.h"
#include "nsString.h"
#include "nsThreadUtils.h"

namespace mozilla {

#define LOG(msg, ...) \
  EME_LOG("MFProtectedReadiness[{}] " msg, fmt::ptr(this), ##__VA_ARGS__)

namespace {
bool IsRecoverableActivationError(HRESULT aError) {
  // These two errors are reported when Media Foundation fails to build the
  // protected topology because the protected pipeline was not fully in place
  // yet (for example output protection had not settled), not because the system
  // lacks a capability. They typically clear once the pipeline is re-driven
  // after readiness settles, so they are worth a bounded retry; capability
  // failures such as MF_E_HARDWARE_DRM_UNSUPPORTED are terminal and are not
  // treated as recoverable here.
  return aError == MF_E_TOPO_UNSUPPORTED ||
         aError == MF_E_INCOMPATIBLE_SAMPLE_PROTECTION;
}

using Condition = MFProtectedPathReadinessMonitor::Condition;
// The conditions that must be ready before the protected topology can build,
// shared by the activation gate (IsReadyToActivate) and the settled check
// (AllActivationConditionsSettledLocked). The per-stream decryptor is
// deliberately excluded: it is established during sample handling after the
// topology builds, not before activation.
constexpr Condition kGatingConditions[] = {Condition::HwDrmAdapter,
                                           Condition::ContentProtectionManager,
                                           Condition::Hdcp};
}  // namespace

MFProtectedPathReadinessMonitor::MFProtectedPathReadinessMonitor()
    : mLock("MFProtectedPathReadinessMonitor"), mRecoveriesUsed(0) {
  for (auto& state : mState) {
    state = State::Pending;
  }
  for (auto& error : mLastError) {
    error = S_OK;
  }
}

void MFProtectedPathReadinessMonitor::MarkReady(Condition aWhich) {
  MutexAutoLock lock(mLock);
  mState[aWhich] = State::Ready;
  LOG("MarkReady({})", EnumValueToString(aWhich));
  MaybeRunSettledCallbackLocked();
}

void MFProtectedPathReadinessMonitor::MarkAllReady() {
  MutexAutoLock lock(mLock);
  for (Condition condition : MakeInclusiveEnumeratedRange(sHighestCondition)) {
    mState[condition] = State::Ready;
  }
  LOG("MarkAllReady (protected frame produced)");
  MaybeRunSettledCallbackLocked();
}

void MFProtectedPathReadinessMonitor::MarkFailed(Condition aWhich,
                                                 HRESULT aError) {
  MutexAutoLock lock(mLock);
  mState[aWhich] = State::Failed;
  mLastError[aWhich] = aError;
  LOG("MarkFailed({}, {:#x})", EnumValueToString(aWhich),
      static_cast<uint32_t>(aError));
  MaybeRunSettledCallbackLocked();
}

void MFProtectedPathReadinessMonitor::ResetEngineConditions() {
  MutexAutoLock lock(mLock);
  // Only the engine-side conditions are cleared: a recreated engine
  // re-establishes the adapter binding and the content protection manager,
  // while the CDM-side conditions (HDCP, decryptor) persist with the surviving
  // CDM actor and so must not be reset here.
  mState[Condition::HwDrmAdapter] = State::Pending;
  mState[Condition::ContentProtectionManager] = State::Pending;
  LOG("ResetEngineConditions");
}

bool MFProtectedPathReadinessMonitor::IsReady(Condition aWhich) const {
  MutexAutoLock lock(mLock);
  return mState[aWhich] == State::Ready;
}

bool MFProtectedPathReadinessMonitor::IsReadyToActivate() const {
  MutexAutoLock lock(mLock);
  for (Condition condition : kGatingConditions) {
    if (mState[condition] != State::Ready) {
      return false;
    }
  }
  return true;
}

MFProtectedPathReadinessMonitor::Reaction
MFProtectedPathReadinessMonitor::OnActivationError(HRESULT aError,
                                                   uint32_t aMaxRecoveries) {
  if (!IsRecoverableActivationError(aError)) {
    LOG("OnActivationError({:#x}): not recoverable, terminal",
        static_cast<uint32_t>(aError));
    return Reaction::Terminal;
  }
  MutexAutoLock lock(mLock);
  if (mRecoveriesUsed >= aMaxRecoveries) {
    LOG("OnActivationError({:#x}): budget exhausted ({}/{}), terminal",
        static_cast<uint32_t>(aError), mRecoveriesUsed, aMaxRecoveries);
    return Reaction::Terminal;
  }
  ++mRecoveriesUsed;
  LOG("OnActivationError({:#x}): recover ({}/{})",
      static_cast<uint32_t>(aError), mRecoveriesUsed, aMaxRecoveries);
  return Reaction::Recover;
}

void MFProtectedPathReadinessMonitor::ResetRecoveryBudget() {
  MutexAutoLock lock(mLock);
  mRecoveriesUsed = 0;
  LOG("ResetRecoveryBudget");
}

uint32_t MFProtectedPathReadinessMonitor::RecoveriesUsed() const {
  MutexAutoLock lock(mLock);
  return mRecoveriesUsed;
}

bool MFProtectedPathReadinessMonitor::AllActivationConditionsSettled() const {
  MutexAutoLock lock(mLock);
  return AllActivationConditionsSettledLocked();
}

bool MFProtectedPathReadinessMonitor::AllActivationConditionsSettledLocked()
    const {
  for (Condition condition : kGatingConditions) {
    if (mState[condition] == State::Pending) {
      return false;
    }
  }
  return true;
}

void MFProtectedPathReadinessMonitor::RunWhenActivationSettled(
    std::function<void()> aCallback, nsISerialEventTarget* aTarget) {
  MutexAutoLock lock(mLock);
  mPendingSettledCallback = std::move(aCallback);
  mPendingSettledTarget = aTarget;
  LOG("RunWhenActivationSettled registered");
  MaybeRunSettledCallbackLocked();
}

void MFProtectedPathReadinessMonitor::MaybeRunSettledCallbackLocked() {
  if (!mPendingSettledCallback || !AllActivationConditionsSettledLocked()) {
    return;
  }
  std::function<void()> callback = std::move(mPendingSettledCallback);
  RefPtr<nsISerialEventTarget> target = std::move(mPendingSettledTarget);
  mPendingSettledCallback = nullptr;
  mPendingSettledTarget = nullptr;
  LOG("activation gate released");
  // Dispatch can fail when the target thread is already shutting down (e.g.
  // during teardown), which is not a programming error, so warn rather than
  // assert.
  [[maybe_unused]] nsresult rv = target->Dispatch(NS_NewRunnableFunction(
      "MFProtectedPathReadinessMonitor::SettledCallback", std::move(callback)));
  NS_WARNING_ASSERTION(NS_SUCCEEDED(rv),
                       "Failed to dispatch readiness settled callback");
}

nsCString MFProtectedPathReadinessMonitor::DescribeReadiness() const {
  MutexAutoLock lock(mLock);
  nsAutoCString out;
  for (Condition condition : MakeInclusiveEnumeratedRange(sHighestCondition)) {
    if (!out.IsEmpty()) {
      out.Append(' ');
    }
    out.AppendFmt("{}={}", EnumValueToString(condition),
                  EnumValueToString(mState[condition]));
    if (mState[condition] == State::Failed) {
      out.AppendFmt("({:#x})", static_cast<uint32_t>(mLastError[condition]));
    }
  }
  return out;
}

#undef LOG

}  // namespace mozilla
