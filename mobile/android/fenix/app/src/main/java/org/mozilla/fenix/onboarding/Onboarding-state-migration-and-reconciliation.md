# Onboarding Completion States After Continuous Onboarding

## Terminology

- **Initial onboarding:** The flow shown when a user first opens the app after a fresh install.
- **Continuous onboarding:** The follow-up onboarding stages shown over subsequent days after
  initial onboarding.

## Overview

**Version 150** introduced the following preferences for continuous onboarding, but the feature
itself was not enabled by default on all channels until **version 155**. Before the Release app
shipped 155, it was enabled for Nightly users from version 151, Beta users from version 155, and
Release users enrolled in the `android-second-and-seven-day-onboarding` experiment (2026-04-15 to
2026-05-29).

| Preference                                        | Purpose                                                       |
|---------------------------------------------------|---------------------------------------------------------------|
| `Settings.onboardingCompletedTimestamp`           | Records when initial onboarding finished.                     |
| `Settings.continuousOnboardingFeatureEnabled`     | Tracks whether continuous onboarding is enabled for the user. |
| `Settings.secondDayOnboardingCompletedTimestamp`  | Records completion of the day-2 stage.                        |
| `Settings.thirdDayOnboardingCompletedTimestamp`   | Records completion of the day-3 stage.                        |
| `Settings.fifthDayOnboardingCompletedTimestamp`   | Records completion of the day-5 stage.                        |
| `Settings.seventhDayOnboardingCompletedTimestamp` | Records completion of the day-7 stage.                        |

The gap between introducing these preferences and enabling the feature created different stored
completion states depending on when users first onboarded.

## The issue

**Gating features or behavior on onboarding progress is unreliable because the stored preferences
do not consistently reflect the user's onboarding journey.**

Two separate mechanisms represent initial onboarding completion:

- `FenixOnboarding.userHasBeenOnboarded()` checks whether
  `onboardedVersion == CURRENT_ONBOARDING_VERSION`, including when the onboarding UI was bypassed.
  Despite its name suggesting that it stores a version, the value is only ever set to `0` or `1` and
  is ultimately used as a Boolean flag.
- `Settings.onboardingCompletedTimestamp` records when initial onboarding finished.
  A value of `-1L` means no completion timestamp was recorded.

A user can therefore be considered onboarded without a completion timestamp. Others have a valid
initial timestamp but unset continuous onboarding stage timestamps because the feature was disabled
when they onboarded.

These differences affect features that depend on onboarding completion or elapsed time.

For example, `ReviewPromptMiddleware`'s `continuousOnboardingInProgress` gate hides the review
prompt when `continuousOnboardingFeatureEnabled` is `true` and
`seventhDayOnboardingCompletedTimestamp` is `-1L`.

