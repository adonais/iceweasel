/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_ContentClassifierPrefMirror_h
#define mozilla_ContentClassifierPrefMirror_h

#include "mozilla/StaticPtr.h"

namespace mozilla {

// Transitional shim that derives the ContentClassifier engine prefs
// (privacy.trackingprotection.content.*) from the classic Enhanced Tracking
// Protection prefs (privacy.trackingprotection.*). This lets the existing
// about:preferences ETP UI drive the content classifier without being
// rewired.
//
// Gated by privacy.trackingprotection.content.mirror.enabled (off by
// default). While enabled the mirror owns the content engine/enabled prefs
// and recomputes them on every relevant ETP pref change; while disabled it
// leaves the content prefs untouched (the last derived values, if any,
// remain in place).
//
// The whole class is meant to be deleted once the migration to the content
// classifier is complete.
class ContentClassifierPrefMirror final {
 public:
  // Idempotently register the master pref callback that drives the singleton's
  // lifecycle.
  // Parent process, main thread only. Called from
  // ContentClassifierService::Init.
  static void Init();

 private:
  ContentClassifierPrefMirror();
  ~ContentClassifierPrefMirror();

  friend class StaticAutoPtr<ContentClassifierPrefMirror>;

  // Registered once on the master pref and never unregistered, so the mirror
  // keeps listening for the master pref even while the singleton is gone.
  static void OnMirrorPrefChange(const char* aPref, void* aData);

  static void Shutdown();

  // Registered on every watched ETP source pref while the mirror is up.
  static void OnPrefChange(const char* aPref, void* aData);

  // Request a Sync() on the next turn of the event loop, coalescing bursts of
  // ETP pref changes (e.g. switching the ETP category) into a single recompute
  // so the content engine prefs - and the engine rebuilds they trigger in
  // ContentClassifierService - are touched at most once per turn.
  void ScheduleSync();

  // Recompute the content engine prefs from the current ETP pref state and
  // write them. No-op while the mirror is disabled.
  void Sync();

  static StaticAutoPtr<ContentClassifierPrefMirror> sInstance;

  // Whether a coalesced Sync() runnable is already pending. Main thread only.
  bool mSyncScheduled = false;
};

}  // namespace mozilla

#endif  // mozilla_ContentClassifierPrefMirror_h
