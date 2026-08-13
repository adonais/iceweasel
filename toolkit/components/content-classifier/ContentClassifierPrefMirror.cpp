/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "ContentClassifierPrefMirror.h"

#include "mozilla/ClearOnShutdown.h"
#include "mozilla/Preferences.h"
#include "mozilla/Span.h"
#include "mozilla/StaticPrefs_privacy.h"
#include "MainThreadUtils.h"
#include "nsString.h"
#include "nsThreadUtils.h"
#include "nsXULAppAPI.h"

namespace mozilla {

StaticAutoPtr<ContentClassifierPrefMirror>
    ContentClassifierPrefMirror::sInstance;

namespace {

constexpr char kMirrorEnabledPref[] =
    "privacy.trackingprotection.content.mirror.enabled";

// Content classifier prefs the mirror owns while enabled.
constexpr char kProtectionEnabledPref[] =
    "privacy.trackingprotection.content.protection.enabled";
constexpr char kProtectionEnginesPref[] =
    "privacy.trackingprotection.content.protection.engines";
constexpr char kProtectionEnginesPBMPref[] =
    "privacy.trackingprotection.content.protection.engines.pbmode";
constexpr char kAnnotationEnabledPref[] =
    "privacy.trackingprotection.content.annotation.enabled";
constexpr char kAnnotationEnginesPref[] =
    "privacy.trackingprotection.content.annotation.engines";
constexpr char kAnnotationEnginesPBMPref[] =
    "privacy.trackingprotection.content.annotation.engines.pbmode";

constexpr char kMajorExceptionsEngine[] = "major-exceptions";
constexpr char kMinorExceptionsEngine[] = "minor-exceptions";

// Maps a content classifier engine name (see ContentClassifierService.cpp,
// kFeatures) onto the ETP prefs that gate it in normal and private-browsing
// contexts. An engine joins the derived list when its gating pref is true.
struct EngineMapping {
  const char* mEngine;
  const char* mNormalPref;
  const char* mPBMPref;
};

constexpr EngineMapping kProtectionMappings[] = {
    {"trackers", "privacy.trackingprotection.enabled",
     "privacy.trackingprotection.pbmode.enabled"},
    {"fingerprinters", "privacy.trackingprotection.fingerprinting.enabled",
     "privacy.trackingprotection.fingerprinting.enabled"},
    {"cryptominers", "privacy.trackingprotection.cryptomining.enabled",
     "privacy.trackingprotection.cryptomining.enabled"},
    {"social-trackers", "privacy.trackingprotection.socialtracking.enabled",
     "privacy.trackingprotection.socialtracking.enabled"},
    {"email-trackers", "privacy.trackingprotection.emailtracking.enabled",
     "privacy.trackingprotection.emailtracking.pbmode.enabled"},
    {"harmful-addon", "privacy.trackingprotection.harmfuladdon.enabled",
     "privacy.trackingprotection.harmfuladdon.enabled"},
};

constexpr EngineMapping kAnnotationMappings[] = {
    {"trackers", "privacy.trackingprotection.annotate_channels",
     "privacy.trackingprotection.annotate_channels"},
    // Content trackers are annotated only when the strict list is in use.
    {"trackers-content", "privacy.annotate_channels.strict_list.enabled",
     "privacy.annotate_channels.strict_list.pbmode.enabled"},
    {"fingerprinters", "privacy.trackingprotection.annotate_channels",
     "privacy.trackingprotection.annotate_channels"},
    {"cryptominers", "privacy.trackingprotection.annotate_channels",
     "privacy.trackingprotection.annotate_channels"},
    {"social-trackers", "privacy.trackingprotection.annotate_channels",
     "privacy.trackingprotection.annotate_channels"},
};

// ETP source prefs the mirror observes; a change to any of these recomputes
// the derived content prefs. Must cover every gating pref referenced above.
constexpr const char* kWatchedPrefs[] = {
    "privacy.trackingprotection.enabled",
    "privacy.trackingprotection.pbmode.enabled",
    "privacy.trackingprotection.annotate_channels",
    "privacy.annotate_channels.strict_list.enabled",
    "privacy.annotate_channels.strict_list.pbmode.enabled",
    "privacy.trackingprotection.fingerprinting.enabled",
    "privacy.trackingprotection.cryptomining.enabled",
    "privacy.trackingprotection.socialtracking.enabled",
    "privacy.trackingprotection.emailtracking.enabled",
    "privacy.trackingprotection.emailtracking.pbmode.enabled",
    "privacy.trackingprotection.harmfuladdon.enabled",
    "privacy.trackingprotection.allow_list.baseline.enabled",
    "privacy.trackingprotection.allow_list.convenience.enabled",
};

// Build a comma-separated engine list, selecting each mapping's normal or
// PBM gating pref according to aPrivateBrowsing.
void BuildEngineList(Span<const EngineMapping> aMappings, bool aPrivateBrowsing,
                     nsACString& aOut) {
  aOut.Truncate();
  for (const auto& mapping : aMappings) {
    const char* gatingPref =
        aPrivateBrowsing ? mapping.mPBMPref : mapping.mNormalPref;
    if (Preferences::GetBool(gatingPref, false)) {
      if (!aOut.IsEmpty()) {
        aOut.Append(',');
      }
      aOut.Append(nsDependentCString(mapping.mEngine));
    }
  }
}

// Append the WebCompat exception engines to a protection engine list built by
// BuildEngineList.
void AppendExceptionEngines(nsACString& aProtectionEngines) {
  // Only add exception engines if the list already holds a blocking engine.
  if (aProtectionEngines.IsEmpty()) {
    return;
  }
  bool baseline =
      StaticPrefs::privacy_trackingprotection_allow_list_baseline_enabled();
  bool convenience =
      StaticPrefs::privacy_trackingprotection_allow_list_convenience_enabled();
  if (baseline) {
    aProtectionEngines.Append(',');
    aProtectionEngines.Append(nsDependentCString(kMajorExceptionsEngine));
  }
  if (baseline && convenience) {
    aProtectionEngines.Append(',');
    aProtectionEngines.Append(nsDependentCString(kMinorExceptionsEngine));
  }
}

}  // namespace

// static
void ContentClassifierPrefMirror::Init() {
  MOZ_ASSERT(XRE_IsParentProcess());
  MOZ_ASSERT(NS_IsMainThread());

  static bool sRegistered = false;
  if (sRegistered) {
    return;
  }
  sRegistered = true;

  // Tear the singleton down at shutdown through the same path as a
  // pref-disable.
  RunOnShutdown([] { Shutdown(); });

  Preferences::RegisterCallbackAndCall(
      &ContentClassifierPrefMirror::OnMirrorPrefChange,
      nsDependentCString(kMirrorEnabledPref));
}

ContentClassifierPrefMirror::ContentClassifierPrefMirror() {
  for (const char* pref : kWatchedPrefs) {
    Preferences::RegisterCallback(&ContentClassifierPrefMirror::OnPrefChange,
                                  nsDependentCString(pref));
  }
}

ContentClassifierPrefMirror::~ContentClassifierPrefMirror() {
  for (const char* pref : kWatchedPrefs) {
    Preferences::UnregisterCallback(&ContentClassifierPrefMirror::OnPrefChange,
                                    nsDependentCString(pref));
  }
}

// static
void ContentClassifierPrefMirror::OnMirrorPrefChange(const char* aPref,
                                                     void* aData) {
  MOZ_ASSERT(NS_IsMainThread());

  bool enabled = Preferences::GetBool(kMirrorEnabledPref, false);
  if (enabled == !!sInstance) {
    // The master pref changed but the up/down state didn't flip.
    return;
  }

  if (!enabled) {
    Shutdown();
    return;
  }

  sInstance = new ContentClassifierPrefMirror();
  sInstance->ScheduleSync();
}

// static
void ContentClassifierPrefMirror::Shutdown() {
  MOZ_ASSERT(NS_IsMainThread());
  sInstance = nullptr;
}

// static
void ContentClassifierPrefMirror::OnPrefChange(const char* aPref, void* aData) {
  MOZ_ASSERT(NS_IsMainThread());
  if (sInstance) {
    sInstance->ScheduleSync();
  }
}

void ContentClassifierPrefMirror::ScheduleSync() {
  MOZ_ASSERT(NS_IsMainThread());
  if (mSyncScheduled) {
    return;
  }
  mSyncScheduled = true;
  NS_DispatchToMainThread(
      NS_NewRunnableFunction("ContentClassifierPrefMirror::Sync", [] {
        if (sInstance) {
          sInstance->mSyncScheduled = false;
          sInstance->Sync();
        }
      }));
}

void ContentClassifierPrefMirror::Sync() {
  MOZ_ASSERT(NS_IsMainThread());

  if (!Preferences::GetBool(kMirrorEnabledPref, false)) {
    // Disabled: leave the content prefs as they are. Any values previously
    // derived by the mirror remain in place.
    return;
  }

  // Compute the ContentClassifier engine lists from the ETP source prefs for
  // the normal and private prefs.
  nsAutoCString protectionEngines;
  nsAutoCString protectionEnginesPBM;
  nsAutoCString annotationEngines;
  nsAutoCString annotationEnginesPBM;
  BuildEngineList(Span(kProtectionMappings), false, protectionEngines);
  BuildEngineList(Span(kProtectionMappings), true, protectionEnginesPBM);
  BuildEngineList(Span(kAnnotationMappings), false, annotationEngines);
  BuildEngineList(Span(kAnnotationMappings), true, annotationEnginesPBM);

  AppendExceptionEngines(protectionEngines);
  AppendExceptionEngines(protectionEnginesPBM);

  Preferences::SetCString(kProtectionEnginesPref, protectionEngines);
  Preferences::SetCString(kProtectionEnginesPBMPref, protectionEnginesPBM);
  Preferences::SetCString(kAnnotationEnginesPref, annotationEngines);
  Preferences::SetCString(kAnnotationEnginesPBMPref, annotationEnginesPBM);

  Preferences::SetBool(
      kProtectionEnabledPref,
      !protectionEngines.IsEmpty() || !protectionEnginesPBM.IsEmpty());
  Preferences::SetBool(
      kAnnotationEnabledPref,
      !annotationEngines.IsEmpty() || !annotationEnginesPBM.IsEmpty());
}

}  // namespace mozilla
