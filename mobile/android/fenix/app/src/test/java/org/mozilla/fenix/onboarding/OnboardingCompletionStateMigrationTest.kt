/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.onboarding

import java.time.LocalDate
import java.time.ZoneOffset
import mozilla.components.support.test.robolectric.testContext
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.mozilla.fenix.GleanMetrics.Onboarding
import org.mozilla.fenix.helpers.FenixGleanTestRule
import org.mozilla.fenix.utils.Settings
import org.robolectric.RobolectricTestRunner

// Deliberately duplicated from production rather than imported, so a wrong production date fails this test too.
private val ONBOARDING_COMPLETION_BACKFILL_TIMESTAMP_MILLIS =
    LocalDate.of(2026, 4, 21).atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli()

// Deliberately duplicated from production rather than imported, so a wrong production date fails this test too.
// Telemetry test names describe this date as when continuous onboarding was enabled, meaning its Release rollout.
// Nightly, Beta and an experiment had it earlier; see the Overview in
// `Onboarding-state-migration-and-reconciliation.md`.
private val CONTINUOUS_ONBOARDING_RELEASE_CUTOFF_MILLIS =
    LocalDate.of(2026, 9, 1).atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli()

@RunWith(RobolectricTestRunner::class)
class OnboardingCompletionStateMigrationTest {
    @get:Rule val gleanTestRule = FenixGleanTestRule(testContext)

    private lateinit var settings: Settings

    @Before
    fun setUp() {
        settings = Settings(testContext)
    }

    @Test
    fun `GIVEN onboarding is already fully complete WHEN reconciling completion state THEN nothing is changed`() {
        val existingOnboardingCompletedTimestamp = 100_000L
        val existingSecondDayTimestamp = 200_000L
        val existingThirdDayTimestamp = 210_000L
        val existingFifthDayTimestamp = 220_000L
        val existingSeventhDayTimestamp = 230_000L
        settings.onboardingCompletedTimestamp = existingOnboardingCompletedTimestamp
        settings.secondDayOnboardingCompletedTimestamp = existingSecondDayTimestamp
        settings.thirdDayOnboardingCompletedTimestamp = existingThirdDayTimestamp
        settings.fifthDayOnboardingCompletedTimestamp = existingFifthDayTimestamp
        settings.seventhDayOnboardingCompletedTimestamp = existingSeventhDayTimestamp

        settings.reconcileOnboardingCompletionState()

        assertEquals(existingOnboardingCompletedTimestamp, settings.onboardingCompletedTimestamp)
        assertEquals(existingSecondDayTimestamp, settings.secondDayOnboardingCompletedTimestamp)
        assertEquals(existingThirdDayTimestamp, settings.thirdDayOnboardingCompletedTimestamp)
        assertEquals(existingFifthDayTimestamp, settings.fifthDayOnboardingCompletedTimestamp)
        assertEquals(existingSeventhDayTimestamp, settings.seventhDayOnboardingCompletedTimestamp)
    }

    @Test
    fun `GIVEN an onboarded user without a timestamp WHEN reconciling completion state twice THEN all timestamps are backfilled to the same value and the second call is a no-op`() {
        settings.onboardingCompletedTimestamp = -1L

        settings.reconcileOnboardingCompletionState()

        assertAllOnboardingTimestampsEqual()

        settings.reconcileOnboardingCompletionState()

        assertAllOnboardingTimestampsEqual()
    }

    /**
     * This inconsistent state should never occur through normal app behavior: continuous onboarding stages cannot be
     * completed before initial onboarding. Verify that reconciling completion state handles it defensively anyway.
     */
    @Test
    fun `GIVEN existing day timestamps without an initial timestamp WHEN reconciling completion state THEN existing day timestamps are overwritten to match`() {
        settings.onboardingCompletedTimestamp = -1L
        settings.secondDayOnboardingCompletedTimestamp = 200_000L
        settings.thirdDayOnboardingCompletedTimestamp = 210_000L
        settings.fifthDayOnboardingCompletedTimestamp = 220_000L
        settings.seventhDayOnboardingCompletedTimestamp = 230_000L

        settings.reconcileOnboardingCompletionState()

        assertAllOnboardingTimestampsEqual()
    }

