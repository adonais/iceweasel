/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.settings.datachoices

import androidx.test.ext.junit.runners.AndroidJUnit4
import io.mockk.every
import kotlin.test.assertEquals
import mozilla.components.support.test.robolectric.testContext
import org.junit.Test
import org.junit.runner.RunWith
import org.mozilla.fenix.ext.components

@RunWith(AndroidJUnit4::class)
class DataChoicesSearchProviderTest {

    @Test
    fun `GIVEN no marketing telemetry selection has been made WHEN getting search items THEN the base data choices are returned`() {
        every { testContext.components.settings.hasMadeMarketingTelemetrySelection } returns false

        val keys = DataChoicesSearchProvider.getSearchItems(testContext).map { it.preferenceKey }

        assertEquals(
            expected = listOf("TECHNICAL_DATA", "STUDIES", "USAGE_DATA", "CRASH_REPORTS"),
            actual = keys,
            message = "Expected the base data choices without the campaign measurement item",
        )
    }

    @Test
    fun `GIVEN a marketing telemetry selection has been made WHEN getting search items THEN the campaign measurement item is also returned`() {
        every { testContext.components.settings.hasMadeMarketingTelemetrySelection } returns true

        val keys = DataChoicesSearchProvider.getSearchItems(testContext).map { it.preferenceKey }

        assertEquals(
            expected = listOf("TECHNICAL_DATA", "STUDIES", "USAGE_DATA", "CRASH_REPORTS", "CAMPAIGN_MEASUREMENT"),
            actual = keys,
            message = "Expected the campaign measurement item once a marketing telemetry selection has been made",
        )
    }
}
