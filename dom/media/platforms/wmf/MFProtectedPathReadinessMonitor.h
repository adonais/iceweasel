/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef DOM_MEDIA_PLATFORMS_WMF_MFPROTECTEDPATHREADINESSMONITOR_H_
#define DOM_MEDIA_PLATFORMS_WMF_MFPROTECTEDPATHREADINESSMONITOR_H_

#include <windef.h>

#include <cstdint>
#include <functional>

#include "mozilla/DefineEnum.h"
#include "mozilla/EnumeratedArray.h"
#include "mozilla/Mutex.h"
#include "mozilla/RefPtr.h"
#include "nsISerialEventTarget.h"
#include "nsStringFwd.h"

namespace mozilla {

// The Media Foundation Media Engine builds a "protected" playback topology (its
// internal decode/render graph) for hardware DRM (PlayReady SL3000, the
// hardware security level). That topology can only be built once several
// independent conditions are in place: a hardware-DRM-capable GPU adapter, the
// engine's content protection manager (connected to the CDM), and an HDCP
// output-protection link. If activation is attempted before they are all ready,
// Media Foundation fails the topology with no advance warning
// (MF_E_TOPO_UNSUPPORTED / MF_E_INCOMPATIBLE_SAMPLE_PROTECTION).
//
// This class records, for each such condition (the Condition enum below names
// and describes each one), whether it is still pending, ready, or has failed.
// The caller registers the protected-topology build as a callback deferred
// until those conditions settle (the "activation gate"; see
// RunWhenActivationSettled), so the engine activates only when ready instead of
// activating blind and retrying on failure.
//
// One monitor exists per protected playback session. It is owned by the CDM
// actor, which outlives the playback-engine actor across a recovery, so the
// monitor (and its recovery budget) survive an engine recreate while the
// engine-side conditions are re-established by the new engine.
//
// The conditions are established from more than one thread, so the monitor
// guards its state and every method is safe to call from any thread: most
// conditions are marked, and the activation gate and error reaction read the
// monitor, on the engine manager thread, while the HDCP condition is marked
// later from a background queue (its support query blocks and cannot run on the
// manager thread).
//
// Typical use, holding protected activation until readiness settles:
//   // on the engine manager thread, as protected setup progresses
//   monitor.MarkReady(Condition::ContentProtectionManager);
//   monitor.RunWhenActivationSettled([] { /* build protected topology */ },
//                                    managerThread);
//   // later, from the background HDCP queue
//   monitor.MarkReady(Condition::Hdcp);  // releases the gate once all settled
//
// A condition that cannot be established is marked failed rather than ready
// (MarkFailed). The gate still treats a failed condition as settled and
// releases, so protected activation is never held forever waiting on something
// that will not become ready; the failure then surfaces through the engine's
// normal topology-build error path rather than from the monitor itself.
class MFProtectedPathReadinessMonitor final {
 public:
  MFProtectedPathReadinessMonitor();

  // The conditions tracked for protected activation. The first three gate
  // activation (see IsReadyToActivate); Decryptor is tracked for diagnostics
  // but is deliberately not part of the gate.
  //   HwDrmAdapter:             a hardware-DRM-capable GPU adapter is bound to
  //                             the engine.
  //   ContentProtectionManager: the engine's content protection manager is
  //                             installed and connected to the CDM proxy.
  //   Hdcp:                     the HDCP output-protection support query has
  //                             completed (pre-warmed off the activation path).
  //   Decryptor:                the per-stream decryptor (input trust
  //   authority)
  //                             is available; established during sample
  //                             handling after the topology builds (for
  //                             clearlead, at the clear->encrypted transition),
  //                             so it is never an activation precondition.
  MOZ_DEFINE_ENUM_CLASS_WITH_BASE_AND_TOSTRING_AT_CLASS_SCOPE(
      Condition, uint8_t,
      (HwDrmAdapter, ContentProtectionManager, Hdcp, Decryptor));

  // Record a condition's outcome once it is known. MarkReady marks it ready;
  // MarkFailed marks it permanently unestablishable and records the platform
  // HResult (aError) for diagnostics. Neither throws, retries, or recovers;
  // they only update state. Both count the condition as settled for the
  // activation gate (see the class comment): a ready condition can satisfy the
  // gate, a failed one never does.
  void MarkReady(Condition aWhich);
  void MarkFailed(Condition aWhich, HRESULT aError);