    @Test
    fun `GIVEN onboarding completed before the continuous onboarding cutoff WHEN reconciling completion state THEN all timestamps are backfilled to the known migration timestamp`() {
        settings.onboardingCompletedTimestamp = CONTINUOUS_ONBOARDING_RELEASE_CUTOFF_MILLIS - 100

        settings.reconcileOnboardingCompletionState()

        assertAllOnboardingTimestampsEqual()
    }

    @Test
    fun `GIVEN onboarding completed before the cutoff and a day timestamp already set WHEN reconciling completion state THEN existing timestamps are overwritten to the known migration timestamp`() {
        val onboardingCompletedTimestamp = CONTINUOUS_ONBOARDING_RELEASE_CUTOFF_MILLIS - 100

        settings.onboardingCompletedTimestamp = onboardingCompletedTimestamp
        settings.secondDayOnboardingCompletedTimestamp = onboardingCompletedTimestamp + 1

        settings.reconcileOnboardingCompletionState()

        assertAllOnboardingTimestampsEqual()
    }

    @Test
    fun `GIVEN onboarding completed at or after the cutoff WHEN reconciling completion state THEN day timestamps are not backfilled`() {
        settings.onboardingCompletedTimestamp = CONTINUOUS_ONBOARDING_RELEASE_CUTOFF_MILLIS

        settings.reconcileOnboardingCompletionState()

        assertEquals(CONTINUOUS_ONBOARDING_RELEASE_CUTOFF_MILLIS, settings.onboardingCompletedTimestamp)
        assertEquals(-1L, settings.seventhDayOnboardingCompletedTimestamp)
    }

    @Test
    fun `GIVEN onboarding completed at or after the cutoff with genuine partial progress WHEN reconciling completion state THEN existing progress is preserved`() {
        val secondDayTimestamp = CONTINUOUS_ONBOARDING_RELEASE_CUTOFF_MILLIS + 1_000
        settings.onboardingCompletedTimestamp = CONTINUOUS_ONBOARDING_RELEASE_CUTOFF_MILLIS
        settings.secondDayOnboardingCompletedTimestamp = secondDayTimestamp

        settings.reconcileOnboardingCompletionState()

        assertEquals(secondDayTimestamp, settings.secondDayOnboardingCompletedTimestamp)
        assertEquals(-1L, settings.thirdDayOnboardingCompletedTimestamp)
        assertEquals(-1L, settings.fifthDayOnboardingCompletedTimestamp)
        assertEquals(-1L, settings.seventhDayOnboardingCompletedTimestamp)
    }

    /**
     * Continuous onboarding was already enabled before the release cutoff for some users (see the Overview in
     * `Onboarding-state-migration-and-reconciliation.md`), so a user who onboarded before the release cutoff can have
     * genuine multi-stage progress here, not just a stray timestamp. The migration can't distinguish that from cohort 2
     * (a user with a real completion timestamp that predates the release cutoff, per the package README) and flattens
     * it to fully complete regardless, overwriting the real initial timestamp too.
     */
    @Test
    fun `GIVEN genuine multi-stage progress before continuous onboarding was enabled WHEN reconciling completion state THEN progress is flattened to fully complete`() {
        val onboardingCompletedTimestamp = CONTINUOUS_ONBOARDING_RELEASE_CUTOFF_MILLIS - 100
        settings.onboardingCompletedTimestamp = onboardingCompletedTimestamp
        settings.secondDayOnboardingCompletedTimestamp = onboardingCompletedTimestamp + 1_000
        settings.thirdDayOnboardingCompletedTimestamp = onboardingCompletedTimestamp + 2_000

        settings.reconcileOnboardingCompletionState()

        assertAllOnboardingTimestampsEqual()
    }

    @Test
    fun `GIVEN day 7 was already backfilled WHEN reconciling completion state again THEN nothing is rewritten`() {
        val onboardingCompletedTimestamp = CONTINUOUS_ONBOARDING_RELEASE_CUTOFF_MILLIS - 100
        settings.onboardingCompletedTimestamp = onboardingCompletedTimestamp
        settings.seventhDayOnboardingCompletedTimestamp = ONBOARDING_COMPLETION_BACKFILL_TIMESTAMP_MILLIS
        val unexpectedValue = ONBOARDING_COMPLETION_BACKFILL_TIMESTAMP_MILLIS + 1
        settings.secondDayOnboardingCompletedTimestamp = unexpectedValue

        settings.reconcileOnboardingCompletionState()

        assertEquals(onboardingCompletedTimestamp, settings.onboardingCompletedTimestamp)
        assertEquals(unexpectedValue, settings.secondDayOnboardingCompletedTimestamp)
    }

