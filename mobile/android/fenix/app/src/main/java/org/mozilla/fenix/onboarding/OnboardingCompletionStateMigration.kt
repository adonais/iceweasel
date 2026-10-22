/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.onboarding

import androidx.annotation.MainThread
import java.time.LocalDate
import java.time.ZoneOffset
import mozilla.components.support.base.log.logger.Logger
import org.mozilla.fenix.GleanMetrics.Onboarding
import org.mozilla.fenix.utils.Settings

private const val UNSET_TIMESTAMP = -1L

private const val DAY_2 = 2
private const val DAY_3 = 3
private const val DAY_5 = 5
private const val DAY_7 = 7

private val logger = Logger("OnboardingCompletionStateMigration")

/**
 * Enum representing why a user's onboarding completion state needs migration.
 *
 * @see [Onboarding.CompletionStateMigrationStartedExtra.migrationReason]
 */
private enum class MigrationReason(val telemetryId: String) {
    /**
     * The initial onboarding completion timestamp is missing. This can happen when a user onboarded before version 150
     * or bypassed the onboarding UI; the stored state cannot distinguish between these cases.
     */
    UNSET_TIMESTAMP("unset_timestamp"),

    /**
     * The user completed initial onboarding before continuous onboarding rolled out in Firefox 155, but has not
     * completed day 7. This includes users who never received the follow-up prompts and early users who started them
     * before launch. The `progress_predates_cutoff` extra records whether any stage was completed before launch.
     */
    PREDATES_ROLLOUT("predates_rollout"),
}

/**
 * Release-channel cutoff for continuous onboarding (version 155, 2026-09-01).
 *
 * Users who completed initial onboarding before this date should be treated as having completed the day-N stages. Users
 * who completed it on or after this date remain eligible for those stages, even if they have not opened the app for
 * some time.
 *
 * Some users had continuous onboarding enabled before this date; see the Overview in
 * `Onboarding-state-migration-and-reconciliation.md` for which. This release cutoff is intentionally applied to those
 * installations as well, since their stored state is indistinguishable from cohort 2's.
 */
private val CONTINUOUS_ONBOARDING_RELEASE_CUTOFF_MILLIS =
    LocalDate.of(2026, 9, 1).atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli()

/**
 * Date the onboarding completion timestamp preferences were introduced (version 150, 2026-04-21).
 *
 * This provides a known timestamp for users whose onboarding completion state needs to be backfilled.
 */
private val ONBOARDING_COMPLETION_BACKFILL_TIMESTAMP_MILLIS =
    LocalDate.of(2026, 4, 21).atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli()

/**
 * Fixes inconsistent onboarding completion state left by earlier versions of the app.
 *
 * See `Onboarding-state-migration-and-reconciliation.md` in this package for the user cohorts and reconciliation
 * strategy this implements.
 *
 * Dispatches to one of two migration paths based on whether [Settings.onboardingCompletedTimestamp] is already set.
 *
 * Both migrations converge on the exact same fully-backfilled state, using the same fixed timestamp for every field
 * including the initial completion timestamp. This makes backfilled completion state recognizable and avoids the
 * appearance of genuine progression through the stages.
 *
 * Callers should only invoke this for users who have actually been onboarded according to
 * [FenixOnboarding.userHasBeenOnboarded]
 */
@MainThread
fun Settings.reconcileOnboardingCompletionState() {
    val backfillTimestamp = ONBOARDING_COMPLETION_BACKFILL_TIMESTAMP_MILLIS

    if (onboardingCompletedTimestamp == UNSET_TIMESTAMP) {
        backfillOnboardingCompletionState(MigrationReason.UNSET_TIMESTAMP, backfillTimestamp)
    } else {
        backfillPreCutoffOnboardingCompletionIfNeeded(backfillTimestamp)
    }
}

/**
 * Backfills the initial onboarding timestamp and day-N stage timestamps for users whose initial onboarding timestamp
 * predates the release cutoff, overwriting their real initial timestamp so they converge to the same fully-backfilled
 * state as a user with no initial timestamp.
 *
 * For migration purposes, these users are treated as having completed continuous onboarding, regardless of any recorded
 * progress. Once the seventh-day timestamp is backfilled, later calls take no further action.
 *
 * A user who genuinely completed day 7 before the cutoff (possible wherever continuous onboarding was enabled ahead of
 * this cutoff, see [CONTINUOUS_ONBOARDING_RELEASE_CUTOFF_MILLIS]) is intentionally left untouched rather than
 * backfilled: their seventh-day timestamp is already set, so they were never blocked by ReviewPromptMiddleware's
 * `continuousOnboardingInProgress` gate, and overwriting their genuine progress would serve no purpose. A user from the
 * same population with only partial progress is flattened like cohort 2, losing any remaining stages.
 *
 * @param backfillTimestamp The fixed timestamp used to backfill the initial onboarding and day-N stage timestamps.
 */
private fun Settings.backfillPreCutoffOnboardingCompletionIfNeeded(backfillTimestamp: Long) {
    // Completing the seventh-day stage implies that every earlier stage is complete.
    if (seventhDayOnboardingCompletedTimestamp != UNSET_TIMESTAMP) return

    if (onboardingCompletedTimestamp >= CONTINUOUS_ONBOARDING_RELEASE_CUTOFF_MILLIS) return

    logger.info("Onboarding predates the release cutoff; marking onboarding completion as fully backfilled.")

    backfillOnboardingCompletionState(MigrationReason.PREDATES_ROLLOUT, backfillTimestamp)
}

