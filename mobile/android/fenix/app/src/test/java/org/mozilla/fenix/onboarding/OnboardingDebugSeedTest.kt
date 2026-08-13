/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.onboarding

import mozilla.components.support.test.robolectric.testContext
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.mozilla.fenix.utils.Settings
import org.robolectric.RobolectricTestRunner

private const val UNSET_TIMESTAMP = -1L
private const val NOW = 1_700_000_000_000L

@RunWith(RobolectricTestRunner::class)
class OnboardingDebugSeedTest {
    private lateinit var settings: Settings

    @Before
    fun setup() {
        settings = Settings(testContext)
    }

    @Test
    fun `GIVEN a debug build and the timestamp is unset WHEN seeding THEN it is set to the provided time`() {
        assertEquals(UNSET_TIMESTAMP, settings.onboardingCompletedTimestamp)

        settings.seedOnboardingCompletedTimestampForDebugIfNeeded(now = NOW, isDebug = true)

        assertEquals(NOW, settings.onboardingCompletedTimestamp)
    }

    @Test
    fun `GIVEN a debug build and the timestamp is already set WHEN seeding THEN it is left unchanged`() {
        val existingTimestamp = NOW - 1
        settings.onboardingCompletedTimestamp = existingTimestamp

        settings.seedOnboardingCompletedTimestampForDebugIfNeeded(now = NOW, isDebug = true)

        assertEquals(existingTimestamp, settings.onboardingCompletedTimestamp)
    }

    @Test
    fun `GIVEN a non-debug build and the timestamp is unset WHEN seeding THEN it is left unchanged`() {
        assertEquals(UNSET_TIMESTAMP, settings.onboardingCompletedTimestamp)

        settings.seedOnboardingCompletedTimestampForDebugIfNeeded(now = NOW, isDebug = false)

        assertEquals(UNSET_TIMESTAMP, settings.onboardingCompletedTimestamp)
    }
}