    /**
     * Cohorts 1.a and 1.b: no completion timestamp recorded, so they're indistinguishable from stored preferences alone
     * — this single case covers both.
     */
    @Test
    fun `GIVEN a cohort 1a or 1b user with continuous onboarding enabled WHEN reconciling completion state THEN the review prompt is no longer blocked`() {
        settings.continuousOnboardingFeatureEnabled = true
        settings.onboardingCompletedTimestamp = -1L

        assertTrue("Review prompt should be blocked before migration", continuousOnboardingInProgress())

        settings.reconcileOnboardingCompletionState()

        assertFalse("Review prompt should no longer be blocked after migration", continuousOnboardingInProgress())
    }

    /** Cohort 2: has a real completion timestamp, but it predates the continuous onboarding release cutoff. */
    @Test
    fun `GIVEN a cohort 2 user with continuous onboarding enabled WHEN reconciling completion state THEN the review prompt is no longer blocked`() {
        settings.continuousOnboardingFeatureEnabled = true
        settings.onboardingCompletedTimestamp = CONTINUOUS_ONBOARDING_RELEASE_CUTOFF_MILLIS - 100

        assertTrue("Review prompt should be blocked before migration", continuousOnboardingInProgress())

        settings.reconcileOnboardingCompletionState()

        assertFalse("Review prompt should no longer be blocked after migration", continuousOnboardingInProgress())
    }

    /** Cohort 3: has a real completion timestamp that already postdates the release cutoff. */
    @Test
    fun `GIVEN a cohort 3 user with continuous onboarding enabled WHEN reconciling completion state THEN the review prompt remains blocked`() {
        settings.continuousOnboardingFeatureEnabled = true
        settings.onboardingCompletedTimestamp = CONTINUOUS_ONBOARDING_RELEASE_CUTOFF_MILLIS + 100

        assertTrue("Review prompt should be blocked before migration", continuousOnboardingInProgress())

        settings.reconcileOnboardingCompletionState()

        assertTrue("Review prompt should still be blocked after migration", continuousOnboardingInProgress())
    }

    // region Telemetry

    @Test
    fun `GIVEN onboarding is considered complete WHEN checking the user's state THEN no migration events are recorded`() {
        settings.onboardingCompletedTimestamp = 100_000L
        settings.seventhDayOnboardingCompletedTimestamp = 230_000L

        settings.reconcileOnboardingCompletionState()

        assertNull(Onboarding.completionStateMigrationStarted.testGetValue())
        assertNull(Onboarding.completionStateMigrationCompleted.testGetValue())
    }

    @Test
    fun `GIVEN initial onboarding finished at the moment continuous onboarding was enabled WHEN checking the user's state THEN no migration events are recorded`() {
        settings.onboardingCompletedTimestamp = CONTINUOUS_ONBOARDING_RELEASE_CUTOFF_MILLIS

        settings.reconcileOnboardingCompletionState()

        assertNull(Onboarding.completionStateMigrationStarted.testGetValue())
        assertNull(Onboarding.completionStateMigrationCompleted.testGetValue())
    }

    @Test
    fun `GIVEN an existing user has no completion date or completed stages WHEN their state is migrated THEN the started event reports the missing date and no progress`() {
        settings.onboardingCompletedTimestamp = -1L

        settings.reconcileOnboardingCompletionState()

        val extra = Onboarding.completionStateMigrationStarted.testGetValue()!!.single().extra!!
        assertEquals("unset_timestamp", extra["migration_reason"])
        assertNull(extra["last_completed_stage"])
        assertEquals("false", extra["progress_predates_cutoff"])
    }

    @Test
    fun `GIVEN an existing user has no completion date WHEN their state is migrated THEN the completed event is recorded once with no extras`() {
        settings.onboardingCompletedTimestamp = -1L

        settings.reconcileOnboardingCompletionState()

        assertNull(Onboarding.completionStateMigrationCompleted.testGetValue()!!.single().extra)
    }