Some users never see continuous onboarding at all, so the day-7 stage is never marked complete for
them. When `continuousOnboardingFeatureEnabled` is `true`, the review prompt therefore remains
blocked indefinitely for those users (see [User cohorts](#user-cohorts) below for which users this
affects).

The day-7 stage itself had a related gap, independent of cohort: it only completed once the user
became eligible for IP Protection and `IPProtectionOnboardingPrompt.onShowOnboarding` fired. A user
who is permanently ineligible (Nimbus config or unsupported region) never reaches that callback, so
even a cohort 3 user progressing normally through the earlier stages could get stuck at day 7
indefinitely, blocking the review prompt the same way. The same applied to an eligible user for whom
`IPProtectionPromptRepository.canShowIPProtectionPrompt()` returns `false`, for example because the
prompt was already shown outside continuous onboarding or the VPN was already used. This was fixed by
also marking the day-7 stage complete when eligibility resolves to a terminal ineligible state, or
when the user is eligible but the prompt is no longer allowed to be shown.

## User cohorts

All four cohorts return `true` from `userHasBeenOnboarded()`, including users marked as onboarded
without completing the initial onboarding UI. The table describes their state before reconciliation.

| #   | Cohort                                                                                             | Initial completion timestamp | Continuous onboarding stage timestamps             | Currently eligible for continuous onboarding? | Should be eligible for continuous onboarding? |
|-----|----------------------------------------------------------------------------------------------------|------------------------------|----------------------------------------------------|-----------------------------------------------|-----------------------------------------------|
| 1.a | Completed initial onboarding before version 150                                                    | Unset (`-1L`)                | All unset                                          | No                                            | No                                            |
| 1.b | Marked as onboarded through a path that bypasses the initial onboarding UI                         | Unset (`-1L`)                | All unset                                          | No                                            | No                                            |
| 2   | Completed initial onboarding while continuous onboarding was disabled, such as in versions 150–154 | Recorded                     | Initially unset; populated as stages are completed | Yes                                           | No                                            |
| 3   | Completed initial onboarding with continuous onboarding enabled                                    | Recorded                     | None, some, or all recorded, depending on progress | Yes                                           | Yes                                           |

Cohorts 1.a and 1.b should not see continuous onboarding. However, their unset stage timestamps can
still incorrectly block the review prompt when `continuousOnboardingFeatureEnabled` is `true`.

Cohort 2 is currently incorrectly eligible for continuous onboarding but should be treated as complete.
Cohort 3 should continue through its remaining stages normally.

Users who had continuous onboarding enabled ahead of the version 155 release (see
[Overview](#overview)) are cohort 3 by definition, but their initial completion timestamp predates the
release cutoff, so their stored state cannot be distinguished from cohort 2's. The migration treats them
as cohort 2: those who already completed the day-7 stage are left alone, and those with partial progress
are marked fully complete, discarding the remaining stages.

Eligibility does not guarantee that a stage will be shown. Displaying a stage also depends on
the user's progress and the conditions for that stage.

Unset stage timestamps are not inherently incorrect: they can represent normal progress. The issue
is distinguishing that state from missing records or stages that were unavailable at onboarding.

## Telemetry

The migration records two Glean events in the `events` ping, only for users who need migrating.
`onboarding.completion_state_migration_started` is recorded just before any stored state changes,
and its extras describe the state about to be overwritten.
`onboarding.completion_state_migration_completed` is recorded once the backfilled state has been
written and has no extras. Comparing the two counts shows how often the migration is interrupted
between them, and a repeat started event from the same client means an earlier migration did not
persist. See the Glean Dictionary for the full definitions of
[started](https://dictionary.telemetry.mozilla.org/apps/fenix/metrics/onboarding_completion_state_migration_started)
and
[completed](https://dictionary.telemetry.mozilla.org/apps/fenix/metrics/onboarding_completion_state_migration_completed).
The started event's extras map to the cohorts above as follows:

| Cohort                          | `migration_reason` | `progress_predates_cutoff` |
|---------------------------------|--------------------|----------------------------|
| 1.a and 1.b                     | `unset_timestamp`  | `false`                    |
| 2                               | `predates_rollout` | `false`                    |
| Early access, partial progress  | `predates_rollout` | `true`                     |
| 3, and anyone already at day 7  | no event           | no event                   |

## Paths that bypass initial onboarding

This is how a user ends up in cohort 1.b.

`BaseBrowserFragment.observeTabSource()`, formerly in `browser/BaseBrowserFragment.kt`, used to call
`FenixOnboarding.finish()` without recording `onboardingCompletedTimestamp` whenever:

- The user had not already been marked as onboarded.
- The tab was neither from a redirect nor an external source.
- The URL was neither of the onboarding-related links in `onboardingLinksList`.

For example, a user could enter this state by accepting the Terms of Use without completing the
remaining onboarding steps, closing Firefox, and then performing a voice search through the Firefox
home-screen widget. This opened a tab directly and triggered `FenixOnboarding.finish()`, bypassing
the rest of onboarding without recording `onboardingCompletedTimestamp`. The next time the user
opened Firefox, they were considered onboarded despite the timestamp remaining unset.

[Bug 2072686](https://bugzilla.mozilla.org/show_bug.cgi?id=2072686) removed this bypass, so cohort 1.b
is now purely historical: no new installations can enter it, but existing installations already in
that state still require the migration described below.

`AutomatedLaunch.disableOnboarding()` also bypasses initial onboarding, but is used only by internal
tools and is outside this discussion's scope.

## Direction for resolution

The goal is to make onboarding state reliable for downstream checks:

- Backfill the initial completion timestamp for cohorts 1.a, 1.b, and 2 to a known state using a fixed
  release-channel date (version 150's release, when the onboarding-completion-timestamp preferences
  were introduced), since it predates continuous onboarding for every affected user regardless of
  when they actually onboarded. This overwrites cohort 2's real initial timestamp, but nothing
  outside continuous onboarding depends on that timestamp being genuine for these users.
- Mark continuous onboarding as complete for cohorts 1.a, 1.b, and 2 by populating all four stage
  timestamps with the same fixed backfill date used above. This prevents further stages from
  appearing, and cohorts 1.a, 1.b, and 2 end up in the exact same, fully-backfilled state.
- Preserve cohort 3's existing progress.
- Ensure normal completion and UI-bypass paths consistently record the relevant state.
- Make migrated users recognizable without a dedicated tracking preference: since every backfilled
  field is set to the same fixed timestamp, future fixes can identify this cohort by comparing any
  of them against that known value.

Reconciled timestamps should avoid making existing users appear newly onboarded. Stage timestamps
populated by migration represent completion markers, not evidence that the user saw those stages.

Cohorts 1.a and 1.b share the same missing-timestamp state. If their original cohort cannot be reliably
determined, migration tracking should preserve that uncertainty.
