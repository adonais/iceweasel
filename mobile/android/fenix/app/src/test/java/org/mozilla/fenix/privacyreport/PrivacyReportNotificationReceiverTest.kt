/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.privacyreport

import android.app.Application
import android.content.Intent
import mozilla.components.support.test.robolectric.testContext
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.mozilla.fenix.GleanMetrics.TrackingProtection
import org.mozilla.fenix.helpers.FenixGleanTestRule
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf

@RunWith(RobolectricTestRunner::class)
class PrivacyReportNotificationReceiverTest {

    @get:Rule val gleanRule = FenixGleanTestRule(testContext)

    @Test
    fun `WHEN the dismissed action is received THEN nothing is launched`() {
        PrivacyReportNotificationReceiver()
            .onReceive(
                testContext,
                Intent(ACTION_PRIVACY_REPORT_NOTIFICATION_DISMISSED),
            )

        assertNull(shadowOf(testContext as Application).nextStartedActivity)
    }

    @Test
    fun `WHEN an unknown action is received THEN nothing is launched`() {
        PrivacyReportNotificationReceiver().onReceive(testContext, Intent("unknown"))

        assertNull(shadowOf(testContext as Application).nextStartedActivity)
    }

    @Test
    fun `WHEN the dismissed action is received THEN the dismissed event is recorded`() {
        PrivacyReportNotificationReceiver()
            .onReceive(
                testContext,
                Intent(ACTION_PRIVACY_REPORT_NOTIFICATION_DISMISSED),
            )

        assertEquals(1, TrackingProtection.privacyReportNotificationDismissed.testGetValue()!!.size)
    }
}