    @Test
    fun `GIVEN an existing user has no completion date WHEN their state is checked twice THEN both migration events are only recorded once`() {
        settings.onboardingCompletedTimestamp = -1L

        settings.reconcileOnboardingCompletionState()
        settings.reconcileOnboardingCompletionState()

        assertEquals(1, Onboarding.completionStateMigrationStarted.testGetValue()!!.size)
        assertEquals(1, Onboarding.completionStateMigrationCompleted.testGetValue()!!.size)
    }

    /**
     * Not a reachable production state: the stage provider shows nothing without an initial completion timestamp, so
     * cohort 1 users never gain stage timestamps. This guards that the recording handles whatever is in storage.
     */
    @Test
    fun `GIVEN an existing user has completed stages but no initial completion date WHEN their state is migrated THEN the started event reports the last stage and progress before continuous onboarding was enabled`() {
        settings.onboardingCompletedTimestamp = -1L
        settings.secondDayOnboardingCompletedTimestamp = 200_000L
        settings.thirdDayOnboardingCompletedTimestamp = 210_000L
        settings.fifthDayOnboardingCompletedTimestamp = 220_000L
        settings.seventhDayOnboardingCompletedTimestamp = 230_000L

        settings.reconcileOnboardingCompletionState()

        val extra = Onboarding.completionStateMigrationStarted.testGetValue()!!.single().extra!!
        assertEquals("unset_timestamp", extra["migration_reason"])
        assertEquals("7", extra["last_completed_stage"])
        assertEquals("true", extra["progress_predates_cutoff"])
    }

    @Test
    fun `GIVEN initial onboarding finished before continuous onboarding was enabled with no later stages complete WHEN their state is migrated THEN the started event reports the early completion and no progress`() {
        settings.onboardingCompletedTimestamp = CONTINUOUS_ONBOARDING_RELEASE_CUTOFF_MILLIS - 100

        settings.reconcileOnboardingCompletionState()

        val extra = Onboarding.completionStateMigrationStarted.testGetValue()!!.single().extra!!
        assertEquals("predates_rollout", extra["migration_reason"])
        assertNull(extra["last_completed_stage"])
        assertEquals("false", extra["progress_predates_cutoff"])
    }

    @Test
    fun `GIVEN initial onboarding finished before continuous onboarding was enabled WHEN their state is checked twice THEN both migration events are only recorded once`() {
        settings.onboardingCompletedTimestamp = CONTINUOUS_ONBOARDING_RELEASE_CUTOFF_MILLIS - 100

        settings.reconcileOnboardingCompletionState()
        settings.reconcileOnboardingCompletionState()

        assertEquals(1, Onboarding.completionStateMigrationStarted.testGetValue()!!.size)
        assertEquals(1, Onboarding.completionStateMigrationCompleted.testGetValue()!!.size)
    }

    @Test
    fun `GIVEN some stages were completed before continuous onboarding was enabled WHEN their state is migrated THEN the started event reports the last stage and progress before continuous onboarding was enabled`() {
        val onboardingCompletedTimestamp = CONTINUOUS_ONBOARDING_RELEASE_CUTOFF_MILLIS - 100
        settings.onboardingCompletedTimestamp = onboardingCompletedTimestamp
        settings.secondDayOnboardingCompletedTimestamp = onboardingCompletedTimestamp + 1
        settings.thirdDayOnboardingCompletedTimestamp = onboardingCompletedTimestamp + 2

        settings.reconcileOnboardingCompletionState()

        val extra = Onboarding.completionStateMigrationStarted.testGetValue()!!.single().extra!!
        assertEquals("predates_rollout", extra["migration_reason"])
        assertEquals("3", extra["last_completed_stage"])
        assertEquals("true", extra["progress_predates_cutoff"])
    }

    @Test
    fun `GIVEN initial onboarding finished before continuous onboarding was enabled and stages were completed after it WHEN their state is migrated THEN the started event reports the last stage and no progress before continuous onboarding was enabled`() {
        settings.onboardingCompletedTimestamp = CONTINUOUS_ONBOARDING_RELEASE_CUTOFF_MILLIS - 100
        settings.secondDayOnboardingCompletedTimestamp = CONTINUOUS_ONBOARDING_RELEASE_CUTOFF_MILLIS + 1
        settings.thirdDayOnboardingCompletedTimestamp = CONTINUOUS_ONBOARDING_RELEASE_CUTOFF_MILLIS + 2

        settings.reconcileOnboardingCompletionState()

        val extra = Onboarding.completionStateMigrationStarted.testGetValue()!!.single().extra!!
        assertEquals("predates_rollout", extra["migration_reason"])
        assertEquals("3", extra["last_completed_stage"])
        assertEquals("false", extra["progress_predates_cutoff"])
    }

