/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.components.metrics

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import io.mockk.mockk
import io.mockk.verify
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.mozilla.fenix.utils.Settings

@RunWith(AndroidJUnit4::class)
internal class AdjustMetricsServiceTest {
    val context: Context = ApplicationProvider.getApplicationContext()

    val conversionEventRecorder = mockk<ConversionEventRecorder>(relaxed = true)

    @Test
    fun `WHEN Adjust attribution data already exist THEN already known is true`() {
        val settings = Settings(context)
        assertFalse(AdjustMetricsService.alreadyKnown(settings))

        settings.adjustCampaignId = "campaign"
        assertTrue(AdjustMetricsService.alreadyKnown(settings))

        settings.adjustCampaignId = ""
        assertFalse(AdjustMetricsService.alreadyKnown(settings))

        settings.adjustNetwork = "network"
        assertTrue(AdjustMetricsService.alreadyKnown(settings))

        settings.adjustNetwork = ""
        assertFalse(AdjustMetricsService.alreadyKnown(settings))

        settings.adjustAdGroup = "ad group"
        assertTrue(AdjustMetricsService.alreadyKnown(settings))

        settings.adjustAdGroup = ""
        assertFalse(AdjustMetricsService.alreadyKnown(settings))

        settings.adjustCreative = "creative"
        assertTrue(AdjustMetricsService.alreadyKnown(settings))
    }

    @Test
    fun `GIVEN a ConversionEvent1 event WHEN sendGleanEventAndPing is called THEN the event is recorded and the ping is submitted`() {
        AdjustMetricsService.sendGleanEventAndPing(
            Event.GrowthData.ConversionEvent1,
            conversionEventRecorder,
        )

        verify { conversionEventRecorder.recordConversionEvent(1) }
        verify { conversionEventRecorder.submitAdjustAttributionPing() }
    }

    @Test
    fun `GIVEN a ConversionEvent2 event WHEN sendGleanEventAndPing is called THEN the event is recorded and the ping is submitted`() {
        AdjustMetricsService.sendGleanEventAndPing(
            Event.GrowthData.ConversionEvent2,
            conversionEventRecorder,
        )

        verify { conversionEventRecorder.recordConversionEvent(2) }
        verify { conversionEventRecorder.submitAdjustAttributionPing() }
    }

    @Test
    fun `GIVEN a ConversionEvent3 event WHEN sendGleanEventAndPing is called THEN the event is recorded and the ping is submitted`() {
        AdjustMetricsService.sendGleanEventAndPing(
            Event.GrowthData.ConversionEvent3,
            conversionEventRecorder,
        )

        verify { conversionEventRecorder.recordConversionEvent(3) }
        verify { conversionEventRecorder.submitAdjustAttributionPing() }
    }

    @Test
    fun `GIVEN a ConversionEvent4 event WHEN sendGleanEventAndPing is called THEN the event is recorded and the ping is submitted`() {
        AdjustMetricsService.sendGleanEventAndPing(
            Event.GrowthData.ConversionEvent4,
            conversionEventRecorder,
        )

        verify { conversionEventRecorder.recordConversionEvent(4) }
        verify { conversionEventRecorder.submitAdjustAttributionPing() }
    }

    @Test
    fun `GIVEN a ConversionEvent5 event WHEN sendGleanEventAndPing is called THEN the event is recorded and the ping is submitted`() {
        AdjustMetricsService.sendGleanEventAndPing(
            Event.GrowthData.ConversionEvent5,
            conversionEventRecorder,
        )

        verify { conversionEventRecorder.recordConversionEvent(5) }
        verify { conversionEventRecorder.submitAdjustAttributionPing() }
    }

    @Test
    fun `GIVEN a ConversionEvent6 event WHEN sendGleanEventAndPing is called THEN the event is recorded and the ping is submitted`() {
        AdjustMetricsService.sendGleanEventAndPing(
            Event.GrowthData.ConversionEvent6,
            conversionEventRecorder,
        )

        verify { conversionEventRecorder.recordConversionEvent(6) }
        verify { conversionEventRecorder.submitAdjustAttributionPing() }
    }

    @Test
    fun `GIVEN a ConversionEvent7 event WHEN sendGleanEventAndPing is called THEN the event is recorded and the ping is submitted`() {
        AdjustMetricsService.sendGleanEventAndPing(
            Event.GrowthData.ConversionEvent7(fromSearch = true),
            conversionEventRecorder,
        )

        verify { conversionEventRecorder.recordConversionEvent(7) }
        verify { conversionEventRecorder.submitAdjustAttributionPing() }
    }

    @Test
    fun `GIVEN a ConversionEvent8 event WHEN sendGleanEventAndPing is called THEN the event is recorded and the ping is submitted`() {
        AdjustMetricsService.sendGleanEventAndPing(
            Event.FirstWeekPostInstall.ConversionEvent8,
            conversionEventRecorder,
        )

        verify { conversionEventRecorder.recordConversionEvent(8) }
        verify { conversionEventRecorder.submitAdjustAttributionPing() }
    }

    @Test
    fun `GIVEN a ConversionEvent9 event WHEN sendGleanEventAndPing is called THEN the event is recorded and the ping is submitted`() {
        AdjustMetricsService.sendGleanEventAndPing(
            Event.FirstWeekPostInstall.ConversionEvent9,
            conversionEventRecorder,
        )

        verify { conversionEventRecorder.recordConversionEvent(9) }
        verify { conversionEventRecorder.submitAdjustAttributionPing() }
    }

    @Test
    fun `GIVEN a ConversionEvent10 event WHEN sendGleanEventAndPing is called THEN the event is recorded and the ping is submitted`() {
        AdjustMetricsService.sendGleanEventAndPing(
            Event.FirstWeekPostInstall.ConversionEvent10,
            conversionEventRecorder,
        )

        verify { conversionEventRecorder.recordConversionEvent(10) }
        verify { conversionEventRecorder.submitAdjustAttributionPing() }
    }
}
