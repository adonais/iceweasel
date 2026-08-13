/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef DOM_MEDIA_MEDIACONTROL_AUDIOSESSIONMANAGER_H_
#define DOM_MEDIA_MEDIACONTROL_AUDIOSESSIONMANAGER_H_

#include "AudioSessionRecord.h"
#include "mozilla/Attributes.h"
#include "mozilla/DefineEnum.h"
#include "mozilla/Maybe.h"
#include "mozilla/dom/AudioSessionBinding.h"
#include "nsTHashMap.h"
#include "nsTHashSet.h"

namespace mozilla::dom {

class MediaController;

// Whether an audio-focus loss is resumable. A Transient loss moves the
// interrupted sessions to Interrupted and remembers them so a later restore
// re-activates them; a Permanent loss moves them to Inactive and is not
// restorable.
MOZ_DEFINE_ENUM_CLASS_WITH_BASE_AND_TOSTRING(AudioSessionInterruptKind, uint8_t,
                                             (Transient, Permanent));

/**
 * Owns the parent-side AudioSession spec state for a single tab
 * (per-top-level-BC). Encapsulates the per-browsing-context override map and
 * the "compute the audio session type" and "update the selected audio
 * session" algorithms behind a small mutator API, so callers cannot reach the
 * underlying map without going through the manager.
 *
 * The owner (`MediaController`) holds the manager directly. The manager keeps
 * a raw back-pointer to the owner for event dispatch and for inherited
 * per-BC audibility queries; the owner outlives the manager by construction.
 */
class AudioSessionManager final {
 public:
  explicit AudioSessionManager(MediaController* aController);
  ~AudioSessionManager() = default;

  AudioSessionManager(const AudioSessionManager&) = delete;
  AudioSessionManager& operator=(const AudioSessionManager&) = delete;

  // Mutators. Each one runs the post-mutation invariant:
  // recompute selected → recompute effective → maybe fire change event.
  void SetTypeOverride(uint64_t aBrowsingContextId, AudioSessionType aType);
  void NotifyAudibilityChanged(uint64_t aBrowsingContextId);
  void NotifyBcDiscarded(uint64_t aBrowsingContextId);

  // Interrupt every active audio session in the tab on a system audio-focus
  // loss, regardless of type, with aKind selecting whether the loss is
  // resumable.
  void InterruptAudioSessions(AudioSessionInterruptKind aKind);
  // Re-activate the sessions a transient loss interrupted. No-op when no
  // interrupt is outstanding.
  void RestoreAudioSessions();

  // The audio-session type that applies to the given browsing context. The
  // user override takes precedence; otherwise the type comes from the
  // browsing context's currently audible sources.
  AudioSessionType EffectiveTypeForBc(uint64_t aBrowsingContextId) const;

  // The audio-session type the tab is currently exposing to chrome
  // consumers. Returns Auto when the tab is producing no audio.
  AudioSessionType GetEffectiveType() const;

  // Test-only accessor for the per-browsing-context AudioSession record.
  // Returns nullptr when no record exists.
  const AudioSessionRecord* GetRecordForTesting(
      uint64_t aBrowsingContextId) const;

 private:
  // The selected audio session for this tab per the spec algorithm:
  // the audio session whose interruptions and focus changes the tab's
  // audible browsing contexts would observe. Nothing() when no audio
  // session is currently selected.
  Maybe<AudioSessionType> GetSelectedAudioSessionType() const;

  // Refresh mSelectedAudioSessionBcId. Called from every entry point that
  // mutates mAudioSessions so the cache always reflects the current state.
  void UpdateSelectedAudioSession();

  // §5.2 inactivate. No-op when the record does not exist or is already
  // Inactive.
  void InactivateAudioSession(uint64_t aBrowsingContextId);

  // §5.2 try activating. No-op when the record is already Active. The
  // caller is responsible for ensuring the record exists.
  void TryActivateAudioSession(uint64_t aBrowsingContextId);

  // §5.2 notify-the-states-change. Single entry point for state mutations:
  // writes the field, then runs any post-mutation steps.
  void SetAudioSessionState(uint64_t aBrowsingContextId,
                            AudioSessionState aNewState);

  // Drop the record for this browsing context if all of its fields are at
  // their defaults. Mutators call this after any change that may have left
  // the record empty.
  void RemoveRecordIfEmpty(uint64_t aBrowsingContextId);

  // The mutators for mInterruptedBcIds; each logs so the interrupted-session
  // set's lifetime is traceable.
  void AddInterruptedBcId(uint64_t aBrowsingContextId);
  void RemoveInterruptedBcId(uint64_t aBrowsingContextId);
  void ClearInterruptedBcIds();

  // §5.4 update-all-audiosession-states.
  // Inactivates other exclusive sessions when the just-updated session is
  // itself exclusive and active, with the auto-vs-auto exemption that two
  // pages neither of which explicitly opted into an exclusive type can
  // coexist.
  void UpdateAllAudioSessionStates(uint64_t aUpdatedBcId);

  // True iff the page never set an explicit type on this browsing context.
  bool IsBcAutoTyped(uint64_t aBrowsingContextId) const;

  // Fire the change event when the resolved effective type changed.
  void MaybeFireEffectiveTypeChanged();

  // Non-owning back-pointer; the controller holds this manager by value as
  // a member, so the controller always outlives the manager.
  MediaController* const MOZ_NON_OWNING_REF mController;

  // Per-browsing-context AudioSession state.
  nsTHashMap<nsUint64HashKey, AudioSessionRecord> mAudioSessions;

  // Cache for the §5.3 result: the browsing context whose audio session is
  // currently the tab's selected one, or Nothing() when no session
  // qualifies.
  Maybe<uint64_t> mSelectedAudioSessionBcId;

  // Cached last value of GetEffectiveType().
  AudioSessionType mLastDispatchedEffectiveType = AudioSessionType::Auto;

  // The browsing contexts whose sessions a transient audio-focus loss
  // interrupted; re-activated by RestoreAudioSessions.
  nsTHashSet<uint64_t> mInterruptedBcIds;
};

}  // namespace mozilla::dom

#endif  // DOM_MEDIA_MEDIACONTROL_AUDIOSESSIONMANAGER_H_