    @Test
    fun `GIVEN stages were completed both before and after continuous onboarding was enabled WHEN their state is migrated THEN the started event reports progress before continuous onboarding was enabled`() {
        settings.onboardingCompletedTimestamp = CONTINUOUS_ONBOARDING_RELEASE_CUTOFF_MILLIS - 100
        settings.secondDayOnboardingCompletedTimestamp = CONTINUOUS_ONBOARDING_RELEASE_CUTOFF_MILLIS - 1
        settings.thirdDayOnboardingCompletedTimestamp = CONTINUOUS_ONBOARDING_RELEASE_CUTOFF_MILLIS + 1

        settings.reconcileOnboardingCompletionState()

        val extra = Onboarding.completionStateMigrationStarted.testGetValue()!!.single().extra!!
        assertEquals("3", extra["last_completed_stage"])
        assertEquals("true", extra["progress_predates_cutoff"])
    }

    @Test
    fun `GIVEN a stage was completed at the moment continuous onboarding was enabled WHEN their state is migrated THEN the started event reports no progress before continuous onboarding was enabled`() {
        settings.onboardingCompletedTimestamp = CONTINUOUS_ONBOARDING_RELEASE_CUTOFF_MILLIS - 100
        settings.secondDayOnboardingCompletedTimestamp = CONTINUOUS_ONBOARDING_RELEASE_CUTOFF_MILLIS

        settings.reconcileOnboardingCompletionState()

        val extra = Onboarding.completionStateMigrationStarted.testGetValue()!!.single().extra!!
        assertEquals("2", extra["last_completed_stage"])
        assertEquals("false", extra["progress_predates_cutoff"])
    }

    @Test
    fun `GIVEN only non-consecutive stages were completed WHEN their state is migrated THEN the started event reports the last stage`() {
        settings.onboardingCompletedTimestamp = CONTINUOUS_ONBOARDING_RELEASE_CUTOFF_MILLIS - 100
        settings.thirdDayOnboardingCompletedTimestamp = CONTINUOUS_ONBOARDING_RELEASE_CUTOFF_MILLIS + 2
        settings.fifthDayOnboardingCompletedTimestamp = CONTINUOUS_ONBOARDING_RELEASE_CUTOFF_MILLIS + 4

        settings.reconcileOnboardingCompletionState()

        val extra = Onboarding.completionStateMigrationStarted.testGetValue()!!.single().extra!!
        assertEquals("5", extra["last_completed_stage"])
    }

    // endregion

    /** Mirrors the `continuousOnboardingInProgress` lambda wired up in [org.mozilla.fenix.components.Components]. */
    private fun continuousOnboardingInProgress(): Boolean {
        val continuousOnboardingCompleted = settings.seventhDayOnboardingCompletedTimestamp != -1L
        return settings.continuousOnboardingFeatureEnabled && !continuousOnboardingCompleted
    }

    private fun assertAllOnboardingTimestampsEqual() {
        assertEquals(ONBOARDING_COMPLETION_BACKFILL_TIMESTAMP_MILLIS, settings.onboardingCompletedTimestamp)
        assertEquals(ONBOARDING_COMPLETION_BACKFILL_TIMESTAMP_MILLIS, settings.secondDayOnboardingCompletedTimestamp)
        assertEquals(ONBOARDING_COMPLETION_BACKFILL_TIMESTAMP_MILLIS, settings.thirdDayOnboardingCompletedTimestamp)
        assertEquals(ONBOARDING_COMPLETION_BACKFILL_TIMESTAMP_MILLIS, settings.fifthDayOnboardingCompletedTimestamp)
        assertEquals(ONBOARDING_COMPLETION_BACKFILL_TIMESTAMP_MILLIS, settings.seventhDayOnboardingCompletedTimestamp)
    }
}