/**
 * Records the state about to be migrated, backfills the initial onboarding timestamp and all day-N stages with the
 * given [timestamp], then records that the migration completed.
 *
 * The started event carries the pre-migration state, so it must be recorded before any preference updates.
 */
private fun Settings.backfillOnboardingCompletionState(reason: MigrationReason, timestamp: Long) {
    recordMigrationStarted(reason)

    migrateOnboardingCompletedTimestamp(timestamp)
    markAllContinuousOnboardingStagesComplete(timestamp)

    Onboarding.completionStateMigrationCompleted.record()
}

/** Records the user's onboarding completion state before the migration overwrites it. */
private fun Settings.recordMigrationStarted(reason: MigrationReason) {
    val completedStageTimestamps = completedContinuousOnboardingStages()
    val progressPredatesCutoff = completedStageTimestamps.any { (_, timestamp) ->
        timestamp < CONTINUOUS_ONBOARDING_RELEASE_CUTOFF_MILLIS
    }

    Onboarding.completionStateMigrationStarted.record(
        Onboarding.CompletionStateMigrationStartedExtra(
            migrationReason = reason.telemetryId,
            lastCompletedStage = completedStageTimestamps.lastOrNull()?.first,
            progressPredatesCutoff = progressPredatesCutoff,
        )
    )
}

/** Returns completed stages, as their day number, and their timestamps in day order. */
private fun Settings.completedContinuousOnboardingStages(): List<Pair<Int, Long>> =
    listOf(
            DAY_2 to secondDayOnboardingCompletedTimestamp,
            DAY_3 to thirdDayOnboardingCompletedTimestamp,
            DAY_5 to fifthDayOnboardingCompletedTimestamp,
            DAY_7 to seventhDayOnboardingCompletedTimestamp,
        )
        .filter { it.second != UNSET_TIMESTAMP }

private fun Settings.migrateOnboardingCompletedTimestamp(backfilledTimestamp: Long) {
    if (onboardingCompletedTimestamp != UNSET_TIMESTAMP) {
        logTimestampOverwrite(
            "onboardingCompletedTimestamp",
            onboardingCompletedTimestamp,
            backfilledTimestamp,
        )
    }
    onboardingCompletedTimestamp = backfilledTimestamp
}

/**
 * Marks all continuous onboarding stages as complete with the given [timestamp].
 *
 * Once all stages are complete, no logic depends on the exact values of their timestamps or the spacing between them,
 * so the same timestamp can be reused without creating artificial gaps.
 */
private fun Settings.markAllContinuousOnboardingStagesComplete(timestamp: Long) {
    migrateSecondDayOnboardingCompletedTimestamp(timestamp)
    migrateThirdDayOnboardingCompletedTimestamp(timestamp)
    migrateFifthDayOnboardingCompletedTimestamp(timestamp)
    migrateSeventhDayOnboardingCompletedTimestamp(timestamp)
}

private fun Settings.migrateSecondDayOnboardingCompletedTimestamp(backfilledTimestamp: Long) {
    if (secondDayOnboardingCompletedTimestamp != UNSET_TIMESTAMP) {
        logTimestampOverwrite(
            "secondDayOnboardingCompletedTimestamp",
            secondDayOnboardingCompletedTimestamp,
            backfilledTimestamp,
        )
    }
    secondDayOnboardingCompletedTimestamp = backfilledTimestamp
}

private fun Settings.migrateThirdDayOnboardingCompletedTimestamp(backfilledTimestamp: Long) {
    if (thirdDayOnboardingCompletedTimestamp != UNSET_TIMESTAMP) {
        logTimestampOverwrite(
            "thirdDayOnboardingCompletedTimestamp",
            thirdDayOnboardingCompletedTimestamp,
            backfilledTimestamp,
        )
    }
    thirdDayOnboardingCompletedTimestamp = backfilledTimestamp
}

private fun Settings.migrateFifthDayOnboardingCompletedTimestamp(backfilledTimestamp: Long) {
    if (fifthDayOnboardingCompletedTimestamp != UNSET_TIMESTAMP) {
        logTimestampOverwrite(
            "fifthDayOnboardingCompletedTimestamp",
            fifthDayOnboardingCompletedTimestamp,
            backfilledTimestamp,
        )
    }
    fifthDayOnboardingCompletedTimestamp = backfilledTimestamp
}

private fun Settings.migrateSeventhDayOnboardingCompletedTimestamp(backfilledTimestamp: Long) {
    if (seventhDayOnboardingCompletedTimestamp != UNSET_TIMESTAMP) {
        logTimestampOverwrite(
            "seventhDayOnboardingCompletedTimestamp",
            seventhDayOnboardingCompletedTimestamp,
            backfilledTimestamp,
        )
    }
    seventhDayOnboardingCompletedTimestamp = backfilledTimestamp
}

private fun logTimestampOverwrite(prefName: String, originalValue: Long, newValue: Long) {
    if (originalValue == newValue) return

    logger.warn(
        "$prefName was already set to $originalValue while backfilling onboarding state. Overwriting with $newValue."
    )
}
