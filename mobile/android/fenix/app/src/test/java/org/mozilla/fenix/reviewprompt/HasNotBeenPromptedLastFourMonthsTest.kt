/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.reviewprompt

import androidx.test.ext.junit.runners.AndroidJUnit4
import mozilla.components.support.test.robolectric.testContext
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.mozilla.fenix.utils.Settings

@RunWith(AndroidJUnit4::class)
class HasNotBeenPromptedLastFourMonthsTest {

    private val settings = Settings(testContext)

    @Test
    fun `GIVEN prompt has never been shown WHEN hasNotBeenPromptedLastFourMonths called THEN returns true`() {
        settings.lastReviewPromptTimeInMillis = 0L
        val timeNowInMillis = { TEST_TIME_NOW }

        assertTrue(hasNotBeenPromptedLastFourMonths(settings, timeNowInMillis))
    }

    @Test
    fun `GIVEN prompt has been shown more than 4 months ago WHEN hasNotBeenPromptedLastFourMonths called THEN returns true`() {
        settings.lastReviewPromptTimeInMillis = MORE_THAN_4_MONTHS_FROM_TEST_TIME_NOW
        val timeNowInMillis = { TEST_TIME_NOW }

        assertTrue(hasNotBeenPromptedLastFourMonths(settings, timeNowInMillis))
    }

    @Test
    fun `GIVEN prompt has been shown less than 4 months ago WHEN hasNotBeenPromptedLastFourMonths called THEN returns false`() {
        settings.lastReviewPromptTimeInMillis = LESS_THAN_4_MONTHS_FROM_TEST_TIME_NOW
        val timeNowInMillis = { TEST_TIME_NOW }

        assertFalse(hasNotBeenPromptedLastFourMonths(settings, timeNowInMillis))
    }

    private companion object {
        const val TEST_TIME_NOW = 1598416882805L
        const val MORE_THAN_4_MONTHS_FROM_TEST_TIME_NOW = 1588048882804L
        const val LESS_THAN_4_MONTHS_FROM_TEST_TIME_NOW = 1595824882905L
    }
}
