/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ipprotection.store

import junit.framework.TestCase.assertFalse
import junit.framework.TestCase.assertTrue
import mozilla.components.support.test.robolectric.testContext
import org.json.JSONObject
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.mozilla.experiments.nimbus.HardcodedNimbusFeatures
import org.mozilla.fenix.nimbus.FxNimbus
import org.mozilla.fenix.utils.Settings
import org.mozilla.fenix.utils.Settings.Companion.ONE_WEEK_MS
import org.robolectric.RobolectricTestRunner

private const val CURRENT_TIME_MILLIS = 1_759_926_358_000L

private const val EXACTLY_ONE_WEEK_AGO = CURRENT_TIME_MILLIS - ONE_WEEK_MS
private const val LESS_THAN_ONE_WEEK_AGO = EXACTLY_ONE_WEEK_AGO + 1
private const val MORE_THAN_ONE_WEEK_AGO = EXACTLY_ONE_WEEK_AGO - 1

@RunWith(RobolectricTestRunner::class)
class IPProtectionPromptRepositoryTest {
    private lateinit var settings: Settings

    private lateinit var repository: DefaultIPProtectionPromptRepository

    @Before
    fun setup() {
        settings = Settings(testContext)
        settings.onboardingCompletedTimestamp = MORE_THAN_ONE_WEEK_AGO
        repository = DefaultIPProtectionPromptRepository(settings)
    }

    @Test
    fun `WHEN all conditions satisfied THEN show the prompt`() {
        settings.isIPProtectionEnabled = true
        repository.isShowingPrompt = false

        assertTrue(settings.isIPProtectionAvailable)
        assertTrue(repository.canShowIPProtectionPrompt(CURRENT_TIME_MILLIS))
    }

    @Test
    fun `WHEN the prompt is already showing THEN do not show the prompt`() {
        settings.isIPProtectionEnabled = true
        repository.isShowingPrompt = true

        assertTrue(settings.isIPProtectionAvailable)
        assertFalse(repository.canShowIPProtectionPrompt(CURRENT_TIME_MILLIS))
    }

    @Test
    fun `WHEN the IP Protection feature is not available THEN do not show the prompt`() {
        val hardcodedNimbus = HardcodedNimbusFeatures(
            testContext,
            "ip-protection" to JSONObject(
                """
                {
                    "enabled": false
                }
                """.trimIndent(),
            ),
        )
        hardcodedNimbus.connectWith(FxNimbus)
        settings.isIPProtectionEnabled = false
        repository.isShowingPrompt = false

        assertFalse(settings.isIPProtectionAvailable)

        assertFalse(repository.canShowIPProtectionPrompt(CURRENT_TIME_MILLIS))
    }

    @Test
    fun `WHEN onboarding was completed less than a week ago THEN do not show the prompt`() {
        settings.onboardingCompletedTimestamp = LESS_THAN_ONE_WEEK_AGO

        repository = DefaultIPProtectionPromptRepository(settings)
        settings.isIPProtectionEnabled = true
        repository.isShowingPrompt = false

        assertTrue(settings.isIPProtectionAvailable)
        assertFalse(repository.canShowIPProtectionPrompt(CURRENT_TIME_MILLIS))
    }

    @Test
    fun `WHEN onboarding was completed exactly a week ago THEN do not show the prompt`() {
        settings.onboardingCompletedTimestamp = EXACTLY_ONE_WEEK_AGO
        repository = DefaultIPProtectionPromptRepository(settings)
        settings.isIPProtectionEnabled = true
        repository.isShowingPrompt = false

        assertTrue(settings.isIPProtectionAvailable)
        assertFalse(repository.canShowIPProtectionPrompt(CURRENT_TIME_MILLIS))
    }

    @Test
    fun `WHEN onboarding was completed over a week ago THEN show the prompt`() {
        settings.onboardingCompletedTimestamp = MORE_THAN_ONE_WEEK_AGO
        repository = DefaultIPProtectionPromptRepository(settings)
        settings.isIPProtectionEnabled = true
        repository.isShowingPrompt = false

        assertTrue(settings.isIPProtectionAvailable)
        assertTrue(repository.canShowIPProtectionPrompt(CURRENT_TIME_MILLIS))
    }
}