  // Marks every condition ready. Called when a produced frame proves the whole
  // protected pipeline (HDCP and the per-stream decryptor included) is working,
  // so the conditions reflect that rather than a stale pre-warm outcome. The
  // caller is responsible for invoking this only when the frame actually
  // exercised the protected path: a clearlead session's first frame is clear
  // and does not, so the caller skips it (see MFMediaEngineParent).
  void MarkAllReady();

  // A recreated engine re-establishes the engine-side conditions (the adapter
  // and content protection manager), so clear those back to pending; the
  // remaining conditions persist with the surviving CDM actor.
  void ResetEngineConditions();

  bool IsReady(Condition aWhich) const;

  // True once every condition required before the protected topology may build
  // is ready: adapter, content protection manager, and HDCP. The per-stream
  // decryptor is established only during sample handling, after the topology
  // builds, so it is intentionally excluded here.
  bool IsReadyToActivate() const;

  // True once none of the pre-activation conditions is still pending: each is
  // either ready or failed. The gate proceeds at this point; a failed condition
  // is surfaced by the topology build downstream rather than hanging
  // activation.
  bool AllActivationConditionsSettled() const;

  // Run aCallback on aTarget once the pre-activation conditions have settled,
  // or immediately (dispatched) if they already have. Used to hold the
  // protected topology build. A later registration replaces (drops) any prior
  // pending callback, which is intentional across an engine recreate: the old
  // engine's continuation must not fire.
  void RunWhenActivationSettled(std::function<void()> aCallback,
                                nsISerialEventTarget* aTarget);

  // Recover: re-drive the protected pipeline through the engine-recreate
  // recovery path. Terminal: stop reacting and surface the error to EME.
  MOZ_DEFINE_ENUM_CLASS_WITH_BASE_AND_TOSTRING_AT_CLASS_SCOPE(Reaction, uint8_t,
                                                              (Recover,
                                                               Terminal));

  // Last-resort reaction for the two protected-activation errors Media
  // Foundation gives no advance signal for (topology unsupported and
  // incompatible sample protection). Returns Recover while the bounded budget
  // allows, otherwise Terminal. Any other error is Terminal and does not
  // consume the budget.
  Reaction OnActivationError(HRESULT aError, uint32_t aMaxRecoveries);

  // Restore the recovery budget; call once a protected playback produces a
  // frame so a working stream is not constrained by an earlier transient
  // failure.
  void ResetRecoveryBudget();

  // The number of bounded recoveries consumed this session, recorded for
  // diagnostics at a protected-activation outcome.
  uint32_t RecoveriesUsed() const;

  // A compact "name=state" summary of every condition, for diagnostics recorded
  // when a protected activation fails. Each state is Pending, Ready, or
  // Failed(0xHRESULT), e.g. "HwDrmAdapter=Ready ContentProtectionManager=Ready
  // Hdcp=Pending Decryptor=Pending".
  nsCString DescribeReadiness() const;

 private:
  // The outcome of a single condition: Pending until its result is known, then
  // Ready if it was established or Failed if it could not be.
  MOZ_DEFINE_ENUM_CLASS_WITH_BASE_AND_TOSTRING_AT_CLASS_SCOPE(State, uint8_t,
                                                              (Pending, Ready,
                                                               Failed));

  // These Locked() helpers require mLock to be held, enforced by MOZ_REQUIRES.
  bool AllActivationConditionsSettledLocked() const MOZ_REQUIRES(mLock);
  void MaybeRunSettledCallbackLocked() MOZ_REQUIRES(mLock);

  mutable Mutex mLock;
  EnumeratedArray<Condition, State, sConditionCount> mState
      MOZ_GUARDED_BY(mLock);
  // The platform HResult passed to MarkFailed for each condition, for
  // diagnostics; meaningful only while a condition is in the Failed state.
  EnumeratedArray<Condition, HRESULT, sConditionCount> mLastError
      MOZ_GUARDED_BY(mLock);
  uint32_t mRecoveriesUsed MOZ_GUARDED_BY(mLock);
  std::function<void()> mPendingSettledCallback MOZ_GUARDED_BY(mLock);
  RefPtr<nsISerialEventTarget> mPendingSettledTarget MOZ_GUARDED_BY(mLock);
};

}  // namespace mozilla

#endif  // DOM_MEDIA_PLATFORMS_WMF_MFPROTECTEDPATHREADINESSMONITOR_H_
